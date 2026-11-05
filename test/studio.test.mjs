import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, readFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { createStudio, decodeImage, validateProduct } from '../src/server.mjs';
import { scenes, angles, buildPrompt } from '../src/scenes.mjs';
import { makeZip } from '../src/zip.mjs';
import { canonicalSpecifications, listingInstructions } from '../src/listing.mjs';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=', 'base64');
const listing = { title: 'Acme Home Decorative Storage Set for Thoughtful Table Settings', amazonTitle: 'Acme Home Decorative Storage Set', itemHighlights: 'Considered details for dining and display', bullets: Array(5).fill('Distinctive decorative details for a considered table setting.'), amazonDescription: 'A considered addition to the table. '.repeat(10), description: 'Decorative details create an inviting setting for everyday arrangements and special occasions. '.repeat(12), specifications: [], reviewNotes: ['Confirm care instructions.'] };
const writeListing = directory => writeFile(path.join(directory, 'outputs/listing.json'), JSON.stringify(listing));
const image = { name: '../../unsafe.png', data: `data:image/png;base64,${png.toString('base64')}` };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn) { for (let i = 0; i < 120; i++) { const value = await fn(); if (value) return value; await wait(20); } throw new Error('Timed out'); }
async function fixture(t, options = {}) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'shelf-studio-test-'));
  const app = await createStudio({ dataDir, checkLogin: async () => ({ ready: true, message: 'Test login' }), ...options });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const { token } = await (await fetch(`${base}/api/status`)).json();
  const request = (route, body, headers = {}) => fetch(base + route, body === undefined ? { headers } : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Studio-Token': token, ...headers }, body: JSON.stringify(body) });
  t.after(async () => { await app.close(); await wait(30); await rm(dataDir, { recursive: true, force: true }); });
  return { app, dataDir, base, request };
}

test('rejects disguised or malformed images', () => {
  assert.equal(decodeImage(image).extension, 'png');
  assert.throws(() => decodeImage({ name: 'x.png', data: 'data:image/png;base64,PHNjcmlwdD4=' }), /valid/);
  assert.throws(() => decodeImage({ name: 'x.svg', data: 'data:image/svg+xml;base64,AAAA' }), /supported/);
  assert.throws(() => decodeImage({ name: 'x.png', data: image.data.slice(0, -12) }), /valid/);
});

test('upload, progress, completion, ZIP and restart persistence', async t => {
  const calls = [];
  const f = await fixture(t, { runner: ({ directory, prompt }) => {
    calls.push(prompt);
    return { done: (async () => { await wait(50); await writeListing(directory); for (const s of scenes) await writeFile(path.join(directory, 'outputs', s.id + '.png'), png); })(), cancel() {} };
  } });
  const response = await f.request('/api/jobs', { images: [image], notes: 'Keep lids open' });
  assert.equal(response.status, 201); const job = await response.json();
  assert.equal(job.inputs[0].url, `/files/${job.id}/inputs/reference-1.png`);
  const done = await until(async () => { const j = await (await f.request(`/api/jobs/${job.id}`)).json(); return j.status === 'complete' && j; });
  assert.equal(done.count, 5); assert.match(calls[0], /Keep lids open/);
  assert.equal((await f.request(done.outputs[0].url)).status, 200);
  const zip = await f.request(`/api/jobs/${job.id}/download`);
  assert.equal(zip.headers.get('content-type'), 'application/zip');
  const bytes = Buffer.from(await zip.arrayBuffer());
  assert.equal(bytes.readUInt32LE(), 0x04034b50); assert.equal(bytes.readUInt16LE(bytes.length - 14), 7);
  assert.equal((await f.request(`/api/jobs/${job.id}/retry`, {})).status, 409);
  const reopened = await createStudio({ dataDir: f.dataDir, checkLogin: async () => ({ ready: true }) });
  await new Promise(resolve => reopened.server.listen(0, '127.0.0.1', resolve));
  const persisted = await (await fetch(`http://127.0.0.1:${reopened.server.address().port}/api/jobs`)).json();
  assert.equal(persisted[0].status, 'complete'); assert.equal(persisted[0].count, 5); await reopened.close();
});

