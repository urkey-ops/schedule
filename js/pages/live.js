// ── pages/live.js ─────────────────────────────────────────────

function renderLiveBoard() {
  const iso = todayStr();
  const now = new Date();
  const si  = currentSlotIdx();

  // Date label
  const dl = document.getElementById('live-date-label');
  if (dl) dl.textContent = now.toLocaleDateString('en-GB', {
    weekday:'long', day:'numeric', month:'long', year:'numeric'
  });

  // Holiday banner
  const hb = document.getElementById('live-holiday-banner');
  if (hb) {
    const holiday = getHolidayForDate(iso);
    if (holiday) {
      hb.innerHTML     = `${holiday.emoji} <strong>${escH(holiday.name)}</strong>`;
      hb.style.background  = holiday.color + '22';
      hb.style.borderColor = holiday.color + '55';
      hb.style.color       = holiday.color;
      hb.classList.remove('hidden');
    } else {
      hb.classList.add('hidden');
    }
  }

  renderLiveAlerts();
  renderLiveVolunteers();

  const board      = document.getElementById('live-board');
  if (!board) return;
  const activeEmps = state.employees.filter(e => e.status === 'Active');

  if (!activeEmps.length) {
    board.innerHTML = `<div style="text-align:center;padding:32px;
      color:var(--muted);font-size:13px">No active employees.</div>`;
    return;
  }

  // Group by current location
  const groups = {};
  ALLLOCS.forEach(loc => { groups[loc] = []; });

  activeEmps.forEach(e => {
    if (isEmpDayOff(e.id, iso))           return;
    if (isOnLeave(e.id, iso))             return;
    if (state.absences?.[iso]?.[e.id])   return;
    const { loc } = si >= 0
      ? getResolvedLoc(iso, si, e.id)
      : { loc: e.fallback || 'off' };
    if (loc === 'off' || loc === 'vac')   return;
    if (!groups[loc]) groups[loc] = [];
    groups[loc].push(e);
  });

  board.innerHTML = ALLLOCS
    .filter(loc => groups[loc]?.length)
    .map(loc => {
      const color = LOCCOLOR[loc] || '#888';
      const label = LOCLABEL[loc] || loc;
      return `<div class="live-card" style="border-top:3px solid ${color}">
        <div class="live-card-stripe" style="background:${color}"></div>
        <div class="live-card-hdr">
          <span class="live-loc-tag"
            style="background:${color}22;color:${color}">${label}</span>
          ${si >= 0
            ? `<span class="live-slot-time">${TIMESLOTS[si]}</span>`
            : ''}
        </div>
        <div class="live-card-body">
          ${groups[loc].map(e => {
            const absent = !!state.absences?.[iso]?.[e.id];
            return `<div class="live-emp-name">${escH(e.name)}</div>
              ${absent
                ? `<span class="absent-badge">Absent</span>`
                : ''}
              <button class="present-toggle ${absent?'absent':'present'}"
                onclick="toggleAbsent('${e.id}','${iso}')">
                ${absent ? '✖ Mark Present' : '✔ Present'}
              </button>`;
          }).join('')}
          ${renderUpNext(loc, iso, si)}
        </div>
      </div>`;
    }).join('')
    || `<div style="text-align:center;padding:32px;
        color:var(--muted);font-size:13px">
        No assignments for current slot.</div>`;

  if (typeof renderTimeline === 'function') renderTimeline();
}

function renderUpNext(loc, iso, curSi) {
  const upcoming = [];
  for (let si = curSi + 1; si < TIMESLOTS.length; si++) {
    const emps = state.employees
      .filter(e => e.status === 'Active' &&
        !isEmpDayOff(e.id, iso) && !isOnLeave(e.id, iso))
      .filter(e => {
        const { loc: l } = getResolvedLoc(iso, si, e.id);
        return l === loc;
      });
    if (emps.length) {
      upcoming.push({ slot: TIMESLOTS[si], emps });
      if (upcoming.length >= 2) break;
    }
  }
  if (!upcoming.length) return '';
  return `<div class="live-next">
    <div class="live-next-title">Up next</div>
    ${upcoming.map(u => `
      <div class="live-next-slot">
        <span>${u.emps.map(e => escH(e.name.split(' ')[0])).join(', ')}</span>
        <span class="live-next-time">${u.slot.split('–')[0].trim()}</span>
      </div>`).join('')}
  </div>`;
}

