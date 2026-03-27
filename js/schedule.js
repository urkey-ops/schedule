// ── schedule.js ───────────────────────────────────────────────

let density = 'normal';

// ── Helpers ───────────────────────────────────────────────────
function getWeekMonday(d) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  c.setDate(c.getDate() - ((c.getDay() + 6) % 7));
  return c;
}

function nowMins() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

function currentSlotIdx() {
  const nm = nowMins();
  return SLOTSTART.findIndex((s, i) => nm >= s * 60 && nm < SLOTEND[i] * 60);
}

function formatWeekLabel(monday) {
  return monday.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}

// ── Resolved location ─────────────────────────────────────────
function getResolvedLoc(iso, slotIdx, empId) {
  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return { loc: 'off', source: 'fallback' };

  // Regular day off — hard OFF unless swapped
  if (isEmpDayOff(empId, iso)) return { loc: 'off', source: 'dayoff' };

  // Absence
  if (state.absences?.[iso]?.[empId]) return { loc: 'off', source: 'absent' };

  // Active leave
  if (isOnLeave(empId, iso)) return { loc: 'vac', source: 'leave' };

  // Weekly override
  const ovr = state.schedule?.[iso]?.[slotIdx]?.[empId];
  if (ovr !== undefined) return { loc: ovr, source: 'override' };

  // Default schedule
  const dow = DAYSSHORT[(new Date(iso + 'T00:00:00').getDay() + 6) % 7];
  const def = state.defaultSchedule?.[dow]?.[slotIdx]?.[empId];
  if (def !== undefined) return { loc: def, source: 'default' };

  // Fallback
  const fb = emp.fallback ? emp.fallback.toLowerCase().replace(/\s+/g, '') : 'field';
  return { loc: fb, source: 'fallback' };
}

function isOverrideSet(iso, slotIdx, empId) {
  return state.schedule?.[iso]?.[slotIdx]?.[empId] !== undefined;
}

// ── Hours calc (single source of truth now in state.js) ───────
// calcScheduledHrsWeek is defined in state.js — do NOT redefine here

function hrsChipHtml(empId) {
  const hrs = calcScheduledHrsWeek(empId);
  const cap = getEmpHourCap(empId);
  const cls = hrs > cap ? 'hrs-over' : hrs >= cap - 5 ? 'hrs-ok' : 'hrs-under';
  return `<span class="hrs-chip ${cls}" title="${hrs}h scheduled / ${cap}h cap">${hrs}/${cap}h</span>`;
}

// ── Range Fill ────────────────────────────────────────────────
function renderRangeFill(mode) {
  const activeEmps = state.employees.filter(e => e.status === 'Active');
  const empOptions = activeEmps.map(e =>
    `<option value="${e.id}">${escH(e.name)}</option>`
  ).join('');
  const locOptions = LOCOPTIONS.filter(l => !['vac','off'].includes(l.val)).map(l =>
    `<option value="${l.val}">${l.label}</option>`
  ).join('');
  const timeOptions = TIMESLOTS.map((t, i) =>
    `<option value="${i}">${t}</option>`
  ).join('');

  return `<div class="range-fill-bar">
    <span class="range-fill-label">Quick Fill</span>
    <select id="rf-emp-${mode}" style="flex:2;min-width:120px">${empOptions}</select>
    <select id="rf-loc-${mode}" style="flex:1;min-width:100px">${locOptions}</select>
    <span style="font-size:11px;color:var(--muted);white-space:nowrap">From</span>
    <select id="rf-from-${mode}" style="flex:1;min-width:110px">${timeOptions}</select>
    <span style="font-size:11px;color:var(--muted);white-space:nowrap">To</span>
    <select id="rf-to-${mode}" style="flex:1;min-width:110px">${timeOptions}</select>
    <button class="btn btn-warn btn-sm" onclick="applyRangeFill('${mode}')">Apply</button>
    <button class="btn btn-ghost btn-sm" onclick="clearRangeFill('${mode}')">Clear Range</button>
  </div>`;
}

