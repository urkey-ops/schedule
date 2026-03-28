// ── staff.js ──────────────────────────────────────────────────

// ── State for sort / filter ───────────────────────────────────
let _rosterSort   = 'name';   // 'name' | 'hours'
let _rosterSortDir = 1;       // 1 = asc, -1 = desc
let _rosterFilter = 'all';    // 'all' | 'active' | 'leave' | 'dayoff'
let _editEmpId    = null;
let _blockedLocs  = [];
let _planWeekMon  = '';

// ── Render Roster ─────────────────────────────────────────────
function renderRoster() {
  const tbody = document.getElementById('roster-body');
  if (!tbody) return;

  const iso     = todayStr();
  const weekMon = state.currentWeekMon || toDateStr(getWeekMonday(new Date()));

  // Apply filter
  let emps = [...state.employees];
  if (_rosterFilter === 'active') {
    emps = emps.filter(e => e.status === 'Active');
  } else if (_rosterFilter === 'leave') {
    emps = emps.filter(e => isOnLeave(e.id, iso));
  } else if (_rosterFilter === 'dayoff') {
    emps = emps.filter(e => isEmpDayOff(e.id, iso));
  }

  // Apply sort
  emps.sort((a, b) => {
    if (_rosterSort === 'name') {
      return _rosterSortDir * a.name.localeCompare(b.name);
    }
    if (_rosterSort === 'hours') {
      const ha = calcScheduledHrsWeek(a.id, weekMon);
      const hb = calcScheduledHrsWeek(b.id, weekMon);
      return _rosterSortDir * (ha - hb);
    }
    return 0;
  });

  if (!emps.length) {
    tbody.innerHTML = `<tr><td colspan="9"
      style="text-align:center;padding:24px;color:var(--muted)">
      No employees match the current filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = emps.map((emp, idx) => {
    const used      = calcScheduledHrsWeek(emp.id, weekMon);
    const cap       = emp.hourCap || DEFAULTHRSCAP;
    const pct       = Math.min((used / cap) * 100, 100);
    const over      = used > cap;
    const warn      = !over && pct >= 80;
    const barColor  = over ? '#dc2626' : warn ? '#d97706' : '#059669';
    const onLeave_  = isOnLeave(emp.id, iso);
    const isDayOff_ = isEmpDayOff(emp.id, iso);
    const absent_   = !!state.absences?.[iso]?.[emp.id];

    // Status badge
    let statusBadge = '';
    if (absent_)    statusBadge = `<span class="status-chip chip-absent">Absent</span>`;
    else if (onLeave_)   statusBadge = `<span class="status-chip chip-leave">On Leave</span>`;
    else if (isDayOff_)  statusBadge = `<span class="status-chip chip-dayoff">Day Off</span>`;
    else statusBadge = `<span class="status-chip chip-${emp.status?.toLowerCase()||'active'}">
      ${emp.status||'Active'}</span>`;

    // Blocked locs
    const blockedStr = (emp.blocked||[]).map(l =>
      `<span class="blocked-chip">${LOCLABEL[l]||l}</span>`
    ).join('') || `<span style="color:var(--subtle);font-size:11px">none</span>`;

    // Day off DOW badges — clickable in admin mode
    const dows = ['MON','TUE','WED','THU','FRI','SAT','SUN'];
    const dowBadges = dows.map(d => {
      const isOff = (emp.daysOff||[]).includes(d);
      return `<span class="dow-badge ${isOff?'dow-badge-off':''}"
        ${state.mode==='admin'
          ? `onclick="toggleEmpDow('${emp.id}','${d}')" style="cursor:pointer" title="Toggle ${d} off"`
          : ''}>${d}</span>`;
    }).join('');

    // Leave balance
    const annualUsed = calcLeaveUsed(emp.id,'annual');
    const sickUsed   = calcLeaveUsed(emp.id,'sick');
    const annualCap  = emp.annualLeave || 20;
    const sickCap    = emp.sickLeave   || 10;
    const leaveStr   = `<div style="font-size:10px;line-height:1.6">
      <span style="color:${annualUsed>=annualCap?'#dc2626':'var(--muted)'}">
        AL: ${annualUsed}/${annualCap}d
      </span><br>
      <span style="color:${sickUsed>=sickCap?'#dc2626':'var(--muted)'}">
        SL: ${sickUsed}/${sickCap}d
      </span>
    </div>`;

    // Hour bar
    const hourBar = `
      <div class="roster-hr-bar">
        <div class="roster-hr-track">
          <div class="roster-hr-fill"
            style="width:${pct}%;background:${barColor}"></div>
        </div>
        <span class="roster-hr-label" style="color:${barColor}">
          ${used.toFixed(1)}/${cap}h
        </span>
      </div>`;

    return `<tr class="${absent_?'row-absent':''} ${onLeave_?'row-leave':''}">
      <td style="color:var(--muted);font-size:11px">${idx+1}</td>
      <td>
        <div style="font-weight:700;font-size:13px;color:var(--text)">
          ${escH(emp.name)}
        </div>
        <div style="font-size:10px;color:var(--subtle)">
          ${emp.id}
        </div>
      </td>
      <td>
        <span class="loc-select ${LOCCLS[emp.fallback]||''}"
          style="font-size:10px;padding:2px 6px">
          ${escH(emp.fallback||'—')}
        </span>
      </td>
      <td>${blockedStr}</td>
      <td>${statusBadge}</td>
      <td>${hourBar}</td>
      <td><div style="display:flex;gap:2px;flex-wrap:wrap">${dowBadges}</div></td>
      <td>${leaveStr}</td>
      <td>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          <button class="btn btn-sm btn-ghost"
            onclick="openEditEmployee('${emp.id}')">Edit</button>
          <button class="btn btn-sm btn-ghost"
            onclick="openPlanSchedule('${emp.id}')">Plan</button>
          <button class="btn btn-sm btn-danger"
            onclick="deleteEmployee('${emp.id}')">✕</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ── Sort / Filter controls ────────────────────────────────────
function sortRoster(field) {
  if (_rosterSort === field) {
    _rosterSortDir *= -1;
  } else {
    _rosterSort    = field;
    _rosterSortDir = 1;
  }
  renderRoster();
}

function filterRoster(val) {
  _rosterFilter = val;
  renderRoster();
}

// ── Quick DOW toggle (click badge in table) ───────────────────
function toggleEmpDow(empId, dow) {
  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return;
  if (!emp.daysOff) emp.daysOff = [];
  const idx = emp.daysOff.indexOf(dow);
  if (idx >= 0) emp.daysOff.splice(idx, 1);
  else          emp.daysOff.push(dow);
  persistAll('employees');
  renderRoster();
  showToast(`${emp.name} — ${dow} day off ${idx>=0?'removed':'added'}`);
}

// ── Hour bar standalone ───────────────────────────────────────
function renderHourBar(empId) {
  const emp     = state.employees.find(e => e.id === empId);
  const weekMon = state.currentWeekMon || toDateStr(getWeekMonday(new Date()));
  const used    = calcScheduledHrsWeek(empId, weekMon);
  const cap     = emp?.hourCap || DEFAULTHRSCAP;
  const pct     = Math.min((used/cap)*100, 100);
  const over    = used > cap;
  const warn    = !over && pct >= 80;
  const color   = over ? '#dc2626' : warn ? '#d97706' : '#059669';
  return `<div class="roster-hr-bar">
    <div class="roster-hr-track">
      <div class="roster-hr-fill"
        style="width:${pct}%;background:${color}"></div>
    </div>
    <span class="roster-hr-label" style="color:${color}">
      ${used.toFixed(1)}/${cap}h
    </span>
  </div>`;
}

// ── Leave usage calc ──────────────────────────────────────────
function calcLeaveUsed(empId, type) {
  return (state.leaveRequests||[])
    .filter(l => l.empId===empId && l.type===type && l.status==='active')
    .reduce((acc, l) => {
      const from = new Date(l.from+'T00:00:00');
      const to   = new Date(l.to+'T00:00:00');
      const days = Math.round((to-from)/(86400000)) + 1;
      return acc + days;
    }, 0);
}

// ── Add / Edit Employee ───────────────────────────────────────
function openAddEmployee() {
  _editEmpId  = null;
  _blockedLocs = [];
  document.getElementById('modal-title').textContent = 'Add Employee';
  document.getElementById('emp-name').value      = '';
  document.getElementById('emp-fallback').value  = 'Field Work';
  document.getElementById('emp-hour-cap').value  = '';
  document.getElementById('emp-status').value    = 'Active';
  document.getElementById('emp-annual').value    = '';
  document.getElementById('emp-sick').value      = '';
  document.getElementById('emp-hrs-summary').innerHTML = '';
  // Clear DOW checkboxes
  ['MON','TUE','WED','THU','FRI','SAT','SUN'].forEach(d => {
    const cb = document.getElementById(`dow-off-${d}`);
    if (cb) cb.checked = false;
  });
  // Clear blocked toggles
  ['gate','podium','mandir','field','giftshop'].forEach(loc => {
    document.getElementById(`tog-${loc}`)?.classList.remove('active');
  });
  openModal('emp-modal');
  setTimeout(() => document.getElementById('emp-name')?.focus(), 100);
}

function openEditEmployee(empId) {
  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return;
  _editEmpId   = empId;
  _blockedLocs = [...(emp.blocked||[])];

  document.getElementById('modal-title').textContent = 'Edit Employee';
  document.getElementById('emp-name').value     = emp.name || '';
  document.getElementById('emp-fallback').value = emp.fallback || 'Field Work';
  document.getElementById('emp-hour-cap').value = emp.hourCap || '';
  document.getElementById('emp-status').value   = emp.status  || 'Active';
  document.getElementById('emp-annual').value   = emp.annualLeave || '';
  document.getElementById('emp-sick').value     = emp.sickLeave   || '';

  // DOW checkboxes
  ['MON','TUE','WED','THU','FRI','SAT','SUN'].forEach(d => {
    const cb = document.getElementById(`dow-off-${d}`);
    if (cb) cb.checked = (emp.daysOff||[]).includes(d);
  });

  // Blocked toggles
  ['gate','podium','mandir','field','giftshop'].forEach(loc => {
    const btn = document.getElementById(`tog-${loc}`);
    if (btn) btn.classList.toggle('active', _blockedLocs.includes(loc));
  });

  // Hours summary
  const weekMon = state.currentWeekMon || toDateStr(getWeekMonday(new Date()));
  const used    = calcScheduledHrsWeek(empId, weekMon);
  const cap     = emp.hourCap || DEFAULTHRSCAP;
  const pct     = Math.min((used/cap)*100,100);
  const color   = used>cap?'#dc2626':pct>=80?'#d97706':'#059669';
  document.getElementById('emp-hrs-summary').innerHTML =
    `<div style="display:flex;align-items:center;gap:10px">
      <span style="font-size:12px;color:var(--muted);font-weight:600">
        This week:
      </span>
      <div class="roster-hr-bar" style="flex:1">
        <div class="roster-hr-track">
          <div class="roster-hr-fill"
            style="width:${pct}%;background:${color}"></div>
        </div>
        <span class="roster-hr-label" style="color:${color}">
          ${used.toFixed(1)}/${cap}h
        </span>
      </div>
    </div>`;

  openModal('emp-modal');
  setTimeout(() => document.getElementById('emp-name')?.focus(), 100);
}

function toggleLoc(loc) {
  const btn = document.getElementById(`tog-${loc}`);
  if (!btn) return;
  const idx = _blockedLocs.indexOf(loc);
  if (idx >= 0) { _blockedLocs.splice(idx,1); btn.classList.remove('active'); }
  else          { _blockedLocs.push(loc);      btn.classList.add('active'); }
}

function saveEmployee() {
  const name = v('emp-name');
  if (!name) { alert('Please enter a name.'); return; }

  const daysOff = ['MON','TUE','WED','THU','FRI','SAT','SUN']
    .filter(d => document.getElementById(`dow-off-${d}`)?.checked);

  const hourCap = parseInt(v('emp-hour-cap')) || DEFAULTHRSCAP;

  if (_editEmpId) {
    const emp = state.employees.find(e => e.id === _editEmpId);
    if (!emp) return;
    emp.name        = name;
    emp.fallback    = v('emp-fallback');
    emp.blocked     = [..._blockedLocs];
    emp.status      = v('emp-status');
    emp.hourCap     = hourCap;
    emp.daysOff     = daysOff;
    emp.annualLeave = parseInt(v('emp-annual')) || 20;
    emp.sickLeave   = parseInt(v('emp-sick'))   || 10;
  } else {
    state.employees.push({
      id          : `emp-${Date.now()}`,
      name,
      fallback    : v('emp-fallback'),
      blocked     : [..._blockedLocs],
      status      : v('emp-status'),
      hourCap,
      daysOff,
      annualLeave : parseInt(v('emp-annual')) || 20,
      sickLeave   : parseInt(v('emp-sick'))   || 10,
    });
  }

  persistAll('employees');
  closeModal('emp-modal');
  renderRoster();
  renderAll();
  showToast(_editEmpId ? 'Employee updated' : 'Employee added');
}

function deleteEmployee(empId) {
  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return;
  if (!confirm(`Delete ${emp.name}? This cannot be undone.`)) return;
  pushUndo('Delete employee', state);
  state.employees = state.employees.filter(e => e.id !== empId);
  persistAll('employees');
  renderRoster();
  renderAll();
  showToast(`${emp.name} deleted`);
}

// ── Plan Schedule modal ───────────────────────────────────────
function openPlanSchedule(empId) {
  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return;
  _editEmpId  = empId;
  _planWeekMon = state.currentWeekMon || toDateStr(getWeekMonday(new Date()));
  document.getElementById('plan-modal-title').textContent =
    `Plan Schedule — ${emp.name}`;
  renderPlanModal();
  openModal('plan-modal');
}

function renderPlanModal() {
  const emp = state.employees.find(e => e.id === _editEmpId);
  if (!emp) return;

  const mon = new Date(_planWeekMon+'T00:00:00');
  const end = new Date(mon); end.setDate(end.getDate()+6);
  document.getElementById('plan-week-label').textContent =
    `${mon.toLocaleDateString('en-GB',{day:'numeric',month:'short'})} – ${
      end.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}`;

  const container = document.getElementById('plan-days-container');
  if (!container) return;

  container.innerHTML = DAYSSHORT.map((dow, di) => {
    const d        = new Date(mon); d.setDate(d.getDate()+di);
    const iso      = toDateStr(d);
    const isToday_ = iso === todayStr();
    const isDO     = isEmpDayOff(emp.id, iso);
    const onLeave_ = isOnLeave(emp.id, iso);
    const holiday  = getHolidayForDate(iso);

    return `<div style="border:1.5px solid var(--border);border-radius:10px;
                        margin-bottom:10px;overflow:hidden">
      <div style="padding:8px 12px;background:var(--surface2);
                  border-bottom:1px solid var(--border);
                  display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <strong style="font-size:13px">${DAYSFULL[di]} ${d.getDate()}</strong>
        ${isToday_ ? '<span class="today-badge">TODAY</span>' : ''}
        ${holiday  ? `<span style="font-size:11px;color:${holiday.color};font-weight:600">
          ${holiday.emoji} ${escH(holiday.name)}</span>` : ''}
        ${isDO     ? '<span class="status-chip chip-dayoff" style="font-size:10px">Day Off</span>' : ''}
        ${onLeave_ ? '<span class="status-chip chip-leave"  style="font-size:10px">On Leave</span>' : ''}
      </div>
      ${isDO || onLeave_ ? '' :
        `<div style="padding:8px 12px;display:flex;flex-direction:column;gap:4px">
          ${TIMESLOTS.map((slot, si) => {
            const { loc, source } = getResolvedLoc(iso, si, emp.id);
            const isOvr = source === 'override';
            return `<div style="display:flex;align-items:center;gap:8px;
                                padding:4px 0;border-bottom:1px solid var(--border)">
              <span style="font-size:10px;color:var(--muted);
                           min-width:110px;flex-shrink:0">${slot}</span>
              <select data-iso="${iso}" data-si="${si}"
                class="plan-cell-select ${isOvr?'is-override':''}"
                style="flex:1;padding:5px 8px;border-radius:6px;font-size:12px;
                       border:1.5px solid ${isOvr?'var(--orange)':'var(--border2)'};
                       background:var(--surface)"
                onchange="planCellChange(this,'${emp.id}')">
                ${ALLLOCS.map(l =>
                  `<option value="${l}" ${loc===l?'selected':''}>${LOCLABEL[l]||l}</option>`
                ).join('')}
              </select>
              ${isOvr
                ? `<button class="btn btn-sm btn-ghost"
                    style="font-size:10px;padding:3px 7px"
                    onclick="clearPlanCell('${iso}',${si},'${emp.id}')">↩</button>`
                : ''}
            </div>`;
          }).join('')}
        </div>`}
    </div>`;
  }).join('');
}

function planCellChange(sel, empId) {
  const iso = sel.dataset.iso;
  const si  = parseInt(sel.dataset.si);
  const loc = sel.value;
  if (!state.schedule)       state.schedule       = {};
  if (!state.schedule[iso])  state.schedule[iso]  = {};
  if (!state.schedule[iso][si]) state.schedule[iso][si] = {};
  state.schedule[iso][si][empId] = loc;
  sel.style.borderColor = 'var(--orange)';
  sel.classList.add('is-override');
}

function clearPlanCell(iso, si, empId) {
  if (!state.schedule?.[iso]?.[si]) return;
  delete state.schedule[iso][si][empId];
  if (!Object.keys(state.schedule[iso][si]).length) delete state.schedule[iso][si];
  if (!Object.keys(state.schedule[iso]).length)     delete state.schedule[iso];
  renderPlanModal();
}

function planShiftWeek(delta) {
  const d = new Date(_planWeekMon+'T00:00:00');
  d.setDate(d.getDate() + delta*7);
  _planWeekMon = toDateStr(d);
  renderPlanModal();
}

function savePlanSchedule() {
  persistAll('schedule');
  closeModal('plan-modal');
  renderAll();
  showToast('Schedule saved');
}

// ── Volunteers ────────────────────────────────────────────────
let _editVolId = null;

function renderVolunteers() {
  const el = document.getElementById('volunteer-list');
  if (!el) return;

  const vols = state.volunteers || [];
  if (!vols.length) {
    el.innerHTML = `<div class="card"
      style="padding:20px;text-align:center;color:var(--muted);font-size:13px">
      No volunteers added yet.</div>`;
    return;
  }

  const iso  = todayStr();
  const dow  = DAYSSHORT[(new Date().getDay()+6)%7];

  el.innerHTML = `<div class="card"><div style="overflow-x:auto">
    <table class="data-table">
      <thead><tr>
        <th>#</th><th>Name</th><th>Availability</th>
        <th>Available Today</th><th>Note</th><th>Actions</th>
      </tr></thead>
      <tbody>
        ${vols.map((vol, i) => {
          const avail     = state.volAvailability?.[vol.id] || {};
          const todayAvail= avail[dow] !== false;
          const availDows = DAYSSHORT.map(d =>
            `<span class="dow-badge ${avail[d]===false?'':'dow-badge-avail'}"
              ${state.mode==='admin'
                ? `onclick="toggleVolAvail('${vol.id}','${d}')" style="cursor:pointer"`
                : ''}>
              ${d}
            </span>`).join('');
          return `<tr>
            <td style="color:var(--muted);font-size:11px">${i+1}</td>
            <td style="font-weight:700;font-size:13px">${escH(vol.name)}</td>
            <td><div style="display:flex;gap:2px;flex-wrap:wrap">${availDows}</div></td>
            <td>
              <span class="status-chip ${todayAvail?'chip-active':'chip-dayoff'}">
                ${todayAvail?'Available':'Not available'}
              </span>
            </td>
            <td style="font-size:12px;color:var(--muted)">${escH(vol.note||'—')}</td>
            <td>
              <div style="display:flex;gap:4px">
                <button class="btn btn-sm btn-ghost"
                  onclick="openEditVolunteer('${vol.id}')">Edit</button>
                <button class="btn btn-sm btn-danger"
                  onclick="deleteVolunteer('${vol.id}')">✕</button>
              </div>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div></div>`;
}

function toggleVolAvail(volId, dow) {
  if (!state.volAvailability)         state.volAvailability = {};
  if (!state.volAvailability[volId])  state.volAvailability[volId] = {};
  const cur = state.volAvailability[volId][dow];
  state.volAvailability[volId][dow] = (cur === false) ? true : false;
  persistAll('volAvailability');
  renderVolunteers();
}

function openAddVolunteer() {
  _editVolId = null;
  document.getElementById('vol-modal-title').textContent = 'Add Volunteer';
  document.getElementById('vol-name').value = '';
  document.getElementById('vol-note').value = '';
  openModal('vol-modal');
  setTimeout(() => document.getElementById('vol-name')?.focus(), 100);
}

function openEditVolunteer(volId) {
  const vol = (state.volunteers||[]).find(v => v.id === volId);
  if (!vol) return;
  _editVolId = volId;
  document.getElementById('vol-modal-title').textContent = 'Edit Volunteer';
  document.getElementById('vol-name').value = vol.name || '';
  document.getElementById('vol-note').value = vol.note || '';
  openModal('vol-modal');
  setTimeout(() => document.getElementById('vol-name')?.focus(), 100);
}

function saveVolunteer() {
  const name = v('vol-name');
  if (!name) { alert('Please enter a name.'); return; }
  if (!state.volunteers) state.volunteers = [];
  if (_editVolId) {
    const vol = state.volunteers.find(v => v.id === _editVolId);
    if (vol) { vol.name = name; vol.note = v('vol-note'); }
  } else {
    state.volunteers.push({
      id  : `vol-${Date.now()}`,
      name,
      note: v('vol-note'),
    });
  }
  persistAll('volunteers');
  closeModal('vol-modal');
  renderVolunteers();
  showToast(_editVolId ? 'Volunteer updated' : 'Volunteer added');
}

function deleteVolunteer(volId) {
  const vol = (state.volunteers||[]).find(v => v.id === volId);
  if (!vol) return;
  if (!confirm(`Delete ${vol.name}?`)) return;
  state.volunteers = state.volunteers.filter(v => v.id !== volId);
  persistAll('volunteers');
  renderVolunteers();
  showToast(`${vol.name} deleted`);
}

// ── Live volunteers panel ─────────────────────────────────────
function renderLiveVolunteers() {
  const el  = document.getElementById('live-volunteers');
  if (!el) return;
  const dow  = DAYSSHORT[(new Date().getDay()+6)%7];
  const vols = (state.volunteers||[]).filter(vol => {
    const avail = state.volAvailability?.[vol.id] || {};
    return avail[dow] !== false;
  });
  if (!vols.length) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div style="font-size:11px;font-weight:700;color:var(--muted);
                text-transform:uppercase;letter-spacing:0.6px;margin-bottom:8px">
      Volunteers available today
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      ${vols.map(vol =>
        `<div style="padding:5px 10px;background:var(--surface2);
                     border:1.5px solid var(--border2);border-radius:8px;
                     font-size:12px;font-weight:600;color:var(--text)">
          👤 ${escH(vol.name)}
          ${vol.note?`<span style="font-size:10px;color:var(--muted);
            margin-left:4px">${escH(vol.note)}</span>`:''}
        </div>`).join('')}
    </div>`;
}
