// Firebase SDK loaded via CDN — no npm needed
const FB_SDK = 'https://www.gstatic.com/firebasejs/10.12.0';
let _db = null;
let _fbReady = false;

async function initFirebase(cfg) {
  const { initializeApp }  = await import(`${FB_SDK}/firebase-app.js`);
  const { getDatabase, ref, set, onValue } = await import(`${FB_SDK}/firebase-database.js`);

  const app = initializeApp(cfg);
  _db = getDatabase(app);
  _fbReady = true;

  // Start listening for remote changes
  onValue(ref(_db, 'smPro'), snap => {
    if (snap.exists()) {
      const remote = snap.val();
      Object.assign(state, remote);
      renderAll();
      setSyncStatus('synced');
    }
  }, err => { console.error(err); setSyncStatus('error'); });

  setSyncStatus('synced');
}

async function pushToFirebase() {
  if (!_fbReady || !_db) return;
  setSyncStatus('syncing');
  try {
    const { ref, set } = await import(`${FB_SDK}/firebase-database.js`);
    await set(ref(_db, 'smPro'), state);
    setSyncStatus('synced');
  } catch(e) {
    console.error(e);
    setSyncStatus('error');
  }
}

function setSyncStatus(status) {
  const chip = document.getElementById('sync-indicator');
  const txt  = document.getElementById('sync-text');
  if (!chip) return;
  chip.className = `sync-chip ${status}`;
  txt.textContent = status === 'synced' ? 'firebase' : status === 'syncing' ? 'saving…' : 'error';
}

function isFirebaseReady() { return _fbReady; }