test('partial failure retains outputs and retry requests only missing scenes', async t => {
  let count = 0, retryPrompt;
  const f = await fixture(t, { runner: ({ directory, prompt }) => ({ cancel() {}, done: (async () => {
    if (count++ === 0) { await writeFile(path.join(directory, 'outputs', `${scenes[0].id}.png`), png); throw new Error('Service interrupted'); }
    retryPrompt = prompt; await writeListing(directory);
    for (const s of scenes.slice(1)) await writeFile(path.join(directory, 'outputs', s.id + '.png'), png);
  })() }) });
  const job = await (await f.request('/api/jobs', { images: [image] })).json();
  await until(async () => (await (await f.request(`/api/jobs/${job.id}`)).json()).status === 'partial');
  assert.equal((await f.request(`/api/jobs/${job.id}/retry`, {})).status, 200);
  await until(async () => (await (await f.request(`/api/jobs/${job.id}`)).json()).status === 'complete');
  assert.match(retryPrompt, /Create 4 finished/); assert.doesNotMatch(retryPrompt, new RegExp(`Required output file:.*${scenes[0].id}`));
});

test('queue is sequential and cancelling releases next job', async t => {
  let runs = 0;
  const f = await fixture(t, { runner: ({ directory }) => {
    runs++;
    if (runs === 1) { let resolve; return { done: new Promise(r => { resolve = r; }), cancel: () => resolve() }; }
    return { cancel() {}, done: Promise.all([writeListing(directory), ...scenes.map(s => writeFile(path.join(directory, 'outputs', s.id + '.png'), png))]) };
  } });
  const first = await (await f.request('/api/jobs', { images: [image] })).json();
  await until(() => runs === 1);
  const second = await (await f.request('/api/jobs', { images: [image] })).json();
  assert.equal(runs, 1);
  assert.equal((await f.request(`/api/jobs/${first.id}/cancel`, {})).status, 200);
  await until(async () => (await (await f.request(`/api/jobs/${second.id}`)).json()).status === 'complete');
  assert.equal((await (await f.request(`/api/jobs/${first.id}`)).json()).status, 'cancelled');
});

test('guards submissions, malformed bodies and local files', async t => {
  let runs = 0;
  const f = await fixture(t, { runner: () => { runs++; return { done: Promise.resolve(), cancel() {} }; } });
  assert.equal((await f.request('/api/jobs', { images: [] })).status, 400);
  assert.equal((await f.request('/api/jobs', { images: Array(6).fill(image) })).status, 400);
  assert.equal((await f.request('/api/jobs', { images: [image], notes: 42 })).status, 400);
  assert.equal((await f.request('/api/jobs', null)).status, 400);
  assert.equal((await f.request('/api/jobs', { images: [image] }, { 'X-Studio-Token': 'wrong' })).status, 403);
  assert.equal((await f.request('/api/jobs', { images: [image] }, { Origin: 'https://evil.example' })).status, 403);
  const badHostStatus = await new Promise((resolve, reject) => {
    const req = http.get(f.base + '/api/jobs', { headers: { Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
  });
  assert.equal(badHostStatus, 403);
  assert.equal((await f.request('/server.mjs')).status, 404);
  assert.equal((await f.request('/files/../../../../.codex/auth.json')).status, 404);
  assert.equal(runs, 0);
});

test('symlinks and unfinished PNG outputs are never counted', async t => {
  const f = await fixture(t, { runner: ({ directory }) => ({ cancel() {}, done: (async () => {
    await symlink(path.join(directory, 'inputs/reference-1.png'), path.join(directory, 'outputs/stone-plinth.png'));
    await writeFile(path.join(directory, 'outputs/white-studio.png'), png.subarray(0, 35));
  })() }) });
  const job = await (await f.request('/api/jobs', { images: [image] })).json();
  const result = await until(async () => { const j = await (await f.request(`/api/jobs/${job.id}`)).json(); return j.status === 'failed' && j; });
  assert.equal(result.count, 0);
  assert.equal((await f.request(`/files/${job.id}/outputs/stone-plinth.png`)).status, 404);
});

test('restart marks an unfinished batch as interrupted', async t => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'studio-restart-'));
  const id = '11111111-1111-4111-8111-111111111111';
  await mkdir(path.join(dataDir, id));
  await writeFile(path.join(dataDir, id, 'job.json'), JSON.stringify({ id, status: 'generating', inputs: [], createdAt: new Date().toISOString() }));
  const app = await createStudio({ dataDir });
  assert.equal(JSON.parse(await readFile(path.join(dataDir, id, 'job.json'))).status, 'interrupted');
  await app.close(); await rm(dataDir, { recursive: true });
});

