#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const ENDPOINT = 'https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128';
const MODEL_ID = 'music_v1';

async function assertAbsent(path) {
  try {
    await access(path);
    throw new Error(`El archivo ya existe; no se sobrescribe: ${path}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

export async function generateMusic({ prompt, apiKey, durationMs, outputPath, confirmed = false, fetchImpl = fetch }) {
  if (confirmed !== true) throw new Error('Se requiere confirmación explícita antes de enviar el prompt.');
  if (!apiKey?.trim()) throw new Error('Falta ELEVENLABS_API_KEY en el entorno.');
  if (!prompt?.trim()) throw new Error('El prompt de música está vacío.');
  if (!Number.isInteger(durationMs) || durationMs < 3000 || durationMs > 600000) {
    throw new Error('durationMs debe ser un entero entre 3000 y 600000 ms.');
  }
  if (prompt.includes(apiKey)) throw new Error('El prompt parece contener una credencial; no se enviará.');
  await assertAbsent(outputPath);
  await assertAbsent(`${outputPath}.meta.json`);

  // Una llamada por confirmación. No reintentar: errores de cuota/autenticación requieren revisión humana.
  const response = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ prompt, music_length_ms: durationMs, model_id: MODEL_ID }),
  });
  if (!response.ok) throw new Error(`ElevenLabs Music respondió HTTP ${response.status}; respuesta omitida por seguridad.`);
  const audio = Buffer.from(await response.arrayBuffer());
  if (!audio.length) throw new Error('ElevenLabs Music devolvió un archivo vacío.');

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, audio, { flag: 'wx' });
  const metadata = {
    provider: 'elevenlabs',
    modelId: MODEL_ID,
    outputFormat: 'mp3_44100_128',
    durationRequestedMs: durationMs,
    prompt,
    promptSha256: createHash('sha256').update(prompt, 'utf8').digest('hex'),
    output: relative(dirname(outputPath), outputPath) || '.',
    generatedAt: new Date().toISOString(),
    rightsReview: 'pending: verify ElevenLabs plan terms and YouTube use before distribution; generation alone is not a copyright guarantee',
  };
  await writeFile(`${outputPath}.meta.json`, `${JSON.stringify(metadata, null, 2)}\n`, { flag: 'wx' });
  return { bytes: audio.length, metadata };
}

function option(args, name) {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

async function main() {
  const args = process.argv.slice(2);
  const projectArg = option(args, '--project');
  const promptArg = option(args, '--prompt');
  const durationSeconds = Number(option(args, '--duration-seconds'));
  if (!projectArg || !promptArg || !Number.isFinite(durationSeconds)) {
    throw new Error('Uso: pnpm video:music --project <paquete> --prompt <archivo.txt> --duration-seconds <segundos> [--output <ruta-relativa.mp3>]');
  }
  const project = resolve(projectArg);
  const promptPath = resolve(project, promptArg);
  const promptRelative = relative(project, promptPath);
  if (promptRelative.startsWith('..') || isAbsolute(promptRelative)) throw new Error('El archivo de prompt debe estar dentro del paquete de video.');
  const outputRelative = option(args, '--output') ?? 'assets/audio/music.mp3';
  if (isAbsolute(outputRelative) || outputRelative.split(/[\\/]/).includes('..')) throw new Error('--output debe ser una ruta relativa dentro del paquete.');
  const outputPath = join(project, outputRelative);
  const durationMs = Math.round(durationSeconds * 1000);
  const prompt = (await readFile(promptPath, 'utf8')).trim();
  if (!prompt) throw new Error('El archivo de prompt está vacío.');
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey?.trim()) throw new Error('Configura ELEVENLABS_API_KEY mediante el entorno seguro del proceso.');
  if (prompt.includes(apiKey)) throw new Error('El prompt parece contener una credencial; no se enviará.');
  await assertAbsent(outputPath);
  await assertAbsent(`${outputPath}.meta.json`);

  console.log(`Proveedor/modelo: ElevenLabs Music / ${MODEL_ID}`);
  console.log(`Duración solicitada: ${durationSeconds} s`);
  console.log(`Prompt: ${promptPath}`);
  console.log(`Salida: ${outputPath}`);
  console.log('\n--- Prompt exacto que se enviará ---\n');
  console.log(prompt);
  console.log('\n--- Fin del prompt ---');
  console.log('La generación puede consumir cuota. La música generada no garantiza por sí sola ausencia de reclamos de copyright.');
  const rl = createInterface({ input: stdin, output: stdout });
  let answer;
  try {
    answer = await rl.question('¿Autorizas esta única llamada y el consumo de cuota? Escribe ENVIAR: ');
  } finally {
    rl.close();
  }
  if (answer !== 'ENVIAR') throw new Error('Cancelado; no se hizo ninguna llamada.');
  const result = await generateMusic({ prompt, apiKey, durationMs, outputPath, confirmed: true });
  console.log(`Audio generado (${result.bytes} bytes): ${outputPath}`);
  console.log(`Metadatos sin secretos: ${outputPath}.meta.json`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
