// ── Hardcoded config — auto-connects on every device ─────────
const HARDCODED_CONFIG = {
  apiKey:      "AIzaSyAT0EMRwzFSQMSbMjvmL2t7iOwwWqsDqzQ",
  authDomain:  "schedulemaker-6a571.firebaseapp.com",
  databaseURL: "schedulemaker-6a571.firebaseapp.com",
  projectId:   "schedulemaker-6a571",
  appId:       "1:685602481293:web:2e5e0359b3df42f825aec4"
};

const FB_SDK = 'https://www.gstatic.com/firebasejs/10.12.0';
let _db = null;
let _fbRef = null;

async function initFirebase(cfg) {
  const { initializeApp }          = await import(`${FB_SDK}/firebase-app.js`);
  const { getDatabase, ref, onValue, set } = await import(`${FB_SDK}/firebase-database.js`);

  const app = initializeApp(cfg, 'smPro');
  _db       = getDatabase(app);
  _fbRef    = ref(_db, 'smPro');

  // Listen for remote changes
  onValue(_fbRef, snap => {
    const data = snap.val();
    if (!data) return;
    ['employees','volunteers','defaultSchedule','schedule',
     'volAvailability','absences','leaveRequests','swapRequests'].forEach(k => {
      if (data[k] !== undefined) state[k] = data[k];
    });
    saveLocal();
    renderAll();
    setSyncStatus('synced');
  }, err => {
    console.error('Firebase read error', err);
    setSyncStatus('error');
  });

  setSyncStatus('synced');
}

function pushToFirebase() {
  if (!_fbRef) return;
  import(`${FB_SDK}/firebase-database.js`).then(({ set }) => {
    set(_fbRef, {
      employees:       state.employees,
      volunteers:      state.volunteers,
      defaultSchedule: state.defaultSchedule,
      schedule:        state.schedule,
      volAvailability: state.volAvailability,
      absences:        state.absences       || {},
      leaveRequests:   state.leaveRequests,
      swapRequests:    state.swapRequests,
    }).then(() => setSyncStatus('synced'))
      .catch(e => { console.error('Firebase write error', e); setSyncStatus('error'); });
  });
}

function setSyncStatus(status) {
  const chip = document.getElementById('sync-indicator');
  const text = document.getElementById('sync-text');
  if (!chip || !text) return;
  chip.className = `sync-chip ${status}`;
  text.textContent = status === 'synced' ? 'firebase' : status === 'syncing' ? 'syncing…' : 'error';
}
