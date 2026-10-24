"""Sesiones compartidas del emulador: una planta calculada una vez para PLC y visores."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from time import time
from typing import Any
from uuid import uuid4

from twin_runtime.plant import PlantModel

from .historian import historian
from .plc_tags import plc_tags
from .profiles import commands_for_hour

TICK_S = 0.1
MAX_STEPS_PER_TICK = 4000


def clean(value: Any) -> Any:
    if isinstance(value, float) and value != value:
        return None
    if isinstance(value, dict):
        return {key: clean(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [clean(item) for item in value]
    return value


@dataclass
class PlantSession:
    id: str
    plant_id: str
    plant: Any
    profile_id: str | None
    profile: dict[str, Any] | None
    speed: float = 240.0
    paused: bool = False
    running: bool = False
    created_at: float = field(default_factory=time)
    last_activity: float = field(default_factory=time)
    subscribers: set[asyncio.Queue[dict[str, Any]]] = field(default_factory=set)
    task: asyncio.Task[None] | None = None
    applied_profile_hour: int | None = None
    pending_profile: tuple[int, str, dict[str, Any]] | None = None
    budget: float = 0.0
    sent_events: int = 0
    last_sample_t: float = -60.0
    recommendations: list[dict[str, Any]] = field(default_factory=list)
    _snapshot_t: float | None = field(default=None, repr=False)
    _snapshot: dict[str, Any] | None = field(default=None, repr=False)

    def snapshot(self) -> dict[str, Any]:
        """Una lectura de sensores por instante simulado, compartida por PLC y 3D."""
        if self._snapshot is None or self._snapshot_t != self.plant.t:
            self._snapshot = self.plant.snapshot()
            self._snapshot_t = self.plant.t
        return self._snapshot

    def invalidate_snapshot(self) -> None:
        self._snapshot = None

    def message(self) -> dict[str, Any]:
        snapshot = self.snapshot()
        hour = int(self.plant.t // 3600)
        profile_state = {"id": self.profile_id, "hour": hour} if self.profile_id else None
        events = [event.to_dict() for event in self.plant.events[self.sent_events :]][-200:]
        self.sent_events = len(self.plant.events)
        return clean(
            {
                "session_id": self.id,
                "t": self.plant.t,
                "speed": self.speed,
                "paused": self.paused,
                "running": self.running,
                "profile": profile_state,
                "snapshot": snapshot,
                "plc_tags": plc_tags(
                    snapshot, profile_id=self.profile_id, profile_hour=hour if profile_state else None, simulated_time=self.plant.t
                ),
                "events": events,
            }
        )

    def apply_profile_hour(self, hour: int) -> None:
        if self.pending_profile is not None and hour >= self.pending_profile[0]:
            _, self.profile_id, self.profile = self.pending_profile
            self.pending_profile = None
            self.applied_profile_hour = None
        if self.profile is None or self.applied_profile_hour == hour:
            return
        for item in commands_for_hour(self.profile, hour):
            equipment = self.plant.equipment[item["equipment"]]
            equipment.command(item["command"], item["args"])
            self.plant.events.extend(equipment.drain_events())
        self.applied_profile_hour = hour
        self.invalidate_snapshot()

    def publish(self) -> None:
        message = self.message()
        if message["t"] - self.last_sample_t >= 60:
            historian.sample(
                self.id,
                message["t"],
                {"plc_tags": message["plc_tags"], "profile": message["profile"], "events": message["events"]},
            )
            historian.frame(self.id, message["t"], message["snapshot"])
            self.last_sample_t = message["t"]
        for queue in list(self.subscribers):
            if queue.full():
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            queue.put_nowait(message)


class SessionManager:
    def __init__(self) -> None:
        self.sessions: dict[str, PlantSession] = {}

    def create(
        self, plant_id: str, model: PlantModel, profile_id: str | None = None, profile: dict[str, Any] | None = None
    ) -> PlantSession:
        plant = model.create(seed=1, random_faults=False, horizon_s=86400.0)
        session = PlantSession(str(uuid4()), plant_id, plant, profile_id, profile)
        self.sessions[session.id] = session
        return session

    def get(self, plant_id: str, session_id: str) -> PlantSession | None:
        session = self.sessions.get(session_id)
        return session if session and session.plant_id == plant_id else None

    def start(self, session: PlantSession) -> None:
        if session.running and session.task is not None and not session.task.done():
            return
        session.running = True
        session.last_activity = time()
        session.task = asyncio.create_task(self._run(session))

    async def _run(self, session: PlantSession) -> None:
        try:
            while session.running:
                if not session.paused:
                    session.apply_profile_hour(int(session.plant.t // 3600))
                    session.budget += session.speed * TICK_S
                    steps = 0
                    while session.budget >= session.plant.model.dt and steps < MAX_STEPS_PER_TICK:
                        session.plant.step()
                        session.budget -= session.plant.model.dt
                        steps += 1
                    if steps == MAX_STEPS_PER_TICK:
                        session.budget = 0.0
                session.publish()
                await asyncio.sleep(TICK_S)
        finally:
            session.publish()

    def stop(self, session: PlantSession) -> None:
        session.running = False
        session.last_activity = time()

    def schedule_profile(self, session: PlantSession, profile_id: str, profile: dict[str, Any]) -> int:
        """Programa el perfil para la siguiente hora simulada; no envía mandos al aceptarlo."""
        current_hour = int(session.plant.t // 3600)
        session.pending_profile = (current_hour + 1, profile_id, profile)
        session.last_activity = time()
        return current_hour + 1

    def command(self, session: PlantSession, payload: dict[str, Any]) -> None:
        if "speed" in payload:
            requested_speed = float(payload["speed"])
            if requested_speed not in {60.0, 120.0, 240.0, 600.0}:
                raise ValueError("velocidad permitida: ×60, ×120, ×240 o ×600")
            session.speed = requested_speed
        if "pause" in payload:
            session.paused = bool(payload["pause"])
        if "command" in payload:
            equipment = session.plant.equipment[payload["equipment"]]
            equipment.command(payload["command"], payload.get("args") or {})
            session.plant.events.extend(equipment.drain_events())
            session.invalidate_snapshot()
        historian.command(session.id, session.plant.t, payload)
        session.last_activity = time()

    def publish_recommendation(self, session: PlantSession, recommendation: dict[str, Any]) -> dict[str, Any]:
        item = {"id": str(uuid4()), "status": "pending", "created_t": session.plant.t, **recommendation}
        session.recommendations.append(item)
        historian.command(session.id, session.plant.t, {"source": "fractal", "recommendation": item})
        historian.recommendation(session.id, item["id"], session.plant.t, item)
        return item

    def decide_recommendation(self, session: PlantSession, recommendation_id: str, accept: bool) -> dict[str, Any]:
        item = next((value for value in session.recommendations if value["id"] == recommendation_id), None)
        if item is None:
            raise KeyError("recomendación desconocida")
        item["status"] = "accepted" if accept else "rejected"
        if accept:
            for command in item.get("proposal", []):
                self.command(session, command)
        historian.command(
            session.id,
            session.plant.t,
            {"source": "operator", "recommendation_id": recommendation_id, "decision": item["status"]},
        )
        historian.recommendation(session.id, recommendation_id, session.plant.t, item)
        return item

    def subscribe(self, session: PlantSession) -> asyncio.Queue[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=2)
        session.subscribers.add(queue)
        queue.put_nowait(session.message())
        return queue

    def unsubscribe(self, session: PlantSession, queue: asyncio.Queue[dict[str, Any]]) -> None:
        session.subscribers.discard(queue)


manager = SessionManager()
