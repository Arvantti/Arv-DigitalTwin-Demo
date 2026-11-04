#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const VOICE_SETTINGS = Object.freeze({
  stability: 0.5,
  similarity_boost: 0.85,
  style: 0,
  speed: 1,
  use_speaker_boost: true,
});

async function assertDoesNotExist(path) {
  try {
    await access(path);
    throw new Error(`El archivo ya existe; no se sobrescribe: ${path}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

export async function generateVoiceover({ text, apiKey, voiceId, modelId, outputPath, confirmed = false, fetchImpl = fetch }) {
  if (confirmed !== true) throw new Error('Se requiere confirmación explícita antes de enviar el guion.');
  if (!apiKey?.trim()) throw new Error('Falta ELEVENLABS_API_KEY en el entorno.');
  if (!voiceId?.trim()) throw new Error('Falta ELEVENLABS_VOICE_ID en el entorno.');
  if (!modelId?.trim()) throw new Error('ELEVENLABS_MODEL_ID no puede estar vacío.');
  if (!text?.trim()) throw new Error('El guion está vacío.');
  if (text.includes(apiKey)) throw new Error('El guion parece contener una credencial; no se enviará.');
  await assertDoesNotExist(outputPath);

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`;
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: modelId, voice_settings: VOICE_SETTINGS }),
  });
  if (!response.ok) throw new Error(`ElevenLabs respondió HTTP ${response.status}; respuesta omitida por seguridad.`);
  const audio = Buffer.from(await response.arrayBuffer());
  if (!audio.length) throw new Error('ElevenLabs devolvió un archivo vacío.');
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, audio, { flag: 'wx' });
  return audio.length;
}

export function resolveModelId(environment = process.env) {
  return environment.ELEVENLABS_MODEL_ID || 'eleven_v4';
}

export function buildMetadata({ modelId, voiceId }) {
  return {
    provider: 'elevenlabs',
    modelId,
    voiceId,
    output: 'assets/audio/voiceover.mp3',
    generatedAt: new Date().toISOString(),
    requestParameters: {
      model_id: modelId,
      voice_settings: VOICE_SETTINGS,
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const value = (name) => {
    const index = args.indexOf(name);
    return index < 0 ? null : args[index + 1];
  };
  const projectArg = value('--project');
  if (!projectArg) throw new Error('Uso: pnpm video:voice --project <carpeta> [--script <guion-aprobado.md>]');

  const project = resolve(projectArg);
  const scriptPath = resolve(value('--script') ?? join(project, 'script.md'));
  const outputPath = resolve(project, 'assets/audio/voiceover.mp3');
  const metaPath = resolve(project, 'assets/audio/voiceover-meta.json');
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  const modelId = resolveModelId();
  if (!apiKey?.trim() || !voiceId?.trim()) {
    throw new Error('Configura ELEVENLABS_API_KEY y ELEVENLABS_VOICE_ID en el entorno.');
  }

  const text = (await readFile(scriptPath, 'utf8')).trim();
  if (!text) throw new Error('El archivo de guion está vacío.');
  if (text.includes(apiKey)) throw new Error('El guion parece contener una credencial; no se enviará.');
  await assertDoesNotExist(outputPath);
  await assertDoesNotExist(metaPath);

  console.log(`Guion: ${scriptPath}\nModelo: ${modelId}\nVoz: ${voiceId}\nSalida: ${outputPath}`);
  console.log('\n--- Guion que se enviará ---\n');
  console.log(text);
  console.log('\n--- Fin del guion ---');
  console.log('ElevenLabs recibirá el texto completo y podrá procesarlo externamente.');
  const rl = createInterface({ input: stdin, output: stdout });
  let answer;
  try {
    answer = await rl.question('¿Confirmas enviar este guion? Escribe ENVIAR para continuar: ');
  } finally {
    rl.close();
  }
  if (answer !== 'ENVIAR') throw new Error('Cancelado; no se envió texto.');

  const bytes = await generateVoiceover({ text, apiKey, voiceId, modelId, outputPath, confirmed: true });
  const metadata = buildMetadata({ modelId, voiceId });
  await writeFile(metaPath, `${JSON.stringify(metadata, null, 2)}\n`, { flag: 'wx' });
  console.log(`Locución generada (${bytes} bytes): ${outputPath}`);
  console.log(`Metadatos registrados: ${metaPath}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
