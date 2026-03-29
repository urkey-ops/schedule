// ── pages/staff-page.js ───────────────────────────────────────

let _rosterSort    = 'name';
let _rosterSortDir = 1;
let _rosterFilter  = 'all';

function renderRoster() {
  const tbody   = document.getElementById('roster-body');
  if (!tbody) return;
  const iso     = todayStr();
  const weekMon = state.currentWeekMon || toDateStr(getWeekMonday(new Date()));

  let emps = [...state.employees];
  if (_rosterFilter === 'active')  emps = emps.filter(e => e.status === 'Active');
  if (_rosterFilter === 'leave')   emps = emps.filter(e => isOnLeave(e.id, iso));
  if (_rosterFilter === 'dayoff')  emps = emps.filter(e => isEmpDayOff(e.id, iso));

  emps.sort((a, b) => {
    if (_rosterSort === 'name')  return _rosterSortDir * a.name.localeCompare(b.name);
    if (_rosterSort === 'hours') {
      return _rosterSortDir *
        (calcScheduledHrsWeek(a.id, weekMon) - calcScheduledHrsWeek(b.id, weekMon));
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
    const pct       = Math.min((used/cap)*100, 100);
    const over      = used > cap;
    const warn      = !over && pct >= 80;
    const barColor  = over ? '#dc2626' : warn ? '#d97706' : '#059669';
    const onLeave_  = isOnLeave(emp.id, iso);
    const isDayOff_ = isEmpDayOff(emp.id, iso);
    const absent_   = !!state.absences?.[iso]?.[emp.id];

    let statusBadge = '';
    if (absent_)        statusBadge = `<span class="status-chip chip-absent">Absent</span>`;
    else if (onLeave_)  statusBadge = `<span class="status-chip chip-leave">On Leave</span>`;
    else if (isDayOff_) statusBadge = `<span class="status-chip chip-dayoff">Day Off</span>`;
    else statusBadge = `<span class="status-chip chip-${emp.status?.toLowerCase()||'active'}">
      ${emp.status||'Active'}</span>`;

    const blockedStr = (emp.blocked||[]).map(l =>
      `<span class="blocked-chip">${LOCLABEL[l]||l}</span>`
    ).join('') || `<span style="color:var(--subtle);font-size:11px">none</span>`;

    const dows = ['MON','TUE','WED','THU','FRI','SAT','SUN'];
    const dowBadges = dows.map(d => {
      const isOff = (emp.daysOff||[]).includes(d);
      return `<span class="dow-badge ${isOff?'dow-badge-off':''}"
        ${state.mode==='admin'
          ? `onclick="toggleEmpDow('${emp.id}','${d}')"
             style="cursor:pointer" title="Toggle ${d} off"`
          : ''}>${d}</span>`;
    }).join('');

    const annualUsed = calcLeaveUsed(emp.id,'annual');
    const sickUsed   = calcLeaveUsed(emp.id,'sick');
    const annualCap  = emp.annualLeave || 20;
    const sickCap    = emp.sickLeave   || 10;
    const leaveStr   = `<div style="font-size:10px;line-height:1.6">
      <span style="color:${annualUsed>=annualCap?'#dc2626':'var(--muted)'}">
        AL: ${annualUsed}/${annualCap}d</span><br>
      <span style="color:${sickUsed>=sickCap?'#dc2626':'var(--muted)'}">
        SL: ${sickUsed}/${sickCap}d</span>
    </div>`;

    const hourBar = `<div class="roster-hr-bar">
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
        <div style="font-weight:700;font-size:13px">${escH(emp.name)}</div>
        <div style="font-size:10px;color:var(--subtle)">${emp.id}</div>
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

function sortRoster(field) {
  if (_rosterSort === field) _rosterSortDir *= -1;
  else { _rosterSort = field; _rosterSortDir = 1; }
  renderRoster();
}

function filterRoster(val) {
  _rosterFilter = val;
  renderRoster();
}

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

  const iso = todayStr();
  const dow = DAYSSHORT[(new Date().getDay()+6)%7];

  el.innerHTML = `<div class="card"><div style="overflow-x:auto">
    <table class="data-table">
      <thead><tr>
        <th>#</th><th>Name</th><th>Availability</th>
        <th>Available Today</th><th>Note</th><th>Actions</th>
      </tr></thead>
      <tbody>
        ${vols.map((vol, i) => {
          const avail      = state.volAvailability?.[vol.id] || {};
          const todayAvail = avail[dow] !== false;
          const availDows  = DAYSSHORT.map(d =>
            `<span class="dow-badge ${avail[d]===false?'':'dow-badge-avail'}"
              ${state.mode==='admin'
                ? `onclick="toggleVolAvail('${vol.id}','${d}')" style="cursor:pointer"`
                : ''}>
              ${d}</span>`
          ).join('');

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
