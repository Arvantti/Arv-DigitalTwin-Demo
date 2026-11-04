import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMetadata, generateVoiceover, resolveModelId } from './voiceover.mjs';

test('uses ELEVENLABS_MODEL_ID or defaults to eleven_v4', () => {
  assert.equal(resolveModelId({ ELEVENLABS_MODEL_ID: 'custom-model' }), 'custom-model');
  assert.equal(resolveModelId({}), 'eleven_v4');
});

const requestSettings = {
  stability: 0.5,
  similarity_boost: 0.85,
  style: 0,
  speed: 1,
  use_speaker_boost: true,
};

test('posts confirmed text through a mocked HTTP request and writes MP3 bytes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'video-voice-test-'));
  const outputPath = join(dir, 'assets/audio/voiceover.mp3');
  let request;
  try {
    const bytes = await generateVoiceover({
      text: 'Approved script',
      apiKey: 'mock-key-for-test-only',
      voiceId: 'voice-test',
      modelId: 'model-test',
      outputPath,
      confirmed: true,
      fetchImpl: async (url, options) => {
        request = { url, options };
        return new Response(Buffer.from('fake-mp3'), { status: 200, headers: { 'content-type': 'audio/mpeg' } });
      },
    });
    assert.equal(bytes, 8);
    assert.equal(request.url, 'https://api.elevenlabs.io/v1/text-to-speech/voice-test');
    assert.equal(request.options.headers['xi-api-key'], 'mock-key-for-test-only');
    assert.deepEqual(JSON.parse(request.options.body), {
      text: 'Approved script',
      model_id: 'model-test',
      voice_settings: requestSettings,
    });
    assert.equal((await readFile(outputPath)).toString(), 'fake-mp3');

    const metadata = buildMetadata({ modelId: 'model-test', voiceId: 'voice-test' });
    assert.equal(metadata.modelId, 'model-test');
    assert.equal(metadata.voiceId, 'voice-test');
    assert.deepEqual(metadata.requestParameters.voice_settings, requestSettings);
    assert.equal(Object.hasOwn(metadata, 'apiKey'), false);
    assert.equal(JSON.stringify(metadata).includes('mock-key-for-test-only'), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('refuses to send without explicit confirmation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'video-voice-test-'));
  let requested = false;
  try {
    await assert.rejects(generateVoiceover({
      text: 'Approved script', apiKey: 'mock-key', voiceId: 'voice-test', modelId: 'model-test',
      outputPath: join(dir, 'voiceover.mp3'),
      fetchImpl: async () => { requested = true; return new Response('audio'); },
    }), /confirmación explícita/);
    assert.equal(requested, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('does not write an output when the mocked HTTP response fails', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'video-voice-test-'));
  const outputPath = join(dir, 'voice.mp3');
  try {
    await assert.rejects(generateVoiceover({
      text: 'Approved script', apiKey: 'mock-key', voiceId: 'v', modelId: 'm', outputPath, confirmed: true,
      fetchImpl: async () => new Response('private response body', { status: 429 }),
    }), /HTTP 429/);
    await assert.rejects(readFile(outputPath), { code: 'ENOENT' });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('refuses to overwrite an existing audio file before making HTTP request', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'video-voice-test-'));
  const outputPath = join(dir, 'voice.mp3');
  await writeFile(outputPath, 'keep');
  let requested = false;
  try {
    await assert.rejects(generateVoiceover({
      text: 'Approved script', apiKey: 'mock-key', voiceId: 'v', modelId: 'm', outputPath, confirmed: true,
      fetchImpl: async () => { requested = true; return new Response('audio'); },
    }), /no se sobrescribe/);
    assert.equal(requested, false);
    assert.equal((await readFile(outputPath)).toString(), 'keep');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
