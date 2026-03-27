// ── Utility ───────────────────────────────────────────────────
function v(id)    { return document.getElementById(id)?.value?.trim() || ''; }
function escH(s)  { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function openModal(id)  { document.getElementById(id)?.classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }

// ── Clock ─────────────────────────────────────────────────────
function tickClock() {
  const now = new Date();
  const hh  = String(now.getHours()).padStart(2,'0');
  const mm  = String(now.getMinutes()).padStart(2,'0');
  const el  = document.getElementById('live-clock');
  if (el) el.textContent = `${hh}:${mm}`;
}

// ── Admin ─────────────────────────────────────────────────────
function openAdminLogin() {
  if (state.mode === 'admin') {
    exitAdmin();
    return;
  }
  document.getElementById('admin-pin-input').value = '';
  document.getElementById('admin-pin-error').textContent = '';
  openModal('admin-login-modal');
  setTimeout(() => document.getElementById('admin-pin-input')?.focus(), 100);
}

function checkAdminPin(e) {
  if (e.key === 'Enter') submitAdminPin();
}

async function submitAdminPin() {
  const pin = document.getElementById('admin-pin-input').value.trim();
  if (!hasPinSet()) {
    document.getElementById('admin-pin-error').textContent =
      'No PIN set. Use Configure Firebase to set one first.';
    return;
  }
  const ok = await verifyPin(pin);
  if (ok) {
    closeModal('admin-login-modal');
    enterAdmin();
  } else {
    document.getElementById('admin-pin-error').textContent = 'Incorrect PIN. Try again.';
    document.getElementById('admin-pin-input').value = '';
  }
}

function enterAdmin() {
  state.mode = 'admin';
  sessionStorage.setItem('smPro_adminSession', '1');
  document.getElementById('mode-badge').textContent = 'ADMIN';
  document.getElementById('mode-badge').className = 'mode-chip mode-admin';
  document.getElementById('admin-trigger-btn').classList.add('active');
  document.querySelectorAll('.admin-only').forEach(el => el.classList.add('admin-tab-visible'));
  showPage('live', document.getElementById('tab-live'));
}

function exitAdmin() {
  state.mode = 'live';
  sessionStorage.removeItem('smPro_adminSession');
  document.getElementById('mode-badge').textContent = 'VIEW';
  document.getElementById('mode-badge').className = 'mode-chip mode-live';
  document.getElementById('admin-trigger-btn').classList.remove('active');
  document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('admin-tab-visible'));
  showPage('live', document.getElementById('tab-live'));
}

function switchToFirebaseModal() {
  closeModal('admin-login-modal');
  showFirebaseConfig();
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
  const pinEl = document.getElementById('fb-pin');
  if (pinEl) {
    pinEl.value = '';
    pinEl.placeholder = hasPinSet() ? '(leave blank to keep current PIN)' : 'Set a new PIN';
  }
  openModal('firebase-modal');
}

async function saveFirebaseConfig() {
  const cfg = {
    apiKey:      v('fb-apiKey'),
    authDomain:  v('fb-authDomain'),
    databaseURL: v('fb-databaseURL'),
    projectId:   v('fb-projectId'),
    appId:       v('fb-appId'),
  };
  if (!cfg.apiKey || !cfg.databaseURL) {
    alert('API Key and Database URL are required.');
    return;
  }
  const pin = v('fb-pin');
  if (pin) {
    if (pin.length < 4) { alert('PIN must be at least 4 characters.'); return; }
    await setPinHash(pin);
  } else if (!hasPinSet()) {
    alert('Please set a PIN before saving.');
    return;
  }
  localStorage.setItem('smPro_fbConfig', JSON.stringify(cfg));
  closeModal('firebase-modal');
  location.reload();
}

