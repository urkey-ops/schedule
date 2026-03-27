// ── Page Navigation ───────────────────────────────────────────
function showPage(name, tabEl) {
  if (name !== 'live' && state.mode !== 'admin') return;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`page-${name}`).classList.add('active');
  if (tabEl) tabEl.classList.add('active');

  const wnb = document.getElementById('week-nav-bar');
  if (name === 'schedule') {
    wnb.classList.remove('hidden');
    renderWeekNav();
    renderSchedule();
  } else {
    wnb.classList.add('hidden');
  }
  if (name === 'staff')    { renderRoster(); renderVolunteers(); }
  if (name === 'leave')    { renderLeave(); renderSwaps(); }
  if (name === 'live')     renderLiveBoard();
  if (name === 'default')  { renderDowPills(); renderDefaultSchedule(); }
}

// ── Week Navigation ───────────────────────────────────────────
function renderWeekNav() {
  const monday    = new Date(state.currentWeekMon + 'T00:00:00');
  const weekDates = Array.from({length:7}, (_, i) => {
    const d = new Date(monday); d.setDate(d.getDate() + i); return d;
  });
  const todayStr_ = todayStr();

  document.getElementById('week-label').textContent = `Week of ${formatWeekLabel(monday)}`;

  document.getElementById('day-pills').innerHTML = weekDates.map((d, i) => {
    const iso    = toDateStr(d);
    const isSel  = iso === state.currentDateISO;
    const isToday = iso === todayStr_;
    const gaps   = countDayGaps(iso);
    const ovrs   = countDayOverrides(iso);
    return `<button class="day-pill ${isSel?'active':''} ${isToday?'today':''} ${gaps>0?'has-gap':''} ${ovrs>0?'has-ovr':''}"
      onclick="switchDay('${iso}')" title="${gaps} gaps, ${ovrs} overrides">
      ${DAYS_SHORT[i]} ${d.getDate()}
      <span class="gap-dot"></span><span class="ovr-dot"></span>
    </button>`;
  }).join('');

  const cb = document.getElementById('copy-day-btns');
  if (cb) cb.innerHTML = weekDates.map((d, i) => {
    const iso = toDateStr(d);
    if (iso === state.currentDateISO) return '';
    return `<button class="btn btn-sm btn-ghost" onclick="copyDayTo('${iso}')">${DAYS_SHORT[i]} ${d.getDate()}</button>`;
  }).join('');
}

function shiftWeek(delta) {
  const mon = new Date(state.currentWeekMon + 'T00:00:00');
  mon.setDate(mon.getDate() + delta * 7);
  state.currentWeekMon  = toDateStr(mon);
  state.currentDateISO  = state.currentWeekMon;
  renderWeekNav();
  renderSchedule();
}

function goToToday() {
  const mon = getWeekMonday(new Date());
  state.currentWeekMon = toDateStr(mon);
  state.currentDateISO = todayStr();
  renderWeekNav();
  renderSchedule();
}

function switchDay(iso) {
  state.currentDateISO = iso;
  renderWeekNav();
  renderSchedule();
}

function jumpToDate(iso) {
  const mon = getWeekMonday(new Date(iso + 'T00:00:00'));
  state.currentWeekMon = toDateStr(mon);
  state.currentDateISO = iso;
  showPage('schedule', document.getElementById('tab-schedule'));
}

function countDayGaps(iso) {
  let g = 0;
  TIME_SLOTS.forEach((_, si) =>
    REQUIRED_LOCS.forEach(loc => {
      const covered = state.employees.some(e =>
        e.status === 'Active' && getResolvedLoc(iso, si, e.id).loc === loc
      );
      if (!covered) g++;
    })
  );
  return g;
}

function countDayOverrides(iso) {
  let c = 0;
  const day = state.schedule?.[iso];
  if (day) Object.values(day).forEach(s => c += Object.keys(s).length);
  return c;
}

// ── Default page dow pills ────────────────────────────────────
function renderDowPills() {
  document.getElementById('dow-pills').innerHTML = DAYS_SHORT.map(dow =>
    `<button class="dow-pill ${state.currentDow === dow ? 'active' : ''}"
      onclick="switchDow('${dow}')">${dow}</button>`
  ).join('');
}

function switchDow(dow) {
  state.currentDow = dow;
  renderDowPills();
  renderDefaultSchedule();
}

// ── Advanced Tools Toggle ─────────────────────────────────────
function toggleAdv() {
  const btn  = document.getElementById('adv-toggle');
  const body = document.getElementById('adv-body');
  btn.classList.toggle('open');
  body.classList.toggle('open');
}

function setDensity(mode) {
  density = mode;
  document.getElementById('density-normal').classList.toggle('active', mode === 'normal');
  document.getElementById('density-compact').classList.toggle('active', mode === 'compact');
  renderSchedule();
}

// ── PIN ───────────────────────────────────────────────────────
function checkPin(e) { if (e.key === 'Enter') submitPin(); }

function submitPin() {
  const entered = document.getElementById('pin-input').value;
  const stored  = localStorage.getItem('smPro_pin') || DEFAULT_PIN;
  if (entered === stored) enterAdminMode();
  else document.getElementById('pin-error').textContent = 'Incorrect PIN.';
}

