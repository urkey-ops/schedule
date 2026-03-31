// ── core/firebase.js ──────────────────────────────────────────

const HARDCODEDCONFIG = {
  apiKey:      "AIzaSyAT0EMRwzFSQMSbMjvmL2t7iOwwWqsDqzQ",
  authDomain:  "schedulemaker-6a571.firebaseapp.com",
  databaseURL: "https://schedulemaker-6a571-default-rtdb.firebaseio.com",
  projectId:   "schedulemaker-6a571",
  appId:       "1:685602481293:web:2e5e0359b3df42f825aec4"
};

const FBSDK = 'https://www.gstatic.com/firebasejs/10.12.0/';

let db             = null;
let fbRef          = null;
let fbInit         = false;
let _hasLocalEdits = false;

const dirtyKeys   = new Set();
let debounceTimer = null;

// ✅ FIXED — added 'swapRequests'
const FBKEYS = [
  'employees','volunteers','defaultSchedule','shifts','earlyGate',
  'volAvailability','absences','leaveRequests','swapRequests',
  'holidays','empDaysOff','empHourCap',
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
        showOutOfSyncBanner('New changes available from another device.');
        return;
      }

      FBKEYS.forEach(k => { if (data[k] !== undefined) state[k] = data[k]; });

      if (data.schedule && !data.shifts) {
        migrateSlotScheduleToShifts(data.schedule);
      }

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

function reloadFromFirebase() {
  _hasLocalEdits = false;
  hideOutOfSyncBanner();
  location.reload();
}
