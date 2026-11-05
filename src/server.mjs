import http from 'node:http';
import { readFile, writeFile, mkdir, readdir, rename, realpath, stat, open } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID, randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scenes, angles, modes, sceneSet, buildPrompt } from './scenes.mjs';
import { makeZip } from './zip.mjs';
import { validateListing, enrichListing, listingText, listingWarnings, listingInstructions } from './listing.mjs';
import { knowledgeSummary, createKnowledgeSnapshot, saveWritingExample, exampleCount } from './knowledge.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exec = promisify(execFile);
const PNG = Buffer.from('89504e470d0a1a0a', 'hex');
const END = Buffer.from('0000000049454e44ae426082', 'hex');
const ACTIVE = new Set(['queued', 'generating']);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

export function validateProduct(value) {
  if (value == null) return { brand: '', name: '', material: '', pieceCount: null, dimensionUnit: 'cm', weightUnit: 'g', dimensions: [] };
  if (typeof value !== 'object' || Array.isArray(value)) throw fail('Please check your product details.');
  const { brand = '', name = '', material = '', pieceCount = null, dimensionUnit = 'cm', weightUnit = 'g', dimensions = [] } = value;
  if (typeof brand !== 'string' || brand.length > 100 || typeof name !== 'string' || name.length > 200) throw fail('Check the brand and product name.');
  if (typeof material !== 'string' || material.length > 300) throw fail('Keep material under 300 characters.');
  if (pieceCount !== null && (!Number.isInteger(pieceCount) || pieceCount < 1 || pieceCount > 1000)) throw fail('Number of pieces must be a whole number between 1 and 1,000.');
  if (!['mm', 'cm', 'in'].includes(dimensionUnit) || !['g', 'kg', 'oz', 'lb'].includes(weightUnit)) throw fail('Choose a valid measurement unit.');
  if (!Array.isArray(dimensions) || dimensions.length > 1000) throw fail('Please use up to 1,000 dimension rows.');
  const rows = dimensions.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw fail('Please check the piece dimensions.');
    const label = row.label || `Piece ${index + 1}`;
    if (typeof label !== 'string' || label.length > 100) throw fail('Keep each piece name under 100 characters.');
    const result = { label };
    for (const key of ['length', 'breadth', 'height', 'weight']) {
      const n = row[key] ?? null;
      if (n !== null && (typeof n !== 'number' || !Number.isFinite(n) || n <= 0 || n > 1e9)) throw fail('Dimensions and weights must be positive numbers, or left blank.');
      result[key] = n;
    }
    return result;
  });
  return { brand: brand.trim(), name: name.trim(), material: material.trim(), pieceCount, dimensionUnit, weightUnit, dimensions: rows };
}

export function decodeImage(input) {
  if (!input || typeof input.name !== 'string' || typeof input.data !== 'string') throw fail('Choose a PNG, JPEG or WebP image.');
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(input.data);
  if (!match) throw fail('Only PNG, JPEG and WebP images are supported.');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > 10 * 1024 * 1024) throw fail('Each image must be 10 MB or smaller.');
  const valid = match[1] === 'png' ? bytes.subarray(0, 8).equals(PNG) && bytes.subarray(-12).equals(END)
    : match[1] === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes[bytes.length - 2] === 255 && bytes.at(-1) === 217
    : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!valid) throw fail('An uploaded file is not a valid PNG, JPEG or WebP image.');
  return { bytes, extension: match[1] === 'jpeg' ? 'jpg' : match[1], name: input.name.slice(0, 180) };
}