function enterAdminMode() {
  state.mode = 'admin';
  document.getElementById('pin-screen').style.display = 'none';
  document.querySelectorAll('.admin-only').forEach(el => {
    el.classList.remove('admin-only');
    el.classList.add('admin-tab-visible');
  });
  document.getElementById('mode-badge').textContent  = 'ADMIN';
  document.getElementById('mode-badge').className    = 'mode-chip mode-admin';
  renderAll();
}

function enterLiveMode() {
  state.mode = 'live';
  document.getElementById('pin-screen').style.display = 'none';
  document.getElementById('mode-badge').textContent  = 'VIEW';
  document.getElementById('mode-badge').className    = 'mode-chip mode-live';
  showPage('live', document.getElementById('tab-live'));
  renderAll();
}

// ── Modals ────────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

// ── Firebase Config ───────────────────────────────────────────
function showFirebaseConfig() {
  const cfg = JSON.parse(localStorage.getItem('smPro_fbConfig') || '{}');
  ['apiKey','authDomain','databaseURL','projectId','appId'].forEach(k => {
    const el = document.getElementById(`fb-${k}`);
    if (el) el.value = cfg[k] || '';
  });
  document.getElementById('fb-pin').value = localStorage.getItem('smPro_pin') || '';
  openModal('firebase-modal');
}

function saveFirebaseConfig() {
  const cfg = {
    apiKey:      document.getElementById('fb-apiKey').value.trim(),
    authDomain:  document.getElementById('fb-authDomain').value.trim(),
    databaseURL: document.getElementById('fb-databaseURL').value.trim(),
    projectId:   document.getElementById('fb-projectId').value.trim(),
    appId:       document.getElementById('fb-appId').value.trim(),
  };
  const pin = document.getElementById('fb-pin').value.trim();
  if (pin) localStorage.setItem('smPro_pin', pin);
  localStorage.setItem('smPro_fbConfig', JSON.stringify(cfg));
  closeModal('firebase-modal');
  if (cfg.apiKey && cfg.databaseURL) {
    initFirebase(cfg).then(() => showToast('Firebase connected ✓'));
  }
}

// ── Export / Import / Reset ───────────────────────────────────
function exportData() {
  const data = {
    employees:      state.employees,
    volunteers:     state.volunteers,
    defaultSchedule: state.defaultSchedule,
    schedule:       state.schedule,
    volAvailability: state.volAvailability,
    leaveRequests:  state.leaveRequests,
    swapRequests:   state.swapRequests,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `schedulemaker-${todayStr()}.json`;
  a.click();
}

function importData() { document.getElementById('import-file').click(); }

function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = evt => {
    try {
      const d = JSON.parse(evt.target.result);
      ['employees','volunteers','defaultSchedule','schedule',
       'volAvailability','leaveRequests','swapRequests'].forEach(k => {
        if (d[k]) state[k] = d[k];
      });
      persistAll();
      renderAll();
      alert('Import successful!');
    } catch { alert('Import failed — invalid JSON.'); }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function resetAllData() { openModal('reset-modal'); }

function confirmReset() {
  const entered = document.getElementById('reset-pin').value;
  const stored  = localStorage.getItem('smPro_pin') || DEFAULT_PIN;
  if (entered !== stored) {
    document.getElementById('reset-error').textContent = 'Incorrect PIN.';
    return;
  }
  ['employees','volunteers','leaveRequests','swapRequests'].forEach(k => state[k] = []);
  ['defaultSchedule','schedule','volAvailability','absences'].forEach(k => state[k] = {});
  persistAll();
  closeModal('reset-modal');
  renderAll();
  alert('All data deleted.');
}

// ── Toast / Undo ──────────────────────────────────────────────
let toastTimer = null;

function showToast(msg) {
  const t   = document.getElementById('undo-toast');
  const btn = t.querySelector('.undo-btn');
  document.getElementById('undo-msg').textContent = msg;
  btn.style.display = 'none';
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove('show'); btn.style.display = ''; }, 2200);
}

function hideToast() { document.getElementById('undo-toast').classList.remove('show'); }

// ── Clock ─────────────────────────────────────────────────────
function tickClock() {
  const now = new Date();
  let h = now.getHours(), m = now.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  document.getElementById('live-clock').textContent =
    `${h}:${String(m).padStart(2,'0')} ${ampm}`;
}

// ── Render All ────────────────────────────────────────────────
function renderAll() {
  renderLiveBoard();
  if (state.mode === 'admin') {
    renderRoster();
    renderVolunteers();
    renderLeave();
    renderSwaps();
    if (document.getElementById('page-default').classList.contains('active')) {
      renderDowPills(); renderDefaultSchedule();
    }
    if (document.getElementById('page-schedule').classList.contains('active')) {
      renderWeekNav(); renderSchedule();
    }
  }
}

// ── Helper: read input value ──────────────────────────────────
function v(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

function escH(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Init ──────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  initState();

  // Set default week/day
  const mon = getWeekMonday(new Date());
  if (!state.currentWeekMon) state.currentWeekMon = toDateStr(mon);
  if (!state.currentDateISO) state.currentDateISO = todayStr();
  if (!state.currentDow)     state.currentDow     = DAYS_SHORT[(new Date().getDay()+6)%7];
  if (!state.mode)           state.mode           = 'live';

  // Set lookup date default
  const ld = document.getElementById('lookup-date');
  if (ld) ld.value = todayStr();

  tickClock();
  setInterval(tickClock, 15000);
  setInterval(() => {
    if (document.getElementById('page-live').classList.contains('active')) renderLiveBoard();
  }, 30000);
});
