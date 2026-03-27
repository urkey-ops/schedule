// ── ui.js ─────────────────────────────────────────────────────

// ── Utility ───────────────────────────────────────────────────
function v(id)    { return document.getElementById(id)?.value?.trim() || ''; }
function escH(s)  { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function openModal(id)  { document.getElementById(id)?.classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }

// ── Clock ─────────────────────────────────────────────────────
function tickClock() {
  const now = new Date();
  const el  = document.getElementById('live-clock');
  if (el) el.textContent =
    `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
}

// ── Admin ─────────────────────────────────────────────────────
function openAdminLogin() {
  if (state.mode === 'admin') { exitAdmin(); return; }
  document.getElementById('admin-pin-input').value = '';
  document.getElementById('admin-pin-error').textContent = '';
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
  document.getElementById('mode-badge').textContent = 'ADMIN';
  document.getElementById('mode-badge').className   = 'mode-chip mode-admin';
  document.getElementById('admin-trigger-btn').classList.add('active');
  document.querySelectorAll('.admin-only').forEach(el => el.classList.add('admin-tab-visible'));
  showPage('live', document.getElementById('tab-live'));
}

function exitAdmin() {
  state.mode = 'live';
  sessionStorage.removeItem('smPro_adminSession');
  document.getElementById('mode-badge').textContent = 'VIEW';
  document.getElementById('mode-badge').className   = 'mode-chip mode-live';
  document.getElementById('admin-trigger-btn').classList.remove('active');
  document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('admin-tab-visible'));
  showPage('live', document.getElementById('tab-live'));
  renderAll(); // Fixed: re-render so admin content clears properly
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
    pinEl.value       = '';
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
  } else {
    // Fixed: removed waitForSync() — was never defined; just check hasPinSet directly
    if (!hasPinSet()) { alert('Please set a PIN before saving.'); return; }
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
    const rf = document.getElementById('range-fill-weekly');
    if (rf && !rf.hasChildNodes()) rf.innerHTML = renderRangeFill('weekly');
  } else if (name === 'default') {
    wnb.classList.add('hidden');
    renderDowPills();
    renderDefaultSchedule();
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
  const end = new Date(mon);
  end.setDate(end.getDate() + 6);

  if (wLabel) wLabel.textContent =
    `${mon.toLocaleDateString('en-GB',{day:'numeric',month:'short'})} – ${
      end.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}`;

  if (!pillsEl) return;
  pillsEl.innerHTML = DAYSSHORT.map((dow, di) => {
    const d       = new Date(mon);
    d.setDate(d.getDate() + di);
    const iso     = toDateStr(d);
    const isToday = iso === todayStr();
    const isActive= iso === state.currentDateISO;
    // Fixed: call once, reuse result
    const holiday = getHolidayForDate(iso);
    const hasGap  = countDayGaps(iso) > 0;
    const hasOvr  = countDayOverrides(iso) > 0;
    const classes = [
      'day-pill',
      isActive  ? 'active'   : '',
      isToday   ? 'today'    : '',
      hasGap    ? 'has-gap'  : '',
      hasOvr    ? 'has-ovr'  : '',
      holiday   ? 'has-hday' : '',
    ].filter(Boolean).join(' ');

    return `<button class="${classes}" onclick="selectDay('${iso}','${dow}')">
      <span class="gap-dot"></span>
      <span class="ovr-dot"></span>
      <span class="hday-dot" ${holiday ? `style="background:${holiday.color}"` : ''}></span>
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
}

function countDayGaps(iso) {
  const activeEmps = state.employees.filter(e => e.status === 'Active');
  let gaps = 0;
  TIMESLOTS.forEach((_, si) => {
    REQUIREDLOCS.forEach(req => {
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
  const rf = document.getElementById('range-fill-default');
  if (rf) rf.innerHTML = renderRangeFill('default');
}

// ── Density ───────────────────────────────────────────────────
// Fixed: use CSS class on table instead of inline styles
// (inline styles get wiped on every renderSchedule call)
function setDensity(d) {
  density = d;
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
    // Rebuild every time so days stay current
    const mon = new Date(state.currentWeekMon + 'T00:00:00');
    container.innerHTML = DAYSSHORT.map((dow, di) => {
      const d   = new Date(mon);
      d.setDate(d.getDate() + di);
      const iso = toDateStr(d);
      if (iso === state.currentDateISO) return '';
      return `<button class="btn btn-sm btn-ghost" onclick="copyDayTo('${iso}')">${dow}</button>`;
    }).filter(Boolean).join('');
  }
}

// ── Live view toggle ──────────────────────────────────────────
function setLiveView(v) {
  ['locations','my','history'].forEach(id => {
    document.getElementById(`view-${id}`)?.classList.toggle('hidden', id !== v);
    document.getElementById(`lvt-${id}`)?.classList.toggle('active', id === v);
  });
  if (v === 'locations') renderLiveBoard();
  if (v === 'my')        renderMySchedule();
  if (v === 'history')   { renderHistoryToday(); renderDeepLookup(); }
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
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
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
  document.getElementById('reset-pin').value          = '';
  document.getElementById('reset-error').textContent  = '';
  openModal('reset-modal');
}

async function confirmReset() {
  const pin = document.getElementById('reset-pin').value.trim();
  const ok  = await verifyPin(pin);
  if (!ok) { document.getElementById('reset-error').textContent = 'Incorrect PIN.'; return; }
  // Fixed: only reset state data — HARDCODEDPINHASH lives in config.js, cannot be cleared from JS
  Object.assign(state, {
    employees: [], volunteers: [], defaultSchedule: {}, schedule: {},
    volAvailability: {}, absences: {}, leaveRequests: [], swapRequests: [],
    holidays: {}, empDaysOff: {}, empHourCap: {}
  });
  persistAll();
  closeModal('reset-modal');
  renderAll();
  showToast('All data deleted');
}

// ── Shared slot assignment helper ─────────────────────────────
// Single function used by renderHistoryToday AND renderDeepLookup
// eliminates the duplicated slot-mapping logic between both
function getSlotAssignments(iso, si) {
  return state.employees
    .filter(e => e.status === 'Active')
    .map(e => ({ emp: e, ...getResolvedLoc(iso, si, e.id) }));
}

// ── Live Board ────────────────────────────────────────────────
// Canonical version lives here — removed from live.js
function renderLiveBoard() {
  const iso  = todayStr();
  const nm   = nowMins();
  const si   = currentSlotIdx();

  // Date label
  const dl = document.getElementById('live-date-label');
  if (dl) dl.textContent = new Date().toLocaleDateString('en-GB', {
    weekday:'long', day:'numeric', month:'long', year:'numeric'
  });

  // Holiday banner
  const holiday = getHolidayForDate(iso);
  const hb = document.getElementById('live-holiday-banner');
  if (hb) {
    if (holiday) {
      hb.innerHTML = `<div class="holiday-banner"
        style="background:${holiday.color}18;border-color:${holiday.color}40;color:${holiday.color}">
        ${holiday.emoji} <strong>${escH(holiday.name)}</strong> — Have a wonderful day!
      </div>`;
      hb.classList.remove('hidden');
    } else {
      hb.classList.add('hidden');
    }
  }

  const activeEmps = state.employees.filter(e => e.status === 'Active');
  const board      = document.getElementById('live-board');

  if (!activeEmps.length) {
    if (board) board.innerHTML = `<div class="card" style="padding:24px;text-align:center;color:var(--muted)">
      No active employees. Add staff in the Staff tab.
    </div>`;
    renderLiveAlerts();
    renderLiveVolunteers();
    renderTimeline();
    return;
  }

  if (board) {
    board.innerHTML = activeEmps.map(emp => {
      const isDayOff = isEmpDayOff(emp.id, iso);
      const onLeave  = isOnLeave(emp.id, iso);
      const absent   = !!state.absences?.[iso]?.[emp.id];
      // Fixed: check active swap status
      const isSwap   = (state.swapRequests || []).some(s =>
        s.empId === emp.id && s.fromDate === iso && s.status === 'active'
      );

      let statusHtml = '';
      let locHtml    = '';

      if (isDayOff && !isSwap) {
        statusHtml = `<span class="badge badge-off">Day Off</span>`;
        locHtml    = `<div class="emp-loc-display loc-off">OFF</div>`;
      } else if (onLeave) {
        statusHtml = `<span class="badge badge-annual">On Leave</span>`;
        locHtml    = `<div class="emp-loc-display loc-vac">VACATION</div>`;
      } else if (absent) {
        statusHtml = `<span class="badge badge-sick">Absent</span>`;
        locHtml    = `<div class="emp-loc-display loc-off">ABSENT</div>`;
      } else if (si < 0) {
        statusHtml = `<span class="badge badge-off">Off Hours</span>`;
        locHtml    = `<div class="emp-loc-display loc-off">—</div>`;
      } else {
        const { loc } = getResolvedLoc(iso, si, emp.id);
        statusHtml    = `<span class="badge badge-active">On Shift</span>`;
        locHtml       = `<div class="emp-loc-display ${LOCCLS[loc] || ''}">${LOCLABEL[loc] || loc}</div>`;
      }

      const hrs = calcScheduledHrsWeek(emp.id);
      const cap = getEmpHourCap(emp.id);
      const hrsCls = hrs > cap ? 'hrs-over' : hrs >= cap - 5 ? 'hrs-ok' : 'hrs-under';

      return `<div class="emp-card">
        <div class="emp-card-top">
          <div class="emp-avatar">${emp.name.charAt(0).toUpperCase()}</div>
          <div class="emp-info">
            <div class="emp-name">${escH(emp.name)}</div>
            <div class="emp-meta">${statusHtml}</div>
          </div>
          ${state.mode === 'admin' && !isDayOff && !onLeave
            ? `<button class="absent-toggle ${absent ? 'is-absent' : ''}"
                onclick="toggleAbsent('${emp.id}','${iso}')">
                ${absent ? '✓ Mark Present' : '✖ Mark Absent'}
              </button>`
            : ''}
        </div>
        ${locHtml}
        <div class="emp-card-footer">
          <span class="hrs-chip ${hrsCls}">${hrs}/${cap}h this week</span>
        </div>
      </div>`;
    }).join('');
  }

  renderTimeline();
  renderLiveAlerts();
  renderLiveVolunteers();
}

// Fixed: canonical argument order (empId, iso) — matches all call sites
function toggleAbsent(empId, iso) {
  if (!state.absences)      state.absences      = {};
  if (!state.absences[iso]) state.absences[iso] = {};
  if (state.absences[iso][empId]) {
    delete state.absences[iso][empId];
    if (!Object.keys(state.absences[iso]).length) delete state.absences[iso];
  } else {
    state.absences[iso][empId] = true;
  }
  persistAll('absences');
  renderLiveBoard();
}

// ── isOnLeave — shared helper ─────────────────────────────────
function isOnLeave(empId, iso) {
  return (state.leaveRequests || []).some(l =>
    l.empId === empId && l.status === 'active' && iso >= l.from && iso <= l.to
  );
}

// ── History / Lookup ──────────────────────────────────────────
function renderHistoryToday() {
  const el   = document.getElementById('history-today');
  if (!el) return;
  const iso  = todayStr();
  const mins = new Date().getHours() * 60 + new Date().getMinutes();
  // Fixed: index-based to avoid indexOf inside map
  const pastIndices = TIMESLOTS.map((_, si) => si).filter(si => SLOTEND[si] * 60 < mins);

  if (!pastIndices.length) {
    el.innerHTML = `<div class="card-body" style="color:var(--muted);font-size:13px">
      No completed slots yet today.
    </div>`;
    return;
  }

  const activeEmps = state.employees.filter(e => e.status === 'Active');
  el.innerHTML = `<div style="overflow-x:auto"><table class="data-table">
    <thead><tr>
      <th>Time Slot</th>
      ${activeEmps.map(e => `<th>${escH(e.name.split(' ')[0])}</th>`).join('')}
    </tr></thead>
    <tbody>
      ${pastIndices.map(si => `<tr>
        <td style="font-size:11px;color:var(--muted);white-space:nowrap">${TIMESLOTS[si]}</td>
        ${getSlotAssignments(iso, si).map(({ loc }) => {
          const cls = LOCCLS[loc] || '';
          return `<td><span class="loc-select ${cls}"
            style="display:inline-block;padding:2px 6px;font-size:10px;font-weight:700;border-radius:4px">
            ${LOCLABEL[loc] || loc}
          </span></td>`;
        }).join('')}
      </tr>`).join('')}
    </tbody>
  </table></div>`;
}

function renderDeepLookup() {
  const el  = document.getElementById('deep-lookup-result');
  const iso = document.getElementById('lookup-date')?.value;
  if (!el || !iso) return;

  const holiday    = getHolidayForDate(iso);
  const activeEmps = state.employees.filter(e => e.status === 'Active');
  let html = '';

  if (holiday) html += `<div style="margin-bottom:10px;padding:8px 12px;border-radius:8px;
    background:${holiday.color}18;color:${holiday.color};font-size:13px;font-weight:600">
    ${holiday.emoji} ${escH(holiday.name)}
  </div>`;

  html += `<div style="overflow-x:auto"><table class="data-table">
    <thead><tr>
      <th>Time Slot</th>
      ${activeEmps.map(e => `<th>${escH(e.name.split(' ')[0])}</th>`).join('')}
    </tr></thead>
    <tbody>
      ${TIMESLOTS.map((slot, si) => `<tr>
        <td style="font-size:11px;color:var(--muted);white-space:nowrap">${slot}</td>
        ${getSlotAssignments(iso, si).map(({ loc }) => {
          const cls = LOCCLS[loc] || '';
          return `<td><span class="loc-select ${cls}"
            style="display:inline-block;padding:2px 6px;font-size:10px;font-weight:700;border-radius:4px">
            ${LOCLABEL[loc] || loc}
          </span></td>`;
        }).join('')}
      </tr>`).join('')}
    </tbody>
  </table></div>`;

  el.innerHTML = html;
}

// ── My Schedule ───────────────────────────────────────────────
let _myEmpId   = '';
let _myWeekMon = '';

function renderMySchedule() {
  const sel = document.getElementById('emp-selector');
  // Fixed: always rebuild so new/removed staff appear without page reload
  if (sel) {
    sel.innerHTML = `<select id="my-emp-select" onchange="selectMyEmp(this.value)"
      style="padding:8px 12px;font-size:14px;border-radius:8px;border:1.5px solid var(--border2)">
      <option value="">— Select your name —</option>
      ${state.employees.filter(e => e.status === 'Active').map(e =>
        `<option value="${e.id}" ${_myEmpId === e.id ? 'selected' : ''}>${escH(e.name)}</option>`
      ).join('')}
    </select>`;
  }

  if (!_myEmpId) return;

  // Fixed: guard against empty _myWeekMon producing Invalid Date
  if (!_myWeekMon) _myWeekMon = state.currentWeekMon || toDateStr(getWeekMonday(new Date()));

  const wStart = new Date(_myWeekMon + 'T00:00:00');
  const wEnd   = new Date(wStart);
  wEnd.setDate(wEnd.getDate() + 6);
  const emp = state.employees.find(e => e.id === _myEmpId);
  if (!emp) return;

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
    ${DAYSFULL.map((day, di) => {
      const d        = new Date(wStart);
      d.setDate(d.getDate() + di);
      const iso      = toDateStr(d);
      const isToday_ = iso === todayStr();
      const isDayOff = isEmpDayOff(_myEmpId, iso);
      const onLeave  = isOnLeave(_myEmpId, iso);
      const holiday  = getHolidayForDate(iso);

      const slots = isDayOff
        ? `<div class="my-day-off-block">Regular Day Off</div>`
        : onLeave
        ? `<div class="my-day-off-block" style="color:var(--purple)">On Leave</div>`
        : TIMESLOTS.map((slot, si) => {
            const { loc } = getResolvedLoc(iso, si, _myEmpId);
            const cls     = LOCCLS[loc] || '';
            return `<div class="my-slot-row ${loc === 'off' ? 'my-slot-off' : ''}">
              <span class="my-slot-time">${slot}</span>
              <span class="my-slot-loc ${cls}">${LOCLABEL[loc] || loc}</span>
            </div>`;
          }).join('');

      return `<div class="my-day-block ${isToday_ ? 'my-day-today' : ''}">
        <div class="my-day-hdr">
          <span>${day} <strong>${d.getDate()}</strong></span>
          ${isToday_ ? '<span class="today-badge">TODAY</span>' : ''}
          ${holiday
            ? `<span class="holiday-mini-badge"
                style="background:${holiday.color}18;color:${holiday.color};border-color:${holiday.color}40">
                ${holiday.emoji} ${escH(holiday.name)}
              </span>`
            : ''}
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

// ── Init ──────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  initState();

  const mon = getWeekMonday(new Date());
  if (!state.currentWeekMon) state.currentWeekMon = toDateStr(mon);
  if (!state.currentDateISO) state.currentDateISO  = todayStr();
  if (!state.currentDow)     state.currentDow      = DAYSSHORT[(new Date().getDay() + 6) % 7];

  if (sessionStorage.getItem('smPro_adminSession')) enterAdmin();
  else state.mode = 'live';

  const ld = document.getElementById('lookup-date');
  if (ld) ld.value = todayStr();

  tickClock();
  setInterval(tickClock, 15000);

  // Auto-refresh live board every 30s
  setInterval(() => {
    if (document.getElementById('page-live')?.classList.contains('active')) renderLiveBoard();
  }, 30000);

  // Fixed: midnight re-render so date never goes stale if left open overnight
  scheduleMidnightRefresh();

  if (window.innerWidth < 640) setLiveView('my');

  renderLiveBoard();
});
