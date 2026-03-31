// ── ui/sync-ui.js ─────────────────────────────────────────────

function setSyncStatus(status) {
  const chip = document.getElementById('sync-indicator');
  const text = document.getElementById('sync-text');
  if (!chip || !text) return;
  chip.className = `sync-chip sync-${status}`;
  const labels = { local:'local', synced:'synced', syncing:'syncing…', error:'offline' };
  text.textContent = labels[status] || status;
}

function showOutOfSyncBanner(msg) {
  const bar = document.getElementById('global-alerts-bar');
  if (!bar) return;
  const id = 'out-of-sync-banner';
  if (document.getElementById(id)) return;
  const div       = document.createElement('div');
  div.id          = id;
  div.className   = 'inline-alert warn';
  div.style       = 'margin:6px 0;display:flex;align-items:center;gap:10px';
  div.innerHTML   = `
    <span>⚠️ ${escH(msg || 'Data may be out of sync.')}</span>
    <button class="btn btn-sm btn-ghost" style="margin-left:auto"
      onclick="reloadFromFirebase()">Sync Now</button>
    <button class="btn btn-sm btn-ghost"
      onclick="hideOutOfSyncBanner()">Ignore</button>`;
  bar.prepend(div);
}

function hideOutOfSyncBanner() {
  document.getElementById('out-of-sync-banner')?.remove();
}

// ── Admin idle session timeout ────────────────────────────────
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
let _idleTimer = null;

function resetIdleTimer() {
  if (state.mode !== 'admin') return;
  clearTimeout(_idleTimer);
  _idleTimer = setTimeout(() => {
    if (state.mode === 'admin') {
      exitAdmin();
      showToast('Session timed out — switched to view mode');
    }
  }, IDLE_TIMEOUT_MS);
}

// Start idle timer on any user interaction while in admin mode
['click','keydown','mousemove','touchstart'].forEach(evt => {
  document.addEventListener(evt, () => {
    if (state.mode === 'admin') resetIdleTimer();
  }, { passive: true });
});
