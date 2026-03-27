// ── Hardcoded config — auto-connects on every device ─────────
const HARDCODED_CONFIG = {
  apiKey:      "AIzaSyAT0EMRwzFSQMSbMjvmL2t7iOwwWqsDqzQ",
  authDomain:  "schedulemaker-6a571.firebaseapp.com",
  databaseURL: "https://schedulemaker-6a571-default-rtdb.firebaseio.com",
  projectId:   "schedulemaker-6a571",
  appId:       "1:685602481293:web:2e5e0359b3df42f825aec4"
};

const FB_SDK   = 'https://www.gstatic.com/firebasejs/10.12.0';
let _db        = null;
let _fbRef     = null;
let _fbInit    = false;

// Dirty-key tracking — only push changed slices
const _dirtyKeys = new Set();
let _debounceTimer = null;

const FB_KEYS = [
  'employees','volunteers','defaultSchedule','schedule',
  'volAvailability','absences','leaveRequests','swapRequests',
  'holidays','empDaysOff','empHourCap'
];

async function initFirebase(cfg) {
  if (_fbInit) return;
  _fbInit = true;
  try {
    const { initializeApp, getApps } = await import(`${FB_SDK}/firebase-app.js`);
    const { getDatabase, ref, onValue } = await import(`${FB_SDK}/firebase-database.js`);

    const existing = getApps().find(a => a.name === 'smPro');
    const app = existing || initializeApp(cfg, 'smPro');
    _db    = getDatabase(app);
    _fbRef = ref(_db, 'smPro');

    onValue(_fbRef, snap => {
      const data = snap.val();
      if (!data) { setSyncStatus('synced'); return; }
      FB_KEYS.forEach(k => { if (data[k] !== undefined) state[k] = data[k]; });
      saveLocal();
      renderAll();
      setSyncStatus('synced');
    }, err => {
      console.error('Firebase read error', err);
      setSyncStatus('error');
      _fbInit = false;
    });

    setSyncStatus('synced');
  } catch(e) {
    console.error('Firebase init failed', e);
    setSyncStatus('error');
    _fbInit = false;
  }
}

// Call this instead of pushToFirebase() when you know which key changed
function markDirty(key) {
  _dirtyKeys.add(key);
}

function pushToFirebase() {
  if (!_fbRef) return;
  // Debounce: flush all dirty keys together after 400ms
  clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(_flushDirty, 400);
}

async function _flushDirty() {
  if (!_fbRef) return;
  setSyncStatus('syncing');
  const keys = _dirtyKeys.size > 0 ? [..._dirtyKeys] : FB_KEYS;
  _dirtyKeys.clear();
  try {
    const { ref, update } = await import(`${FB_SDK}/firebase-database.js`);
    const patch = {};
    keys.forEach(k => { patch[k] = state[k] ?? null; });
    await update(_fbRef, patch);
    setSyncStatus('synced');
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
  text.textContent = status === 'synced'  ? 'firebase'
                   : status === 'syncing' ? 'syncing…'
                   : 'error';
}