// ── Page navigation ───────────────────────────────────────────
function showPage(name, tabEl) {
  if (name !== 'live' && state.mode !== 'admin') return;

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));

  const page = document.getElementById(`page-${name}`);
  if (page) page.classList.add('active');
  if (tabEl) tabEl.classList.add('active');

  const wnb = document.getElementById('week-nav-bar');

  if (name === 'schedule') {
    wnb.classList.remove('hidden');
    renderWeekNav();
    renderSchedule();
    // Inject range fill tool
    const rf = document.getElementById('range-fill-weekly');
    if (rf && !rf.hasChildNodes()) rf.innerHTML = renderRangeFill('weekly');
  } else if (name === 'default') {
    wnb.classList.add('hidden');
    renderDowPills();
    renderDefaultSchedule();
    // Inject range fill tool
    const rf = document.getElementById('range-fill-default');
    if (rf && !rf.hasChildNodes()) rf.innerHTML = renderRangeFill('default');
  } else {
    wnb.classList.add('hidden');
  }

  if (name === 'staff')    { renderRoster(); renderVolunteers(); }
  if (name === 'leave')    { renderLeave(); renderSwaps(); }
  if (name === 'live')     renderLiveBoard();
  if (name === 'holidays') renderHolidaysPage();
}

function renderAll() {
  renderLiveBoard();
  if (state.mode === 'admin') {
    const active = document.querySelector('.page.active')?.id?.replace('page-','');
    if (active === 'staff')    { renderRoster(); renderVolunteers(); }
    if (active === 'leave')    { renderLeave(); renderSwaps(); }
    if (active === 'default')  { renderDowPills(); renderDefaultSchedule(); }
    if (active === 'schedule') { renderWeekNav(); renderSchedule(); }
    if (active === 'holidays') renderHolidaysPage();
  }
}

// ── Week nav ──────────────────────────────────────────────────
function shiftWeek(delta) {
  const d = new Date(state.currentWeekMon + 'T00:00:00');
  d.setDate(d.getDate() + delta * 7);
  state.currentWeekMon = toDateStr(d);
  // Keep selected day in new week
  const curDow = DAYS_SHORT.indexOf(state.currentDow);
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
  state.currentDow     = DAYS_SHORT[(new Date().getDay() + 6) % 7];
  renderWeekNav();
  renderSchedule();
}

function renderWeekNav() {
  const wLabel = document.getElementById('week-label');
  const pillsEl = document.getElementById('day-pills');
  const mon = new Date(state.currentWeekMon + 'T00:00:00');
  const end = new Date(mon); end.setDate(end.getDate() + 6);

  if (wLabel) wLabel.textContent =
    `${mon.toLocaleDateString('en-GB',{day:'numeric',month:'short'})} – ${
      end.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}`;

  if (!pillsEl) return;
  pillsEl.innerHTML = DAYS_SHORT.map((dow, di) => {
    const d   = new Date(mon);
    d.setDate(d.getDate() + di);
    const iso = toDateStr(d);
    const isToday   = iso === todayStr();
    const isActive  = iso === state.currentDateISO;
    const hasGap    = countDayGaps(iso) > 0;
    const hasOvr    = countDayOverrides(iso) > 0;
    const hasHday   = !!getHolidayForDate(iso);
    const holiday   = getHolidayForDate(iso);
    const dayNum    = d.getDate();
    const classes   = [
      'day-pill',
      isActive  ? 'active'   : '',
      isToday   ? 'today'    : '',
      hasGap    ? 'has-gap'  : '',
      hasOvr    ? 'has-ovr'  : '',
      hasHday   ? 'has-hday' : '',
    ].filter(Boolean).join(' ');

    return `<button class="${classes}" onclick="selectDay('${iso}','${dow}')">
      <span class="gap-dot"></span>
      <span class="ovr-dot"></span>
      <span class="hday-dot" ${holiday?`style="background:${holiday.color}"`:''}></span>
      ${dow} ${dayNum}
      ${hasHday ? `<span style="font-size:9px;display:block;line-height:1">${holiday.emoji}</span>` : ''}
    </button>`;
  }).join('');
}

function selectDay(iso, dow) {
  state.currentDateISO = iso;
  state.currentDow     = dow;
  renderWeekNav();
  renderSchedule();
}

function countDayGaps(iso) {
  const activeEmps = state.employees.filter(e => e.status === 'Active');
  let gaps = 0;
  TIME_SLOTS.forEach((_, si) => {
    REQUIRED_LOCS.forEach(req => {
      const covered = activeEmps.some(e => {
        if (isEmpDayOff(e.id, iso)) return false;
        const { loc, source } = getResolvedLoc(iso, si, e.id);
        return loc === req && source !== 'absent' && source !== 'leave';
      });
      if (!covered) gaps++;
    });
  });
  return gaps;
}

