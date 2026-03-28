// ── ui.js ─────────────────────────────────────────────────────

// ── Utility ───────────────────────────────────────────────────
function v(id)    { return document.getElementById(id)?.value?.trim() || ''; }
function escH(s)  { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function openModal(id)  { document.getElementById(id)?.classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }

// ── Clock ─────────────────────────────────────────────────────
function tickClock() {
  const now = new Date();
  const t   = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const lc  = document.getElementById('live-clock-inline');
  const gc  = document.getElementById('grand-clock');
  if (lc) lc.textContent = t;
  if (gc) gc.textContent = t;
}

// ── Admin ─────────────────────────────────────────────────────
function openAdminLogin() {
  if (state.mode === 'admin') { exitAdmin(); return; }
  document.getElementById('admin-pin-input').value        = '';
  document.getElementById('admin-pin-error').textContent  = '';
  openModal('admin-login-modal');
  setTimeout(() => document.getElementById('admin-pin-input')?.focus(), 100);
}

function checkAdminPin(e) {
  if (e.key === 'Enter') submitAdminPin();
}

async function submitAdminPin() {
  const pin   = document.getElementById('admin-pin-input').value.trim();
  const errEl = document.getElementById('admin-pin-error');
  if (!pin) { errEl.textContent = 'Please enter your PIN.'; return; }
  if (!hasPinSet()) { errEl.textContent = 'No PIN configured. Contact your administrator.'; return; }
  const ok = await verifyPin(pin);
  if (ok) {
    closeModal('admin-login-modal');
    enterAdmin();
  } else {
    errEl.textContent = 'Incorrect PIN. Try again.';
    document.getElementById('admin-pin-input').value = '';
  }
}

function enterAdmin() {
  state.mode = 'admin';
  sessionStorage.setItem('smPro_adminSession', '1');

  const badge = document.getElementById('mode-badge');
  if (badge) { badge.textContent = 'ADMIN'; badge.className = 'mode-chip mode-admin'; }

  document.getElementById('admin-trigger-btn')?.classList.add('active');
  document.querySelectorAll('.admin-only').forEach(el => el.classList.add('admin-tab-visible'));

  const fab = document.getElementById('qa-fab-topbar');
  if (fab) fab.classList.remove('hidden');

  document.getElementById('global-alerts-bar')?.classList.remove('hidden');
  renderGlobalAlerts();

  showPage('adminhq', document.getElementById('tab-adminhq'));
}

function exitAdmin() {
  state.mode = 'live';
  sessionStorage.removeItem('smPro_adminSession');

  const badge = document.getElementById('mode-badge');
  if (badge) { badge.textContent = 'VIEW'; badge.className = 'mode-chip mode-live'; }

  document.getElementById('admin-trigger-btn')?.classList.remove('active');
  document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('admin-tab-visible'));

  document.getElementById('qa-fab-topbar')?.classList.add('hidden');
  document.getElementById('quick-actions-panel')?.classList.add('hidden');

  const gb = document.getElementById('global-alerts-bar');
  if (gb) { gb.innerHTML = ''; gb.classList.add('hidden'); }

  if (typeof stopHQRefresh === 'function') stopHQRefresh();

  showPage('live', document.getElementById('tab-live'));
  renderAll();
}

function switchToFirebaseModal() {
  closeModal('admin-login-modal');
  showFirebaseConfig();
}

// ── Global Alerts ─────────────────────────────────────────────
function renderGlobalAlerts() {
  if (state.mode !== 'admin') return;
  const el = document.getElementById('global-alerts-bar');
  if (!el) return;
  el.classList.remove('hidden');
  renderAlertsBar('global-alerts-bar', todayStr());
}

// ── Firebase modal ────────────────────────────────────────────
function showFirebaseConfig() {
  const saved = localStorage.getItem('smPro_fbConfig');
  if (saved) {
    try {
      const cfg = JSON.parse(saved);
      ['apiKey','authDomain','databaseURL','projectId','appId'].forEach(k => {
        const el = document.getElementById(`fb-${k}`);
        if (el) el.value = cfg[k] || '';
      });
    } catch(e) {}
  }
  openModal('firebase-modal');
}

async function saveFirebaseConfig() {
  const cfg = {
    apiKey     : v('fb-apiKey'),
    authDomain : v('fb-authDomain'),
    databaseURL: v('fb-databaseURL'),
    projectId  : v('fb-projectId'),
    appId      : v('fb-appId'),
  };
  if (!cfg.apiKey || !cfg.databaseURL) {
    alert('API Key and Database URL are required.');
    return;
  }
  localStorage.setItem('smPro_fbConfig', JSON.stringify(cfg));
  closeModal('firebase-modal');
  location.reload();
}