export async function createStudio({ dataDir = process.env.STUDIO_DATA_DIR || path.join(ROOT, 'data'), runner = runCodex, checkLogin = loginStatus } = {}) {
  const jobs = new Map(), token = randomBytes(24).toString('hex');
  let activeId = null, closing = false, cancelActive = null;
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const save = async job => {
    const dir = path.join(dataDir, job.id);
    // Per-save temp names prevent two state updates from sharing a temporary file.
    const temp = path.join(dir, `${randomUUID()}.tmp`);
    await writeFile(temp, JSON.stringify(job, null, 2), { mode: 0o600 });
    await rename(temp, path.join(dir, 'job.json'));
  };
  for (const id of await readdir(dataDir)) {
    if (!/^[a-f0-9-]{36}$/.test(id)) continue;
    try {
      const job = JSON.parse(await readFile(path.join(dataDir, id, 'job.json'), 'utf8'));
      if (job.id !== id || !Array.isArray(job.inputs)) continue;
      if (ACTIVE.has(job.status)) { job.status = 'interrupted'; job.message = 'The app was restarted. Resume to create the remaining images.'; await save(job); }
      jobs.set(id, job);
    } catch { /* Ignore incomplete directories, never delete source uploads. */ }
  }
  async function outputFiles(job) {
    const outputs = [];
    for (const scene of sceneSet(job.mode)) {
      const file = path.join(dataDir, job.id, 'outputs', `${scene.id}.png`);
      try {
        // Serve only actual files within this job, never symlinked external paths.
        if (await realpath(file) !== file) continue;
        const handle = await open(file, 'r');
        try {
          const { size } = await handle.stat();
          if (size < 45) continue;
          const head = Buffer.alloc(8), tail = Buffer.alloc(12);
          await handle.read(head, 0, 8, 0); await handle.read(tail, 0, 12, size - 12);
          if (head.equals(PNG) && tail.equals(END)) outputs.push({ ...scene, url: `/files/${job.id}/outputs/${scene.id}.png`, file });
        } finally { await handle.close(); }
      } catch { /* Not finished yet. */ }
    }
    return outputs;
  }
  async function readListing(job) {
    const file = path.join(dataDir, job.id, 'outputs', 'listing.json');
    try {
      if (await realpath(file) !== file || (await stat(file)).size > 2_000_000) return null;
      return enrichListing(validateListing(JSON.parse(await readFile(file, 'utf8'))), job.product);
    } catch { return null; }
  }
  async function finish(job, error) {
    const outputs = await outputFiles(job), listing = await readListing(job);
    const complete = outputs.length === 5 && (job.outputVersion !== 2 || listing);
    job.status = complete ? 'complete' : outputs.length || listing ? 'partial' : 'failed';
    job.message = complete ? 'Your listing and five images are ready.' : `${outputs.length}/5 images; ${listing ? 'listing copy ready' : 'listing copy missing or invalid'}. ${error?.message?.slice(0, 400) || 'Retry to finish the missing outputs.'}`;
  }
  async function publicJob(job) {
    const outputs = await outputFiles(job), listing = await readListing(job);
    return { listing, mode: job.mode || 'scenes', writingExample: !!job.writingExample, knowledgeVersion: job.knowledgeVersion, warnings: listing ? listingWarnings(listing) : [], id: job.id, createdAt: job.createdAt, status: job.status, message: job.message, notes: job.notes, product: job.product || validateProduct(null),
      inputs: job.inputs.map(i => ({ name: i.name, url: `/files/${job.id}/inputs/${i.file}` })),
      outputs: outputs.map(({ file, prompt, ...s }) => s), count: outputs.length };
  }
  async function pump() {
    if (activeId || closing) return;
    const job = [...jobs.values()].find(j => j.status === 'queued');
    if (!job) return;
    activeId = job.id;
    try {
      job.status = 'generating'; job.message = 'Preparing your product photographs…'; await save(job);
      const existing = await outputFiles(job), missing = sceneSet(job.mode).filter(s => !existing.some(o => o.id === s.id));
      const directory = path.join(dataDir, job.id);
      let prompt = missing.length ? buildPrompt(job, directory, missing) : `Create listing copy only. Do not generate or overwrite images. Inspect original references: ${JSON.stringify(job.inputs.map(i => path.join(directory, 'inputs', i.file)))}. Product facts: ${JSON.stringify(job.product)}. Do not delegate or use paid API fallbacks. Write only inside this job's outputs folder.`;
      if (job.outputVersion === 2 && !await readListing(job)) {
        const knowledge = await createKnowledgeSnapshot(job, dataDir);
        job.knowledgeVersion = knowledge.version;
        await writeFile(path.join(directory, 'knowledge-snapshot.json'), JSON.stringify(knowledge, null, 2));
        prompt += listingInstructions(job, directory, knowledge);
      }
      await writeFile(path.join(directory, 'request.txt'), prompt);
      const result = runner({ job, directory, prompt, onProgress: message => {
        if (job.status === 'generating') job.message = message;
      } });
      cancelActive = result.cancel;
      if (job.status === 'cancelled') cancelActive?.();
      await result.done;
      if (job.status === 'generating') {
        await finish(job);
      }
    } catch (error) {
      if (job.status === 'generating') await finish(job, error);
    } finally {
      await save(job); activeId = null; cancelActive = null;
      setImmediate(() => pump().catch(console.error));
    }
  }
  async function jsonBody(req) {
    let size = 0; const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 34 * 1024 * 1024) throw fail('Please keep your total upload under 24 MB.', 413);
      chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { throw fail('Could not read the upload. Please try again.'); }
  }
  function send(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body));
  }
  async function serveFile(res, file, download = false) {
    const info = await stat(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Content-Length': info.size,
      'Cache-Control': 'private, max-age=60', ...(download ? { 'Content-Disposition': `attachment; filename="${path.basename(file)}"` } : {}) });
    createReadStream(file).on('error', () => res.destroy()).pipe(res);
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' blob: data:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    try {
      const host = req.headers.host || '';
      if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) throw fail('Local access only.', 403);
      if (req.headers.origin && req.headers.origin !== `http://${host}`) throw fail('Please use the Shelf Studio page to submit images.', 403);
      const url = new URL(req.url, `http://${host}`), route = url.pathname;
      if (req.method === 'POST') {
        if (req.headers['x-studio-token'] !== token) throw fail('Refresh the page and try again.', 403);
        if (!req.headers['content-type']?.startsWith('application/json')) throw fail('JSON upload required.', 415);
      }
      if (req.method === 'GET' && route === '/api/status') return send(res, 200, { ...await checkLogin(), token, scenes: scenes.map(({ prompt, ...s }) => s), angles: angles.map(({ prompt, ...s }) => s) });
      if (req.method === 'GET' && route === '/api/knowledge') return send(res, 200, { ...await knowledgeSummary(), exampleCount: await exampleCount(dataDir) });
      if (req.method === 'GET' && route === '/api/jobs') return send(res, 200, await Promise.all([...jobs.values()].reverse().map(publicJob)));
      if (req.method === 'POST' && route === '/api/jobs') {
        if (closing) throw fail('The app is shutting down.', 503);
        if ([...jobs.values()].filter(j => ACTIVE.has(j.status)).length >= 10) throw fail('Your queue is full. Wait for a batch to finish.', 429);
        const body = await jsonBody(req);
        if (!body || !Array.isArray(body.images) || body.images.length < 1 || body.images.length > 5) throw fail('Upload between 1 and 5 reference images.');
        if (body.notes != null && (typeof body.notes !== 'string' || body.notes.length > 2000)) throw fail('Keep your notes under 2,000 characters.');
        if (body.mode != null && !modes.includes(body.mode)) throw fail('Choose scenes or camera angles.');
        const product = validateProduct(body.product);
        const decoded = body.images.map(decodeImage);
        if (decoded.reduce((sum, i) => sum + i.bytes.length, 0) > 24 * 1024 * 1024) throw fail('Please keep your total upload under 24 MB.');
        const login = await checkLogin(); if (!login.ready) throw fail(login.message, 503);
        const id = randomUUID(), directory = path.join(dataDir, id);
        await mkdir(path.join(directory, 'inputs'), { recursive: true, mode: 0o700 });
        await mkdir(path.join(directory, 'outputs'), { mode: 0o700 });
        const inputs = [];
        for (const [index, image] of decoded.entries()) {
          const file = `reference-${index + 1}.${image.extension}`;
          await writeFile(path.join(directory, 'inputs', file), image.bytes, { mode: 0o600 }); inputs.push({ name: image.name, file });
        }
        const job = { id, outputVersion: 2, mode: body.mode || 'scenes', inputs, notes: body.notes || '', product, createdAt: new Date().toISOString(), status: 'queued', message: 'Waiting for the next available generation slot.' };
        await save(job); jobs.set(id, job); send(res, 201, await publicJob(job));
        void pump().catch(console.error); return;
      }
      const action = /^\/api\/jobs\/([a-f0-9-]{36})(?:\/(retry|cancel|download|listing|approve|text))?$/.exec(route);
      if (action) {
        const job = jobs.get(action[1]); if (!job) throw fail('Batch not found.', 404);
        if (req.method === 'GET' && !action[2]) return send(res, 200, await publicJob(job));
        if (req.method === 'GET' && action[2] === 'download') {
          const outputs = await outputFiles(job), listing = await readListing(job); if (!outputs.length && !listing) throw fail('No images are ready yet.', 409);
          const files = await Promise.all(outputs.map(async o => ({ name: `${o.id}.png`, data: await readFile(o.file) })));
          if (listing) files.push({ name: 'listing.txt', data: Buffer.from(listingText(listing)) }, { name: 'listing.json', data: Buffer.from(JSON.stringify(listing, null, 2)) });
          const zip = makeZip(files);
          res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': zip.length, 'Content-Disposition': `attachment; filename="shelf-studio-${job.id.slice(0, 8)}.zip"` }); return res.end(zip);
        }
        if (req.method === 'GET' && action[2] === 'text') {
          const listing = await readListing(job); if (!listing) throw fail('Listing copy is not ready.', 409);
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': 'attachment; filename="listing.txt"' }); return res.end(listingText(listing));
        }
        if (req.method === 'POST' && action[2] === 'approve') {
          if (ACTIVE.has(job.status)) throw fail('Wait until generation finishes.', 409);
          const listing = await readListing(job); if (!listing) throw fail('Listing copy is not ready.', 409);
          await saveWritingExample(job, listing, dataDir); job.writingExample = true; await save(job);
          return send(res, 200, await publicJob(job));
        }
        if (req.method === 'POST' && action[2] === 'cancel') {
          if (!ACTIVE.has(job.status)) throw fail('This batch has already stopped.', 409);
          job.status = 'cancelled'; job.message = 'Stopped. Any finished images are still available.';
          if (activeId === job.id) cancelActive?.();
          await save(job); return send(res, 200, await publicJob(job));
        }
        if (req.method === 'POST' && ['retry', 'listing'].includes(action[2])) {
          if (ACTIVE.has(job.status) || activeId === job.id) throw fail('This batch is still active.', 409);
          if (job.status === 'complete' && await readListing(job)) throw fail('This listing is already complete.', 409);
          job.outputVersion = 2;
          const login = await checkLogin(); if (!login.ready) throw fail(login.message, 503);
          job.status = 'queued'; job.message = 'Queued to create the remaining images.'; await save(job);
          send(res, 200, await publicJob(job)); void pump().catch(console.error); return;
        }
      }
      if (req.method === 'GET' && route.startsWith('/files/')) {
        const match = /^\/files\/([a-f0-9-]{36})\/(inputs|outputs)\/([a-z0-9-]+\.(?:png|jpg|webp))$/.exec(route);
        if (!match) throw fail('File not found.', 404);
        const job = jobs.get(match[1]); if (!job) throw fail('File not found.', 404);
        const allowed = match[2] === 'inputs' ? job.inputs.some(i => i.file === match[3]) : sceneSet(job.mode).some(s => `${s.id}.png` === match[3]);
        if (!allowed) throw fail('File not found.', 404);
        const file = path.join(dataDir, match[1], match[2], match[3]);
        if (await realpath(file) !== file) throw fail('File not found.', 404);
        return await serveFile(res, file, url.searchParams.has('download'));
      }
      if (req.method === 'GET') {
        const files = { '/': 'index.html', '/app.js': 'app.js', '/styles.css': 'styles.css' };
        const example = /^\/examples\/([a-z-]+)\.png$/.exec(route);
        if (files[route]) return await serveFile(res, path.join(ROOT, 'public', files[route]));
        if (example && [...scenes, ...angles].some(s => s.id === example[1])) return await serveFile(res, path.join(ROOT, 'public', 'examples', `${example[1]}.png`));
      }
      throw fail('Not found.', 404);
    } catch (error) {
      if (!res.headersSent) send(res, error.status || (error.code === 'ENOENT' ? 404 : 500), { error: error.status ? error.message : error.code === 'ENOENT' ? 'File not found.' : 'Something went wrong. Please try again.' });
      else res.destroy();
    }
  });
  server.requestTimeout = 60_000;
  return { server, close: async () => { closing = true; cancelActive?.(); await new Promise(resolve => server.close(resolve)); } };
}

