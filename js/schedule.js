// ── schedule.js ───────────────────────────────────────────────

// ── Constants ─────────────────────────────────────────────────
const LOC_CYCLE = ['gate','podium','mandir','field','giftshop','lunch','off'];

// ── Helpers ───────────────────────────────────────────────────

// FIX: calcScheduledHrsWeek is the CANONICAL single source of truth.
// It accepts an explicit weekMon string so callers from any context
// (adminhq, alerts, staff) can pass the correct week rather than
// relying on state.currentWeekMon, which may be stale on HQ page.
function calcScheduledHrsWeek(empId, weekMon) {
  const mon = weekMon || state.currentWeekMon;
  if (!mon) return 0;
  let hrs = 0;
  for (let i = 0; i < 7; i++) {
    const d   = new Date(mon + 'T00:00:00');
    d.setDate(d.getDate() + i);
    const iso = toDateStr(d);
    if (isEmpDayOff(empId, iso)) continue;
    if (isOnLeave(empId, iso))   continue;
    TIMESLOTS.forEach((_, si) => {
      const { loc } = getResolvedLoc(iso, si, empId);
      if (loc !== 'off' && loc !== 'vac') {
        // FIX: use SLOTHRS (now aliased as SLOTDURATION in constants.js)
        hrs += SLOTHRS[si] || 0;
      }
    });
  }
  return Math.round(hrs * 10) / 10;
}

// FIX: isEmpDayOff is the CANONICAL single source of truth.
// state.js previously had a duplicate that read from emp.daysOff differently.
// This version reads emp.daysOff (the field saved by saveEmployee) and
// unlocks the day if an active swap exists for that exact date.
function isEmpDayOff(empId, iso) {
  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return false;
  const d   = new Date(iso + 'T00:00:00');
  const dow = DAYSSHORT[(d.getDay() + 6) % 7];
  // FIX: only active swaps unlock a day-off
  const isSwap = (state.swapRequests || []).some(s =>
    s.empId === empId && s.fromDate === iso && s.status === 'active'
  );
  if (isSwap) return false;
  return (emp.daysOff || []).includes(dow);
}

function getResolvedLoc(iso, si, empId) {
  // 1. Explicit override
  const ovr = state.schedule?.[iso]?.[si]?.[empId];
  if (ovr) return { loc: ovr, source: 'override' };

  // 2. On leave → vac
  if (isOnLeave(empId, iso)) return { loc: 'vac', source: 'leave' };

  // 3. Absent → off marker
  if (state.absences?.[iso]?.[empId]) return { loc: 'off', source: 'absent' };

  // 4. Day off
  if (isEmpDayOff(empId, iso)) return { loc: 'off', source: 'dayoff' };

  // 5. Default schedule for DOW
  const d   = new Date(iso + 'T00:00:00');
  const dow = DAYSSHORT[(d.getDay() + 6) % 7];
  const def = state.defaultSchedule?.[dow]?.[si]?.[empId];
  if (def) return { loc: def, source: 'default' };

  // 6. Employee fallback
  const emp = state.employees.find(e => e.id === empId);
  return { loc: emp?.fallback || 'off', source: 'fallback' };
}

// ── Hours column render ───────────────────────────────────────
function renderHoursCol(iso, activeEmps) {
  const weekMon = getWeekMonStr(iso);
  const el      = document.getElementById('sched-hrs-row');
  if (!el) return;
  el.innerHTML  = activeEmps.map(emp => {
    const used  = calcScheduledHrsWeek(emp.id, weekMon);
    const cap   = emp.hourCap || DEFAULTHRSCAP;
    const pct   = Math.min((used/cap)*100, 100);
    const over  = used > cap;
    const warn  = !over && pct >= 80;
    const color = over ? '#dc2626' : warn ? '#d97706' : '#059669';
    return `<div class="sched-hrs-emp" title="${emp.name}: ${used.toFixed(1)}h / ${cap}h this week">
      <span style="font-size:11px;font-weight:700;color:var(--text)">
        ${emp.name.split(' ')[0]}
      </span>
      <div class="roster-hr-track" style="width:60px">
        <div class="roster-hr-fill"
          style="width:${pct}%;background:${color}"></div>
      </div>
      <span class="hrs-chip ${over?'hrs-over':warn?'hrs-warn':'hrs-ok'}">
        ${used.toFixed(1)}h
      </span>
    </div>`;
  }).join('');
}