// ── Page navigation ───────────────────────────────────────────
function showPage(name, tabEl) {
  const publicPages = ['live', 'grand'];
  if (!publicPages.includes(name) && state.mode !== 'admin') return;

  if (name !== 'grand'   && typeof stopGrandRefresh === 'function') stopGrandRefresh();
  if (name !== 'adminhq' && typeof stopHQRefresh    === 'function') stopHQRefresh();

  document.querySelectorAll('.page').forEach(p    => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));

  const page = document.getElementById(`page-${name}`);
  if (page) page.classList.add('active');
  if (tabEl) tabEl.classList.add('active');

  const wnb = document.getElementById('week-nav-bar');

  if (name === 'schedule') {
    wnb?.classList.remove('hidden');
    renderWeekNav();
    renderSchedule();
    renderAlertsBar('schedule-alerts-bar', state.currentDateISO);
    const rf = document.getElementById('range-fill-weekly');
    if (rf && !rf.hasChildNodes()) rf.innerHTML = renderRangeFill('weekly');
  } else if (name === 'default') {
    wnb?.classList.add('hidden');
    renderDowPills();
    renderDefaultSchedule();
    renderAlertsBar('default-alerts-bar', todayStr());
    const rf = document.getElementById('range-fill-default');
    if (rf && !rf.hasChildNodes()) rf.innerHTML = renderRangeFill('default');
  } else {
    wnb?.classList.add('hidden');
  }

  if (name === 'staff')    { renderRoster(); renderVolunteers(); renderAlertsBar('staff-alerts-bar', todayStr()); }
  if (name === 'leave')    { renderLeave();  renderSwaps();      renderAlertsBar('leave-alerts-bar', todayStr()); }
  if (name === 'live')     renderLiveBoard();
  if (name === 'grand')    renderGrandView();
  if (name === 'adminhq') {
    const dl = document.getElementById('hq-date-label');
    if (dl) dl.textContent = new Date().toLocaleDateString('en-GB', {
      weekday:'long', day:'numeric', month:'long', year:'numeric'
    });
    const wl = document.getElementById('hq-week-label');
    if (wl) {
      const mon = new Date(state.currentWeekMon + 'T00:00:00');
      const end = new Date(mon); end.setDate(end.getDate() + 6);
      wl.textContent = `${mon.toLocaleDateString('en-GB',{day:'numeric',month:'short'})} – ${end.toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`;
    }
    renderAdminHQ();
  }
  if (name === 'holidays') renderHolidaysPage();
}

function renderAll() {
  renderLiveBoard();

  if (state.mode === 'admin') {
    renderGlobalAlerts();
    const active = document.querySelector('.page.active')?.id?.replace('page-','');
    if (active === 'adminhq')  renderAdminHQ();
    if (active === 'staff')    { renderRoster(); renderVolunteers(); renderAlertsBar('staff-alerts-bar', todayStr()); }
    if (active === 'leave')    { renderLeave();  renderSwaps();      renderAlertsBar('leave-alerts-bar', todayStr()); }
    if (active === 'default')  { renderDowPills(); renderDefaultSchedule(); renderAlertsBar('default-alerts-bar', todayStr()); }
    if (active === 'schedule') { renderWeekNav(); renderSchedule();  renderAlertsBar('schedule-alerts-bar', state.currentDateISO); }
    if (active === 'holidays') renderHolidaysPage();
  }

  const grandActive = document.getElementById('page-grand')?.classList.contains('active');
  if (grandActive && typeof renderGrandView === 'function') renderGrandView();
}

// ── HQ week controls ──────────────────────────────────────────
function hqShiftWeek(delta) {
  const d = new Date(state.currentWeekMon + 'T00:00:00');
  d.setDate(d.getDate() + delta * 7);
  state.currentWeekMon = toDateStr(d);
  renderWeekMinimap();
  renderHourWatch();
  const hwl = document.getElementById('hq-week-label');
  if (hwl) {
    const mon = new Date(state.currentWeekMon + 'T00:00:00');
    const end = new Date(mon); end.setDate(end.getDate() + 6);
    hwl.textContent = `${mon.toLocaleDateString('en-GB',{day:'numeric',month:'short'})} – ${end.toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`;
  }
}

function hqGoToToday() {
  state.currentWeekMon = toDateStr(getWeekMonday(new Date()));
  renderWeekMinimap();
  renderHourWatch();
}

