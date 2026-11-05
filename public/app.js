const $ = id => document.getElementById(id);
const state = { files: [], scenes: [], angles: [], mode: 'scenes', jobs: [], selected: null, ready: false, token: null, submitting: false, galleryKey: '', historyKey: '', detailsKey: '' };
const isActive = job => ['queued', 'generating'].includes(job?.status);
const setFor = mode => mode === 'angles' ? state.angles : state.scenes;
const names = { queued: 'Queued', generating: 'Creating your listing', complete: 'Your outputs are ready', partial: 'Some outputs are ready', failed: 'Generation stopped', cancelled: 'Generation stopped', interrupted: 'Ready to resume' };
function showError(message = '') { $('error').textContent = message; $('error').hidden = !message; }
function updateButton() { $('generate').disabled = !state.ready || !state.files.length || state.submitting; }
async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', 'X-Studio-Token': state.token || '', ...options.headers } });
  const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Something went wrong. Please try again.'); return body;
}
async function addFiles(list) {
  showError(); const incoming = [...list];
  if (state.files.length + incoming.length > 5) return showError('You can add up to 5 reference images per batch.');
  if (incoming.some(file => !['image/png', 'image/jpeg', 'image/webp'].includes(file.type))) return showError('Please choose PNG, JPG or WebP images.');
  if (incoming.some(file => file.size > 10 * 1024 * 1024)) return showError('Each image must be 10 MB or smaller.');
  if ([...state.files.map(f => f.file), ...incoming].reduce((n, f) => n + f.size, 0) > 24 * 1024 * 1024) return showError('Please keep your total upload under 24 MB.');
  for (const file of incoming) state.files.push({ file, url: URL.createObjectURL(file), id: crypto.randomUUID() });
  renderPreviews(); updateButton();
}
function renderPreviews() {
  $('previews').replaceChildren();
  for (const item of state.files) {
    const wrap = document.createElement('div'); wrap.className = 'preview';
    const img = document.createElement('img'); img.src = item.url; img.alt = item.file.name;
    const button = document.createElement('button'); button.className = 'remove'; button.textContent = '×'; button.ariaLabel = `Remove ${item.file.name}`;
    button.onclick = () => { URL.revokeObjectURL(item.url); state.files = state.files.filter(f => f.id !== item.id); renderPreviews(); updateButton(); };
    wrap.append(img, button); $('previews').append(wrap);
  }
}
$('files').onchange = e => { addFiles(e.target.files); e.target.value = ''; };
$('dropzone').onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('files').click(); } };
for (const event of ['dragenter', 'dragover']) $('dropzone').addEventListener(event, e => { e.preventDefault(); $('dropzone').classList.add('dragging'); });
for (const event of ['dragleave', 'drop']) $('dropzone').addEventListener(event, e => { e.preventDefault(); $('dropzone').classList.remove('dragging'); });
$('dropzone').addEventListener('drop', e => addFiles(e.dataTransfer.files));
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => e.preventDefault());
function readData(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Could not read an image. Please choose it again.')); reader.readAsDataURL(file); }); }
function renumberRows() {
  [...$('dimension-rows').children].forEach((row, index) => {
    row.querySelector('.piece-row-number').textContent = `Piece ${index + 1}`;
    row.querySelector('[data-field="label"]').placeholder = `e.g. ${index ? 'Small bowl' : 'Large container'}`;
    row.querySelector('.remove-piece').ariaLabel = `Remove piece ${index + 1} dimensions`;
  });
}
function addDimensionRow(focus = false) {
  if ($('dimension-rows').children.length >= 1000) return showError('You can add up to 1,000 dimension rows.');
  const row = document.createElement('fieldset'); row.className = 'dimension-row';
  const legend = document.createElement('legend'); legend.className = 'piece-row-number';
  const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'remove-piece'; remove.textContent = '×';
  remove.onclick = () => { row.remove(); renumberRows(); };
  const label = document.createElement('input'); label.type = 'text'; label.maxLength = 100; label.dataset.field = 'label'; label.ariaLabel = 'Piece name'; label.className = 'piece-name';
  const fields = document.createElement('div'); fields.className = 'measurement-fields';
  for (const [key, title] of [['length', 'Length'], ['breadth', 'Breadth'], ['height', 'Height'], ['weight', 'Weight']]) {
    const wrap = document.createElement('label'); wrap.textContent = title;
    const input = document.createElement('input'); input.type = 'number'; input.min = '0'; input.max = '1000000000'; input.step = 'any'; input.inputMode = 'decimal'; input.placeholder = '—'; input.dataset.field = key;
    input.oninput = () => input.setCustomValidity('');
    wrap.append(input); fields.append(wrap);
  }
  row.append(legend, remove, label, fields); $('dimension-rows').append(row); renumberRows();
  if (focus) label.focus();
}
function productDetails() {
  const number = $('piece-count');
  if (!number.reportValidity()) return null;
  const dimensions = [];
  for (const row of $('dimension-rows').children) {
    const result = { label: row.querySelector('[data-field="label"]').value.trim() };
    for (const key of ['length', 'breadth', 'height', 'weight']) {
      const input = row.querySelector(`[data-field="${key}"]`);
      if (input.value !== '' && Number(input.value) <= 0) input.setCustomValidity('Enter a positive number or leave this blank.');
      if (!input.reportValidity()) return null;
      result[key] = input.value === '' ? null : Number(input.value);
    }
    if (result.label || ['length', 'breadth', 'height', 'weight'].some(k => result[k] !== null)) {
      result.label ||= row.querySelector('legend').textContent;
      dimensions.push(result);
    }
  }
  return { brand: $('product-brand').value.trim(), name: $('product-name').value.trim(), material: $('material').value.trim(), pieceCount: number.value === '' ? null : Number(number.value), dimensionUnit: $('dimension-unit').value, weightUnit: $('weight-unit').value, dimensions };
}
$('add-piece').onclick = () => addDimensionRow(true);
for (const input of document.querySelectorAll('input[name="mode"]')) input.onchange = () => { state.mode = input.value; render(); };
addDimensionRow();
$('generate').onclick = async () => {
  if (state.submitting) return;
  const product = productDetails(); if (!product) return;
  showError(); state.submitting = true; updateButton();
  const submitted = [...state.files];
  try {
    const images = await Promise.all(submitted.map(async item => ({ name: item.file.name, data: await readData(item.file) })));
    const job = await api('/api/jobs', { method: 'POST', body: JSON.stringify({ images, notes: $('notes').value, product, mode: state.mode }) });
    state.jobs.unshift(job); selectJob(job.id);
    submitted.forEach(item => URL.revokeObjectURL(item.url));
    state.files = state.files.filter(f => !submitted.some(s => s.id === f.id)); renderPreviews(); $('notes').value = '';
    $('product-name').value = ''; $('material').value = ''; $('piece-count').value = ''; $('dimension-rows').replaceChildren(); addDimensionRow();
  } catch (error) { showError(error.message); }
  finally { state.submitting = false; updateButton(); }
};
function selectJob(id) {
  state.selected = id;
  if (id) localStorage.setItem('shelf-studio-batch', id); else localStorage.removeItem('shelf-studio-batch');
  render();
}
function showLightbox(scene, url, example) {
  $('lightbox-image').src = url; $('lightbox-image').alt = scene.name;
  $('lightbox-title').textContent = scene.name + (example ? ' · Example' : '');
  $('lightbox-download').href = example ? url : `${url}?download=1`;
  $('lightbox-download').download = `${scene.id}.png`; $('lightbox').showModal();
}
$('close-dialog').onclick = () => $('lightbox').close();
$('lightbox').onclick = e => { if (e.target === $('lightbox')) { const r = $('lightbox').getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) $('lightbox').close(); } };
function render() {
  const job = state.jobs.find(j => j.id === state.selected), active = isActive(job);
  $('gallery-tag').textContent = job ? `${job.count} / 5 ready` : 'Example results';
  $('gallery-description').textContent = job ? 'Listing copy and photographs appear as they finish.' : state.mode === 'angles' ? 'Five camera angles of the same product, ready for your next listing.' : 'The same five scenes you loved, ready for your next product.';
  $('batch-progress').hidden = !job;
  $('result-actions').hidden = !job;
  if (job) {
    $('progress-title').textContent = names[job.status] || job.status;
    $('progress-count').textContent = `${job.count} of 5`;
    $('progress').value = job.count; $('progress-message').textContent = job.message;
    $('download-all').hidden = !job.count && !job.listing; $('download-all').href = `/api/jobs/${job.id}/download`;
    $('retry').hidden = active || job.status === 'complete'; $('cancel').hidden = !active;
  }
  renderListing(job);
  const detailsKey = JSON.stringify([job?.id, job?.product, job?.notes]);
  $('saved-details').hidden = !job;
  if (detailsKey !== state.detailsKey) {
    state.detailsKey = detailsKey; $('saved-details-content').replaceChildren();
    if (job) {
      const product = job.product || {};
      const add = text => { const p = document.createElement('p'); p.textContent = text; $('saved-details-content').append(p); };
      if (product.material) add(`Material: ${product.material}`);
      if (product.pieceCount) add(`Pieces in set: ${product.pieceCount}`);
      for (const row of product.dimensions || []) {
        const sizes = [['length', 'L'], ['breadth', 'B'], ['height', 'H']].filter(([key]) => row[key] != null).map(([key, label]) => `${label} ${row[key]} ${product.dimensionUnit}`);
        if (row.weight != null) sizes.push(`${row.weight} ${product.weightUnit}`);
        add(`${row.label}: ${sizes.length ? sizes.join(' · ') : 'No measurements supplied'}`);
      }
      if (job.notes) add(`Comments: ${job.notes}`);
      if (!$('saved-details-content').children.length) add('No extra product details supplied.');
    }
  }
  const galleryKey = JSON.stringify([job?.id, job?.status, job?.outputs.map(o => o.id), job ? job.mode : state.mode, state.scenes, state.angles]);
  if (galleryKey !== state.galleryKey) {
    state.galleryKey = galleryKey; $('gallery').replaceChildren();
    const pending = text => {
      const placeholder = document.createElement('div'); placeholder.className = `pending${active ? ' active' : ''}`;
      const symbol = document.createElement('span'); symbol.className = 'pending-symbol'; symbol.textContent = '✳';
      const label = document.createElement('span'); label.textContent = text;
      placeholder.append(symbol, label); return placeholder;
    };
    setFor(job ? job.mode : state.mode).forEach((scene, index) => {
      const card = document.createElement('article'); card.className = 'scene';
      const url = job ? job.outputs.find(o => o.id === scene.id)?.url : `/examples/${scene.id}.png`;
      if (url) {
        const button = document.createElement('button'); button.className = 'image-button'; button.ariaLabel = `Preview ${scene.name}`;
        const img = document.createElement('img'); img.src = url; img.alt = `Products in ${scene.name.toLowerCase()}`; img.loading = 'lazy';
        if (!job) img.onerror = () => button.replaceWith(pending('Example coming soon'));
        button.append(img); button.onclick = () => showLightbox(scene, url, !job); card.append(button);
      } else {
        card.append(pending(job.status === 'generating' ? 'Creating…' : job.status === 'queued' ? 'Queued' : 'Not generated yet'));
      }
      const title = document.createElement('h3'), number = document.createElement('span'); number.className = 'scene-number'; number.textContent = `0${index + 1}`;
      title.append(number, document.createTextNode(scene.name));
      const description = document.createElement('p'); description.textContent = scene.description;
      card.append(title, description); $('gallery').append(card);
    });
  }
  $('history-section').hidden = !state.jobs.length;
  const historyKey = JSON.stringify([state.selected, state.jobs.map(j => [j.id, j.status, j.count, j.listing?.title])]);
  if (historyKey !== state.historyKey) {
    state.historyKey = historyKey; $('history').replaceChildren();
    for (const j of state.jobs) {
      const button = document.createElement('button'); button.className = 'history-item' + (j.id === state.selected ? ' selected' : '');
      const img = document.createElement('img'); img.src = j.outputs[0]?.url || j.inputs[0].url; img.alt = ''; img.loading = 'lazy';
      const copy = document.createElement('span'); copy.className = 'history-copy';
      const title = document.createElement('strong'); title.textContent = j.listing?.title || j.product?.name || j.inputs.map(i => i.name).join(', ');
      const subtitle = document.createElement('small'); subtitle.textContent = `${new Date(j.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${j.count}/5 ready · ${j.status}`;
      copy.append(title, subtitle); button.append(img, copy); button.onclick = () => selectJob(j.id); $('history').append(button);
    }
  }
}
async function action(actionName) {
  const id = state.selected; if (!id) return;
  showError(); const button = $(actionName); button.disabled = true;
  try { const updated = await api(`/api/jobs/${id}/${actionName}`, { method: 'POST', body: '{}' }); state.jobs = state.jobs.map(j => j.id === id ? updated : j); render(); }
  catch (error) { showError(error.message); } finally { button.disabled = false; }
}
$('retry').onclick = () => action('retry'); $('cancel').onclick = () => action('cancel'); $('show-examples').onclick = () => selectJob(null);
async function refresh(initial = false) {
  try {
    const [status, jobs] = await Promise.all([api('/api/status'), api('/api/jobs')]);
    state.ready = status.ready; state.token = status.token; state.scenes = status.scenes; state.angles = status.angles || []; state.jobs = jobs;
    $('connection').className = 'connection ' + (status.ready ? 'ready' : 'offline'); $('connection-text').textContent = status.message;
    if (initial) { const saved = localStorage.getItem('shelf-studio-batch'); state.selected = jobs.some(j => j.id === saved) ? saved : null; }
    render(); updateButton();
  } catch {
    state.ready = false; $('connection').className = 'connection offline'; $('connection-text').textContent = 'Reconnecting to the studio…'; updateButton();
  } finally { setTimeout(() => refresh(), 3000); }
}
refresh(true);

