'use strict';

const drop = document.getElementById('drop');
const fileInput = document.getElementById('file');
const queue = document.getElementById('queue');

const jobs = new Map();

function esc(s) {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c],
  );
}

function renderQueue() {
  const ordered = [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt);
  // Incremental DOM update: rebuild (small list, cheap).
  queue.innerHTML = '';
  for (const j of ordered) queue.appendChild(renderJob(j));
}

function renderJob(j) {
  const el = document.createElement('div');
  el.className = `job ${j.status}`;
  el.dataset.id = j.id;

  const pct = Math.round((j.progress || 0) * 100);
  const statusLabel =
    j.status === 'done'
      ? 'Done'
      : j.status === 'error'
        ? 'Error'
        : j.status === 'processing'
          ? `${pct}%`
          : j.status === 'queued'
            ? 'Queued'
            : j.status;

  el.innerHTML = `
    <div class="job-top">
      <div class="job-name" title="${esc(j.filename)}">${esc(j.filename)}</div>
      <div class="job-status">${esc(statusLabel)}</div>
    </div>
    <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
    ${
      j.status === 'done'
        ? `
      <div class="job-footer">
        <a class="job-download" href="/api/download/${j.id}" download>Download MP4 ↓</a>
      </div>
    `
        : ''
    }
    ${j.status === 'error' ? `<div class="job-error">${esc(j.error || 'Unknown error')}</div>` : ''}
  `;
  return el;
}

// ── File selection & upload ─────────────────────────────────────

drop.addEventListener('click', (e) => {
  // label + hidden input already opens the picker on click; guard against
  // a double-trigger if the user clicked the inner <span class="btn">.
  if (e.target === fileInput) return;
});

fileInput.addEventListener('change', (e) => {
  for (const f of e.target.files) uploadFile(f);
  fileInput.value = '';
});

['dragenter', 'dragover'].forEach((type) => {
  drop.addEventListener(type, (e) => {
    e.preventDefault();
    drop.classList.add('drag');
  });
});
['dragleave', 'drop'].forEach((type) => {
  drop.addEventListener(type, (e) => {
    e.preventDefault();
    if (type === 'dragleave' && drop.contains(e.relatedTarget)) return;
    drop.classList.remove('drag');
  });
});
drop.addEventListener('drop', (e) => {
  for (const f of e.dataTransfer.files) uploadFile(f);
});

async function uploadFile(file) {
  if (!file) return;
  if (!/\.html?$/i.test(file.name)) {
    alert('Please choose an .html file.');
    return;
  }

  // Optimistic row — before the server responds we already show "Uploading…"
  const tmpId = 'tmp-' + Math.random().toString(36).slice(2, 10);
  jobs.set(tmpId, {
    id: tmpId,
    filename: file.name,
    status: 'queued',
    progress: 0,
    createdAt: Date.now(),
  });
  renderQueue();

  const fd = new FormData();
  fd.append('file', file);

  try {
    const r = await fetch('/api/convert', { method: 'POST', body: fd });
    const data = await r.json().catch(() => ({}));
    jobs.delete(tmpId);
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    // Real job record will arrive via SSE; if it raced ahead it's already there.
  } catch (err) {
    jobs.set(tmpId, {
      id: tmpId,
      filename: file.name,
      status: 'error',
      progress: 0,
      error: err.message,
      createdAt: Date.now(),
    });
    renderQueue();
  }
}

// ── SSE: live job updates ───────────────────────────────────────
// Firebase Hosting buffers Cloud Run responses, which breaks SSE. Talk to
// the Cloud Run URL directly for the event stream — POST / download still
// go through the Hosting rewrite so the user sees a single domain.
const SSE_URL = document.querySelector('meta[name="sse-url"]')?.content || '/api/events';

function connect() {
  const es = new EventSource(SSE_URL);
  es.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'snapshot') {
      for (const j of msg.jobs) jobs.set(j.id, j);
    } else if (msg.type === 'job') {
      jobs.set(msg.job.id, msg.job);
    }
    renderQueue();
  });
  es.addEventListener('error', () => {
    // EventSource auto-reconnects; nothing to do. If the server is down,
    // uploads will fail with their own error surface.
  });
}
connect();