function applyRangeFill(mode) {
  const empId = document.getElementById(`rf-emp-${mode}`).value;
  const loc   = document.getElementById(`rf-loc-${mode}`).value;
  const from  = parseInt(document.getElementById(`rf-from-${mode}`).value);
  const to    = parseInt(document.getElementById(`rf-to-${mode}`).value);

  if (from >= to) { alert('From time must be before To time.'); return; }

  pushUndo('Range fill', state);

  if (mode === 'weekly') {
    const iso = state.currentDateISO;
    if (isOnLeave(empId, iso)) {
      if (!confirm('This employee is on leave for this date. Apply anyway?')) return;
    }
    if (isEmpDayOff(empId, iso)) {
      if (!confirm('This is their regular day off. Override and apply?')) return;
    }
    if (!state.schedule)       state.schedule       = {};
    if (!state.schedule[iso])  state.schedule[iso]  = {};
    for (let si = from; si < to; si++) {
      if (!state.schedule[iso][si]) state.schedule[iso][si] = {};
      state.schedule[iso][si][empId] = loc;
    }
    persistAll('schedule');
    renderSchedule();
    showToast(`Filled ${TIMESLOTS[from]} – ${TIMESLOTS[to]}`);
  }

  if (mode === 'default') {
    const dow = state.currentDow;
    if (!state.defaultSchedule)       state.defaultSchedule       = {};
    if (!state.defaultSchedule[dow])  state.defaultSchedule[dow]  = {};
    for (let si = from; si < to; si++) {
      if (!state.defaultSchedule[dow][si]) state.defaultSchedule[dow][si] = {};
      state.defaultSchedule[dow][si][empId] = loc;
    }
    persistAll('defaultSchedule');
    renderDefaultSchedule();
    showToast(`Default filled ${TIMESLOTS[from]} – ${TIMESLOTS[to]}`);
  }
}

function clearRangeFill(mode) {
  const empId = document.getElementById(`rf-emp-${mode}`).value;
  const from  = parseInt(document.getElementById(`rf-from-${mode}`).value);
  const to    = parseInt(document.getElementById(`rf-to-${mode}`).value);

  pushUndo('Clear range', state);

  if (mode === 'weekly') {
    const iso = state.currentDateISO;
    for (let si = from; si < to; si++) {
      if (state.schedule?.[iso]?.[si]) delete state.schedule[iso][si][empId];
    }
    persistAll('schedule');
    renderSchedule();
  }

  if (mode === 'default') {
    const dow = state.currentDow;
    for (let si = from; si < to; si++) {
      if (state.defaultSchedule?.[dow]?.[si]) delete state.defaultSchedule[dow][si][empId];
    }
    persistAll('defaultSchedule');
    renderDefaultSchedule();
  }

  showToast('Range cleared');
}