// ── Coverage row ──────────────────────────────────────────────
function buildCoverageRow(iso, activeEmps) {
  return TIMESLOTS.map((_, si) => {
    const results = REQUIREDLOCS.map(req => {
      const covered = activeEmps.some(e => {
        if (isEmpDayOff(e.id, iso))        return false;
        if (isOnLeave(e.id, iso))          return false;
        if (state.absences?.[iso]?.[e.id]) return false;
        const { loc } = getResolvedLoc(iso, si, e.id);
        return loc === req;
      });
      return { req, covered };
    });
    const allOk = results.every(r => r.covered);
    return { si, results, allOk };
  });
}

// ── Cycle location on click ───────────────────────────────────
function cycleLocCell(iso, si, empId) {
  const emp     = state.employees.find(e => e.id === empId);
  const blocked = emp?.blocked || [];
  const { loc: curLoc } = getResolvedLoc(iso, si, empId);

  // Build available cycle — skip blocked locs
  const cycle = LOC_CYCLE.filter(l =>
    l === 'off' || l === 'lunch' || !blocked.includes(l)
  );

  const curIdx  = cycle.indexOf(curLoc);
  const nextLoc = cycle[(curIdx + 1) % cycle.length];

  // Save as override
  if (!state.schedule)          state.schedule          = {};
  if (!state.schedule[iso])     state.schedule[iso]     = {};
  if (!state.schedule[iso][si]) state.schedule[iso][si] = {};

  if (nextLoc === 'off') {
    // If cycling back to off — check if that's the fallback,
    // if so just clear the override
    const def   = state.defaultSchedule
      ?.[DAYSSHORT[(new Date(iso+'T00:00:00').getDay()+6)%7]]?.[si]?.[empId];
    const fb    = emp?.fallback || 'off';
    const would = def || fb;
    if (would === 'off') {
      delete state.schedule[iso][si][empId];
      if (!Object.keys(state.schedule[iso][si]).length)
        delete state.schedule[iso][si];
      if (!Object.keys(state.schedule[iso]).length)
        delete state.schedule[iso];
    } else {
      state.schedule[iso][si][empId] = 'off';
    }
  } else {
    state.schedule[iso][si][empId] = nextLoc;
  }

  persistAll('schedule');
  renderSchedule();
  renderAlertsBar('schedule-alerts-bar', iso);
  if (state.mode === 'admin') renderGlobalAlerts();
}

// ── Bulk fill row ─────────────────────────────────────────────
function bulkFillRow(empId, iso) {
  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return;

  // Pick most common non-off loc for this employee
  const locs   = TIMESLOTS.map((_, si) => {
    const { loc } = getResolvedLoc(iso, si, empId);
    return loc;
  }).filter(l => l !== 'off' && l !== 'vac');

  const freq   = {};
  locs.forEach(l => { freq[l] = (freq[l]||0)+1; });
  const topLoc = Object.keys(freq).sort((a,b) => freq[b]-freq[a])[0] || emp.fallback || 'gate';

  const loc = prompt(
    `Bulk fill all slots for ${emp.name} on ${fmtDate(iso)}.\nEnter location (gate/podium/mandir/field/giftshop/lunch/off):`,
    topLoc
  );
  if (!loc || !LOC_CYCLE.includes(loc)) {
    showToast('Invalid location — cancelled'); return;
  }

  if (!state.schedule)         state.schedule         = {};
  if (!state.schedule[iso])    state.schedule[iso]    = {};
  TIMESLOTS.forEach((_, si) => {
    if (!state.schedule[iso][si]) state.schedule[iso][si] = {};
    state.schedule[iso][si][empId] = loc;
  });

  persistAll('schedule');
  renderSchedule();
  showToast(`${emp.name} — all slots set to ${LOCLABEL[loc]||loc}`);
}

