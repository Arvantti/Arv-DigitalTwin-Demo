import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateMusic } from './music.mjs';

test('sends one confirmed music request and records prompt metadata without a key', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'video-music-test-'));
  const outputPath = join(dir, 'assets/audio/music.mp3');
  let request;
  try {
    const result = await generateMusic({
      prompt: 'Original instrumental orchestral cue', apiKey: 'mock-key-for-test-only', durationMs: 9000,
      outputPath, confirmed: true,
      fetchImpl: async (url, options) => {
        request = { url, options };
        return new Response(Buffer.from('fake-mp3'), { status: 200, headers: { 'content-type': 'audio/mpeg' } });
      },
    });
    assert.equal(request.url, 'https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128');
    assert.equal(request.options.headers['xi-api-key'], 'mock-key-for-test-only');
    assert.deepEqual(JSON.parse(request.options.body), {
      prompt: 'Original instrumental orchestral cue', music_length_ms: 9000, model_id: 'music_v1',
    });
    assert.equal((await readFile(outputPath)).toString(), 'fake-mp3');
    const metaText = await readFile(`${outputPath}.meta.json`, 'utf8');
    const metadata = JSON.parse(metaText);
    assert.equal(metadata.prompt, 'Original instrumental orchestral cue');
    assert.equal(metadata.modelId, 'music_v1');
    assert.match(metadata.rightsReview, /not a copyright guarantee/);
    assert.equal(metaText.includes('mock-key-for-test-only'), false);
    assert.equal(result.bytes, 8);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('refuses generation without explicit consent', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'video-music-test-'));
  let requested = false;
  try {
    await assert.rejects(generateMusic({
      prompt: 'Music', apiKey: 'mock-key', durationMs: 9000, outputPath: join(dir, 'music.mp3'),
      fetchImpl: async () => { requested = true; return new Response('audio'); },
    }), /confirmación explícita/);
    assert.equal(requested, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('does not retry or write output on provider failure', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'video-music-test-'));
  let calls = 0;
  const outputPath = join(dir, 'music.mp3');
  try {
    await assert.rejects(generateMusic({
      prompt: 'Music', apiKey: 'mock-key', durationMs: 9000, outputPath, confirmed: true,
      fetchImpl: async () => { calls += 1; return new Response('private body', { status: 429 }); },
    }), /HTTP 429/);
    assert.equal(calls, 1);
    await assert.rejects(readFile(outputPath), { code: 'ENOENT' });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('does not overwrite pre-existing output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'video-music-test-'));
  const outputPath = join(dir, 'music.mp3');
  await writeFile(outputPath, 'keep');
  let requested = false;
  try {
    await assert.rejects(generateMusic({
      prompt: 'Music', apiKey: 'mock-key', durationMs: 9000, outputPath, confirmed: true,
      fetchImpl: async () => { requested = true; return new Response('audio'); },
    }), /no se sobrescribe/);
    assert.equal(requested, false);
    assert.equal((await readFile(outputPath)).toString(), 'keep');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