// ── Weekly Schedule ───────────────────────────────────────────
function renderSchedule() {
  const iso        = state.currentDateISO;
  const activeEmps = state.employees.filter(e => e.status === 'Active');
  const thead      = document.getElementById('sched-head');
  const tbody      = document.getElementById('sched-body');
  if (!thead || !tbody) return;

  // Hours chips row
  const hrsRow = document.getElementById('sched-hrs-row');
  if (hrsRow) {
    hrsRow.innerHTML = `<div style="display:flex;gap:8px;flex-wrap:wrap;padding:8px 14px;border-bottom:1px solid var(--border);background:var(--surface2)">
      ${activeEmps.map(e =>
        `<div style="display:flex;align-items:center;gap:5px">
          <span style="font-size:11px;font-weight:600;color:var(--muted)">${escH(e.name.split(' ')[0])}</span>
          ${hrsChipHtml(e.id)}
        </div>`
      ).join('')}
    </div>`;
  }

  thead.innerHTML = `<tr>
    <th style="min-width:110px;text-align:right">Time</th>
    ${activeEmps.map(e => {
      const isDayOff = isEmpDayOff(e.id, iso);
      return `<th title="${escH(e.name)}" class="${isDayOff ? 'dayoff-col' : ''}">
        ${escH(e.name.split(' ')[0])}
        ${isDayOff ? `<br><span style="font-size:8px;color:var(--subtle);font-weight:400">day off</span>` : ''}
      </th>`;
    }).join('')}
    <th>Cov</th>
  </tr>`;

  const nm      = nowMins();
  const todayIso = todayStr();
  const isToday  = iso === todayIso;

  // Holiday banner
  const holiday = getHolidayForDate(iso);
  const hb = document.getElementById('sched-holiday-banner');
  if (hb) {
    if (holiday) {
      hb.innerHTML = `<div class="holiday-banner" style="background:${holiday.color}18;border-color:${holiday.color}40;color:${holiday.color}">
        ${holiday.emoji} <strong>${escH(holiday.name)}</strong>
      </div>`;
      hb.classList.remove('hidden');
    } else {
      hb.classList.add('hidden');
    }
  }

  tbody.innerHTML = TIMESLOTS.map((slot, si) => {
    const isLunch  = LUNCHSLOTS.includes(si);
    const slotStartMins = SLOTSTART[si] * 60;
    const slotEndMins   = SLOTEND[si]   * 60;
    const isCurrent = isToday && nm >= slotStartMins && nm < slotEndMins;

    const cells = activeEmps.map(emp => {
      const isDayOff = isEmpDayOff(emp.id, iso);

      if (isDayOff) {
        const hasOverride = isOverrideSet(iso, si, emp.id);
        if (!hasOverride) {
          return `<td class="dayoff-col">
            <div class="dayoff-lock">OFF
              ${state.mode === 'admin'
                ? `<button class="dayoff-override-btn" onclick="overrideDayOff('${iso}',${si},'${emp.id}')"></button>`
                : ''}
            </div>
          </td>`;
        }
      }

      const { loc, source } = getResolvedLoc(iso, si, emp.id);
      const cls = LOCCLS[loc];

      if (source === 'leave')  return `<td><div class="leave-lock">LEAVE</div></td>`;
      if (source === 'absent') return `<td><div class="absent-lock">ABSENT</div></td>`;

      const isOvr = isOverrideSet(iso, si, emp.id);
      const options = LOCOPTIONS.map(o =>
        `<option value="${o.val}" ${loc === o.val ? 'selected' : ''}>${o.label}</option>`
      ).join('');

      return `<td>
        <div class="cell-wrap ${isOvr ? 'overridden' : ''}">
          ${isOvr && state.mode === 'admin'
            ? `<button class="reset-btn" onclick="resetCell('${iso}',${si},'${emp.id}')"></button>`
            : ''}
          ${state.mode === 'admin'
            ? `<select class="loc-select ${cls}" onchange="handleLocChange('${iso}',${si},'${emp.id}',this)">${options}</select>`
            : `<div class="loc-select ${cls}" style="padding:3px 5px">${LOCLABEL[loc]}</div>`}
        </div>
      </td>`;
    }).join('');

    // Coverage check
    const covered = REQUIREDLOCS.every(req =>
      activeEmps.some(e => {
        if (isEmpDayOff(e.id, iso)) return false;
        const { loc, source } = getResolvedLoc(iso, si, e.id);
        return loc === req && source !== 'absent' && source !== 'leave';
      })
    );

    return `<tr class="${isCurrent ? 'cur-row' : ''}" data-si="${si}">
      <td class="slot-label ${isLunch ? 'lunch-slot' : ''} ${isCurrent ? 'cur-slot' : ''}">${slot}</td>
      ${cells}
      <td class="cov-cell ${covered ? 'cov-ok' : 'cov-fail'}">${covered ? '✓' : '!'}</td>
    </tr>`;
  }).join('');

  renderSchedAlerts();
  renderSuggest();
  updateDayPillDots();
}

function overrideDayOff(iso, slotIdx, empId) {
  if (!confirm('Override day off for this slot?')) return;
  pushUndo('Override day off', state);
  if (!state.schedule)              state.schedule              = {};
  if (!state.schedule[iso])         state.schedule[iso]         = {};
  if (!state.schedule[iso][slotIdx]) state.schedule[iso][slotIdx] = {};
  const emp = state.employees.find(e => e.id === empId);
  const fb  = emp?.fallback ? emp.fallback.toLowerCase().replace(/\s+/g, '') : 'field';
  state.schedule[iso][slotIdx][empId] = fb;
  persistAll('schedule');
  renderSchedule();
}