function countDayOverrides(iso) {
  const ovrs = state.schedule?.[iso] || {};
  return Object.values(ovrs).reduce((acc, slot) => acc + Object.keys(slot).length, 0);
}

// ── DOW pills for default schedule ───────────────────────────
function renderDowPills() {
  const container = document.getElementById('dow-pills');
  if (!container) return;
  container.innerHTML = DAYS_SHORT.map((d, i) => `
    <button class="day-pill ${state.currentDow === d ? 'active' : ''}"
      onclick="selectDow('${d}')">
      ${DAYS_FULL[i]}
    </button>`).join('');
}

function selectDow(dow) {
  state.currentDow = dow;
  renderDowPills();
  renderDefaultSchedule();
  // Re-inject range fill with correct dow context
  const rf = document.getElementById('range-fill-default');
  if (rf) rf.innerHTML = renderRangeFill('default');
}

// ── Density ───────────────────────────────────────────────────
function setDensity(d) {
  density = d;
  document.querySelectorAll('.density-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`density-${d}`)?.classList.add('active');
  document.querySelectorAll('.sched-grid tr').forEach(row => {
    row.style.fontSize = d === 'compact' ? '10px' : '';
  });
  document.querySelectorAll('.loc-select').forEach(sel => {
    sel.style.padding = d === 'compact' ? '2px 2px' : '';
    sel.style.fontSize = d === 'compact' ? '9px' : '';
  });
}

// ── Adv toggle ────────────────────────────────────────────────
function toggleAdv() {
  const body = document.getElementById('adv-body');
  const btn  = document.getElementById('adv-toggle');
  if (!body) return;
  body.classList.toggle('open');
  btn?.classList.toggle('open');

  // Build copy-day buttons
  if (body.classList.contains('open')) {
    const container = document.getElementById('copy-day-btns');
    if (!container) return;
    const mon = new Date(state.currentWeekMon + 'T00:00:00');
    container.innerHTML = DAYS_SHORT.map((dow, di) => {
      const d   = new Date(mon);
      d.setDate(d.getDate() + di);
      const iso = toDateStr(d);
      if (iso === state.currentDateISO) return '';
      return `<button class="btn btn-sm btn-ghost" onclick="copyDayTo('${iso}')">${dow}</button>`;
    }).filter(Boolean).join('');
  }
}

// ── Live view toggle ──────────────────────────────────────────
let _liveView = 'locations';
function setLiveView(v) {
  _liveView = v;
  document.querySelectorAll('.lvt-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`lvt-${v}`)?.classList.add('active');
  document.getElementById('view-locations')?.classList.toggle('hidden', v !== 'locations');
  document.getElementById('view-my')?.classList.toggle('hidden', v !== 'my');
  document.getElementById('view-history')?.classList.toggle('hidden', v !== 'history');
  if (v === 'my')      renderMySchedule();
  if (v === 'history') { renderHistoryToday(); renderDeepLookup(); }
}

// ── Schedule alerts ───────────────────────────────────────────
function renderSchedAlerts() {
  const area = document.getElementById('sched-alert-area');
  if (!area) return;
  const iso        = state.currentDateISO;
  const activeEmps = state.employees.filter(e => e.status === 'Active');
  let html = '';

  // Leave alerts
  state.leaveRequests?.filter(l => l.status === 'active').forEach(l => {
    const from = new Date(l.from + 'T00:00:00');
    const to   = new Date(l.to   + 'T00:00:00');
    const cur  = new Date(iso    + 'T00:00:00');
    if (cur >= from && cur <= to) {
      const emp = state.employees.find(e => e.id === l.empId);
      if (emp) html += `<div class="alert-banner leave">🔒 ${escH(emp.name)} is on ${l.type} leave today
        <button class="fix-btn" onclick="showPage('leave',document.getElementById('tab-leave'))">View</button>
      </div>`;
    }
  });

  // Swap alerts
  state.swapRequests?.forEach(s => {
    if (s.fromDate === iso) {
      const emp = state.employees.find(e => e.id === s.empId);
      if (emp) html += `<div class="alert-banner swap">🔄 ${escH(emp.name)} swapped day off — working today instead of usual day off</div>`;
    }
  });

  area.innerHTML = html;
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

function hideToast() {
  document.getElementById('undo-toast')?.classList.remove('show');
}

// ── Export / Import ───────────────────────────────────────────
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type:'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `schedule-backup-${todayStr()}.json`;
  a.click();
}

function importData() {
  document.getElementById('import-file')?.click();
}

function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;
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
    } catch(err) {
      alert('Invalid JSON file.');
    }
  };
  reader.readAsText(file);
}

