// ── Current view state ────────────────────────────────────────
let density = 'normal';

// ── Helpers ───────────────────────────────────────────────────
function getWeekMonday(d) {
  const clone = new Date(d);
  clone.setHours(0,0,0,0);
  clone.setDate(clone.getDate() - ((clone.getDay() + 6) % 7));
  return clone;
}

function nowMins() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

function currentSlotIdx() {
  const nm = nowMins();
  return SLOT_START.findIndex((s, i) => nm >= s * 60 && nm < SLOT_END[i] * 60);
}

function formatWeekLabel(monday) {
  return monday.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}

// ── Resolved location for any cell ───────────────────────────
// Returns { loc, source } where source = 'override'|'default'|'fallback'|'leave'|'absent'
function getResolvedLoc(iso, slotIdx, empId) {
  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return { loc: 'off', source: 'fallback' };

  // Absence
  if (state.absences?.[iso]?.[empId])
    return { loc: 'off', source: 'absent' };

  // Active leave
  if (isOnLeave(empId, iso))
    return { loc: 'vac', source: 'leave' };

  // Day-off swap: employee works on their usual day off
  const activeSwap = state.swapRequests?.find(s => s.empId === empId && s.toDate === iso);
  // (swap just means they show up as normal — no special loc change needed)

  // Weekly schedule override
  const ovr = state.schedule?.[iso]?.[slotIdx]?.[empId];
  if (ovr !== undefined)
    return { loc: ovr, source: 'override' };

  // Default schedule (keyed by day-of-week string e.g. 'MON')
  const dow = DAYS_SHORT[(new Date(iso + 'T00:00:00').getDay() + 6) % 7];
  const def = state.defaultSchedule?.[dow]?.[slotIdx]?.[empId];
  if (def !== undefined)
    return { loc: def, source: 'default' };

  // Fallback
  const fb = emp.fallback ? emp.fallback.toLowerCase().replace(/\s+/g, '') : 'field';
  return { loc: fb, source: 'fallback' };
}

function isOverrideSet(iso, slotIdx, empId) {
  return state.schedule?.[iso]?.[slotIdx]?.[empId] !== undefined;
}

// ── Weekly Schedule ───────────────────────────────────────────
function renderSchedule() {
  const iso        = state.currentDateISO;
  const activeEmps = state.employees.filter(e => e.status === 'Active');
  const thead      = document.getElementById('sched-head');
  const tbody      = document.getElementById('sched-body');
  if (!thead || !tbody) return;

  thead.innerHTML = `<tr>
    <th style="min-width:130px">Time</th>
    ${activeEmps.map(e =>
      `<th title="${escH(e.name)}">${escH(e.name.split(' ')[0])}</th>`
    ).join('')}
    <th>Cov</th>
  </tr>`;

  const nm         = nowMins();
  const todayStr_  = todayStr();
  const isToday    = iso === todayStr_;

  tbody.innerHTML = TIME_SLOTS.map((slot, si) => {
    const isLunch   = LUNCH_SLOTS.includes(si);
    const slotStart = SLOT_START[si] * 60;
    const slotEnd   = SLOT_END[si]   * 60;
    const isCurrent = isToday && nm >= slotStart && nm < slotEnd;

    const cells = activeEmps.map(emp => {
      const { loc, source } = getResolvedLoc(iso, si, emp.id);
      const cls             = LOC_CLS[loc] || '';

      if (source === 'leave')
        return `<td><div class="leave-lock">🔒 LEAVE</div></td>`;
      if (source === 'absent')
        return `<td><div class="absent-lock">✖ ABSENT</div></td>`;

      const isOvr = isOverrideSet(iso, si, emp.id);
      const options = LOC_OPTIONS.map(o =>
        `<option value="${o.val}" ${loc === o.val ? 'selected' : ''}>${o.label}</option>`
      ).join('');

      return `<td>
        <div class="cell-wrap ${isOvr ? 'overridden' : ''}">
          ${isOvr && state.mode === 'admin'
            ? `<button class="reset-btn" onclick="resetCell('${iso}',${si},'${emp.id}')">↺ reset</button>`
            : ''}
          ${state.mode === 'admin'
            ? `<select class="loc-select ${cls}"
                onchange="handleLocChange('${iso}',${si},'${emp.id}',this)">
                ${options}
               </select>`
            : `<div class="loc-select ${cls}" style="padding:3px 5px">${LOC_LABEL[loc] || loc}</div>`
          }
        </div>
      </td>`;
    }).join('');

    // Coverage check — all REQUIRED_LOCS must be covered
    const covered = REQUIRED_LOCS.every(req =>
      activeEmps.some(e => {
        const { loc, source } = getResolvedLoc(iso, si, e.id);
        return loc === req && source !== 'absent' && source !== 'leave';
      })
    );

    return `<tr class="${isCurrent ? 'cur-row' : ''}" data-si="${si}">
      <td class="slot-label ${isLunch ? 'lunch-slot' : ''} ${isCurrent ? 'cur-slot' : ''}">${slot}</td>
      ${cells}
      <td class="cov-cell ${covered ? 'cov-ok' : 'cov-fail'}">${covered ? '✔' : '✖'}</td>
    </tr>`;
  }).join('');

  renderSchedAlerts();
  renderSuggest();
  updateDayPillDots();
}

