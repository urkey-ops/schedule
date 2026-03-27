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
  if (_fbInit) return;
  _fbInit = true;

  try {
    const { initializeApp, getApps } = await import(`${FB_SDK}/firebase-app.js`);
    const { getDatabase, ref, onValue, set } = await import(`${FB_SDK}/firebase-database.js`);

    const existing = getApps().find(a => a.name === 'smPro');
    const app      = existing || initializeApp(cfg, 'smPro');
    _db    = getDatabase(app);
    _fbRef = ref(_db, 'smPro');

    onValue(_fbRef, snap => {
      const data = snap.val();
      if (!data) { setSyncStatus('synced'); return; }
      ['employees','volunteers','defaultSchedule','schedule',
       'volAvailability','absences','leaveRequests','swapRequests',
       'holidays','empDaysOff','empHourCap'].forEach(k => {
        if (data[k] !== undefined) state[k] = data[k];
      });
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
      holidays:        state.holidays        || {},
      empDaysOff:      state.empDaysOff      || {},
      empHourCap:      state.empHourCap      || {},
    })
    .then(()  => setSyncStatus('synced'))
    .catch(e  => { console.error(e); setSyncStatus('error'); });
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