test('ZIP preserves filenames and binary content', () => {
  const zip = makeZip([{ name: 'white-studio.png', data: png }]);
  assert.ok(zip.includes(png)); assert.ok(zip.includes(Buffer.from('white-studio.png')));
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
});

test('product details validate counts, positive measurements and explicit units', () => {
  assert.equal(validateProduct(null).dimensionUnit, 'cm');
  assert.throws(() => validateProduct({ pieceCount: 2.5 }), /whole number/);
  assert.throws(() => validateProduct({ pieceCount: 0 }), /whole number/);
  assert.throws(() => validateProduct({ dimensionUnit: 'unknown' }), /unit/);
  assert.throws(() => validateProduct({ weightUnit: 'unknown' }), /unit/);
  assert.throws(() => validateProduct({ dimensions: [{ weight: -5 }] }), /positive/);
  assert.throws(() => validateProduct({ dimensions: [{ length: '10' }] }), /positive/);
  assert.throws(() => validateProduct({ dimensions: [{ height: Infinity }] }), /positive/);
  assert.equal(validateProduct({ dimensions: [{ label: 'Small bowl', breadth: 12.5 }] }).dimensions[0].height, null);
});

test('ten-piece measurements are stored, returned, and included in the generation prompt', async t => {
  let generatedPrompt;
  const f = await fixture(t, { runner: ({ prompt }) => { generatedPrompt = prompt; return { done: Promise.resolve(), cancel() {} }; } });
  const product = { brand: 'Acme Home', name: '', material: 'Stainless steel', pieceCount: 10, dimensionUnit: 'in', weightUnit: 'kg', dimensions: Array.from({ length: 10 }, (_, i) => ({ label: `Container ${i + 1}`, length: 10 + i, breadth: 8 + i, height: 5 + i, weight: 0.2 + i })) };
  const response = await f.request('/api/jobs', { images: [image], notes: 'All ten together', product });
  assert.equal(response.status, 201);
  const job = await response.json();
  assert.deepEqual(job.product, product);
  await until(() => generatedPrompt);
  assert.match(generatedPrompt, /Stainless steel/); assert.match(generatedPrompt, /Container 10/);
  assert.match(generatedPrompt, /"pieceCount":10/); assert.match(generatedPrompt, /"weightUnit":"kg"/);
  assert.match(generatedPrompt, /All ten together/);
  const stored = JSON.parse(await readFile(path.join(f.dataDir, job.id, 'job.json')));
  assert.deepEqual(stored.product, product);
});