function handleLocChange(iso, slotIdx, empId, sel) {
  pushUndo('Schedule change', state);
  if (!state.schedule)              state.schedule              = {};
  if (!state.schedule[iso])         state.schedule[iso]         = {};
  if (!state.schedule[iso][slotIdx]) state.schedule[iso][slotIdx] = {};
  state.schedule[iso][slotIdx][empId] = sel.value;
  sel.className = `loc-select ${LOC_CLS[sel.value] || ''}`;
  sel.closest('.cell-wrap').classList.add('overridden');
  persistAll();
  showToast('Schedule updated');
  updateDayPillDots();
  renderSchedAlerts();
}

function resetCell(iso, slotIdx, empId) {
  pushUndo('Reset cell', state);
  if (state.schedule?.[iso]?.[slotIdx]) {
    delete state.schedule[iso][slotIdx][empId];
  }
  persistAll();
  renderSchedule();
}

function applyDefaultToDay() {
  pushUndo('Apply default', state);
  const iso = state.currentDateISO;
  const dow = DAYS_SHORT[(new Date(iso + 'T00:00:00').getDay() + 6) % 7];
  const def = state.defaultSchedule?.[dow] || {};
  if (!state.schedule)      state.schedule      = {};
  state.schedule[iso] = JSON.parse(JSON.stringify(def));
  persistAll();
  renderSchedule();
  showToast('Default applied to day');
}

function clearOverridesForDay() {
  pushUndo('Clear overrides', state);
  const iso = state.currentDateISO;
  if (state.schedule?.[iso]) delete state.schedule[iso];
  persistAll();
  renderSchedule();
  showToast('Overrides cleared');
}

function copyDayTo(targetIso) {
  pushUndo('Copy day', state);
  const srcIso = state.currentDateISO;
  const src    = state.schedule?.[srcIso] || {};
  if (!state.schedule) state.schedule = {};
  state.schedule[targetIso] = JSON.parse(JSON.stringify(src));
  persistAll();
  showToast(`Copied to ${targetIso}`);
}

// ── Day Pill Dots ─────────────────────────────────────────────
function updateDayPillDots() {
  const pills = document.querySelectorAll('.day-pill');
  pills.forEach(pill => {
    const iso  = pill.getAttribute('onclick')?.match(/'([\d-]+)'/)?.[1];
    if (!iso) return;
    const gaps = countDayGaps(iso);
    const ovrs = countDayOverrides(iso);
    pill.classList.toggle('has-gap', gaps > 0);
    pill.classList.toggle('has-ovr', ovrs > 0);
  });
}

// ── Default Schedule ──────────────────────────────────────────
function renderDefaultSchedule() {
  const dow        = state.currentDow || DAYS_SHORT[0];
  const activeEmps = state.employees.filter(e => e.status === 'Active');
  const thead      = document.getElementById('default-head');
  const tbody      = document.getElementById('default-body');
  if (!thead || !tbody) return;

  thead.innerHTML = `<tr>
    <th style="min-width:130px">Time</th>
    ${activeEmps.map(e => `<th>${escH(e.name.split(' ')[0])}</th>`).join('')}
    <th>Cov</th>
  </tr>`;

  tbody.innerHTML = TIME_SLOTS.map((slot, si) => {
    const isLunch = LUNCH_SLOTS.includes(si);

    const cells = activeEmps.map(emp => {
      const saved = state.defaultSchedule?.[dow]?.[si]?.[emp.id];
      const loc   = saved ?? (emp.fallback ? emp.fallback.toLowerCase().replace(/\s+/g,'') : 'field');
      const cls   = LOC_CLS[loc] || '';
      const options = LOC_OPTIONS.map(o =>
        `<option value="${o.val}" ${loc === o.val ? 'selected' : ''}>${o.label}</option>`
      ).join('');
      return `<td>
        <select class="loc-select ${cls}"
          onchange="handleDefaultChange('${dow}',${si},'${emp.id}',this)">
          ${options}
        </select>
      </td>`;
    }).join('');

    const covered = REQUIRED_LOCS.every(req =>
      activeEmps.some(e => {
        const saved = state.defaultSchedule?.[dow]?.[si]?.[e.id];
        const loc   = saved ?? (e.fallback ? e.fallback.toLowerCase().replace(/\s+/g,'') : 'field');
        return loc === req;
      })
    );

    return `<tr data-si="${si}">
      <td class="slot-label ${isLunch ? 'lunch-slot' : ''}">${slot}</td>
      ${cells}
      <td class="cov-cell ${covered ? 'cov-ok' : 'cov-fail'}">${covered ? '✔' : '✖'}</td>
    </tr>`;
  }).join('');
}

