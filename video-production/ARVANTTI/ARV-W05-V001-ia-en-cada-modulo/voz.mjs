#!/usr/bin/env node
/**
 * Voz del video "La IA en cada módulo" (ElevenLabs, con tiempos por carácter).
 *   node voz.mjs            muestra los textos que se enviarían
 *   node voz.mjs --enviar   genera solo las escenas nuevas o cambiadas en assets/audio/<escena>/
 *   node voz.mjs --revisar  transcribe cada escena con ElevenLabs Scribe para comprobar la pronunciación
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const T = (p) => path.join(HERE, p);
const V = JSON.parse(fs.readFileSync(T("video.json"), "utf8"));
export const vozDe = (id) => T(`assets/audio/${id}/voiceover.mp3`);
export const alineacionDe = (id) => T(`assets/audio/${id}/alignment.json`);

// Palabras que la voz en español lee mal: se envían como se pronuncian (los subtítulos muestran el original).
const PRONUNCIA = [["DigitalTwin", "Digital Twin"], ["Integrator", "Íntegreitor"], ["SCADA", "Escada"], ["Scada", "Escada"], ["ERP", "E R P"], ["CRM", "C R M"], ["APS", "A P S"], ["3D", "tres D"], ["MCP", "M C P"], ["CLI", "C L I"], ["OS", "O S"], ["AI", "Ei Ai"]];
export function paraVoz(texto) {
  let out = "", idx = [];
  for (let i = 0; i < texto.length; ) {
    const p = PRONUNCIA.find(([a]) => texto.startsWith(a, i) && !/\p{L}/u.test(texto[i - 1] || "") && !/\p{L}/u.test(texto[i + a.length] || ""));
    if (p) {
      for (let k = 0; k < p[0].length; k++) idx.push(out.length + Math.floor((k * p[1].length) / p[0].length));
      out += p[1];
      i += p[0].length;
    } else idx.push(out.length), (out += texto[i++]);
  }
  return { texto: out, idx };
}
const VOICE_SETTINGS = { stability: 0.5, similarity_boost: 0.85, style: 0, speed: 1, use_speaker_boost: true };
const modelo = () => process.env.ELEVENLABS_MODEL_ID || "eleven_v4";
const hash = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
function credenciales() {
  const apiKey = process.env.ELEVENLABS_API_KEY, voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey?.trim() || !voiceId?.trim()) throw new Error("Faltan ELEVENLABS_API_KEY o ELEVENLABS_VOICE_ID en el entorno.");
  return { apiKey, voiceId };
}

async function generar() {
  const enviar = process.argv.includes("--enviar");
  const pend = V.escenas.filter((e) => {
    const a = alineacionDe(e.id);
    return !(fs.existsSync(vozDe(e.id)) && fs.existsSync(a) && JSON.parse(fs.readFileSync(a, "utf8")).hash === hash(`${modelo()}|${paraVoz(e.voz).texto}`));
  });
  console.log(`${pend.length} escenas nuevas o cambiadas, ${pend.reduce((n, e) => n + paraVoz(e.voz).texto.length, 0)} caracteres (modelo ${modelo()}).`);
  if (!enviar) return pend.forEach((e) => console.log(`- ${e.id}: ${paraVoz(e.voz).texto}`));
  const { apiKey, voiceId } = credenciales();
  for (const e of pend) {
    const pv = paraVoz(e.voz);
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({ text: pv.texto, model_id: modelo(), voice_settings: VOICE_SETTINGS }),
    });
    if (!res.ok) throw new Error(`${e.id}: ElevenLabs respondió HTTP ${res.status}; respuesta omitida por seguridad.`);
    const j = await res.json();
    fs.mkdirSync(path.dirname(vozDe(e.id)), { recursive: true });
    fs.writeFileSync(vozDe(e.id), Buffer.from(j.audio_base64, "base64"));
    let a = j.alignment || j.normalized_alignment;
    if (a && pv.texto !== e.voz && a.characters?.length === pv.texto.length) a = { characters: [...e.voz], character_start_times_seconds: pv.idx.map((k) => a.character_start_times_seconds[k]) };
    fs.writeFileSync(alineacionDe(e.id), `${JSON.stringify({ hash: hash(`${modelo()}|${pv.texto}`), modelo: modelo(), texto: e.voz, alignment: a })}\n`);
    console.log(`${e.id}: listo`);
  }
}

async function revisar() {
  const { apiKey } = credenciales();
  for (const e of V.escenas) {
    if (!fs.existsSync(vozDe(e.id))) continue;
    const fd = new FormData();
    fd.append("model_id", "scribe_v1");
    fd.append("language_code", "spa");
    fd.append("file", new Blob([fs.readFileSync(vozDe(e.id))], { type: "audio/mpeg" }), "voz.mp3");
    const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": apiKey }, body: fd });
    if (!res.ok) { console.log(`${e.id}: Scribe HTTP ${res.status}`); continue; }
    console.log(`${e.id}: ${(await res.json()).text}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await (process.argv.includes("--revisar") ? revisar() : generar());