// ── Week nav ──────────────────────────────────────────────────
function shiftWeek(delta) {
  const d = new Date(state.currentWeekMon + 'T00:00:00');
  d.setDate(d.getDate() + delta * 7);
  state.currentWeekMon = toDateStr(d);
  const curDow = DAYSSHORT.indexOf(state.currentDow);
  const newDay = new Date(d);
  newDay.setDate(newDay.getDate() + (curDow >= 0 ? curDow : 0));
  state.currentDateISO = toDateStr(newDay);
  renderWeekNav();
  renderSchedule();
}

function goToToday() {
  const mon = getWeekMonday(new Date());
  state.currentWeekMon = toDateStr(mon);
  state.currentDateISO = todayStr();
  state.currentDow     = DAYSSHORT[(new Date().getDay() + 6) % 7];
  renderWeekNav();
  renderSchedule();
}

function renderWeekNav() {
  const wLabel  = document.getElementById('week-label');
  const pillsEl = document.getElementById('day-pills');
  const mon = new Date(state.currentWeekMon + 'T00:00:00');
  const end = new Date(mon); end.setDate(end.getDate() + 6);

  if (wLabel) wLabel.textContent =
    `${mon.toLocaleDateString('en-GB',{day:'numeric',month:'short'})} – ${end.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}`;

  if (!pillsEl) return;
  pillsEl.innerHTML = DAYSSHORT.map((dow, di) => {
    const d       = new Date(mon); d.setDate(d.getDate() + di);
    const iso     = toDateStr(d);
    const isToday = iso === todayStr();
    const isActive= iso === state.currentDateISO;
    const holiday = getHolidayForDate(iso);
    const alerts  = typeof scanAlerts === 'function' ? scanAlerts(iso) : [];
    const hasGap  = alerts.some(a => a.type === ALERT_TYPES.GAP);
    const hasOvr  = countDayOverrides(iso) > 0;

    return `<button class="day-pill ${isActive?'active':''} ${isToday?'today':''} ${hasGap?'has-gap':''} ${hasOvr?'has-ovr':''} ${holiday?'has-hday':''}"
      onclick="selectDay('${iso}','${dow}')">
      <span class="gap-dot"></span>
      <span class="ovr-dot"></span>
      <span class="hday-dot" ${holiday?`style="background:${holiday.color}"`:''}></span>
      ${dow} ${d.getDate()}
      ${holiday ? `<span style="font-size:9px;display:block;line-height:1">${holiday.emoji}</span>` : ''}
    </button>`;
  }).join('');
}

function selectDay(iso, dow) {
  state.currentDateISO = iso;
  state.currentDow     = dow;
  renderWeekNav();
  renderSchedule();
  renderAlertsBar('schedule-alerts-bar', iso);
}

function countDayOverrides(iso) {
  const ovrs = state.schedule?.[iso] || {};
  return Object.values(ovrs).reduce((acc, slot) => acc + Object.keys(slot).length, 0);
}

// ── DOW pills ─────────────────────────────────────────────────
function renderDowPills() {
  const container = document.getElementById('dow-pills');
  if (!container) return;
  container.innerHTML = DAYSSHORT.map((d, i) =>
    `<button class="day-pill ${state.currentDow === d ? 'active' : ''}"
      onclick="selectDow('${d}')">${DAYSFULL[i]}</button>`
  ).join('');
}

function selectDow(dow) {
  state.currentDow = dow;
  renderDowPills();
  renderDefaultSchedule();
}

// ── Density ───────────────────────────────────────────────────
function setDensity(d) {
  document.querySelectorAll('.density-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`density-${d}`)?.classList.add('active');
  document.querySelectorAll('.sched-grid').forEach(t => {
    t.classList.toggle('density-compact', d === 'compact');
    t.classList.toggle('density-normal',  d === 'normal');
  });
}

// ── Adv toggle ────────────────────────────────────────────────
function toggleAdv() {
  const body = document.getElementById('adv-body');
  const btn  = document.getElementById('adv-toggle');
  if (!body) return;
  body.classList.toggle('open');
  btn?.classList.toggle('open');
  if (body.classList.contains('open')) {
    const container = document.getElementById('copy-day-btns');
    if (!container) return;
    const mon = new Date(state.currentWeekMon + 'T00:00:00');
    container.innerHTML = DAYSSHORT.map((dow, di) => {
      const d   = new Date(mon); d.setDate(d.getDate() + di);
      const iso = toDateStr(d);
      if (iso === state.currentDateISO) return '';
      return `<button class="btn btn-sm btn-ghost"
        onclick="copyDayTo('${iso}')">${dow}</button>`;
    }).filter(Boolean).join('');
  }
}

// ── Quick actions toggle ──────────────────────────────────────
function toggleQuickActions() {
  const panel = document.getElementById('quick-actions-panel');
  const fab   = document.getElementById('qa-fab-topbar');
  if (!panel) return;
  const isHidden = panel.classList.contains('hidden');
  panel.classList.toggle('hidden', !isHidden);
  fab?.classList.toggle('active', isHidden);
  if (isHidden) renderQuickActionsPanel();
}

// ── Toast ─────────────────────────────────────────────────────
let _toastTimer = null;
function showToast(msg) {
  const t = document.getElementById('undo-toast');
  const m = document.getElementById('undo-msg');
  if (!t || !m) return;
  m.textContent = msg;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}
function hideToast() { document.getElementById('undo-toast')?.classList.remove('show'); }

// ── Export / Import ───────────────────────────────────────────
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)],{type:'application/json'});
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `schedule-backup-${todayStr()}.json`;
  a.click();
}
function importData() { document.getElementById('import-file')?.click(); }