// ── Reset ─────────────────────────────────────────────────────
function resetAllData() {
  document.getElementById('reset-pin').value   = '';
  document.getElementById('reset-error').textContent = '';
  openModal('reset-modal');
}

async function confirmReset() {
  const pin = document.getElementById('reset-pin').value.trim();
  const ok  = await verifyPin(pin);
  if (!ok) {
    document.getElementById('reset-error').textContent = 'Incorrect PIN.';
    return;
  }
  state.employees = []; state.volunteers = [];
  state.defaultSchedule = {}; state.schedule = {};
  state.volAvailability = {}; state.absences = {};
  state.leaveRequests = []; state.swapRequests = [];
  state.holidays = {}; state.empDaysOff = {}; state.empHourCap = {};
  persistAll();
  closeModal('reset-modal');
  renderAll();
  showToast('All data deleted');
}

// ── Live board ────────────────────────────────────────────────
function renderLiveBoard() {
  const iso  = todayStr();
  const now  = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const dow  = DAYS_SHORT[(now.getDay() + 6) % 7];

  // Date label
  const dl = document.getElementById('live-date-label');
  if (dl) dl.textContent = now.toLocaleDateString('en-GB', {
    weekday:'long', day:'numeric', month:'long', year:'numeric'
  });

  // Holiday banner on live board
  const holiday = getHolidayForDate(iso);
  const hb = document.getElementById('live-holiday-banner');
  if (hb) {
    if (holiday) {
      hb.innerHTML = `<div class="holiday-banner" style="background:${holiday.color}18;border-color:${holiday.color}40;color:${holiday.color}">
        ${holiday.emoji} <strong>${escH(holiday.name)}</strong> — Have a wonderful day!
      </div>`;
      hb.classList.remove('hidden');
    } else {
      hb.classList.add('hidden');
    }
  }

  const activeEmps = state.employees.filter(e => e.status === 'Active');

  // Current slot
  const curSlot = SLOT_START.findIndex((s, i) => mins >= s * 60 && mins < SLOT_END[i] * 60);

  // ── Location timeline ──
  const tlLabels = document.getElementById('tl-labels');
  const tlCont   = document.getElementById('location-timeline');

  if (tlLabels && tlCont) {
    tlLabels.innerHTML = TIME_SLOTS.map((slot, si) => {
      const isCur = si === curSlot;
      return `<div class="tl-label ${isCur ? 'tl-cur' : ''}">${slot}</div>`;
    }).join('');

    const locRows = ALL_LOCS.map(loc => {
      const cells = TIME_SLOTS.map((_, si) => {
        const assigned = activeEmps.filter(e => {
          if (isEmpDayOff(e.id, iso)) return false;
          const { loc: l, source } = getResolvedLoc(iso, si, e.id);
          return l === loc && source !== 'absent';
        });
        const isCur = si === curSlot;
        const names = assigned.map(e => escH(e.name.split(' ')[0])).join(', ');
        const cls   = assigned.length ? (LOC_CLS[loc] || '') : 'loc-empty';
        return `<div class="tl-cell ${cls} ${isCur ? 'tl-cell-cur' : ''}" title="${LOC_LABEL[loc]||loc}: ${names||'Empty'}">${names || ''}</div>`;
      }).join('');

      return `<div class="tl-row">
        <div class="tl-row-label">${LOC_LABEL[loc]||loc}</div>
        <div class="tl-cells">${cells}</div>
      </div>`;
    }).join('');

    tlCont.innerHTML = locRows;
  }

  // ── Employee cards ──
  const board = document.getElementById('live-board');
  if (board) {
    if (!activeEmps.length) {
      board.innerHTML = `<div class="card" style="padding:24px;text-align:center;color:var(--muted)">No active employees. Add staff in the Staff tab.</div>`;
    } else {
      board.innerHTML = activeEmps.map(emp => {
        const isDayOff = isEmpDayOff(emp.id, iso);
        const onLeave  = isOnLeave(emp.id, iso);
        const absent   = state.absences?.[iso]?.[emp.id];

        let statusHtml = '';
        let locHtml    = '';

        if (isDayOff && !isSwapOverride(emp.id, iso)) {
          statusHtml = `<span class="badge badge-off">Day Off</span>`;
          locHtml    = `<div class="emp-loc-display loc-off">OFF</div>`;
        } else if (onLeave) {
          statusHtml = `<span class="badge badge-annual">On Leave</span>`;
          locHtml    = `<div class="emp-loc-display loc-vac">VACATION</div>`;
        } else if (absent) {
          statusHtml = `<span class="badge badge-sick">Absent</span>`;
          locHtml    = `<div class="emp-loc-display loc-off">ABSENT</div>`;
        } else if (curSlot === -1) {
          statusHtml = `<span class="badge badge-off">Off Hours</span>`;
          locHtml    = `<div class="emp-loc-display loc-off">—</div>`;
        } else {
          const { loc } = getResolvedLoc(iso, curSlot, emp.id);
          const cls     = LOC_CLS[loc] || '';
          statusHtml    = `<span class="badge badge-active">On Shift</span>`;
          locHtml       = `<div class="emp-loc-display ${cls}">${LOC_LABEL[loc]||loc}</div>`;
        }

        const hrs = calcScheduledHrsWeek(emp.id);
        const cap = getEmpHourCap(emp.id);

        return `<div class="emp-card">
          <div class="emp-card-top">
            <div class="emp-avatar">${emp.name.charAt(0).toUpperCase()}</div>
            <div class="emp-info">
              <div class="emp-name">${escH(emp.name)}</div>
              <div class="emp-meta">${statusHtml}</div>
            </div>
            ${state.mode === 'admin' && !isDayOff && !onLeave ? `
              <button class="absent-toggle ${absent?'is-absent':''}"
                onclick="toggleAbsent('${emp.id}','${iso}')">
                ${absent ? '✓ Mark Present' : '✖ Mark Absent'}
              </button>` : ''}
          </div>
          ${locHtml}
          <div class="emp-card-footer">
            <span class="hrs-chip ${hrs>cap?'hrs-over':hrs>=cap-5?'hrs-ok':'hrs-under'}">${hrs}/${cap}h this week</span>
          </div>
        </div>`;
      }).join('');
    }
  }

  // ── Volunteers ──
  const volEl = document.getElementById('live-volunteers');
  if (volEl) {
    const todayVols = (state.volunteers||[]).filter(vol => {
      const avail = state.volAvailability?.[vol.id] || [];
      return avail.includes(dow);
    });
    volEl.innerHTML = todayVols.length
      ? todayVols.map(v => `<span class="vol-chip">${escH(v.name)}${v.note?` · <span style="font-weight:400">${escH(v.note)}</span>`:''}</span>`).join('')
      : `<span style="color:var(--muted);font-size:13px">No volunteers available today.</span>`;
  }

  // Live alerts
  renderLiveAlerts();
}