// ── Copy week ─────────────────────────────────────────────────
function copyWeekTo(targetWeekMon) {
  const srcMon = state.currentWeekMon;
  if (srcMon === targetWeekMon) {
    showToast('Source and target week are the same'); return;
  }
  if (!confirm(
    `Copy week of ${fmtDate(srcMon)} → week of ${fmtDate(targetWeekMon)}?\nExisting overrides in target will be replaced.`
  )) return;

  for (let i = 0; i < 7; i++) {
    const srcD = new Date(srcMon+'T00:00:00');
    srcD.setDate(srcD.getDate() + i);
    const srcIso = toDateStr(srcD);

    const tgtD = new Date(targetWeekMon+'T00:00:00');
    tgtD.setDate(tgtD.getDate() + i);
    const tgtIso = toDateStr(tgtD);

    if (state.schedule?.[srcIso]) {
      if (!state.schedule[tgtIso]) state.schedule[tgtIso] = {};
      TIMESLOTS.forEach((_, si) => {
        if (state.schedule[srcIso][si]) {
          state.schedule[tgtIso][si] = { ...state.schedule[srcIso][si] };
        }
      });
    }
  }

  persistAll('schedule');
  renderSchedule();
  showToast(`Week copied to ${fmtDate(targetWeekMon)}`);
}

// ── Apply default to day ──────────────────────────────────────
function applyDefaultToDay() {
  const iso = state.currentDateISO;
  const dow = DAYSSHORT[(new Date(iso+'T00:00:00').getDay()+6)%7];
  if (!confirm(`Apply default schedule to ${fmtDate(iso)} (${dow})?`)) return;

  const def = state.defaultSchedule?.[dow] || {};
  if (!state.schedule)        state.schedule        = {};
  if (!state.schedule[iso])   state.schedule[iso]   = {};

  TIMESLOTS.forEach((_, si) => {
    if (def[si]) {
      state.schedule[iso][si] = { ...def[si] };
    }
  });

  persistAll('schedule');
  renderSchedule();
  showToast('Default applied');
}

// ── Clear overrides for day ───────────────────────────────────
function clearOverridesForDay() {
  const iso = state.currentDateISO;
  if (!confirm(`Clear all overrides for ${fmtDate(iso)}?`)) return;
  pushUndo('Clear overrides', state);
  delete state.schedule?.[iso];
  persistAll('schedule');
  renderSchedule();
  showToast('Overrides cleared');
}

// ── Copy day to target ────────────────────────────────────────
function copyDayTo(targetIso) {
  const srcIso = state.currentDateISO;
  if (!state.schedule?.[srcIso]) {
    showToast('Nothing to copy — no overrides on this day'); return;
  }
  if (!confirm(`Copy ${fmtDate(srcIso)} → ${fmtDate(targetIso)}?`)) return;

  if (!state.schedule[targetIso]) state.schedule[targetIso] = {};
  TIMESLOTS.forEach((_, si) => {
    if (state.schedule[srcIso][si]) {
      state.schedule[targetIso][si] = { ...state.schedule[srcIso][si] };
    }
  });

  persistAll('schedule');
  renderSchedule();
  showToast(`Day copied to ${fmtDate(targetIso)}`);
}

