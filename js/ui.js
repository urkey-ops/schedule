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
  const el  = document.getElementById('live-clock-inline');
  if (el) el.textContent = t;
  const gc  = document.getElementById('grand-clock');
  if (gc) gc.textContent = t;
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
  renderAll();
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
    if (!hasPinSet()) { alert('Please set a PIN before saving.'); return; }
  }
  localStorage.setItem('smPro_fbConfig', JSON.stringify(cfg));
  closeModal('firebase-modal');
  location.reload();
}

// ── Page navigation ───────────────────────────────────────────
function showPage(name, tabEl) {
  // Grand view is public — all others except live require admin
  const publicPages = ['live', 'grand'];
  if (!publicPages.includes(name) && state.mode !== 'admin') return;

  // Stop grand view refresh if leaving grand page
  if (name !== 'grand' && typeof stopGrandRefresh === 'function') stopGrandRefresh();

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
  if (name === 'grand')    renderGrandView();
  if (name === 'holidays') renderHolidaysPage();
}

function renderAll() {
  renderLiveBoard();
  // Refresh grand view if open
  const grandActive = document.getElementById('page-grand')?.classList.contains('active');
  if (grandActive && typeof renderGrandView === 'function') renderGrandView();

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
function setLiveView(view) {
  ['locations','my','history'].forEach(id => {
    document.getElementById(`view-${id}`)?.classList.toggle('hidden', id !== view);
    document.getElementById(`lvt-${id}`)?.classList.toggle('active', id === view);
  });
  if (view === 'locations') renderLiveBoard();
  if (view === 'my')        renderMySchedule();
  if (view === 'history')   { renderHistoryToday(); renderDeepLookup(); }
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

function importData() { document.getElementById('import-file')?.click(); }

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
    employees: [], volunteers: [], defaultSchedule: {}, schedule: {},
    volAvailability: {}, absences: {}, leaveRequests: [], swapRequests: [],
    holidays: {}, empDaysOff: {}, empHourCap: {}
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
    .map(e => ({ emp: e, ...getResolvedLoc(iso, si, e.id) }));
}

// ── Schedule alerts ───────────────────────────────────────────
function renderSchedAlerts() {
  const area = document.getElementById('sched-alert-area');
  if (!area) return;
  const iso = state.currentDateISO;
  let html  = '';
  (state.leaveRequests || []).filter(l => l.status === 'active').forEach(l => {
    const cur = new Date(iso + 'T00:00:00');
    if (cur >= new Date(l.from + 'T00:00:00') && cur <= new Date(l.to + 'T00:00:00')) {
      const emp = state.employees.find(e => e.id === l.empId);
      if (emp) html += `<div class="alert-banner leave">🔒 ${escH(emp.name)} is on ${l.type} leave today</div>`;
    }
  });
  (state.swapRequests || []).forEach(s => {
    if (s.fromDate === iso && s.status === 'active') {
      const emp = state.employees.find(e => e.id === s.empId);
      if (emp) html += `<div class="alert-banner swap">🔄 ${escH(emp.name)} swapped day off — working today</div>`;
    }
  });
  area.innerHTML = html;
}

// ── Live Board ────────────────────────────────────────────────
function renderLiveBoard() {
  const iso = todayStr();
  const si  = currentSlotIdx();

  // Today strip date label
  const dl = document.getElementById('live-date-label');
  if (dl) dl.textContent = new Date().toLocaleDateString('en-GB', {
    weekday:'long', day:'numeric', month:'long', year:'numeric'
  });

  // Today strip — current slot chip
  const tsr = document.getElementById('today-strip-right');
  if (tsr) {
    const holiday = getHolidayForDate(iso);
    tsr.innerHTML = (si >= 0 ? `<span class="summary-chip chip-slot">🕐 ${TIMESLOTS[si]}</span>` : '') +
      (holiday ? `<span class="summary-chip" style="background:${holiday.color}18;color:${holiday.color}">${holiday.emoji} ${escH(holiday.name)}</span>` : '');
  }

  // Holiday banner
  const holiday = getHolidayForDate(iso);
  const hb = document.getElementById('live-holiday-banner');
  if (hb) {
    if (holiday) {
      hb.innerHTML = `<div style="padding:9px 14px;background:${holiday.color}18;border:1.5px solid ${holiday.color}40;color:${holiday.color};border-radius:10px;font-size:13px;font-weight:600">
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
    return;
  }

  if (board) {
    board.innerHTML = `<div class="grand-now-grid">` +
      activeEmps.map(emp => {
        const isDayOff = isEmpDayOff(emp.id, iso);
        const onLeave  = isOnLeave(emp.id, iso);
        const absent   = !!state.absences?.[iso]?.[emp.id];
        const isSwap   = (state.swapRequests || []).some(s =>
          s.empId === emp.id && s.fromDate === iso && s.status === 'active'
        );

        let locLabel = '—', locColor = 'var(--muted)', locCls = '';
        if (isDayOff && !isSwap) { locLabel = 'Day Off';   locColor = 'var(--muted)'; }
        else if (onLeave)         { locLabel = 'On Leave';  locColor = 'var(--purple)'; }
        else if (absent)          { locLabel = 'Absent';    locColor = 'var(--red)'; }
        else if (si < 0)          { locLabel = 'Off Hours'; locColor = 'var(--muted)'; }
        else {
          const { loc } = getResolvedLoc(iso, si, emp.id);
          locLabel = LOCLABEL[loc] || loc;
          locColor = LOCCOLOR[loc] || '#888';
          locCls   = LOCCLS[loc]   || '';
        }

        const initial = emp.name.charAt(0).toUpperCase();

        return `<div class="grand-loc-card" style="--loc-color:${locColor}">
          <div class="grand-loc-header" style="background:${locColor}">
            <span class="grand-loc-name" style="font-size:11px">${escH(emp.name)}</span>
            ${state.mode === 'admin' && !isDayOff && !onLeave
              ? `<button class="absent-toggle-sm ${absent ? 'is-absent' : ''}"
                  onclick="toggleAbsent('${emp.id}','${iso}')"
                  title="${absent ? 'Mark Present' : 'Mark Absent'}">
                  ${absent ? '↩' : '✖'}
                </button>`
              : ''}
          </div>
          <div class="grand-loc-body" style="align-items:center;justify-content:center;text-align:center;padding:16px 10px">
            <div class="grand-emp-avatar" style="background:${locColor};width:40px;height:40px;font-size:18px;margin:0 auto 8px">${initial}</div>
            <div style="font-size:16px;font-weight:800;color:${locColor}">${escH(locLabel)}</div>
            ${si >= 0 && !isDayOff && !onLeave && !absent ? (() => {
              // Next change preview
              const { loc: curLoc } = si >= 0 ? getResolvedLoc(iso, si, emp.id) : { loc: 'off' };
              for (let i = si + 1; i < TIMESLOTS.length; i++) {
                const { loc: nLoc } = getResolvedLoc(iso, i, emp.id);
                if (nLoc !== curLoc) {
                  return `<div style="font-size:10px;color:var(--muted);margin-top:6px">Next: ${LOCLABEL[nLoc]||nLoc} @ ${TIMESLOTS[i].split('–')[0]}</div>`;
                }
              }
              return '';
            })() : ''}
          </div>
        </div>`;
      }).join('') + `</div>`;
  }

  renderLiveAlerts();
  renderLiveVolunteers();
}

// Fixed: canonical argument order (empId, iso)
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

function isOnLeave(empId, iso) {
  return (state.leaveRequests || []).some(l =>
    l.empId === empId && l.status === 'active' && iso >= l.from && iso <= l.to
  );
}

// ── History / Lookup ──────────────────────────────────────────
function renderHistoryToday() {
  const el  = document.getElementById('history-today');
  if (!el) return;
  const iso  = todayStr();
  const mins = new Date().getHours() * 60 + new Date().getMinutes();
  const pastIndices = TIMESLOTS.map((_, si) => si).filter(si => SLOTEND[si] * 60 < mins);

  if (!pastIndices.length) {
    el.innerHTML = `<div style="padding:16px;color:var(--muted);font-size:13px">No completed slots yet today.</div>`;
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
        ${getSlotAssignments(iso, si).map(({ loc }) =>
          `<td><span class="loc-select ${LOCCLS[loc]||''}"
            style="display:inline-block;padding:2px 6px;font-size:10px;font-weight:700;border-radius:4px">
            ${LOCLABEL[loc]||loc}
          </span></td>`
        ).join('')}
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
        ${getSlotAssignments(iso, si).map(({ loc }) =>
          `<td><span class="loc-select ${LOCCLS[loc]||''}"
            style="display:inline-block;padding:2px 6px;font-size:10px;font-weight:700;border-radius:4px">
            ${LOCLABEL[loc]||loc}
          </span></td>`
        ).join('')}
      </tr>`).join('')}
    </tbody>
  </table></div>`;

  el.innerHTML = html;
}

// ── My Schedule ───────────────────────────────────────────────
let _myEmpId   = localStorage.getItem('smPro_myEmpId') || '';
let _myWeekMon = '';

function renderMySchedule() {
  const sel = document.getElementById('emp-selector');
  if (sel) {
    sel.innerHTML = `<select id="my-emp-select" onchange="selectMyEmp(this.value)"
      style="padding:8px 12px;font-size:14px;border-radius:8px;border:1.5px solid var(--border2)">
      <option value="">— Select your name —</option>
      ${state.employees.filter(e => e.status === 'Active').map(e =>
        `<option value="${e.id}" ${_myEmpId === e.id ? 'selected' : ''}>${escH(e.name)}</option>`
      ).join('')}
    </select>`;
  }

  // Big current location card
  const curCard  = document.getElementById('my-current-card');
  const nextSlot = document.getElementById('my-next-slot');
  const tlBar    = document.getElementById('my-timeline-bar');

  if (!_myEmpId) {
    curCard?.classList.add('hidden');
    nextSlot?.classList.add('hidden');
    tlBar?.classList.add('hidden');
    return;
  }

  if (!_myWeekMon) _myWeekMon = state.currentWeekMon || toDateStr(getWeekMonday(new Date()));

  const emp = state.employees.find(e => e.id === _myEmpId);
  if (!emp) return;

  const iso      = todayStr();
  const si       = currentSlotIdx();
  const isDayOff = isEmpDayOff(_myEmpId, iso);
  const onLeave  = isOnLeave(_myEmpId, iso);
  const absent   = !!state.absences?.[iso]?.[_myEmpId];

  // ── Big current location card ──
  if (curCard) {
    curCard.classList.remove('hidden');
    let bigLoc = '', bigColor = '#888', bigLabel = '';

    if (isDayOff)    { bigLabel = 'Day Off';   bigColor = '#6b7280'; }
    else if (onLeave) { bigLabel = 'On Leave';  bigColor = '#7c3aed'; }
    else if (absent)  { bigLabel = 'Absent';    bigColor = '#ef4444'; }
    else if (si < 0)  { bigLabel = 'Off Hours'; bigColor = '#6b7280'; }
    else {
      const { loc } = getResolvedLoc(iso, si, _myEmpId);
      bigLoc   = loc;
      bigLabel = LOCLABEL[loc] || loc;
      bigColor = LOCCOLOR[loc] || '#888';
    }

    curCard.style.background = bigColor;
    curCard.innerHTML = `
      <div class="my-loc-label">You are currently at</div>
      <div class="my-loc-name">${bigLabel.toUpperCase()}</div>
      <div class="my-loc-slot">${si >= 0 ? TIMESLOTS[si] : ''}</div>`;
  }

  // ── Next change indicator ──
  if (nextSlot) {
    let found = false;
    if (si >= 0 && !isDayOff && !onLeave && !absent) {
      const { loc: curLoc } = getResolvedLoc(iso, si, _myEmpId);
      for (let i = si + 1; i < TIMESLOTS.length; i++) {
        const { loc: nLoc } = getResolvedLoc(iso, i, _myEmpId);
        if (nLoc !== curLoc) {
          const nColor = LOCCOLOR[nLoc] || '#888';
          nextSlot.classList.remove('hidden');
          nextSlot.innerHTML = `<span>Next change</span>
            <span class="next-arrow">→</span>
            <span class="next-loc" style="color:${nColor}">${LOCLABEL[nLoc]||nLoc}</span>
            <span style="color:var(--muted);font-size:12px">at ${TIMESLOTS[i].split('–')[0]}</span>`;
          found = true;
          break;
        }
      }
    }
    if (!found) nextSlot.classList.add('hidden');
  }

  // ── Personal timeline bar ──
  if (tlBar && si >= 0 && !isDayOff && !onLeave) {
    tlBar.classList.remove('hidden');
    tlBar.innerHTML = TIMESLOTS.map((_, slotI) => {
      const { loc } = getResolvedLoc(iso, slotI, _myEmpId);
      const color   = LOCCOLOR[loc] || 'var(--border2)';
      const isPast  = SLOTEND[slotI] * 60 < (new Date().getHours() * 60 + new Date().getMinutes());
      const isCur   = slotI === si;
      return `<div class="my-tl-seg ${isPast?'tl-past':''} ${isCur?'tl-current':''}"
        style="background:${loc==='off'?'var(--border2)':color}"
        title="${TIMESLOTS[slotI]}: ${LOCLABEL[loc]||loc}"></div>`;
    }).join('');
  } else if (tlBar) {
    tlBar.classList.add('hidden');
  }

  // ── Week schedule ──
  const wStart = new Date(_myWeekMon + 'T00:00:00');
  const wEnd   = new Date(wStart);
  wEnd.setDate(wEnd.getDate() + 6);

  document.getElementById('my-sched-body').innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin:14px 0;flex-wrap:wrap">
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
      const dayIso   = toDateStr(d);
      const isToday_ = dayIso === todayStr();
      const isDO     = isEmpDayOff(_myEmpId, dayIso);
      const isOL     = isOnLeave(_myEmpId, dayIso);
      const hol      = getHolidayForDate(dayIso);

      const slots = isDO
        ? `<div class="my-day-off-block">Regular Day Off</div>`
        : isOL
        ? `<div class="my-day-off-block" style="color:var(--purple)">On Leave</div>`
        : TIMESLOTS.map((slot, slotI) => {
            const { loc } = getResolvedLoc(dayIso, slotI, _myEmpId);
            const cls     = LOCCLS[loc] || '';
            const isCurSlot = isToday_ && slotI === si;
            return `<div class="my-slot-row ${loc==='off'?'my-slot-off':''} ${isCurSlot?'find-slot-cur':''}">
              <span class="my-slot-time">${slot}</span>
              <span class="my-slot-loc ${cls}">${LOCLABEL[loc]||loc}</span>
            </div>`;
          }).join('');

      return `<div class="my-day-block ${isToday_?'my-day-today':''}">
        <div class="my-day-hdr">
          <span>${day} <strong>${d.getDate()}</strong></span>
          ${isToday_ ? '<span class="today-badge">TODAY</span>' : ''}
          ${hol ? `<span class="holiday-mini-badge"
            style="background:${hol.color}18;color:${hol.color};border-color:${hol.color}40">
            ${hol.emoji} ${escH(hol.name)}</span>` : ''}
        </div>
        <div class="my-day-slots">${slots}</div>
      </div>`;
    }).join('')}`;
}

function selectMyEmp(empId) {
  _myEmpId = empId;
  // Fixed: remember selection in localStorage so it persists across reloads
  localStorage.setItem('smPro_myEmpId', empId);
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

  scheduleMidnightRefresh();

  // On mobile default to My Schedule view
  if (window.innerWidth < 640) {
    setLiveView('my');
  } else {
    setLiveView('locations');
  }

  renderLiveBoard();
});
