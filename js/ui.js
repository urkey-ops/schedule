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
  if (name === 'staff')   { renderRoster(); renderVolunteers(); }
  if (name === 'leave')   { renderLeave(); renderSwaps(); }
  if (name === 'live')    renderLiveBoard();
  if (name === 'default') { renderDowPills(); renderDefaultSchedule(); }
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
    const iso     = toDateStr(d);
    const isSel   = iso === state.currentDateISO;
    const isToday = iso === todayStr_;
    const gaps    = countDayGaps(iso);
    const ovrs    = countDayOverrides(iso);
    return `<button class="day-pill ${isSel?'active':''} ${isToday?'today':''} ${gaps>0?'has-gap':''} ${ovrs>0?'has-ovr':''}"
      onclick="switchDay('${iso}')" title="${gaps} gap(s), ${ovrs} override(s)">
      ${DAYS_SHORT[i]} ${d.getDate()}
      <span class="gap-dot"></span>
      <span class="ovr-dot"></span>
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
  state.currentWeekMon = toDateStr(mon);
  state.currentDateISO = state.currentWeekMon;
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
  TIME_SLOTS.forEach((_, si) => {
    REQUIRED_LOCS.forEach(loc => {
      const covered = state.employees.some(e =>
        e.status === 'Active' && getResolvedLoc(iso, si, e.id).loc === loc
      );
      if (!covered) g++;
    });
  });
  return g;
}

function countDayOverrides(iso) {
  let c = 0;
  const day = state.schedule?.[iso];
  if (day) Object.values(day).forEach(s => c += Object.keys(s).length);
  return c;
}

// ── Default page dow pills ─────────────────────────────────────
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

// ── Advanced Tools Toggle ──────────────────────────────────────
function toggleAdv() {
  document.getElementById('adv-toggle').classList.toggle('open');
  document.getElementById('adv-body').classList.toggle('open');
}

function setDensity(mode) {
  density = mode;
  document.getElementById('density-normal').classList.toggle('active', mode === 'normal');
  document.getElementById('density-compact').classList.toggle('active', mode === 'compact');
  renderSchedule();
}

// ── Admin Login Modal ──────────────────────────────────────────
function openAdminLogin() {
  // If already admin, log out instead
  if (state.mode === 'admin') {
    exitAdminMode();
    return;
  }
  document.getElementById('admin-pin-input').value = '';
  document.getElementById('admin-pin-error').textContent = '';
  openModal('admin-login-modal');
  setTimeout(() => document.getElementById('admin-pin-input').focus(), 100);
}

function checkAdminPin(e) {
  if (e.key === 'Enter') submitAdminPin();
}

function submitAdminPin() {
  const entered = document.getElementById('admin-pin-input').value;
  const stored  = localStorage.getItem('smPro_pin') || DEFAULT_PIN;
  if (entered === stored) {
    closeModal('admin-login-modal');
    enterAdminMode();
  } else {
    document.getElementById('admin-pin-error').textContent = 'Incorrect PIN. Try again.';
    document.getElementById('admin-pin-input').value = '';
    document.getElementById('admin-pin-input').focus();
  }
}

function enterAdminMode() {
  state.mode = 'admin';
  document.querySelectorAll('.admin-only').forEach(el => {
    el.classList.remove('admin-only');
    el.classList.add('admin-tab-visible');
  });
  document.getElementById('mode-badge').textContent = 'ADMIN';
  document.getElementById('mode-badge').className   = 'mode-chip mode-admin';
  const btn = document.getElementById('admin-trigger-btn');
  if (btn) { btn.textContent = '🔓 Admin'; btn.classList.add('active'); }
  renderAll();
}

function exitAdminMode() {
  if (!confirm('Exit admin mode?')) return;
  state.mode = 'live';
  document.querySelectorAll('.admin-tab-visible').forEach(el => {
    el.classList.remove('admin-tab-visible');
    el.classList.add('admin-only');
  });
  document.getElementById('mode-badge').textContent = 'VIEW';
  document.getElementById('mode-badge').className   = 'mode-chip mode-live';
  const btn = document.getElementById('admin-trigger-btn');
  if (btn) { btn.textContent = '🔑 Admin'; btn.classList.remove('active'); }
  // Return to live board
  showPage('live', document.getElementById('tab-live'));
}

function switchToFirebaseModal() {
  closeModal('admin-login-modal');
  showFirebaseConfig();
}

// ── Modals ─────────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

// Click outside modal to close
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.add('hidden');
  }
});

// ── Firebase Config ────────────────────────────────────────────
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

// ── Export / Import / Reset ────────────────────────────────────
function exportData() {
  const data = {
    employees:       state.employees,
    volunteers:      state.volunteers,
    defaultSchedule: state.defaultSchedule,
    schedule:        state.schedule,
    volAvailability: state.volAvailability,
    leaveRequests:   state.leaveRequests,
    swapRequests:    state.swapRequests,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
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

// ── Toast ──────────────────────────────────────────────────────
let toastTimer = null;

function showToast(msg, withUndo = false) {
  const t   = document.getElementById('undo-toast');
  const btn = t.querySelector('.undo-btn');
  document.getElementById('undo-msg').textContent = msg;
  btn.style.display = withUndo ? '' : 'none';
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove('show');
    btn.style.display = '';
  }, 2400);
}

function hideToast() { document.getElementById('undo-toast').classList.remove('show'); }

// ── Clock ──────────────────────────────────────────────────────
function tickClock() {
  const now  = new Date();
  let h      = now.getHours();
  const m    = now.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const el = document.getElementById('live-clock');
  if (el) el.textContent = `${h}:${String(m).padStart(2,'0')} ${ampm}`;
}

// ── Render All ─────────────────────────────────────────────────
function renderAll() {
  renderLiveBoard();
  if (state.mode === 'admin') {
    if (document.getElementById('page-staff').classList.contains('active')) {
      renderRoster(); renderVolunteers();
    }
    if (document.getElementById('page-leave').classList.contains('active')) {
      renderLeave(); renderSwaps();
    }
    if (document.getElementById('page-default').classList.contains('active')) {
      renderDowPills(); renderDefaultSchedule();
    }
    if (document.getElementById('page-schedule').classList.contains('active')) {
      renderWeekNav(); renderSchedule();
    }
  }
}

// ── Helper utilities ───────────────────────────────────────────
function v(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

function escH(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}

// ── Init ───────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  initState();

  // Set default week/day state
  const mon = getWeekMonday(new Date());
  if (!state.currentWeekMon) state.currentWeekMon = toDateStr(mon);
  if (!state.currentDateISO) state.currentDateISO = todayStr();
  if (!state.currentDow)     state.currentDow     = DAYS_SHORT[(new Date().getDay()+6)%7];

  // Always start in live/view mode — no PIN gate
  state.mode = 'live';

  // Set default lookup date
  const ld = document.getElementById('lookup-date');
  if (ld) ld.value = todayStr();

  // Start clock
  tickClock();
  setInterval(tickClock, 15000);

  // Auto-refresh live board every 30s
  setInterval(() => {
    if (document.getElementById('page-live').classList.contains('active')) {
      renderLiveBoard();
    }
  }, 30000);

  // Render live board immediately
  renderLiveBoard();
});
