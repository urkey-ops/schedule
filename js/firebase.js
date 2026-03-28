// ── firebase.js ───────────────────────────────────────────────

const HARDCODEDCONFIG = {
  apiKey:      "AIzaSyAT0EMRwzFSQMSbMjvmL2t7iOwwWqsDqzQ",
  authDomain:  "schedulemaker-6a571.firebaseapp.com",
  databaseURL: "https://schedulemaker-6a571-default-rtdb.firebaseio.com",
  projectId:   "schedulemaker-6a571",
  appId:       "1:685602481293:web:2e5e0359b3df42f825aec4"
};

const FBSDK = 'https://www.gstatic.com/firebasejs/10.12.0/';

let db          = null;
let fbRef       = null;
let fbInit      = false;
let _hasLocalEdits = false; // track unsaved local changes

const dirtyKeys = new Set();
let debounceTimer = null;

const FBKEYS = [
  'employees','volunteers','defaultSchedule','schedule',
  'volAvailability','absences','leaveRequests','swapRequests',
  'holidays','empDaysOff','empHourCap'
];

async function importFBSDK(file) {
  return import(FBSDK + file);
}

async function initFirebase(cfg) {
  if (fbInit) return;
  fbInit = true;
  try {
    const { initializeApp, getApps } = await importFBSDK('firebase-app.js');
    const { getDatabase, ref, onValue } = await importFBSDK('firebase-database.js');
    const existing = getApps().find(a => a.name === 'smPro');
    const app = existing || initializeApp(cfg, 'smPro');
    db    = getDatabase(app);
    fbRef = ref(db, 'smPro');

   onValue(fbRef, snap => {
  const data = snap.val();
  if (!data) { setSyncStatus('synced'); return; }

  if (_hasLocalEdits && state.mode === 'admin') {
    showOutOfSyncBanner();
    return;
  }

  FBKEYS.forEach(k => { if (data[k] !== undefined) state[k] = data[k]; });
  saveLocal();

  // Guard: only render if DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => renderAll(), { once: true });
  } else {
    renderAll();
  }

  setSyncStatus('synced');
});
    setSyncStatus('synced');
  } catch(e) {
    console.error('Firebase init failed', e);
    setSyncStatus('error');
    fbInit = false;
  }
}

function markDirty(key) {
  dirtyKeys.add(key);
  _hasLocalEdits = true;
}

function pushToFirebase() {
  if (!fbRef) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(flushDirty, 400);
}

async function flushDirty() {
  if (!fbRef) return;
  // Fixed: guard against empty dirtyKeys — never fall back to full write silently
  if (dirtyKeys.size === 0) return;

  setSyncStatus('syncing');
  const keys = [...dirtyKeys];
  dirtyKeys.clear();
  _hasLocalEdits = false;

  try {
    const { ref, update } = await importFBSDK('firebase-database.js');
    const patch = {};
    keys.forEach(k => { patch[k] = state[k] ?? null; });
    await update(fbRef, patch);
    setSyncStatus('synced');
    hideOutOfSyncBanner();
  } catch(e) {
    console.error('Firebase write error', e);
    setSyncStatus('error');
  }
}

function setSyncStatus(status) {
  const chip = document.getElementById('sync-indicator');
  const text = document.getElementById('sync-text');
  if (!chip || !text) return;
  chip.className = `sync-chip ${status}`;
  text.textContent = status === 'synced' ? 'firebase' : status === 'syncing' ? 'syncing…' : 'error';
}

function showOutOfSyncBanner() {
  let banner = document.getElementById('sync-conflict-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'sync-conflict-banner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#f59e0b;color:#fff;text-align:center;padding:10px 16px;font-size:13px;font-weight:600';
    banner.innerHTML = `⚠️ New changes available from another device. 
      <button onclick="reloadFromFirebase()" style="margin-left:12px;padding:4px 12px;border-radius:6px;border:none;background:#fff;color:#b45309;font-weight:700;cursor:pointer">Sync Now</button>
      <button onclick="hideOutOfSyncBanner()" style="margin-left:8px;padding:4px 12px;border-radius:6px;border:none;background:transparent;color:#fff;cursor:pointer">Ignore</button>`;
    document.body.prepend(banner);
  }
}

function hideOutOfSyncBanner() {
  document.getElementById('sync-conflict-banner')?.remove();
}

function reloadFromFirebase() {
  _hasLocalEdits = false;
  hideOutOfSyncBanner();
  location.reload();
}
