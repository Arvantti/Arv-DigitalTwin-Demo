#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { dirname, join, resolve } from 'node:path';

const rl = createInterface({ input, output });
const ask = async (question) => (await rl.question(`${question}: `)).trim();
const required = async (question) => {
  const value = await ask(question);
  if (!value) throw new Error(`Falta completar: ${question}`);
  return value;
};
const positiveNumber = async (question, integer = false) => {
  const value = Number(await required(question));
  if (!Number.isFinite(value) || value <= 0 || (integer && !Number.isInteger(value))) {
    throw new Error(`${question} debe ser ${integer ? 'un entero' : 'un número'} mayor que cero.`);
  }
  return value;
};

try {
  console.log('\nGenerador de configuración de video · ARVANTTI Labs\n');
  console.log('Elige el formato; no se selecciona uno automáticamente.');
  console.log('1) Vertical social   1080×1920');
  console.log('2) Horizontal        1920×1080');
  console.log('3) Cuadrado          1080×1080');
  console.log('4) Personalizado\n');

  const format = await required('¿Qué tipo y tamaño quieres para el video? (1–4)');
  const presets = {
    '1': [1080, 1920, 'vertical-social'],
    '2': [1920, 1080, 'horizontal'],
    '3': [1080, 1080, 'square'],
  };
  let width, height, formatId;
  if (presets[format]) {
    [width, height, formatId] = presets[format];
  } else if (format === '4') {
    width = await positiveNumber('Ancho en píxeles', true);
    height = await positiveNumber('Alto en píxeles', true);
    formatId = 'custom';
  } else {
    throw new Error('Selecciona una opción entre 1 y 4.');
  }

  const title = await required('Título del proyecto');
  const slug = title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!slug) throw new Error('El título debe producir un slug válido.');
  const topic = await required('Tema principal');
  const channel = await required('Canal de publicación');
  const audience = await required('Audiencia');
  const voiceover = await required('¿Habrá locución real? (sí/no)');
  const claimsSource = await required('Fuente de claims (ruta o URL; escribe «sin claims» si aplica)');
  const duration = await positiveNumber('Duración en segundos');
  const fps = await positiveNumber('Frames por segundo', true);
  const suggestedDir = `./video-production/ARVANTTI/ARV-W01-V001-${slug}`;
  const projectDir = resolve((await ask(`Carpeta del proyecto [${suggestedDir}]`)) || suggestedDir);

  const safeArea = formatId === 'vertical-social'
    ? { left: 96, right: 984, top: 260, bottom: 1580 }
    : { left: Math.round(width * 0.08), right: Math.round(width * 0.92), top: Math.round(height * 0.1), bottom: Math.round(height * 0.9) };

  const config = {
    project: title,
    topic,
    channel,
    audience,
    voiceover,
    claimsSource,
    engine: 'hyperframes',
    brand: 'arvantti',
    sharedComponents: 'assets/shared/core',
    format: formatId,
    width,
    height,
    fps,
    durationSeconds: duration,
    safeArea,
    audio: {
      voiceover: 'assets/audio/voiceover.mp3',
      subtitles: 'assets/captions/captions.vtt',
      sfxDirectory: 'assets/shared/core/sfx',
    },
    branding: {
      sharedAssets: 'assets/shared',
      logo: 'assets/shared/arvantti/branding/ArvanttiLabsLogo.png',
    },
    qa: {
      requireFullTimelineCoverage: true,
      requireSafeArea: true,
      requireAudioCheck: true,
      requireKeyframes: true,
    },
  };

  await mkdir(dirname(projectDir), { recursive: true });
  await mkdir(projectDir);
  await writeFile(join(projectDir, 'video-config.json'), `${JSON.stringify(config, null, 2)}\n`, { flag: 'wx' });
  console.log(`\nConfiguración creada: ${join(projectDir, 'video-config.json')}`);
  console.log(`ARVANTTI · ${width}×${height} · ${fps} fps · ${duration}s · HyperFrames`);
} catch (error) {
  console.error(`\nNo se generó la configuración: ${error.message}`);
  process.exitCode = 1;
} finally {
  rl.close();
}
