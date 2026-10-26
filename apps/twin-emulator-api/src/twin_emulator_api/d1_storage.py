"""Adaptador mínimo al endpoint D1 interno del Worker de Cloudflare.

SQLite sigue siendo el backend local. En producción, el Container no accede
al disco ni contiene credenciales de cuenta: el Worker valida un secreto de
servicio y ejecuta las sentencias mediante el binding D1.
"""

from __future__ import annotations

import base64
import json
import os
from collections.abc import Sequence
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class D1StorageError(RuntimeError):
    """Falló la petición al bridge interno de D1."""


def _encode_value(value: Any) -> Any:
    if isinstance(value, (bytes, bytearray, memoryview)):
        return {"__twin_d1_bytes__": base64.b64encode(bytes(value)).decode("ascii")}
    return value


def _decode_value(value: Any) -> Any:
    if isinstance(value, dict) and set(value) == {"__twin_d1_bytes__"}:
        return base64.b64decode(value["__twin_d1_bytes__"], validate=True)
    return value


class D1Cursor:
    def __init__(self, rows: list[list[Any]], changes: int = 0) -> None:
        self._rows = [tuple(_decode_value(value) for value in row) for row in rows]
        self.rowcount = changes

    def fetchone(self) -> tuple[Any, ...] | None:
        return self._rows.pop(0) if self._rows else None

    def fetchall(self) -> list[tuple[Any, ...]]:
        rows, self._rows = self._rows, []
        return rows


class D1Connection:
    """Subset síncrono del contrato sqlite3 usado por los stores existentes."""

    def __init__(self, endpoint: str, token: str, *, timeout: float = 10.0) -> None:
        self.endpoint = endpoint
        self.token = token
        self.timeout = timeout

    def __enter__(self) -> D1Connection:
        return self

    def __exit__(self, exc_type: Any, exc: Any, traceback: Any) -> bool:
        # Cada sentencia D1 es atómica; los stores no agrupan transacciones multi-sentencia.
        return False

    def execute(self, sql: str, parameters: Sequence[Any] = ()) -> D1Cursor:
        payload = json.dumps({"sql": sql, "params": [_encode_value(value) for value in parameters]}, separators=(",", ":")).encode()
        request = Request(
            self.endpoint,
            data=payload,
            headers={"authorization": f"Bearer {self.token}", "content-type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=self.timeout) as response:
                result = json.loads(response.read())
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise D1StorageError("No se pudo acceder al almacenamiento D1 del emulador") from exc
        if not isinstance(result, dict) or result.get("success") is not True:
            raise D1StorageError("D1 rechazó la sentencia solicitada")
        rows = result.get("rows", [])
        if not isinstance(rows, list) or any(not isinstance(row, list) for row in rows):
            raise D1StorageError("Respuesta D1 con formato inválido")
        return D1Cursor(rows, int(result.get("changes", 0)))


def connect(path: str | os.PathLike[str]) -> Any:
    """Abre D1 cuando el Worker lo configura; de lo contrario usa SQLite local."""
    backend = os.environ.get("TWIN_DATA_BACKEND", "sqlite").lower()
    if backend == "sqlite":
        import sqlite3

        return sqlite3.connect(path)
    if backend != "d1":
        raise RuntimeError(f"TWIN_DATA_BACKEND no soportado: {backend}")
    endpoint = os.environ.get("TWIN_D1_GATEWAY_URL", "").strip()
    token = os.environ.get("TWIN_D1_GATEWAY_TOKEN", "").strip()
    if not endpoint or not token:
        raise RuntimeError("El backend D1 requiere TWIN_D1_GATEWAY_URL y TWIN_D1_GATEWAY_TOKEN")
    return D1Connection(endpoint, token)