function handleImportFile(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = evt => {
    try {
      const data = JSON.parse(evt.target.result);
      if (!confirm('This will replace ALL current data. Are you sure?')) return;
      pushUndo('Import data', state);
      Object.keys(data).forEach(k => { state[k] = data[k]; });
      persistAll();
      renderAll();
      showToast('Data imported successfully');
    } catch(err) { alert('Invalid JSON file.'); }
  };
  reader.readAsText(file);
}

// ── Reset ─────────────────────────────────────────────────────
function resetAllData() {
  document.getElementById('reset-pin').value         = '';
  document.getElementById('reset-error').textContent = '';
  openModal('reset-modal');
}

async function confirmReset() {
  const pin = document.getElementById('reset-pin').value.trim();
  const ok  = await verifyPin(pin);
  if (!ok) { document.getElementById('reset-error').textContent = 'Incorrect PIN.'; return; }
  Object.assign(state, {
    employees:[], volunteers:[], defaultSchedule:{}, schedule:{},
    volAvailability:{}, absences:{}, leaveRequests:[], swapRequests:[],
    holidays:{}, empDaysOff:{}, empHourCap:{}
  });
  persistAll();
  closeModal('reset-modal');
  renderAll();
  showToast('All data deleted');
}

// ── Shared slot helper ────────────────────────────────────────
function getSlotAssignments(iso, si) {
  return state.employees
    .filter(e => e.status === 'Active')
    .map(e => ({ emp:e, ...getResolvedLoc(iso, si, e.id) }));
}

// ── Toggle absent (ui-triggered) ─────────────────────────────
function toggleAbsent(empId, iso) {
  if (!state.absences)       state.absences       = {};
  if (!state.absences[iso])  state.absences[iso]  = {};
  if (state.absences[iso][empId]) {
    delete state.absences[iso][empId];
    if (!Object.keys(state.absences[iso]).length) delete state.absences[iso];
  } else {
    state.absences[iso][empId] = true;
  }
  persistAll('absences');
  renderLiveBoard();
  if (state.mode === 'admin') renderGlobalAlerts();
}

// ── isOnLeave helper ──────────────────────────────────────────
function isOnLeave(empId, iso) {
  return (state.leaveRequests||[]).some(l =>
    l.empId === empId && l.status === 'active' && iso >= l.from && iso <= l.to
  );
}

// ── Schedule alerts ───────────────────────────────────────────
function renderSchedAlerts() {
  const area = document.getElementById('sched-alert-area'); if (!area) return;
  const iso  = state.currentDateISO;
  let html   = '';
  (state.leaveRequests||[]).filter(l=>l.status==='active').forEach(l => {
    const cur = new Date(iso+'T00:00:00');
    if (cur >= new Date(l.from+'T00:00:00') && cur <= new Date(l.to+'T00:00:00')) {
      const emp = state.employees.find(e=>e.id===l.empId);
      if (emp) html += `<div class="alert-banner leave">🔒 ${escH(emp.name)} is on ${l.type} leave today</div>`;
    }
  });
  (state.swapRequests||[]).forEach(s => {
    if (s.fromDate===iso && s.status==='active') {
      const emp = state.employees.find(e=>e.id===s.empId);
      if (emp) html += `<div class="alert-banner swap">🔄 ${escH(emp.name)} swapped day off — working today</div>`;
    }
  });
  area.innerHTML = html;
}