let loginCache;
async function loginStatus() {
  if (loginCache && Date.now() - loginCache.at < 15_000) return loginCache.value;
  let value;
  try {
    const { stdout, stderr } = await exec(process.env.CODEX_BIN || 'codex', ['login', 'status'], { timeout: 10_000, maxBuffer: 100_000 });
    const signedIn = /logged in/i.test(stdout + stderr);
    value = { ready: signedIn, message: signedIn ? 'Connected to Codex' : 'Run codex login in a terminal, then refresh this page.' };
  } catch (error) {
    value = { ready: false, message: error.code === 'ENOENT' ? 'Install Codex CLI and run codex login, then refresh this page.' : 'Run codex login in a terminal, then refresh this page.' };
  }
  loginCache = { at: Date.now(), value }; return value;
}

export function runCodex({ directory, prompt, onProgress }) {
  // CODEX_MODEL overrides the default model from ~/.codex/config.toml for this app only.
  const args = ['exec', ...(process.env.CODEX_MODEL ? ['--model', process.env.CODEX_MODEL] : []), '--json', '--skip-git-repo-check', '--sandbox', 'workspace-write', '-C', directory, '--output-last-message', path.join(directory, 'response.txt'), '-'];
  const child = spawn(process.env.CODEX_BIN || 'codex', args, { stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32', env: process.env });
  let timedOut = false, timer, buffer = '', stderr = '', lastError = '';
  const cancel = () => { try { if (process.platform === 'win32') child.kill('SIGTERM'); else process.kill(-child.pid, 'SIGTERM'); } catch {} };
  const done = new Promise((resolve, reject) => {
    timer = setTimeout(() => { timedOut = true; cancel(); }, 30 * 60_000);
    child.on('error', error => { clearTimeout(timer); reject(new Error(error.code === 'ENOENT' ? 'Codex CLI was not found. Install it and retry.' : 'Could not start Codex. Retry this batch.')); });
    child.stdin.on('error', () => {});
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stderr.on('data', text => { stderr = (stderr + text).slice(-4000); });
    child.stdout.on('data', text => {
      buffer += text;
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        try {
          const event = JSON.parse(line);
          if (event.type === 'thread.started') onProgress('Studying your products and setting up the five shots…');
          if (event.type === 'item.started' && /tool|image/.test(event.item?.type || '')) onProgress('Creating your product photographs. Images will appear as they finish…');
          if (event.type === 'error' || event.type === 'turn.failed') lastError = event.message || event.error?.message || 'Codex could not complete the batch.';
        } catch { /* Ignore non-JSON CLI diagnostics. */ }
      }
      if (buffer.length > 32 * 1024 * 1024) buffer = ''; // Never retain image payloads indefinitely.
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (timedOut) reject(new Error('Generation timed out. Finished images are saved; retry to create the rest.'));
      else if (code !== 0 || lastError) reject(new Error(lastError ? lastError.slice(0, 450) : /auth|login|401/i.test(stderr) ? 'Codex needs you to sign in again. Run codex login, then retry.' : 'Codex stopped before the batch finished. Retry to create the remaining images.'));
      else resolve();
    });
    child.stdin.end(prompt);
  });
  return { done, cancel };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = await createStudio();
  const port = Number(process.env.PORT || 4317);
  app.server.listen(port, '127.0.0.1', () => console.log(`Shelf Studio is running at http://localhost:${port}`));
  app.server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is in use. Choose another with PORT=4318 npm start.` : error.message); process.exitCode = 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => app.close().then(() => process.exit(0)));
}
