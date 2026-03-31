// ── pages/grandview.js ────────────────────────────────────────
// Grand View: shared display for all staff.
// Shows right now — who is where, handovers coming up.
// Sub-tabs Timeline, Status, Lookup, Find Person removed.

let _grandRefTimer = null;

function stopGrandRefresh() {
  clearInterval(_grandRefTimer);
  _grandRefTimer = null;
}

function renderGrandView() {
  const now = new Date();
  const gc  = document.getElementById('grand-clock');
  const gd  = document.getElementById('grand-date');
  if (gc) gc.textContent =
    `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  if (gd) gd.textContent = now.toLocaleDateString('en-GB', {
    weekday:'long', day:'numeric', month:'long', year:'numeric',
  });

  renderGrandSummaryStrip();
  renderGrandAlertStrip();
  renderGrandNow();

  if (!_grandRefTimer) {
    _grandRefTimer = setInterval(() => {
      if (document.getElementById('page-grand')?.classList.contains('active')) {
        renderGrandView();
      } else {
        stopGrandRefresh();
      }
    }, 60000);
  }
}

// ── Summary strip ─────────────────────────────────────────────

function renderGrandSummaryStrip() {
  const el  = document.getElementById('grand-summary-strip');
  if (!el) return;
  const iso = todayStr();

  const activeEmps = state.employees.filter(e => e.status === 'Active');
  const onLeave    = activeEmps.filter(e => isOnLeave(e.id, iso)).length;
  const onDayOff   = activeEmps.filter(e => isEmpDayOff(e.id, iso)).length;
  const absent     = Object.keys(state.absences?.[iso] || {}).length;
  const working    = activeEmps.length - onLeave - onDayOff - absent;
  const gaps       = getDayGapCount(iso);

  el.innerHTML = `
    <div class="summary-chip chip-assigned">👥 ${working} working</div>
    ${onLeave  ? `<div class="summary-chip chip-leave">🔒 ${onLeave} on leave</div>` : ''}
    ${onDayOff ? `<div class="summary-chip chip-off">😴 ${onDayOff} day off</div>` : ''}
    ${absent   ? `<div class="summary-chip chip-absent">✖ ${absent} absent</div>` : ''}
    ${gaps     ? `<div class="summary-chip chip-gap">⚠️ ${gaps} gap${gaps > 1 ? 's' : ''}</div>` : ''}`;
}

// ── Admin alert strip (visible only in admin mode) ────────────

function renderGrandAlertStrip() {
  const el = document.getElementById('grand-alert-strip');
  if (!el) return;
  if (state.mode !== 'admin') { el.innerHTML = ''; return; }
  renderAlertsBar('grand-alert-strip', todayStr());
}

// ── Right Now grid ────────────────────────────────────────────

function renderGrandNow() {
  const el  = document.getElementById('grand-now-grid');
  const hs  = document.getElementById('grand-handover-strip');
  if (!el) return;

  const iso        = todayStr();
  const nowMn      = nowMins();
  const activeEmps = state.employees.filter(e => e.status === 'Active');

  // Early gate banner
  const earlyEmpId = state.earlyGate?.[iso];
  const earlyBanner = document.getElementById('grand-early-gate');
  if (earlyBanner) {
    const earlyEmp = earlyEmpId
      ? state.employees.find(e => e.id === earlyEmpId)
      : null;
    const isEarlyWindow = nowMn >= EARLY_GATE_START && nowMn < EARLY_GATE_END;
    if (earlyEmp && isEarlyWindow) {
      earlyBanner.innerHTML =
        `<div class="early-gate-strip">
          ⭐ Early Gate (06:00–09:00): <strong>${escH(earlyEmp.name)}</strong>
        </div>`;
    } else {
      earlyBanner.innerHTML = '';
    }
  }

  // Group employees by current location
  const groups = {};
  REQUIREDLOCS.forEach(loc => { groups[loc] = { emps: [], uncovered: false }; });

  activeEmps.forEach(e => {
    if (isEmpDayOff(e.id, iso) || isOnLeave(e.id, iso)) return;
    if (state.absences?.[iso]?.[e.id]) return;
    const loc = getEmpLocAtTime(iso, e.id, nowMn);
    if (loc === 'off' || loc === 'vac' || loc === 'lunch') return;
    if (!groups[loc]) groups[loc] = { emps: [], uncovered: false };
    groups[loc].emps.push(e);
  });

  REQUIREDLOCS.forEach(loc => {
    if (groups[loc]) groups[loc].uncovered = groups[loc].emps.length === 0;
  });

  // Detect upcoming handovers (next 30 mins)
  const handovers = [];
  activeEmps.forEach(e => {
    if (isEmpDayOff(e.id, iso) || isOnLeave(e.id, iso)) return;
    const curLoc  = getEmpLocAtTime(iso, e.id, nowMn);
    const nextLoc = getEmpLocAtTime(iso, e.id, nowMn + 30);
    if (curLoc !== nextLoc && curLoc !== 'off' && nextLoc !== 'off') {
      handovers.push({ emp: e, from: curLoc, to: nextLoc });
    }
  });

  // Also show non-required locations that have staff right now
  const extraLocs = new Set();
  activeEmps.forEach(e => {
    if (isEmpDayOff(e.id, iso) || isOnLeave(e.id, iso)) return;
    if (state.absences?.[iso]?.[e.id]) return;
    const loc = getEmpLocAtTime(iso, e.id, nowMn);
    if (!REQUIREDLOCS.includes(loc) && loc !== 'off' && loc !== 'vac' && loc !== 'lunch') {
      extraLocs.add(loc);
      if (!groups[loc]) groups[loc] = { emps: [], uncovered: false };
    }
  });
  activeEmps.forEach(e => {
    if (isEmpDayOff(e.id, iso) || isOnLeave(e.id, iso)) return;
    if (state.absences?.[iso]?.[e.id]) return;
    const loc = getEmpLocAtTime(iso, e.id, nowMn);
    if (extraLocs.has(loc)) groups[loc].emps.push(e);
  });

  // Holiday banner
  const holiday = getHolidayForDate(iso);
  const holidayHtml = holiday
    ? `<div class="grand-holiday-chip"
         style="background:${holiday.color}22;border-color:${holiday.color}55;
                color:${holiday.color};margin-bottom:12px">
         ${holiday.emoji} ${escH(holiday.name)}
       </div>`
    : '';

  const allLocs = [...REQUIREDLOCS, ...extraLocs];

  el.innerHTML = holidayHtml + allLocs.map(loc => {
    const { emps, uncovered } = groups[loc] || { emps: [], uncovered: true };
    const color = LOCCOLOR[loc] || '#888';
    const label = LOCLABEL[loc] || loc;

    // Up next
    const upNext = renderUpNextGrand(loc, iso, nowMn);

    return `<div class="grand-loc-card ${uncovered && REQUIREDLOCS.includes(loc) ? 'grand-loc-critical' : ''}">
      <div class="grand-loc-header" style="background:${uncovered && REQUIREDLOCS.includes(loc) ? 'var(--red)' : color}">
        <span class="grand-loc-name">${label}</span>
        <span class="grand-loc-count">${emps.length}</span>
      </div>
      <div class="grand-loc-body">
        ${uncovered && REQUIREDLOCS.includes(loc)
          ? `<div class="grand-empty-critical">⚠ Uncovered
              ${state.mode === 'admin'
                ? `<button class="btn btn-sm btn-warn"
                    style="margin-left:auto"
                    onclick="openFillGapModal('${iso}','${loc}',${nowMn},${nowMn + 60})">
                    Fill</button>`
                : ''}</div>`
          : emps.map(e => {
              const absent = !!state.absences?.[iso]?.[e.id];
              const isHO   = handovers.some(h => h.emp.id === e.id);
              return `<div class="grand-emp-chip">
                <div class="grand-emp-avatar"
                  style="background:${color}">${escH(e.name[0])}</div>
                <div>
                  <div class="grand-emp-name">${escH(e.name)}</div>
                  ${isHO ? '<div style="font-size:10px;color:var(--orange);font-weight:700">Handover soon</div>' : ''}
                  ${absent ? '<div style="font-size:10px;color:var(--red);font-weight:700">Marked absent</div>' : ''}
                </div>
                ${state.mode === 'admin'
                  ? `<button class="absent-toggle-sm ${absent ? 'is-absent' : ''}"
                       onclick="toggleAbsent('${e.id}','${iso}')"
                       title="${absent ? 'Mark Present' : 'Mark Absent'}">
                       ${absent ? '✖' : '✔'}
                     </button>`
                  : ''}
              </div>`;
            }).join('')}
        ${upNext}
      </div>
    </div>`;
  }).join('');

  // Handover strip
  if (hs) {
    hs.innerHTML = handovers.length
      ? `<div class="grand-handover-banner">
          <span class="handover-title">🔄 Handovers next 30 min</span>
          ${handovers.map(h =>
            `<div class="handover-chip">
              ${escH(h.emp.name.split(' ')[0])}
              <span class="handover-arrow">→</span>
              <span class="handover-loc">${LOCLABEL[h.to] || h.to}</span>
            </div>`
          ).join('')}
        </div>`
      : '';
  }

  // Off/leave row
  const offEmps = activeEmps.filter(e =>
    isOnLeave(e.id, iso) || isEmpDayOff(e.id, iso) ||
    state.absences?.[iso]?.[e.id]
  );
  if (offEmps.length) {
    el.innerHTML += `<div class="grand-off-row">
      ${offEmps.map(e => {
        const reason = isOnLeave(e.id, iso)  ? '🔒 Leave'
                     : isEmpDayOff(e.id, iso) ? '😴 Day Off'
                     : '✖ Absent';
        return `<div class="grand-off-chip">
          ${escH(e.name.split(' ')[0])}
          <span class="grand-off-reason">${reason}</span>
        </div>`;
      }).join('')}
    </div>`;
  }
}

function renderUpNextGrand(loc, iso, currentMins) {
  // Find next shift starting at this location within 2 hours
  const shifts = getResolvedShifts(iso)
    .filter(s => s.loc === loc && s.start > currentMins && s.start <= currentMins + 120)
    .sort((a, b) => a.start - b.start);

  if (!shifts.length) return '';
  const next = shifts[0];
  const emp  = state.employees.find(e => e.id === next.empId);
  if (!emp) return '';

  return `<div class="grand-next-label">
    Up next ${minsToHHMM(next.start)}: ${escH(emp.name.split(' ')[0])}
  </div>`;
}

function triggerPrint() { window.print(); }