// ── Render Weekly Schedule ────────────────────────────────────
function renderSchedule() {
  const iso        = state.currentDateISO;
  const activeEmps = state.employees.filter(e => e.status === 'Active');
  const thead      = document.getElementById('sched-head');
  const tbody      = document.getElementById('sched-body');
  if (!thead || !tbody) return;

  // Hours row
  renderHoursCol(iso, activeEmps);

  // Holiday banner
  const hb = document.getElementById('sched-holiday-banner');
  if (hb) {
    const holiday = getHolidayForDate(iso);
    if (holiday) {
      hb.innerHTML = `<div style="padding:8px 14px;background:${holiday.color}18;
        border:1.5px solid ${holiday.color}40;color:${holiday.color};
        border-radius:10px;font-size:13px;font-weight:600">
        ${holiday.emoji} <strong>${escH(holiday.name)}</strong>
      </div>`;
      hb.classList.remove('hidden');
    } else {
      hb.classList.add('hidden');
    }
  }

  // Schedule alerts
  renderSchedAlerts();

  // Coverage data
  const coverage = buildCoverageRow(iso, activeEmps);
  const hasAnyGap = coverage.some(c => !c.allOk);

  const coverageAlert = document.getElementById('coverage-alert');
  if (coverageAlert) {
    if (hasAnyGap) {
      const gapCount = coverage.filter(c => !c.allOk).length;
      coverageAlert.textContent =
        `⚠️ ${gapCount} time slot${gapCount>1?'s have':' has'} uncovered required location${gapCount>1?'s':''}`;
      coverageAlert.classList.remove('hidden');
    } else {
      coverageAlert.classList.add('hidden');
    }
  }

  if (!activeEmps.length) {
    thead.innerHTML = '';
    tbody.innerHTML = `<tr><td colspan="3"
      style="text-align:center;padding:24px;color:var(--muted)">
      No active employees.</td></tr>`;
    return;
  }

  // ── Header row ────────────────────────────────────────────
  thead.innerHTML = `<tr>
    <th class="sticky-col"
      style="min-width:90px;font-size:11px;text-align:left;padding:8px 12px">
      Time Slot
    </th>
    ${activeEmps.map(emp => {
      const isDayOff_ = isEmpDayOff(emp.id, iso);
      const onLeave_  = isOnLeave(emp.id, iso);
      const absent_   = !!state.absences?.[iso]?.[emp.id];
      let badge = '';
      if (absent_)     badge = `<span class="sched-emp-badge badge-absent">Absent</span>`;
      else if (onLeave_) badge = `<span class="sched-emp-badge badge-leave">Leave</span>`;
      else if (isDayOff_)badge = `<span class="sched-emp-badge badge-dayoff">Day Off</span>`;

      return `<th style="min-width:110px;text-align:center;padding:6px 8px">
        <div style="font-size:12px;font-weight:700;color:var(--text);
                    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
                    max-width:110px" title="${escH(emp.name)}">
          ${escH(emp.name.split(' ')[0])}
        </div>
        ${badge}
        ${state.mode === 'admin'
          ? `<div style="display:flex;gap:3px;justify-content:center;margin-top:4px">
              <button class="btn btn-sm btn-ghost"
                style="font-size:9px;padding:2px 5px"
                onclick="bulkFillRow('${emp.id}','${iso}')"
                title="Bulk fill all slots">▦</button>
            </div>` : ''}
      </th>`;
    }).join('')}
    <th class="hrs-col" style="font-size:11px;text-align:center;padding:6px 8px">
      Hrs
    </th>
  </tr>`;

  // ── Body rows ─────────────────────────────────────────────
  const now     = new Date();
  const nowMins = now.getHours()*60 + now.getMinutes();
  const todayIso = todayStr();

  tbody.innerHTML = TIMESLOTS.map((slot, si) => {
    const cov       = coverage[si];
    const isPast    = iso === todayIso && SLOTEND[si]*60 < nowMins;
    const isCurrent = iso === todayIso && currentSlotIdx() === si;
    const rowClass  = [
      isPast    ? 'row-past'    : '',
      isCurrent ? 'row-current' : '',
      !cov.allOk ? 'row-has-gap' : '',
    ].filter(Boolean).join(' ');

    // Per-slot hours total (active emps on this slot, not off)
    const slotOnCount = activeEmps.filter(e => {
      if (isEmpDayOff(e.id, iso))        return false;
      if (isOnLeave(e.id, iso))          return false;
      if (state.absences?.[iso]?.[e.id]) return false;
      const { loc } = getResolvedLoc(iso, si, e.id);
      return loc !== 'off' && loc !== 'vac';
    }).length;

    return `<tr class="${rowClass}">
      <td class="sticky-col"
        style="font-size:11px;color:var(--muted);white-space:nowrap;
               padding:6px 12px;vertical-align:middle">
        <div style="font-weight:600;color:var(--text)">${slot}</div>
        <div style="display:flex;gap:4px;margin-top:3px;flex-wrap:wrap">
          ${cov.results.map(r =>
            `<span style="font-size:9px;font-weight:700;padding:1px 4px;
              border-radius:3px;background:${r.covered?'#dcfce7':'#fee2e2'};
              color:${r.covered?'#166534':'#991b1b'}">
              ${r.covered?'✔':'✖'} ${LOCLABEL[r.req]||r.req}
            </span>`).join('')}
        </div>
        ${isCurrent
          ? `<div style="font-size:9px;color:var(--primary);
                         font-weight:700;margin-top:2px">▶ NOW</div>` : ''}
      </td>
      ${activeEmps.map(emp => {
        const isDayOff_ = isEmpDayOff(emp.id, iso);
        const onLeave_  = isOnLeave(emp.id, iso);
        const absent_   = !!state.absences?.[iso]?.[emp.id];
        const { loc, source } = getResolvedLoc(iso, si, emp.id);
        const isOvr     = source === 'override';
        const isLeave   = source === 'leave';
        const isAbsent  = source === 'absent';
        const isDO      = source === 'dayoff';

        // Cell classes
        const cellClass = [
          'sched-cell',
          isOvr    ? 'cell-override'  : '',
          isLeave  ? 'cell-leave'     : '',
          isAbsent ? 'cell-absent'    : '',
          isDO     ? 'cell-dayoff'    : '',
        ].filter(Boolean).join(' ');

        // If day off / leave / absent — show locked cell
        if ((isDayOff_ && !isAbsent) || onLeave_) {
          return `<td class="${cellClass}"
            style="text-align:center;padding:4px;
                   background:repeating-linear-gradient(
                     45deg,var(--surface2),var(--surface2) 4px,
                     var(--surface) 4px,var(--surface) 10px)">
            <span style="font-size:10px;font-weight:600;
              color:${onLeave_?'var(--purple)':'var(--muted)'}">
              ${onLeave_?'🔒 Leave':'—'}
            </span>
          </td>`;
        }

        // Admin: click to cycle, dropdown on right-click
        if (state.mode === 'admin') {
          return `<td class="${cellClass}"
            style="text-align:center;padding:4px;cursor:pointer;
                   position:relative;
                   ${isOvr?'border-left:2px solid var(--orange)':''}"
            onclick="cycleLocCell('${iso}',${si},'${emp.id}')"
            oncontextmenu="openCellDropdown(event,'${iso}',${si},'${emp.id}');return false;"
            title="Click to cycle · Right-click for full list">
            <span class="loc-select ${LOCCLS[loc]||''}"
              style="pointer-events:none;display:inline-block;
                     padding:3px 7px;font-size:11px;font-weight:700;
                     border-radius:5px;white-space:nowrap">
              ${LOCLABEL[loc]||loc}
            </span>
            ${isOvr
              ? `<span style="position:absolute;top:2px;right:2px;
                              font-size:8px;color:var(--orange);
                              font-weight:700;line-height:1">✎</span>` : ''}
            ${absent_
              ? `<span style="position:absolute;bottom:2px;left:2px;
                              font-size:8px;color:var(--red);
                              font-weight:700">✖</span>` : ''}
          </td>`;
        }

        // View mode: read only
        return `<td class="${cellClass}"
          style="text-align:center;padding:4px">
          <span class="loc-select ${LOCCLS[loc]||''}"
            style="display:inline-block;padding:3px 7px;
                   font-size:11px;font-weight:700;
                   border-radius:5px;white-space:nowrap">
            ${LOCLABEL[loc]||loc}
          </span>
        </td>`;
      }).join('')}
      <td class="hrs-col"
        style="text-align:center;padding:4px;font-size:11px;
               font-weight:700;color:var(--muted)">
        ${slotOnCount}
      </td>
    </tr>`;
  }).join('') +

  // ── Coverage summary row ──
  `<tr class="coverage-summary-row">
    <td class="sticky-col"
      style="font-size:10px;font-weight:700;color:var(--muted);
             padding:6px 12px;background:var(--surface2)">
      COVERAGE
    </td>
    ${activeEmps.map(emp => {
      // How many slots is this emp active today?
      const activeSlots = TIMESLOTS.filter((_, si) => {
        if (isEmpDayOff(emp.id, iso)) return false;
        if (isOnLeave(emp.id, iso))   return false;
        const { loc } = getResolvedLoc(iso, si, emp.id);
        return loc !== 'off' && loc !== 'vac';
      }).length;
      return `<td style="text-align:center;padding:4px;
                         background:var(--surface2);font-size:10px;
                         font-weight:700;color:var(--muted)">
        ${activeSlots > 0
          ? `<span style="color:#059669">${activeSlots} slots</span>`
          : `<span style="color:var(--subtle)">—</span>`}
      </td>`;
    }).join('')}
    <td class="hrs-col"
      style="background:var(--surface2);text-align:center;
             padding:4px;font-size:10px;font-weight:700;color:var(--muted)">
      ${activeEmps.reduce((acc, emp) => {
        if (isEmpDayOff(emp.id, iso)) return acc;
        if (isOnLeave(emp.id, iso))   return acc;
        return acc + TIMESLOTS.filter((_, si) => {
          const { loc } = getResolvedLoc(iso, si, emp.id);
          return loc !== 'off' && loc !== 'vac';
        }).length;
      }, 0)} total
    </td>
  </tr>`;
}

// ── Context menu dropdown (right-click on cell) ───────────────
let _ctxMenu = null;

function openCellDropdown(e, iso, si, empId) {
  closeCellDropdown();
  const emp      = state.employees.find(emp => emp.id === empId);
  const blocked  = emp?.blocked || [];
  const { loc: curLoc } = getResolvedLoc(iso, si, empId);

  const menu = document.createElement('div');
  menu.id    = 'ctx-menu';
  menu.style.cssText = `
    position:fixed;
    top:${Math.min(e.clientY, window.innerHeight-240)}px;
    left:${Math.min(e.clientX, window.innerWidth-160)}px;
    background:var(--surface);
    border:1.5px solid var(--border2);
    border-radius:10px;
    box-shadow:0 8px 32px rgba(0,0,0,0.18);
    z-index:9999;
    min-width:150px;
    overflow:hidden;
    animation:slideDown 0.12s ease;
  `;

  const locs    = ALLLOCS || LOC_CYCLE;
  const { source } = getResolvedLoc(iso, si, empId);
  const hasOvr  = source === 'override';

  menu.innerHTML = `
    <div style="padding:8px 12px;background:var(--surface2);
                border-bottom:1px solid var(--border);
                font-size:11px;font-weight:700;color:var(--muted)">
      ${emp?.name.split(' ')[0]} · ${TIMESLOTS[si]}
    </div>
    ${locs.map(loc => {
      const isBlocked = blocked.includes(loc);
      const isCur     = loc === curLoc;
      return `<div class="ctx-menu-item ${isCur?'ctx-active':''} ${isBlocked?'ctx-blocked':''}"
        onclick="${isBlocked?'':` setCellLoc('${iso}',${si},'${empId}','${loc}');closeCellDropdown()`}"
        style="padding:8px 14px;cursor:${isBlocked?'not-allowed':'pointer'};
               font-size:12px;font-weight:${isCur?'700':'500'};
               background:${isCur?'var(--surface2)':'transparent'};
               color:${isBlocked?'var(--subtle)':LOCCOLOR[loc]||'var(--text)'};
               display:flex;align-items:center;gap:8px;
               border-bottom:1px solid var(--border)">
        <span class="loc-dot"
          style="width:8px;height:8px;border-radius:50%;flex-shrink:0;
                 background:${LOCCOLOR[loc]||'var(--border2)'}"></span>
        ${LOCLABEL[loc]||loc}
        ${isCur ? '<span style="margin-left:auto;font-size:10px">✔</span>' : ''}
        ${isBlocked ? '<span style="margin-left:auto;font-size:9px">blocked</span>' : ''}
      </div>`;
    }).join('')}
    ${hasOvr
      ? `<div class="ctx-menu-item"
          onclick="clearSingleOverride('${iso}',${si},'${empId}');closeCellDropdown()"
          style="padding:8px 14px;cursor:pointer;font-size:12px;
                 font-weight:600;color:var(--orange);
                 display:flex;align-items:center;gap:8px">
          ↩ Clear Override
        </div>` : ''}
  `;

  document.body.appendChild(menu);
  _ctxMenu = menu;

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', closeCellDropdown, { once:true });
  }, 50);
}

function closeCellDropdown() {
  if (_ctxMenu) { _ctxMenu.remove(); _ctxMenu = null; }
}

function setCellLoc(iso, si, empId, loc) {
  if (!state.schedule)          state.schedule          = {};
  if (!state.schedule[iso])     state.schedule[iso]     = {};
  if (!state.schedule[iso][si]) state.schedule[iso][si] = {};
  state.schedule[iso][si][empId] = loc;
  persistAll('schedule');
  renderSchedule();
  renderAlertsBar('schedule-alerts-bar', iso);
  if (state.mode === 'admin') renderGlobalAlerts();
}

// ── Range fill helpers ────────────────────────────────────────
function renderRangeFill(mode) {
  return `<div class="range-fill-bar">
    <span style="font-size:11px;font-weight:700;color:var(--muted)">
      Range fill
    </span>
    <select id="rf-emp-${mode}"
      style="padding:5px 8px;border-radius:7px;font-size:12px;
             border:1.5px solid var(--border2);background:var(--surface)">
      <option value="">Select employee…</option>
      ${state.employees.filter(e=>e.status==='Active').map(e=>
        `<option value="${e.id}">${escH(e.name)}</option>`).join('')}
    </select>
    <select id="rf-loc-${mode}"
      style="padding:5px 8px;border-radius:7px;font-size:12px;
             border:1.5px solid var(--border2);background:var(--surface)">
      ${LOC_CYCLE.map(l =>
        `<option value="${l}">${LOCLABEL[l]||l}</option>`).join('')}
    </select>
    <select id="rf-from-${mode}"
      style="padding:5px 8px;border-radius:7px;font-size:12px;
             border:1.5px solid var(--border2);background:var(--surface)">
      ${TIMESLOTS.map((s,i)=>
        `<option value="${i}">${s}</option>`).join('')}
    </select>
    <span style="font-size:11px;color:var(--muted)">to</span>
    <select id="rf-to-${mode}"
      style="padding:5px 8px;border-radius:7px;font-size:12px;
             border:1.5px solid var(--border2);background:var(--surface)">
      ${TIMESLOTS.map((s,i)=>
        `<option value="${i}" ${i===TIMESLOTS.length-1?'selected':''}>
          ${s}</option>`).join('')}
    </select>
    <button class="btn btn-sm btn-primary"
      onclick="applyRangeFill('${mode}')">Apply</button>
  </div>`;
}

function applyRangeFill(mode) {
  const empId  = document.getElementById(`rf-emp-${mode}`)?.value;
  const loc    = document.getElementById(`rf-loc-${mode}`)?.value;
  const from   = parseInt(document.getElementById(`rf-from-${mode}`)?.value);
  const to     = parseInt(document.getElementById(`rf-to-${mode}`)?.value);
  if (!empId || !loc) { showToast('Select employee and location'); return; }
  if (from > to)      { showToast('From slot must be ≤ To slot');  return; }

  if (mode === 'weekly') {
    const iso = state.currentDateISO;
    if (!state.schedule)        state.schedule        = {};
    if (!state.schedule[iso])   state.schedule[iso]   = {};
    for (let si = from; si <= to; si++) {
      if (!state.schedule[iso][si]) state.schedule[iso][si] = {};
      state.schedule[iso][si][empId] = loc;
    }
    persistAll('schedule');
    renderSchedule();
    showToast('Range filled');
  } else {
    const dow = state.currentDow;
    if (!state.defaultSchedule)       state.defaultSchedule       = {};
    if (!state.defaultSchedule[dow])  state.defaultSchedule[dow]  = {};
    for (let si = from; si <= to; si++) {
      if (!state.defaultSchedule[dow][si])
        state.defaultSchedule[dow][si] = {};
      state.defaultSchedule[dow][si][empId] = loc;
    }
    persistAll('defaultSchedule');
    renderDefaultSchedule();
    showToast('Range filled (default)');
  }
}

// ── Default schedule ──────────────────────────────────────────
function renderDefaultSchedule() {
  const dow        = state.currentDow;
  const activeEmps = state.employees.filter(e => e.status === 'Active');
  const thead      = document.getElementById('default-head');
  const tbody      = document.getElementById('default-body');
  if (!thead || !tbody) return;

  if (!activeEmps.length) {
    thead.innerHTML = '';
    tbody.innerHTML = `<tr><td colspan="2"
      style="text-align:center;padding:24px;color:var(--muted)">
      No active employees.</td></tr>`;
    return;
  }

  thead.innerHTML = `<tr>
    <th class="sticky-col"
      style="min-width:90px;font-size:11px;text-align:left;padding:8px 12px">
      Time Slot
    </th>
    ${activeEmps.map(emp => {
      const isDO = (emp.daysOff||[]).includes(dow);
      return `<th style="min-width:110px;text-align:center;padding:6px 8px">
        <div style="font-size:12px;font-weight:700;color:${isDO?'var(--muted)':'var(--text)'}">
          ${escH(emp.name.split(' ')[0])}
        </div>
        ${isDO
          ? `<span class="sched-emp-badge badge-dayoff">Day Off</span>` : ''}
      </th>`;
    }).join('')}
    <th class="hrs-col"
      style="font-size:11px;text-align:center;padding:6px 8px">Slots</th>
  </tr>`;

  tbody.innerHTML = TIMESLOTS.map((slot, si) => {
    const slotCount = activeEmps.filter(e => {
      if ((e.daysOff||[]).includes(dow)) return false;
      const def = state.defaultSchedule?.[dow]?.[si]?.[e.id];
      const loc = def || e.fallback || 'off';
      return loc !== 'off';
    }).length;

    return `<tr>
      <td class="sticky-col"
        style="font-size:11px;color:var(--muted);padding:6px 12px;
               white-space:nowrap">
        <span style="font-weight:600;color:var(--text)">${slot}</span>
      </td>
      ${activeEmps.map(emp => {
        const isDO  = (emp.daysOff||[]).includes(dow);
        const def   = state.defaultSchedule?.[dow]?.[si]?.[emp.id];
        const loc   = def || emp.fallback || 'off';
        const isSet = !!def;

        if (isDO) {
          return `<td style="text-align:center;padding:4px;
            background:repeating-linear-gradient(
              45deg,var(--surface2),var(--surface2) 4px,
              var(--surface) 4px,var(--surface) 10px)">
            <span style="font-size:10px;color:var(--muted);font-weight:600">—</span>
          </td>`;
        }

        if (state.mode === 'admin') {
          return `<td style="text-align:center;padding:4px;
            ${isSet?'border-left:2px solid var(--orange)':''}">
            <select class="loc-select ${LOCCLS[loc]||''}"
              onchange="saveDefaultCell('${dow}',${si},'${emp.id}',this.value)"
              style="font-size:11px;font-weight:700;
                     border:1.5px solid ${isSet?'var(--orange)':'var(--border2)'};
                     border-radius:5px;padding:3px 4px;
                     background:var(--surface);cursor:pointer">
              ${ALLLOCS.map(l =>
                `<option value="${l}" ${loc===l?'selected':''}>
                  ${LOCLABEL[l]||l}</option>`).join('')}
            </select>
          </td>`;
        }

        return `<td style="text-align:center;padding:4px">
          <span class="loc-select ${LOCCLS[loc]||''}"
            style="display:inline-block;padding:3px 7px;
                   font-size:11px;font-weight:700;border-radius:5px">
            ${LOCLABEL[loc]||loc}
          </span>
        </td>`;
      }).join('')}
      <td class="hrs-col"
        style="text-align:center;padding:4px;font-size:11px;
               font-weight:700;color:var(--muted)">
        ${slotCount}
      </td>
    </tr>`;
  }).join('');
}

function saveDefaultCell(dow, si, empId, loc) {
  if (!state.defaultSchedule)          state.defaultSchedule          = {};
  if (!state.defaultSchedule[dow])     state.defaultSchedule[dow]     = {};
  if (!state.defaultSchedule[dow][si]) state.defaultSchedule[dow][si] = {};
  state.defaultSchedule[dow][si][empId] = loc;
  persistAll('defaultSchedule');
}

function saveDefault() {
  persistAll('defaultSchedule');
  renderAll();
  showToast('Default schedule saved');
}

// ── Suggest coverage ──────────────────────────────────────────
function renderSuggestArea() {
  const el  = document.getElementById('suggest-area');
  if (!el || state.mode !== 'admin') return;

  const iso        = state.currentDateISO;
  const activeEmps = state.employees.filter(e => e.status === 'Active');
  const gaps       = [];

  TIMESLOTS.forEach((slot, si) => {
    REQUIREDLOCS.forEach(req => {
      const covered = activeEmps.some(e => {
        if (isEmpDayOff(e.id, iso))        return false;
        if (isOnLeave(e.id, iso))          return false;
        if (state.absences?.[iso]?.[e.id]) return false;
        const { loc } = getResolvedLoc(iso, si, e.id);
        return loc === req;
      });
      if (!covered) gaps.push({ si, slot, req });
    });
  });

  if (!gaps.length) { el.innerHTML = ''; return; }

  el.innerHTML = `<div class="card" style="border:1.5px solid #fca5a5">
    <div style="padding:10px 14px;background:#fee2e2;
                border-bottom:1px solid #fca5a5;
                font-size:12px;font-weight:700;color:#991b1b">
      🚨 ${gaps.length} coverage gap${gaps.length>1?'s':''} on ${fmtDate(iso)}
    </div>
    <div style="padding:10px 14px;display:flex;flex-direction:column;gap:6px">
      ${gaps.map(g =>
        `<div style="display:flex;align-items:center;gap:10px;
                     padding:6px 8px;background:var(--surface2);
                     border-radius:8px;font-size:12px">
          <span style="color:#991b1b;font-weight:700">✖</span>
          <span style="flex:1;font-weight:600">
            ${LOCLABEL[g.req]} uncovered — ${g.slot}
          </span>
          <button class="btn btn-sm btn-primary"
            onclick="openFillGapWizard('${g.req}',${g.si},'${iso}')">
            Fill Gap
          </button>
        </div>`).join('')}
    </div>
  </div>`;
}