// ── Quick Actions Panel ───────────────────────────────────────
function renderQuickActionsPanel() {
  const el = document.getElementById('quick-actions-panel');
  if (!el) return;
  const iso        = todayStr();
  const activeEmps = state.employees.filter(e => e.status === 'Active');

  el.innerHTML = `
    <div class="qa-header">
      <span style="font-weight:700;font-size:13px">Quick Actions</span>
      <button onclick="toggleQuickActions()"
        style="background:none;border:none;cursor:pointer;
               font-size:16px;color:var(--muted)">✕</button>
    </div>
    <div class="qa-body">

      <div class="qa-section-title">Mark Absent Today</div>
      <div style="display:flex;flex-direction:column;gap:4px">
        ${activeEmps.filter(e => !isEmpDayOff(e.id,iso) && !isOnLeave(e.id,iso)).map(e => {
          const absent = !!state.absences?.[iso]?.[e.id];
          return `<button class="qa-emp-btn ${absent?'qa-absent':''}"
            onclick="toggleAbsent('${e.id}','${iso}')">
            <span class="qa-emp-dot"
              style="background:${absent?'var(--red)':'var(--border2)'}"></span>
            ${escH(e.name)}
            <span style="margin-left:auto;font-size:10px;
                         color:${absent?'var(--red)':'var(--muted)'}">
              ${absent?'Absent':'Present'}
            </span>
          </button>`;
        }).join('')}
      </div>

      <div class="qa-section-title" style="margin-top:14px">Schedule Actions</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <button class="btn btn-sm btn-ghost" style="justify-content:flex-start"
          onclick="applyDefaultToDay();toggleQuickActions()">
          📋 Apply Default → Today
        </button>
        <button class="btn btn-sm btn-ghost" style="justify-content:flex-start"
          onclick="clearOverridesForDay();toggleQuickActions()">
          🗑 Clear Today's Overrides
        </button>
        <button class="btn btn-sm btn-ghost" style="justify-content:flex-start"
          onclick="showPage('schedule',document.getElementById('tab-schedule'));toggleQuickActions()">
          📅 Go to Schedule
        </button>
        <button class="btn btn-sm btn-ghost" style="justify-content:flex-start"
          onclick="showPage('staff',document.getElementById('tab-staff'));toggleQuickActions()">
          👥 Go to Staff
        </button>
        <button class="btn btn-sm btn-ghost" style="justify-content:flex-start"
          onclick="showPage('leave',document.getElementById('tab-leave'));toggleQuickActions()">
          🗓 Go to Leave
        </button>
      </div>

      <div class="qa-section-title" style="margin-top:14px">Data</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-sm btn-ghost" onclick="exportData()">⬇ Export</button>
        <button class="btn btn-sm btn-ghost" onclick="importData()">⬆ Import</button>
        <button class="btn btn-sm btn-danger" onclick="resetAllData()">🗑 Reset</button>
      </div>

    </div>`;
}

// ── Midnight refresh ──────────────────────────────────────────
function scheduleMidnightRefresh() {
  const now  = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 30, 0);
  const ms = next - now;
  setTimeout(() => {
    state.currentDateISO = todayStr();
    state.currentDow     = DAYSSHORT[(new Date().getDay()+6)%7];
    renderAll();
    scheduleMidnightRefresh();
  }, ms);
}

// ── Utility helpers ───────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
    day:'numeric', month:'short', year:'numeric'
  });
}

function getWeekMonStr(iso) {
  return toDateStr(getWeekMonday(new Date(iso + 'T00:00:00')));
}

// ── Init ──────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  initState();

  if (!state.currentWeekMon) {
    state.currentWeekMon = toDateStr(getWeekMonday(new Date()));
  }
  if (!state.currentDateISO) state.currentDateISO = todayStr();
  if (!state.currentDow)     state.currentDow     = DAYSSHORT[(new Date().getDay()+6)%7];

  if (sessionStorage.getItem('smPro_adminSession')) {
    enterAdmin();
  } else {
    state.mode = 'live';
    document.getElementById('global-alerts-bar')?.classList.add('hidden');
    document.getElementById('qa-fab-topbar')?.classList.add('hidden');
  }

  const ld = document.getElementById('lookup-date');
  if (ld) ld.value = todayStr();

  tickClock();
  setInterval(tickClock, 15000);

  // Auto-refresh live board every 30s
  setInterval(() => {
    if (document.getElementById('page-live')?.classList.contains('active')) {
      renderLiveBoard();
    }
  }, 30000);

  if (typeof scheduleMidnightRefresh === 'function') scheduleMidnightRefresh();

  if (window.innerWidth < 640) setLiveView('my');
  else                          setLiveView('locations');

  renderLiveBoard();
});