test('copy is required, retry preserves images, export and approved examples work', async t => {
  let runs = 0;
  const f = await fixture(t, { runner: ({ directory, prompt }) => ({ cancel() {}, done: (async () => {
    if (runs++ === 0) {
      for (const scene of scenes) await writeFile(path.join(directory, 'outputs', scene.id + '.png'), png);
      await writeFile(path.join(directory, 'outputs/listing.json'), '{"title":"invalid"}');
    } else { assert.match(prompt, /Create listing copy only/); await writeListing(directory); }
  })() }) });
  const job = await (await f.request('/api/jobs', { images: [image], product: { material: 'Steel', pieceCount: 3, dimensions: [{ label: 'Bowl', length: 12, weight: 200 }] }, notes: 'Use understated language' })).json();
  const partial = await until(async () => { const j = await (await f.request(`/api/jobs/${job.id}`)).json(); return j.status === 'partial' && j; });
  assert.equal(partial.count, 5); assert.equal(partial.listing, null);
  await f.request(`/api/jobs/${job.id}/retry`, {});
  const complete = await until(async () => { const j = await (await f.request(`/api/jobs/${job.id}`)).json(); return j.status === 'complete' && j; });
  assert.ok(complete.listing.specifications.some(s => s.value === 'Length: 12 cm; Weight: 200 g'));
  const copy = await (await f.request(`/api/jobs/${job.id}/text`)).text();
  assert.match(copy, /LONG DESCRIPTION/); assert.doesNotMatch(copy, /Confirm care instructions/);
  assert.equal((await f.request(`/api/jobs/${job.id}/approve`, {})).status, 200);
  const kb = await (await f.request('/api/knowledge')).json(); assert.equal(kb.exampleCount, 1); assert.ok(kb.sources.length > 0);
  const snapshot = JSON.parse(await readFile(path.join(f.dataDir, job.id, 'knowledge-snapshot.json'))); assert.match(snapshot.guide, /Evidence hierarchy/);
  assert.ok(!complete.listing.specifications.some(s => s.name === 'Brand'));
});

test('brand is optional and never invented', () => {
  const product = validateProduct({ material: 'Brass' });
  assert.equal(product.brand, '');
  assert.ok(!canonicalSpecifications(product).some(s => s.name === 'Brand'));
  assert.deepEqual(canonicalSpecifications(validateProduct({ brand: ' Acme ' }))[0], { name: 'Brand', value: 'Acme' });
  assert.match(listingInstructions({ product }, '/tmp/job', { version: 'v', guide: '', examples: [] }), /do not name, guess or invent a brand/);
});

test('angles mode makes five camera views; scenes prompts stay unchanged', async t => {
  let prompt;
  const f = await fixture(t, { runner: ({ directory, prompt: p }) => { prompt = p; return { cancel() {}, done: (async () => {
    await writeListing(directory); for (const s of angles) await writeFile(path.join(directory, 'outputs', s.id + '.png'), png);
  })() }; } });
  assert.equal((await f.request('/api/jobs', { images: [image], mode: 'video' })).status, 400);
  const status = await (await f.request('/api/status')).json();
  assert.equal(status.angles.length, 5); assert.ok(!('prompt' in status.angles[0]));
  const job = await (await f.request('/api/jobs', { images: [image], mode: 'angles' })).json();
  assert.equal(job.mode, 'angles');
  const done = await until(async () => { const j = await (await f.request(`/api/jobs/${job.id}`)).json(); return j.status === 'complete' && j; });
  assert.deepEqual(done.outputs.map(o => o.id), angles.map(s => s.id));
  assert.equal((await f.request(done.outputs[0].url)).status, 200);
  assert.match(prompt, /NOT the camera pose/); assert.match(prompt, /angle-overhead\.png/); assert.doesNotMatch(prompt, /white-studio\.png/);
  assert.doesNotMatch(buildPrompt({ inputs: [], notes: '' }, '/tmp/job', scenes), /CAMERA ANGLES/);
});

test('serves the favicon and the header mark', async t => {
  const f = await fixture(t);
  const icon = await f.request('/favicon.ico');
  assert.equal(icon.status, 200); assert.equal(icon.headers.get('content-type'), 'image/x-icon');
  const page = await (await f.request('/')).text();
  assert.match(page, /rel="icon" href="\/favicon.ico"/); assert.match(page, /class="brandmark"><svg/); assert.doesNotMatch(page, /✳<\/span> Shelf/);
});