// ── Live alerts (leave/swap banners) ──────────────────────────

function renderLiveAlerts() {
  const el  = document.getElementById('live-alert-area');
  if (!el) return;
  const iso = todayStr();
  let html  = '';

  (state.leaveRequests||[])
    .filter(l => l.status==='active' && iso>=l.from && iso<=l.to)
    .forEach(l => {
      const emp = state.employees.find(e => e.id===l.empId);
      if (!emp) return;
      html += `<div class="alert-banner leave">
        🔒 ${escH(emp.name)} is on
        <strong>${l.type||'annual'}</strong> leave today
      </div>`;
    });

  (state.swapRequests||[])
    .filter(s => s.status==='active' && s.fromDate===iso)
    .forEach(s => {
      const emp = state.employees.find(e => e.id===s.empId);
      if (!emp) return;
      html += `<div class="alert-banner swap">
        🔄 ${escH(emp.name)} swapped day off — working today
      </div>`;
    });

  el.innerHTML = html;
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
          ${vol.note
            ? `<span style="font-size:10px;color:var(--muted);margin-left:4px">
                ${escH(vol.note)}</span>`
            : ''}
        </div>`).join('')}
    </div>`;
}

// ── Toggle absent ─────────────────────────────────────────────

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
  if (state.mode === 'admin') renderGlobalAlerts();
}

// ── My Schedule ───────────────────────────────────────────────

function renderMySchedule() {
  const iso    = todayStr();
  const selEl  = document.getElementById('emp-selector');
  const bodyEl = document.getElementById('my-sched-body');
  const activeEmps = state.employees.filter(e => e.status === 'Active');

  if (selEl && !selEl.hasChildNodes()) {
    selEl.innerHTML = activeEmps.map(e =>
      `<button class="emp-pill" onclick="selectMyEmp('${e.id}',this)">
        ${escH(e.name)}</button>`
    ).join('');
  }

  const empId = selEl?.dataset.selected;
  if (!empId || !bodyEl) {
    if (bodyEl) bodyEl.innerHTML = `<div style="text-align:center;
      padding:32px;color:var(--muted);font-size:13px">
      Select your name above to see your schedule.</div>`;
    return;
  }

  const si   = currentSlotIdx();
  const emp  = state.employees.find(e => e.id === empId);
  const mon  = new Date(state.currentWeekMon+'T00:00:00');

  // Today card
  const curCard = document.getElementById('my-current-card');
  if (curCard) {
    if (isOnLeave(empId, iso)) {
      curCard.innerHTML = `<div class="my-day-block my-day-today">
        <div class="my-day-hdr">Today
          <span class="today-badge">TODAY</span>
          <span class="status-chip chip-leave">On Leave</span>
        </div>
      </div>`;
    } else if (isEmpDayOff(empId, iso)) {
      curCard.innerHTML = `<div class="my-day-block my-day-today">
        <div class="my-day-hdr">Today
          <span class="today-badge">TODAY</span>
          <span class="status-chip chip-dayoff">Day Off</span>
        </div>
      </div>`;
    } else {
      const { loc } = si >= 0 ? getResolvedLoc(iso, si, empId) : { loc: emp?.fallback||'off' };
      const color   = LOCCOLOR[loc] || 'var(--muted)';
      curCard.innerHTML = `<div class="my-day-block my-day-today"
        style="border-color:${color}">
        <div class="my-day-hdr" style="background:${color}11">
          <span>Today</span>
          <span class="today-badge" style="background:${color}">TODAY</span>
        </div>
        <div class="my-day-slots">
          ${TIMESLOTS.map((slot, i) => {
            const { loc: l } = getResolvedLoc(iso, i, empId);
            return `<div class="my-slot-row ${i===si?'my-slot-cur':''}
              ${l==='off'||l==='vac'?'my-slot-off':''}">
              <span class="my-slot-time">${slot}</span>
              <span class="my-slot-loc ${LOCCLS[l]||''}"
                style="background:${(LOCCOLOR[l]||'#ccc')}22;
                       color:${LOCCOLOR[l]||'var(--muted)'}">
                ${LOCLABEL[l]||l}
              </span>
              ${i===si
                ? '<span style="font-size:10px;font-weight:700;color:var(--accent)">▶ NOW</span>'
                : ''}
            </div>`;
          }).join('')}
        </div>
      </div>`;
    }
    curCard.classList.remove('hidden');
  }

  // Rest of week
  bodyEl.innerHTML = DAYSSHORT.map((dow, di) => {
    const d   = new Date(mon); d.setDate(d.getDate()+di);
    const diso = toDateStr(d);
    if (diso === iso) return ''; // already shown in curCard
    const holiday = getHolidayForDate(diso);
    const isDO    = isEmpDayOff(empId, diso);
    const onLeave = isOnLeave(empId, diso);

    return `<div class="my-day-block">
      <div class="my-day-hdr">
        ${DAYSFULL[di]} ${d.getDate()}
        ${holiday
          ? `<span class="holiday-mini-badge"
              style="background:${holiday.color}22;color:${holiday.color};
                     border-color:${holiday.color}55">
              ${holiday.emoji} ${escH(holiday.name)}</span>`
          : ''}
        ${isDO    ? '<span class="status-chip chip-dayoff" style="font-size:10px">Day Off</span>'  : ''}
        ${onLeave ? '<span class="status-chip chip-leave"  style="font-size:10px">On Leave</span>' : ''}
      </div>
      ${isDO || onLeave
        ? `<div class="my-day-off-block">
            ${isDO ? '😴 Day Off' : '🔒 On Leave'}</div>`
        : `<div class="my-day-slots">
            ${TIMESLOTS.map((slot, i) => {
              const { loc } = getResolvedLoc(diso, i, empId);
              return `<div class="my-slot-row
                ${loc==='off'||loc==='vac'?'my-slot-off':''}">
                <span class="my-slot-time">${slot}</span>
                <span class="my-slot-loc ${LOCCLS[loc]||''}"
                  style="background:${(LOCCOLOR[loc]||'#ccc')}22;
                         color:${LOCCOLOR[loc]||'var(--muted)'}">
                  ${LOCLABEL[loc]||loc}
                </span>
              </div>`;
            }).join('')}
          </div>`}
    </div>`;
  }).filter(Boolean).join('');
}