function handleDefaultChange(dow, slotIdx, empId, sel) {
  if (!state.defaultSchedule)             state.defaultSchedule             = {};
  if (!state.defaultSchedule[dow])        state.defaultSchedule[dow]        = {};
  if (!state.defaultSchedule[dow][slotIdx]) state.defaultSchedule[dow][slotIdx] = {};
  state.defaultSchedule[dow][slotIdx][empId] = sel.value;
  sel.className = `loc-select ${LOC_CLS[sel.value] || ''}`;
}

function saveDefault() {
  pushUndo('Save default', state);
  persistAll();
  showToast('Default schedule saved');
}

// ── Plan Modal ────────────────────────────────────────────────
let planWeekMon  = '';
let planEmpId    = '';

function openPlanSchedule(empId) {
  planEmpId   = empId;
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

  document.getElementById('plan-modal-title').textContent = `Plan – ${emp.name}`;
  const wStart = new Date(planWeekMon + 'T00:00:00');
  const wEnd   = new Date(wStart); wEnd.setDate(wEnd.getDate() + 6);
  document.getElementById('plan-week-label').textContent =
    `${wStart.toLocaleDateString('en-GB',{day:'numeric',month:'short'})} – ${
      wEnd.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}`;

  document.getElementById('plan-days-container').innerHTML = DAYS_FULL.map((day, di) => {
    const d   = new Date(wStart); d.setDate(d.getDate() + di);
    const iso = toDateStr(d);

    const slots = TIME_SLOTS.map((slot, si) => {
      const { loc } = getResolvedLoc(iso, si, planEmpId);
      const cls     = LOC_CLS[loc] || '';
      const options = LOC_OPTIONS.map(o =>
        `<option value="${o.val}" ${loc === o.val ? 'selected' : ''}>${o.label}</option>`
      ).join('');
      return `<div class="plan-slot-row">
        <span class="plan-slot-label">${slot}</span>
        <select class="loc-select ${cls}" style="flex:1"
          onchange="handlePlanChange('${iso}',${si},this)">
          ${options}
        </select>
      </div>`;
    }).join('');

    return `<div class="plan-day-block">
      <div class="plan-day-hdr">${day} – ${d.toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</div>
      ${slots}
    </div>`;
  }).join('');
}

function handlePlanChange(iso, slotIdx, sel) {
  if (!state.schedule)               state.schedule               = {};
  if (!state.schedule[iso])          state.schedule[iso]          = {};
  if (!state.schedule[iso][slotIdx]) state.schedule[iso][slotIdx] = {};
  state.schedule[iso][slotIdx][planEmpId] = sel.value;
  sel.className = `loc-select ${LOC_CLS[sel.value] || ''}`;
}

function savePlanSchedule() {
  persistAll();
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

  TIME_SLOTS.forEach((_, si) => {
    REQUIRED_LOCS.forEach(req => {
      const covered = activeEmps.some(e => {
        const { loc, source } = getResolvedLoc(iso, si, e.id);
        return loc === req && source !== 'absent' && source !== 'leave';
      });

      if (!covered) {
        const candidates = activeEmps.filter(e => {
          const { source } = getResolvedLoc(iso, si, e.id);
          return !e.blocked?.[req] && source !== 'absent' && source !== 'leave';
        });
        if (candidates.length) {
          suggestions.push({
            slot: TIME_SLOTS[si],
            loc:  req,
            emp:  candidates[0].name
          });
        }
      }
    });
  });

  if (!suggestions.length) { area.innerHTML = ''; return; }

  area.innerHTML = `<div class="suggest-panel">
    <strong>💡 Coverage suggestions:</strong><br>
    <div style="margin-top:6px">
      ${suggestions.slice(0, 6).map(s =>
        `<span class="suggest-chip"
          onclick="applySuggestion('${s.emp}','${s.loc}')">
          ${escH(s.emp)} → ${LOC_LABEL[s.loc] || s.loc} @ ${s.slot}
        </span>`
      ).join('')}
    </div>
  </div>`;
}

function applySuggestion(empName, loc) {
  // Find emp and apply to first uncovered slot for that loc today
  const iso  = state.currentDateISO;
  const emp  = state.employees.find(e => e.name === empName);
  if (!emp) return;

  TIME_SLOTS.forEach((_, si) => {
    const isCovered = state.employees.filter(e => e.status === 'Active').some(e => {
      const { loc: l, source } = getResolvedLoc(iso, si, e.id);
      return l === loc && source !== 'absent' && source !== 'leave';
    });
    if (!isCovered) {
      if (!state.schedule)               state.schedule               = {};
      if (!state.schedule[iso])          state.schedule[iso]          = {};
      if (!state.schedule[iso][si])      state.schedule[iso][si]      = {};
      state.schedule[iso][si][emp.id] = loc;
    }
  });

  persistAll();
  renderSchedule();
  showToast(`Applied: ${empName} → ${LOC_LABEL[loc] || loc}`);
}
