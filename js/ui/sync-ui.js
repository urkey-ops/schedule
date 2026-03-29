// ── ui/sync-ui.js ─────────────────────────────────────────────

function setSyncStatus(status) {
  // status: 'local' | 'synced' | 'syncing' | 'error'
  const chip = document.getElementById('sync-indicator');
  const text = document.getElementById('sync-text');
  if (!chip || !text) return;

  chip.className = `sync-chip sync-${status}`;
  const labels = {
    local  : 'local',
    synced : 'synced',
    syncing: 'syncing…',
    error  : 'offline',
  };
  text.textContent = labels[status] || status;
}

function showOutOfSyncBanner(msg) {
  const bar = document.getElementById('global-alerts-bar');
  if (!bar) return;
  const id  = 'out-of-sync-banner';
  if (document.getElementById(id)) return; // already shown

  const div = document.createElement('div');
  div.id        = id;
  div.className = 'inline-alert warn';
  div.style     = 'margin:6px 0;display:flex;align-items:center;gap:10px';
  div.innerHTML = `
    <span>⚠️ ${escH(msg || 'Data may be out of sync.')}</span>
    <button class="btn btn-sm btn-ghost" style="margin-left:auto"
      onclick="location.reload()">Reload</button>
    <button class="btn btn-sm btn-ghost"
      onclick="document.getElementById('${id}')?.remove()">✕</button>`;
  bar.prepend(div);
}