function handleLocChange(iso, slotIdx, empId, sel) {
  pushUndo('Schedule change', state);
  if (!state.schedule)               state.schedule               = {};
  if (!state.schedule[iso])          state.schedule[iso]          = {};
  if (!state.schedule[iso][slotIdx]) state.schedule[iso][slotIdx] = {};
  state.schedule[iso][slotIdx][empId] = sel.value;
  sel.className = `loc-select ${LOCCLS[sel.value]}`;
  sel.closest('.cell-wrap').classList.add('overridden');
  persistAll('schedule');
  showToast('Schedule updated');
  updateDayPillDots();
  renderSchedAlerts();
  // Refresh hrs chips
  const hrsRow = document.getElementById('sched-hrs-row');
  if (hrsRow) renderSchedule();
}

function resetCell(iso, slotIdx, empId) {
  pushUndo('Reset cell', state);
  if (state.schedule?.[iso]?.[slotIdx]) delete state.schedule[iso][slotIdx][empId];
  persistAll('schedule');
  renderSchedule();
}

function applyDefaultToDay() {
  pushUndo('Apply default', state);
  const iso = state.currentDateISO;
  const dow = DAYSSHORT[(new Date(iso + 'T00:00:00').getDay() + 6) % 7];
  const def = state.defaultSchedule?.[dow];
  if (!state.schedule) state.schedule = {};
  state.schedule[iso] = JSON.parse(JSON.stringify(def || {}));
  persistAll('schedule');
  renderSchedule();
  showToast('Default applied to day');
}

function clearOverridesForDay() {
  pushUndo('Clear overrides', state);
  const iso = state.currentDateISO;
  if (state.schedule?.[iso]) delete state.schedule[iso];
  persistAll('schedule');
  renderSchedule();
  showToast('Overrides cleared');
}

function copyDayTo(targetIso) {
  pushUndo('Copy day', state);
  const srcIso = state.currentDateISO;
  // Fixed: strip leave/absent resolved slots — copy intended schedule only
  const src = state.schedule?.[srcIso] || {};
  const copy = {};
  Object.keys(src).forEach(si => {
    copy[si] = {};
    Object.keys(src[si]).forEach(empId => {
      const { source } = getResolvedLoc(srcIso, parseInt(si), empId);
      if (source !== 'leave' && source !== 'absent') {
        copy[si][empId] = src[si][empId];
      }
    });
  });
  if (!state.schedule) state.schedule = {};
  state.schedule[targetIso] = copy;
  persistAll('schedule');
  showToast(`Copied to ${targetIso}`);
}

// ── Day Pill Dots ─────────────────────────────────────────────
function updateDayPillDots() {
  document.querySelectorAll('.day-pill').forEach(pill => {
    const iso = pill.getAttribute('onclick')?.match(/'(\d{4}-\d{2}-\d{2})'/)?.[1];
    if (!iso) return;
    pill.classList.toggle('has-gap', countDayGaps(iso) > 0);
    pill.classList.toggle('has-ovr', countDayOverrides(iso) > 0);
    pill.classList.toggle('has-hday', !!getHolidayForDate(iso));
  });
}

