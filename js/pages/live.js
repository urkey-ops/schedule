// ── pages/live.js ─────────────────────────────────────────────

function renderLiveBoard() {
  const iso = todayStr();
  const now = new Date();
  const mn  = nowMins();

  // Date label
  const dl = document.getElementById('live-date-label');
  if (dl) dl.textContent = now.toLocaleDateString('en-GB', {
    weekday:'long', day:'numeric', month:'long', year:'numeric',
  });

  // Holiday banner
  const hb = document.getElementById('live-holiday-banner');
  if (hb) {
    const holiday = getHolidayForDate(iso);
    if (holiday) {
      hb.innerHTML         = `${holiday.emoji} <strong>${escH(holiday.name)}</strong>`;
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

  // Group by current location using shift-based lookup
  const groups = {};
  ALLLOCS.forEach(loc => { groups[loc] = []; });

  activeEmps.forEach(e => {
    if (isEmpDayOff(e.id, iso) || isOnLeave(e.id, iso)) return;
    if (state.absences?.[iso]?.[e.id]) return;
    const loc = getEmpLocAtTime(iso, e.id, mn);
    if (loc === 'off' || loc === 'vac') return;
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
          <span class="live-slot-time">${minsToHHMM(mn)}</span>
        </div>
        <div class="live-card-body">
          ${groups[loc].map(e => {
            const absent = !!state.absences?.[iso]?.[e.id];
            return `<div class="live-emp-name">${escH(e.name)}</div>
              ${state.mode === 'admin'
                ? `<button class="present-toggle ${absent ? 'absent' : 'present'}"
                    onclick="toggleAbsent('${e.id}','${iso}')">
                    ${absent ? '✖ Mark Present' : '✔ Present'}
                  </button>`
                : ''}`;
          }).join('')}
          ${renderUpNext(loc, iso, mn)}
        </div>
      </div>`;
    }).join('')
    || `<div style="text-align:center;padding:32px;
        color:var(--muted);font-size:13px">No assignments for current time.</div>`;
}

function renderUpNext(loc, iso, currentMins) {
  // Find next shift at this location within 2 hours
  const shifts = getResolvedShifts(iso)
    .filter(s => s.loc === loc && s.start > currentMins && s.start <= currentMins + 120)
    .sort((a, b) => a.start - b.start)
    .slice(0, 2);

  if (!shifts.length) return '';

  return `<div class="live-next">
    <div class="live-next-title">Up next</div>
    ${shifts.map(s => {
      const emp = state.employees.find(e => e.id === s.empId);
      return `<div class="live-next-slot">
        <span>${emp ? escH(emp.name.split(' ')[0]) : '?'}</span>
        <span class="live-next-time">${minsToHHMM(s.start)}</span>
      </div>`;
    }).join('')}
  </div>`;
}

// ── Live alerts (leave banners) ───────────────────────────────

function renderLiveAlerts() {
  const el  = document.getElementById('live-alert-area');
  if (!el) return;
  const iso = todayStr();
  let html  = '';

  (state.leaveRequests || [])
    .filter(l => l.status === 'active' && iso >= l.from && iso <= l.to)
    .forEach(l => {
      const emp = state.employees.find(e => e.id === l.empId);
      if (!emp) return;
      html += `<div class="alert-banner leave">
        🔒 ${escH(emp.name)} is on <strong>${l.type || 'annual'}</strong> leave today
      </div>`;
    });

  el.innerHTML = html;
}

// ── Volunteers panel ──────────────────────────────────────────

function renderLiveVolunteers() {
  const el  = document.getElementById('live-volunteers');
  if (!el) return;
  const iso = todayStr();
  const vols = (state.volunteers || []).filter(vol =>
    state.volAvailability?.[vol.id]?.[iso] !== false
  );
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
  // Re-render grand view alert strip and now grid if visible
  if (document.getElementById('page-grand')?.classList.contains('active')) {
    renderGrandView();
  }
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

  const mn       = nowMins();
  const emp      = state.employees.find(e => e.id === empId);
  const curCard  = document.getElementById('my-current-card');
  const onLeave_ = isOnLeave(empId, iso);
  const isDayOff_= isEmpDayOff(empId, iso);

  // Current location card
  if (curCard) {
    if (onLeave_) {
      curCard.innerHTML = `<div class="my-loc-label">RIGHT NOW</div>
        <div class="my-loc-name">On Leave</div>`;
      curCard.style.background = 'var(--purple)';
    } else if (isDayOff_) {
      curCard.innerHTML = `<div class="my-loc-label">TODAY</div>
        <div class="my-loc-name">Day Off</div>`;
      curCard.style.background = 'var(--muted)';
    } else {
      const loc   = getEmpLocAtTime(iso, empId, mn);
      const color = LOCCOLOR[loc] || 'var(--accent)';
      curCard.style.background = color;
      curCard.innerHTML = `
        <div class="my-loc-label">RIGHT NOW</div>
        <div class="my-loc-name">${LOCLABEL[loc] || loc}</div>
        ${renderMyNextSlot(iso, empId, mn)}`;
    }
    curCard.classList.remove('hidden');
  }

  // Today's full shift list
  const todayShifts = getResolvedShifts(iso)
    .filter(s => s.empId === empId && s.loc !== 'off' && s.loc !== 'vac');

  // Rest of week
  const mon = new Date(state.currentWeekMon + 'T00:00:00');
  bodyEl.innerHTML = DAYSSHORT.map((dow, di) => {
    const d    = new Date(mon); d.setDate(d.getDate() + di);
    const diso = toDateStr(d);
    if (diso === iso) {
      // Today — show shift list
      if (isDayOff_) return `<div class="my-day-block my-day-today">
        <div class="my-day-hdr">Today — Day Off</div></div>`;
      if (onLeave_)  return `<div class="my-day-block my-day-today">
        <div class="my-day-hdr">Today — On Leave</div></div>`;
      return `<div class="my-day-block my-day-today">
        <div class="my-day-hdr">Today ${d.getDate()}</div>
        <div class="my-day-slots">
          ${todayShifts.map(s => {
            const isCur = s.start <= mn && s.end > mn;
            const color = LOCCOLOR[s.loc] || 'var(--accent)';
            return `<div class="my-slot-row ${isCur ? 'my-slot-cur' : ''}">
              <span class="my-slot-time">
                ${minsToHHMM(s.start)}–${minsToHHMM(s.end)}</span>
              <span class="my-slot-loc"
                style="background:${color}22;color:${color}">
                ${LOCLABEL[s.loc] || s.loc}
              </span>
              ${isCur ? '<span style="font-size:10px;font-weight:700;color:var(--accent)">▶ NOW</span>' : ''}
            </div>`;
          }).join('') || '<div style="color:var(--muted);font-size:12px;padding:8px 0">No shifts scheduled</div>'}
        </div>
      </div>`;
    }

    const holiday  = getHolidayForDate(diso);
    const isDO     = isEmpDayOff(empId, diso);
    const onLeave  = isOnLeave(empId, diso);
    const dayShifts = getResolvedShifts(diso)
      .filter(s => s.empId === empId && s.loc !== 'off' && s.loc !== 'vac');

    return `<div class="my-day-block">
      <div class="my-day-hdr">
        ${DAYSFULL[di]} ${d.getDate()}
        ${holiday
          ? `<span style="font-size:11px;font-weight:600;color:${holiday.color}">
              ${holiday.emoji} ${escH(holiday.name)}</span>`
          : ''}
        ${isDO    ? '<span class="status-chip chip-dayoff" style="font-size:10px">Day Off</span>'  : ''}
        ${onLeave ? '<span class="status-chip chip-leave"  style="font-size:10px">On Leave</span>' : ''}
      </div>
      ${isDO || onLeave
        ? `<div class="my-day-off-block">${isDO ? '😴 Day Off' : '🔒 On Leave'}</div>`
        : `<div class="my-day-slots">
            ${dayShifts.map(s => {
              const color = LOCCOLOR[s.loc] || 'var(--accent)';
              return `<div class="my-slot-row">
                <span class="my-slot-time">
                  ${minsToHHMM(s.start)}–${minsToHHMM(s.end)}</span>
                <span class="my-slot-loc"
                  style="background:${color}22;color:${color}">
                  ${LOCLABEL[s.loc] || s.loc}
                </span>
              </div>`;
            }).join('') || '<div style="color:var(--muted);font-size:12px;padding:8px 0">No shifts</div>'}
          </div>`}
    </div>`;
  }).join('');
}

function renderMyNextSlot(iso, empId, currentMins) {
  const next = getResolvedShifts(iso)
    .filter(s => s.empId === empId && s.start > currentMins)
    .sort((a, b) => a.start - b.start)[0];
  if (!next) return '<div class="my-loc-slot">No more shifts today</div>';
  return `<div class="my-loc-slot">
    Next: ${LOCLABEL[next.loc] || next.loc} at ${minsToHHMM(next.start)}
  </div>`;
}

function selectMyEmp(empId, btn) {
  document.querySelectorAll('.emp-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('emp-selector').dataset.selected = empId;
  renderMySchedule();
}
