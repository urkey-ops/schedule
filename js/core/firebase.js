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
let _hasLocalEdits = false;

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
        // FIX: showOutOfSyncBanner signature now matches sync-ui.js (accepts optional msg)
        showOutOfSyncBanner('New changes available from another device.');
        return;
      }

      FBKEYS.forEach(k => { if (data[k] !== undefined) state[k] = data[k]; });

      // FIX: re-run initHolidays after Firebase loads so defaults are merged
      // even when Firebase has no holidays key yet.
      initHolidays();

      saveLocal();

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

// FIX: setSyncStatus and showOutOfSyncBanner are defined ONLY in sync-ui.js.
// The duplicate definitions that were here have been removed.
// hideOutOfSyncBanner is also defined in sync-ui.js.

function reloadFromFirebase() {
  _hasLocalEdits = false;
  hideOutOfSyncBanner();
  location.reload();
}
