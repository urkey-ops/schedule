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
    tbody.innerHTML = `<tr><td colspan="8"
      style="text-align:center;padding:24px;color:var(--muted)">
      No employees match the current filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = emps.map((emp, idx) => {
    const used      = calcScheduledHrsWeek(emp.id, weekMon);
    const cap       = emp.hourCap || DEFAULTHRSCAP;
    const pct       = Math.min((used / cap) * 100, 100);
    const over      = used > cap;
    const barColor  = over ? '#dc2626' : '#059669';
    const onLeave_  = isOnLeave(emp.id, iso);
    const isDayOff_ = isEmpDayOff(emp.id, iso);
    const absent_   = !!state.absences?.[iso]?.[emp.id];

    let statusBadge = '';
    if (absent_)        statusBadge = `<span class="badge badge-sick">Absent</span>`;
    else if (onLeave_)  statusBadge = `<span class="badge badge-annual">On Leave</span>`;
    else if (isDayOff_) statusBadge = `<span class="badge badge-off">Day Off</span>`;
    else statusBadge = `<span class="badge badge-active">${emp.status || 'Active'}</span>`;

    const dows = ['MON','TUE','WED','THU','FRI','SAT','SUN'];
    const dowBadges = dows.map(d => {
      const isOff = (emp.daysOff || []).includes(d);
      return `<span class="dow-badge ${isOff ? 'dow-badge-off' : ''}"
        ${state.mode === 'admin'
          ? `onclick="toggleEmpDow('${emp.id}','${d}')" style="cursor:pointer"`
          : ''}>${d}</span>`;
    }).join('');

    const annualUsed = calcLeaveUsed(emp.id, 'annual');
    const sickUsed   = calcLeaveUsed(emp.id, 'sick');
    const annualCap  = emp.annualLeave || 20;
    const sickCap    = emp.sickLeave   || 10;
    const leaveStr   = `<div style="font-size:10px;line-height:1.8">
      <span style="color:${annualUsed >= annualCap ? '#dc2626' : 'var(--muted)'}">
        AL: ${annualUsed}/${annualCap}d</span><br>
      <span style="color:${sickUsed >= sickCap ? '#dc2626' : 'var(--muted)'}">
        SL: ${sickUsed}/${sickCap}d</span>
    </div>`;

    const hourBar = `<div class="roster-hr-bar">
      <div class="roster-hr-track">
        <div class="roster-hr-fill"
          style="width:${pct}%;background:${barColor}"></div>
      </div>
      <span class="roster-hr-label" style="color:${barColor}">
        ${used.toFixed(1)}/${cap}h${over ? ' ⚠' : ''}
      </span>
    </div>`;

    return `<tr class="${absent_ ? 'row-absent' : ''} ${onLeave_ ? 'row-leave' : ''}">
      <td style="color:var(--muted);font-size:11px">${idx + 1}</td>
      <td>
        <div style="font-weight:700;font-size:13px">${escH(emp.name)}</div>
        <div style="font-size:10px;color:var(--subtle)">${emp.id}</div>
      </td>
      <td>${statusBadge}</td>
      <td>${hourBar}</td>
      <td><div style="display:flex;gap:2px;flex-wrap:wrap">${dowBadges}</div></td>
      <td>${leaveStr}</td>
      <td>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          <button class="btn btn-sm btn-ghost"
            onclick="openEditEmployee('${emp.id}')">Edit</button>
          ${state.mode === 'admin'
            ? `<button class="btn btn-sm btn-leave"
                onclick="openAddLeave('${emp.id}')">+ Leave</button>
               <button class="btn btn-sm btn-danger"
                onclick="deleteEmployee('${emp.id}')">✕</button>`
            : ''}
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

// ── Volunteers ────────────────────────────────────────────────
// Simplified: single today-available toggle per volunteer
// (replaces 7-day day-of-week matrix)

function renderVolunteers() {
  const el = document.getElementById('volunteer-list');
  if (!el) return;
  const vols = state.volunteers || [];
  const iso  = todayStr();

  if (!vols.length) {
    el.innerHTML = `<div class="card"
      style="padding:20px;text-align:center;color:var(--muted);font-size:13px">
      No volunteers added yet.</div>`;
    return;
  }

  el.innerHTML = `<div class="card"><div style="overflow-x:auto">
    <table class="data-table">
      <thead><tr>
        <th>#</th><th>Name</th><th>Available Today</th><th>Note</th>
        ${state.mode === 'admin' ? '<th>Actions</th>' : ''}
      </tr></thead>
      <tbody>
        ${vols.map((vol, i) => {
          const todayAvail = state.volAvailability?.[vol.id]?.[iso] !== false;
          return `<tr>
            <td style="color:var(--muted);font-size:11px">${i + 1}</td>
            <td style="font-weight:700;font-size:13px">${escH(vol.name)}</td>
            <td>
              ${state.mode === 'admin'
                ? `<button class="btn btn-sm ${todayAvail ? 'btn-success' : 'btn-ghost'}"
                    onclick="toggleVolToday('${vol.id}')">
                    ${todayAvail ? '✔ Available' : '— Not today'}
                  </button>`
                : `<span class="badge ${todayAvail ? 'badge-active' : 'badge-off'}">
                    ${todayAvail ? 'Available' : 'Not today'}</span>`}
            </td>
            <td style="font-size:12px;color:var(--muted)">${escH(vol.note || '—')}</td>
            ${state.mode === 'admin'
              ? `<td>
                  <div style="display:flex;gap:4px">
                    <button class="btn btn-sm btn-ghost"
                      onclick="openEditVolunteer('${vol.id}')">Edit</button>
                    <button class="btn btn-sm btn-danger"
                      onclick="deleteVolunteer('${vol.id}')">✕</button>
                  </div>
                </td>`
              : ''}
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div></div>`;
}

// Toggle volunteer availability for today only
function toggleVolToday(volId) {
  const iso = todayStr();
  if (!state.volAvailability)         state.volAvailability         = {};
  if (!state.volAvailability[volId])  state.volAvailability[volId]  = {};
  const cur = state.volAvailability[volId][iso];
  state.volAvailability[volId][iso] = (cur === false) ? true : false;
  persistAll('volAvailability');
  renderVolunteers();
}