function renderListing(job) {
  $('listing').hidden = !job || !!job.listing || isActive(job);
  const key = JSON.stringify([job?.id, job?.listing, job?.writingExample, job?.warnings, job?.status]);
  if (state.listingKey === key) return;
  state.listingKey = key;
  const root = $('listing-copy'); root.replaceChildren(); root.hidden = !job?.listing;
  if (!job?.listing) return;
  const l = job.listing;
  function block(title, value, parent = root) {
    const wrap = document.createElement('section'), heading = document.createElement('h3'), text = document.createElement('p'), copy = document.createElement('button');
    heading.textContent = title; text.textContent = value; text.className = 'copy-prose'; copy.className = 'text-button'; copy.textContent = 'Copy';
    copy.onclick = async () => { try { await navigator.clipboard.writeText(value); copy.textContent = 'Copied'; } catch { copy.textContent = 'Select text to copy'; } };
    wrap.append(heading, text, copy); parent.append(wrap);
  }
  block('Catalogue title', l.title);
  const amazon = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = 'Amazon listing fields'; amazon.append(summary); root.append(amazon);
  block(`Amazon title · ${[...l.amazonTitle].length}/75`, l.amazonTitle, amazon);
  block(`Item highlights · ${[...l.itemHighlights].length}/125`, l.itemHighlights, amazon);
  block('Five key features', l.bullets.map((b, i) => `${i + 1}. ${b}`).join('\n\n'), amazon);
  block('Amazon description', l.amazonDescription, amazon);
  block('Long description', l.description);
  const specs = document.createElement('details'), label = document.createElement('summary'); label.textContent = 'All product specifications'; specs.append(label); root.append(specs);
  block('Specifications', l.specifications.map(s => `${s.name}: ${s.value}`).join('\n'), specs);
  if (l.reviewNotes.length || job.warnings?.length) block('Seller review notes · excluded from listing text', [...l.reviewNotes, ...job.warnings].join('\n'));
  const download = document.createElement('a'); download.className = 'secondary'; download.href = `/api/jobs/${job.id}/text`; download.textContent = '↓ Download copy (.txt)';
  const approve = document.createElement('button'); approve.id = 'approve'; approve.className = 'text-button'; approve.textContent = job.writingExample ? 'Saved as a writing example' : 'Use as a writing example'; approve.disabled = job.writingExample || isActive(job); approve.onclick = () => action('approve');
  const help = document.createElement('p'); help.className = 'field-help'; help.textContent = 'After reviewing this copy, save it as an example to guide the tone of future listings. Product facts are never reused.';
  root.append(download, approve, help);
}
$('listing').onclick = () => action('listing');
$('knowledge-button').onclick = async () => {
  const root = $('knowledge-panel'); root.hidden = !root.hidden; if (root.hidden) return;
  try {
    const kb = await api('/api/knowledge'); root.replaceChildren();
    const heading = document.createElement('h2'); heading.textContent = `Writing guide · ${kb.researchedAt}`;
    const note = document.createElement('p'); note.textContent = `${kb.sources.length} source records · ${kb.exampleCount} approved writing examples. Research is a dated reference, not a live feed.`;
    const guide = document.createElement('details'), label = document.createElement('summary'), prose = document.createElement('p'); label.textContent = 'Read the full writing playbook'; prose.className = 'copy-prose'; prose.textContent = kb.guide; guide.append(label, prose);
    root.append(heading, note, guide);
    for (const source of kb.sources) {
      const p = document.createElement('p'), a = document.createElement('a');
      const url = source.url || source.productUrl || source.sourceUrl;
      a.textContent = source.title || source.name || `${source.brand || ''} ${source.productType || source.id}`;
      if (url && /^https:\/\//.test(url)) { a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      p.append(a, document.createTextNode(` — ${source.accessQuality || source.access || source.accessLevel || 'see source record'}`)); root.append(p);
    }
  } catch (error) { root.textContent = error.message; }
};