function selectMyEmp(empId, btn) {
  document.querySelectorAll('.emp-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('emp-selector').dataset.selected = empId;
  renderMySchedule();
}

// ── History today ─────────────────────────────────────────────

function renderHistoryToday() {
  const iso    = todayStr();
  const el     = document.getElementById('history-today');
  if (!el) return;
  const activeEmps = state.employees.filter(e => e.status === 'Active');

  el.innerHTML = TIMESLOTS.map((slot, si) => {
    const assignments = activeEmps
      .filter(e => !isEmpDayOff(e.id,iso) && !isOnLeave(e.id,iso))
      .map(e => ({ e, loc: getResolvedLoc(iso, si, e.id).loc }))
      .filter(x => x.loc !== 'off' && x.loc !== 'vac');

    return `<div class="hist-slot-row">
      <span class="hist-time">${slot}</span>
      <div class="hist-locs">
        ${assignments.map(({ e, loc }) =>
          `<span class="loc-select ${LOCCLS[loc]||''}"
            style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px">
            ${escH(e.name.split(' ')[0])}
          </span>`
        ).join('') || '<span style="color:var(--muted);font-size:12px">—</span>'}
      </div>
    </div>`;
  }).join('');
}

// ── Deep lookup ───────────────────────────────────────────────

function renderDeepLookup() {
  const iso = document.getElementById('lookup-date')?.value;
  const el  = document.getElementById('deep-lookup-result');
  if (!iso || !el) return;
  const activeEmps = state.employees.filter(e => e.status === 'Active');

  el.innerHTML = TIMESLOTS.map((slot, si) => {
    const assignments = activeEmps
      .map(e => ({ e, ...getResolvedLoc(iso, si, e.id) }))
      .filter(x => x.loc !== 'off' && x.loc !== 'vac');

    return `<div class="lookup-slot-row">
      <span class="hist-time">${slot}</span>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${assignments.map(({ e, loc }) =>
          `<span class="loc-select ${LOCCLS[loc]||''}"
            style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px">
            ${escH(e.name.split(' ')[0])}
          </span>`
        ).join('') || '<span style="color:var(--muted);font-size:12px">—</span>'}
      </div>
    </div>`;
  }).join('');
}

// ── Quick actions panel ───────────────────────────────────────

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
        ${activeEmps
          .filter(e => !isEmpDayOff(e.id,iso) && !isOnLeave(e.id,iso))
          .map(e => {
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
