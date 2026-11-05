import { readFile, writeFile, mkdir, readdir, rename } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// STUDIO_KNOWLEDGE_DIR swaps in another writing pack (same file names) without editing the default one.
const KNOWLEDGE = process.env.STUDIO_KNOWLEDGE_DIR ? path.resolve(process.env.STUDIO_KNOWLEDGE_DIR) : path.join(ROOT, 'knowledge');
const GUIDE_FILES = ['style-guide.md', 'category-playbooks.md', 'marketplace-rules.md'];

export async function knowledgeSummary() {
  const docs = await Promise.all(GUIDE_FILES.map(async file => ({ file, content: await readFile(path.join(KNOWLEDGE, file), 'utf8') })));
  const sourceNames = ['amazon-sources.json', 'flipkart-sources.json', 'policy-sources.json'];
  const sources = (await Promise.all(sourceNames.map(async file => { try { return JSON.parse(await readFile(path.join(KNOWLEDGE, file), 'utf8')); } catch { return []; } }))).flat();
  const guide = docs.map(d => d.content).join('\n\n');
  return { version: createHash('sha256').update(guide).digest('hex').slice(0, 12), researchedAt: '2026-09-06', sources, guide, documents: GUIDE_FILES };
}

async function approvedExamples(dataDir) {
  const dir = path.join(dataDir, 'writing-examples');
  let names; try { names = await readdir(dir); } catch { return []; }
  const records = await Promise.all(names.filter(n => /^[a-f0-9-]{36}\.json$/.test(n)).map(async n => { try { return JSON.parse(await readFile(path.join(dir, n), 'utf8')); } catch { return null; } }));
  return records.filter(Boolean).sort((a, b) => b.approvedAt.localeCompare(a.approvedAt));
}
export async function createKnowledgeSnapshot(job, dataDir) {
  const knowledge = await knowledgeSummary();
  const terms = `${job.product?.name || ''} ${job.product?.material || ''}`.toLowerCase().match(/[a-z]{3,}/g) || [];
  const matches = (await approvedExamples(dataDir)).filter(e => e.jobId !== job.id).map(e => ({ ...e, score: terms.reduce((n, term) => n + (e.topic.toLowerCase().includes(term) ? 1 : 0), 0) })).sort((a, b) => b.score - a.score).slice(0, 3);
  return { version: knowledge.version, researchedAt: knowledge.researchedAt, guide: knowledge.guide, examples: matches.map(e => ({ topic: e.topic, title: e.title, sample: e.sample, jobId: e.jobId })), sourceIds: knowledge.sources.map(s => s.id) };
}
export async function saveWritingExample(job, listing, dataDir) {
  const dir = path.join(dataDir, 'writing-examples'); await mkdir(dir, { recursive: true, mode: 0o700 });
  const record = { jobId: job.id, approvedAt: new Date().toISOString(), topic: `${job.product?.name || listing.title} ${job.product?.material || ''}`, title: listing.title, sample: listing.description.slice(0, 2800) };
  const temp = path.join(dir, `${randomUUID()}.tmp`); await writeFile(temp, JSON.stringify(record, null, 2), { mode: 0o600 });
  await rename(temp, path.join(dir, `${job.id}.json`)); return record;
}
export async function exampleCount(dataDir) { return (await approvedExamples(dataDir)).length; }