function isSwapOverride(empId, iso) {
  return state.swapRequests?.some(s => s.empId === empId && s.fromDate === iso) || false;
}

function toggleAbsent(empId, iso) {
  if (!state.absences)       state.absences       = {};
  if (!state.absences[iso])  state.absences[iso]  = {};
  if (state.absences[iso][empId]) {
    delete state.absences[iso][empId];
  } else {
    state.absences[iso][empId] = true;
  }
  persistAll();
  renderLiveBoard();
}

function renderLiveAlerts() {
  const area = document.getElementById('live-alert-area');
  if (!area) return;
  const iso = todayStr();
  let html  = '';

  state.leaveRequests?.filter(l => l.status === 'active').forEach(l => {
    const from = new Date(l.from + 'T00:00:00');
    const to   = new Date(l.to   + 'T00:00:00');
    const cur  = new Date(iso    + 'T00:00:00');
    if (cur >= from && cur <= to) {
      const emp = state.employees.find(e => e.id === l.empId);
      if (emp) html += `<div class="alert-banner leave">🔒 ${escH(emp.name)} — ${l.type} leave today</div>`;
    }
  });

  area.innerHTML = html;
}

// ── My Schedule view ──────────────────────────────────────────
let _myEmpId    = '';
let _myWeekMon  = '';