// ── Default Schedule ──────────────────────────────────────────
function renderDefaultSchedule() {
  const dow        = state.currentDow || DAYSSHORT[0];
  const activeEmps = state.employees.filter(e => e.status === 'Active');
  const thead      = document.getElementById('default-head');
  const tbody      = document.getElementById('default-body');
  if (!thead || !tbody) return;

  thead.innerHTML = `<tr>
    <th style="min-width:110px;text-align:right">Time</th>
    ${activeEmps.map(e => {
      const daysOff = getEmpDaysOff(e.id);
      const isOff   = daysOff.includes(dow);
      return `<th class="${isOff ? 'dayoff-col' : ''}" title="${escH(e.name)}">
        ${escH(e.name.split(' ')[0])}
        ${isOff ? `<br><span style="font-size:8px;color:var(--subtle);font-weight:400">day off</span>` : ''}
      </th>`;
    }).join('')}
    <th>Cov</th>
  </tr>`;

  tbody.innerHTML = TIMESLOTS.map((slot, si) => {
    const isLunch = LUNCHSLOTS.includes(si);

    const cells = activeEmps.map(emp => {
      const daysOff = getEmpDaysOff(emp.id);
      const isOff   = daysOff.includes(dow);
      if (isOff) return `<td class="dayoff-col"><div class="dayoff-lock">OFF</div></td>`;

      const saved = state.defaultSchedule?.[dow]?.[si]?.[emp.id];
      const loc   = saved ?? (emp.fallback ? emp.fallback.toLowerCase().replace(/\s+/g, '') : 'field');
      const cls   = LOCCLS[loc];
      const options = LOCOPTIONS.map(o =>
        `<option value="${o.val}" ${loc === o.val ? 'selected' : ''}>${o.label}</option>`
      ).join('');

      return `<td>
        <select class="loc-select ${cls}" onchange="handleDefaultChange('${dow}',${si},'${emp.id}',this)">
          ${options}
        </select>
      </td>`;
    }).join('');

    const covered = REQUIREDLOCS.every(req =>
      activeEmps.some(e => {
        if (getEmpDaysOff(e.id).includes(dow)) return false;
        const saved = state.defaultSchedule?.[dow]?.[si]?.[e.id];
        const loc   = saved ?? (e.fallback ? e.fallback.toLowerCase().replace(/\s+/g, '') : 'field');
        return loc === req;
      })
    );

    return `<tr data-si="${si}">
      <td class="slot-label ${isLunch ? 'lunch-slot' : ''}">${slot}</td>
      ${cells}
      <td class="cov-cell ${covered ? 'cov-ok' : 'cov-fail'}">${covered ? '✓' : '!'}</td>
    </tr>`;
  }).join('');
}

// Fixed: auto-save on every cell change — no manual Save button needed
function handleDefaultChange(dow, slotIdx, empId, sel) {
  if (!state.defaultSchedule)           state.defaultSchedule           = {};
  if (!state.defaultSchedule[dow])      state.defaultSchedule[dow]      = {};
  if (!state.defaultSchedule[dow][slotIdx]) state.defaultSchedule[dow][slotIdx] = {};
  state.defaultSchedule[dow][slotIdx][empId] = sel.value;
  sel.className = `loc-select ${LOCCLS[sel.value]}`;
  persistAll('defaultSchedule');
  showToast('Default schedule saved');
}

// saveDefault kept for the manual Save button — now optional
function saveDefault() {
  persistAll('defaultSchedule');
  showToast('Default schedule saved');
}

// ── Plan Modal ────────────────────────────────────────────────
let planWeekMon = '';
let planEmpId   = '';

function openPlanSchedule(empId) {
  planEmpId   = empId;
  // Fixed: always reset to current week on open — never stale
  planWeekMon = state.currentWeekMon;
  renderPlanModal();
  openModal('plan-modal');
}

function planShiftWeek(delta) {
  const d = new Date(planWeekMon + 'T00:00:00');
  d.setDate(d.getDate() + delta * 7);
  planWeekMon = toDateStr(d);
  renderPlanModal();
}

function renderPlanModal() {
  const emp = state.employees.find(e => e.id === planEmpId);
  if (!emp) return;
  document.getElementById('plan-modal-title').textContent = `Plan ${emp.name}`;

  const wStart = new Date(planWeekMon + 'T00:00:00');
  const wEnd   = new Date(wStart);
  wEnd.setDate(wEnd.getDate() + 6);
  document.getElementById('plan-week-label').textContent =
    `${wStart.toLocaleDateString('en-GB',{day:'numeric',month:'short'})} – ${
      wEnd.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}`;

  document.getElementById('plan-days-container').innerHTML = DAYSFULL.map((day, di) => {
    const d   = new Date(wStart);
    d.setDate(d.getDate() + di);
    const iso = toDateStr(d);
    const dow = DAYSSHORT[di];
    const isDayOff = getEmpDaysOff(planEmpId).includes(dow);

    if (isDayOff) return `<div class="plan-day-block">
      <div class="plan-day-hdr">${day} ${d.toLocaleDateString('en-GB',{day:'numeric',month:'short'})}
        <span style="margin-left:8px;font-size:10px;color:var(--subtle)">regular day off</span>
      </div>
      <div style="padding:10px 14px;font-size:11px;color:var(--subtle)">Day off — not schedulable</div>
    </div>`;

    const slots = TIMESLOTS.map((slot, si) => {
      const { loc } = getResolvedLoc(iso, si, planEmpId);
      const cls     = LOCCLS[loc];
      const options = LOCOPTIONS.map(o =>
        `<option value="${o.val}" ${loc === o.val ? 'selected' : ''}>${o.label}</option>`
      ).join('');
      return `<div class="plan-slot-row">
        <span class="plan-slot-label">${slot}</span>
        <select class="loc-select ${cls}" style="flex:1" onchange="handlePlanChange('${iso}',${si},this)">${options}</select>
      </div>`;
    }).join('');

    return `<div class="plan-day-block">
      <div class="plan-day-hdr">${day} ${d.toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</div>
      ${slots}
    </div>`;
  }).join('');
}

