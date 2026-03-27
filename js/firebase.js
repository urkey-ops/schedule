// ── Hardcoded config — auto-connects on every device ─────────
const HARDCODED_CONFIG = {
  apiKey:      "AIzaSyAT0EMRwzFSQMSbMjvmL2t7iOwwWqsDqzQ",
  authDomain:  "schedulemaker-6a571.firebaseapp.com",
  databaseURL: 'https://schedulemaker-6a571-default-rtdb.firebaseio.com',  
  projectId:   "schedulemaker-6a571",
  appId:       "1:685602481293:web:2e5e0359b3df42f825aec4"
};


const FB_SDK = 'https://www.gstatic.com/firebasejs/10.12.0';
let _db     = null;
let _fbRef  = null;
let _fbInit = false;

async function initFirebase(cfg) {
  if (_fbInit) return; // prevent double init
  _fbInit = true;

  try {
    const { initializeApp, getApps } = await import(`${FB_SDK}/firebase-app.js`);
    const { getDatabase, ref, onValue, set } = await import(`${FB_SDK}/firebase-database.js`);

    // Prevent duplicate Firebase app
    const existing = getApps().find(a => a.name === 'smPro');
    const app      = existing || initializeApp(cfg, 'smPro');

    _db    = getDatabase(app);
    _fbRef = ref(_db, 'smPro');

    // Real-time listener — fires on ANY change from ANY device
    onValue(_fbRef, snap => {
      const data = snap.val();
      if (!data) { setSyncStatus('synced'); return; }

      let changed = false;
      ['employees','volunteers','defaultSchedule','schedule',
       'volAvailability','absences','leaveRequests','swapRequests'].forEach(k => {
        const incoming = JSON.stringify(data[k]);
        const current  = JSON.stringify(state[k]);
        if (data[k] !== undefined && incoming !== current) {
          state[k] = data[k];
          changed  = true;
        }
      });

      // Always save locally and re-render when Firebase sends data
      saveLocal();
      renderAll();
      setSyncStatus('synced');
    }, err => {
      console.error('Firebase read error', err);
      setSyncStatus('error');
      _fbInit = false; // allow retry
    });

    setSyncStatus('synced');
  } catch(e) {
    console.error('Firebase init failed', e);
    setSyncStatus('error');
    _fbInit = false; // allow retry
  }
}

function pushToFirebase() {
  if (!_fbRef) return;

  setSyncStatus('syncing');

  import(`${FB_SDK}/firebase-database.js`).then(({ set }) => {
    set(_fbRef, {
      employees:       state.employees       || [],
      volunteers:      state.volunteers      || [],
      defaultSchedule: state.defaultSchedule || {},
      schedule:        state.schedule        || {},
      volAvailability: state.volAvailability || {},
      absences:        state.absences        || {},
      leaveRequests:   state.leaveRequests   || [],
      swapRequests:    state.swapRequests    || [],
    })
    .then(() => setSyncStatus('synced'))
    .catch(e => {
      console.error('Firebase write error', e);
      setSyncStatus('error');
    });
  });
}

function setSyncStatus(status) {
  const chip = document.getElementById('sync-indicator');
  const text = document.getElementById('sync-text');
  if (!chip || !text) return;
  chip.className   = `sync-chip ${status}`;
  text.textContent = status === 'synced'  ? 'firebase'
                   : status === 'syncing' ? 'syncing…'
                   : 'error';
}