function renderMySchedule() {
  const sel = document.getElementById('emp-selector');
  if (sel && !sel.hasChildNodes()) {
    sel.innerHTML = `
      <select id="my-emp-select" onchange="selectMyEmp(this.value)"
        style="padding:8px 12px;font-size:14px;border-radius:8px;border:1.5px solid var(--border2)">
        <option value="">— Select your name —</option>
        ${state.employees.filter(e=>e.status==='Active').map(e=>
          `<option value="${e.id}" ${_myEmpId===e.id?'selected':''}>${escH(e.name)}</option>`
        ).join('')}
      </select>`;
  }

  if (!_myEmpId) return;
  if (!_myWeekMon) _myWeekMon = state.currentWeekMon || toDateStr(getWeekMonday(new Date()));

  const wStart = new Date(_myWeekMon + 'T00:00:00');
  const wEnd   = new Date(wStart);
  wEnd.setDate(wEnd.getDate() + 6);

  const emp = state.employees.find(e => e.id === _myEmpId);

  document.getElementById('my-sched-body').innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">
      <button class="week-arrow" onclick="shiftMyWeek(-1)">‹</button>
      <span style="font-size:13px;font-weight:600;color:var(--text)">
        ${wStart.toLocaleDateString('en-GB',{day:'numeric',month:'short'})} –
        ${wEnd.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}
      </span>
      <button class="week-arrow" onclick="shiftMyWeek(1)">›</button>
      <button class="today-btn" onclick="goToMyToday()">This Week</button>
    </div>
    ${DAYS_FULL.map((day, di) => {
      const d   = new Date(wStart);
      d.setDate(d.getDate() + di);
      const iso = toDateStr(d);
      const dow = DAYS_SHORT[di];
      const isToday_   = iso === todayStr();
      const isDayOff   = isEmpDayOff(_myEmpId, iso);
      const onLeave    = isOnLeave(_myEmpId, iso);
      const holiday    = getHolidayForDate(iso);

      const slots = isDayOff
        ? `<div class="my-day-off-block">Regular Day Off</div>`
        : onLeave
        ? `<div class="my-day-off-block" style="color:var(--purple)">On Leave</div>`
        : TIME_SLOTS.map((slot, si) => {
            const { loc } = getResolvedLoc(iso, si, _myEmpId);
            const cls     = LOC_CLS[loc] || '';
            return `<div class="my-slot-row ${loc==='off'?'my-slot-off':''}">
              <span class="my-slot-time">${slot}</span>
              <span class="my-slot-loc ${cls}">${LOC_LABEL[loc]||loc}</span>
            </div>`;
          }).join('');

      return `<div class="my-day-block ${isToday_?'my-day-today':''}">
        <div class="my-day-hdr">
          <span>${day} <strong>${d.getDate()}</strong></span>
          ${isToday_ ? '<span class="today-badge">TODAY</span>' : ''}
          ${holiday ? `<span class="holiday-mini-badge" style="background:${holiday.color}18;color:${holiday.color};border-color:${holiday.color}40">${holiday.emoji} ${escH(holiday.name)}</span>` : ''}
        </div>
        <div class="my-day-slots">${slots}</div>
      </div>`;
    }).join('')}`;
}

function selectMyEmp(empId) {
  _myEmpId = empId;
  renderMySchedule();
}

function shiftMyWeek(delta) {
  const d = new Date(_myWeekMon + 'T00:00:00');
  d.setDate(d.getDate() + delta * 7);
  _myWeekMon = toDateStr(d);
  renderMySchedule();
}

function goToMyToday() {
  _myWeekMon = toDateStr(getWeekMonday(new Date()));
  renderMySchedule();
}

// ── History / Lookup ──────────────────────────────────────────
function renderHistoryToday() {
  const el   = document.getElementById('history-today');
  if (!el) return;
  const iso  = todayStr();
  const mins = new Date().getHours() * 60 + new Date().getMinutes();
  const past = TIME_SLOTS.filter((_, si) => SLOT_END[si] * 60 < mins);

  if (!past.length) {
    el.innerHTML = `<div class="card-body" style="color:var(--muted);font-size:13px">No completed slots yet today.</div>`;
    return;
  }

  const activeEmps = state.employees.filter(e => e.status === 'Active');
  el.innerHTML = `<div style="overflow-x:auto"><table class="data-table">
    <thead><tr><th>Time Slot</th>${activeEmps.map(e=>`<th>${escH(e.name.split(' ')[0])}</th>`).join('')}</tr></thead>
    <tbody>
      ${past.map((slot, pIdx) => {
        const si = TIME_SLOTS.indexOf(slot);
        return `<tr>
          <td style="font-size:11px;color:var(--muted);white-space:nowrap">${slot}</td>
          ${activeEmps.map(e => {
            const { loc } = getResolvedLoc(iso, si, e.id);
            const cls = LOC_CLS[loc] || '';
            return `<td><span class="loc-select ${cls}" style="display:inline-block;padding:2px 6px;font-size:10px;font-weight:700;border-radius:4px">${LOC_LABEL[loc]||loc}</span></td>`;
          }).join('')}
        </tr>`;
      }).join('')}
    </tbody>
  </table></div>`;
}

function renderDeepLookup() {
  const el  = document.getElementById('deep-lookup-result');
  const iso = document.getElementById('lookup-date')?.value;
  const loc = document.getElementById('lookup-loc')?.value?.toLowerCase().replace(/\s+/g,'');
  if (!el || !iso) return;

  const activeEmps = state.employees.filter(e => e.status === 'Active');
  const holiday    = getHolidayForDate(iso);

  let html = '';
  if (holiday) html += `<div style="margin-bottom:10px;padding:8px 12px;border-radius:8px;background:${holiday.color}18;color:${holiday.color};font-size:13px;font-weight:600">${holiday.emoji} ${escH(holiday.name)}</div>`;

  html += `<div style="overflow-x:auto"><table class="data-table">
    <thead><tr><th>Time Slot</th>${activeEmps.map(e=>`<th>${escH(e.name.split(' ')[0])}</th>`).join('')}</tr></thead>
    <tbody>
      ${TIME_SLOTS.map((slot, si) => {
        const cells = activeEmps.map(e => {
          const { loc: l } = getResolvedLoc(iso, si, e.id);
          if (loc && l !== loc && loc !== '') return `<td><span style="font-size:10px;color:var(--subtle)">–</span></td>`;
          const cls = LOC_CLS[l] || '';
          return `<td><span class="loc-select ${cls}" style="display:inline-block;padding:2px 6px;font-size:10px;font-weight:700;border-radius:4px">${LOC_LABEL[l]||l}</span></td>`;
        }).join('');
        return `<tr><td style="font-size:11px;color:var(--muted);white-space:nowrap">${slot}</td>${cells}</tr>`;
      }).join('')}
    </tbody>
  </table></div>`;

  el.innerHTML = html;
}

// ── Leave helpers ─────────────────────────────────────────────
function isOnLeave(empId, iso) {
  return (state.leaveRequests||[]).some(l => {
    if (l.empId !== empId || l.status !== 'active') return false;
    return iso >= l.from && iso <= l.to;
  });
}

// ── Init ──────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  initState();
  const mon = getWeekMonday(new Date());
  if (!state.currentWeekMon) state.currentWeekMon = toDateStr(mon);
  if (!state.currentDateISO) state.currentDateISO = todayStr();
  if (!state.currentDow)     state.currentDow = DAYS_SHORT[(new Date().getDay() + 6) % 7];

  if (sessionStorage.getItem('smPro_adminSession')) enterAdmin();
  else state.mode = 'live';

  const ld = document.getElementById('lookup-date');
  if (ld) ld.value = todayStr();

  tickClock();
  setInterval(tickClock, 15000);
  setInterval(() => {
    if (document.getElementById('page-live')?.classList.contains('active')) renderLiveBoard();
  }, 30000);

  if (window.innerWidth < 640) setLiveView('my');

  renderLiveBoard();
});