function handlePlanChange(iso, slotIdx, sel) {
  if (!state.schedule)               state.schedule               = {};
  if (!state.schedule[iso])          state.schedule[iso]          = {};
  if (!state.schedule[iso][slotIdx]) state.schedule[iso][slotIdx] = {};
  state.schedule[iso][slotIdx][planEmpId] = sel.value;
  sel.className = `loc-select ${LOCCLS[sel.value]}`;
}

function savePlanSchedule() {
  persistAll('schedule');
  closeModal('plan-modal');
  renderSchedule();
  showToast('Schedule saved');
}

// ── Suggest ───────────────────────────────────────────────────
function renderSuggest() {
  const area = document.getElementById('suggest-area');
  if (!area) return;
  const iso        = state.currentDateISO;
  const activeEmps = state.employees.filter(e => e.status === 'Active');
  const suggestions = [];

  TIMESLOTS.forEach((_, si) => {
    REQUIREDLOCS.forEach(req => {
      const covered = activeEmps.some(e => {
        if (isEmpDayOff(e.id, iso)) return false;
        const { loc, source } = getResolvedLoc(iso, si, e.id);
        return loc === req && source !== 'absent' && source !== 'leave';
      });
      if (!covered) {
        const candidates = activeEmps
          .filter(e => {
            if (isEmpDayOff(e.id, iso)) return false;
            const { source } = getResolvedLoc(iso, si, e.id);
            return !e.blocked?.[req] && source !== 'absent' && source !== 'leave';
          })
          // Fixed: sort by fewest hours so same person isn't always overloaded
          .sort((a, b) => calcScheduledHrsWeek(a.id) - calcScheduledHrsWeek(b.id));

        if (candidates.length) {
          suggestions.push({
            slot: TIMESLOTS[si], loc: req,
            empId: candidates[0].id, empName: candidates[0].name
          });
        }
      }
    });
  });

  if (!suggestions.length) { area.innerHTML = ''; return; }

  area.innerHTML = `<div class="suggest-panel">
    <strong>Coverage suggestions</strong>
    <div style="margin-top:6px">
      ${suggestions.slice(0, 6).map(s =>
        `<span class="suggest-chip"
          onclick="applySuggestion('${s.empId}','${s.loc}')"
          data-empid="${s.empId}">
          ${escH(s.empName)} → ${LOCLABEL[s.loc]} @ ${s.slot}
        </span>`
      ).join('')}
    </div>
  </div>`;
}

// Fixed: ID-based lookup, conflict check for already-assigned required locs
function applySuggestion(empId, loc) {
  const iso = state.currentDateISO;
  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return;

  TIMESLOTS.forEach((_, si) => {
    const isCovered = state.employees.filter(e => e.status === 'Active').some(e => {
      if (isEmpDayOff(e.id, iso)) return false;
      const { loc: l, source } = getResolvedLoc(iso, si, e.id);
      return l === loc && source !== 'absent' && source !== 'leave';
    });
    if (!isCovered) {
      // Fixed: don't reassign if already covering another required location
      const { loc: currentLoc } = getResolvedLoc(iso, si, empId);
      if (REQUIREDLOCS.includes(currentLoc) && currentLoc !== loc) return;

      if (!state.schedule)              state.schedule              = {};
      if (!state.schedule[iso])         state.schedule[iso]         = {};
      if (!state.schedule[iso][si])     state.schedule[iso][si]     = {};
      state.schedule[iso][si][empId] = loc;
    }
  });

  persistAll('schedule');
  renderSchedule();
  showToast(`Applied ${escH(emp.name)} → ${LOCLABEL[loc]}`);
}
