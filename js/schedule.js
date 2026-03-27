let currentWeekKey = weekKey(new Date());
let currentDayIdx  = (new Date().getDay() + 6) % 7;
let currentDowIdx  = 0; // for default page
let density        = 'normal';
let planWeekKey    = weekKey(new Date());
let editingEmpId   = null;
let blockedLocs    = [];

// ── Resolved location for a cell ──────────────────────────────
function getResolvedLoc(empId, dayIdx, slotIdx, wKey) {
  wKey = wKey || currentWeekKey;
  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return 'off';

  // Check absence
  const dateStr = toDateStr(dateOfDayInWeek(wKey, dayIdx));
  if (state.absences[dateStr]?.[empId]) return 'off';

  // Check active leave
  if (isOnLeave(empId, dateStr)) return 'vac';

  // Check override
  const ovr = state.overrides[wKey]?.[dayIdx]?.[slotIdx]?.[empId];
  if (ovr !== undefined) return ovr;

  // Check default
  const def = state.defaults[dayIdx]?.[slotIdx]?.[empId];
  if (def !== undefined) return def;

  // Fallback
  return emp.fallback ? emp.fallback.toLowerCase().replace(' ', '') : 'field';
}

function isOverridden(empId, dayIdx, slotIdx, wKey) {
  wKey = wKey || currentWeekKey;
  return state.overrides[wKey]?.[dayIdx]?.[slotIdx]?.[empId] !== undefined;
}

// ── Weekly Schedule Page ──────────────────────────────────────
function renderSchedule() {
  const activeEmps = state.employees.filter(e => e.status === 'Active');
  const thead = document.getElementById('sched-head');
  const tbody = document.getElementById('sched-body');
  if (!thead || !tbody) return;

  // Header
  thead.innerHTML = `<tr>
    <th>Time</th>
    ${activeEmps.map(e => `<th>${e.name.split(' ')[0]}</th>`).join('')}
    <th>Cov</th>
  </tr>`;

  // Day pills
  renderWeekNav();

  const now = new Date();
  const nowHr = now.getHours() + now.getMinutes()/60;
  const todayDayIdx = (now.getDay()+6)%7;
  const isCurrentWeek = currentWeekKey === weekKey(now);

  tbody.innerHTML = TIME_SLOTS.map((slot, si) => {
    const isLunch = LUNCH_SLOTS.includes(si);
    const slotMid = (SLOT_START[si] + SLOT_END[si]) / 2;
    const isCurrent = isCurrentWeek && currentDayIdx === todayDayIdx &&
                      nowHr >= SLOT_START[si] && nowHr < SLOT_END[si];

    const cells = activeEmps.map(emp => {
      const dateStr  = toDateStr(dateOfDayInWeek(currentWeekKey, currentDayIdx));
      const onLeave  = isOnLeave(emp.id, dateStr);
      const isAbsent = state.absences[dateStr]?.[emp.id];
      const loc      = getResolvedLoc(emp.id, currentDayIdx, si);
      const ovr      = isOverridden(emp.id, currentDayIdx, si);
      const cls      = LOC_CLS[loc] || '';

      if (onLeave)  return `<td><div class="leave-lock">🔒 LEAVE</div></td>`;
      if (isAbsent) return `<td><div class="absent-lock">✖ ABSENT</div></td>`;

      const options = LOC_OPTIONS.map(o =>
        `<option value="${o.val}" ${loc===o.val?'selected':''}>${o.label}</option>`
      ).join('');

      return `<td>
        <div class="cell-wrap ${ovr?'overridden':''}">
          <button class="reset-btn" onclick="resetCell('${emp.id}',${si})">↺ reset</button>
          <select class="loc-select ${cls}" onchange="handleLocChange('${emp.id}',${si},this)">
            ${options}
          </select>
        </div>
      </td>`;
    }).join('');

    // Coverage check
    const covered = REQUIRED_LOCS.every(req =>
      activeEmps.some(e => getResolvedLoc(e.id, currentDayIdx, si) === req)
    );
    const covCell = `<td class="cov-cell ${covered?'cov-ok':'cov-fail'}">${covered?'✔':'✖'}</td>`;

    return `<tr class="${isCurrent?'cur-row':''}" data-si="${si}">
      <td class="slot-label ${isLunch?'lunch-slot':''} ${isCurrent?'cur-slot':''}">${slot}</td>
      ${cells}${covCell}
    </tr>`;
  }).join('');

  renderSchedAlerts();
  renderSuggest();
  updateDayPillDots();
}

function handleLocChange(empId, slotIdx, sel) {
  pushUndo('Schedule change', state);
  if (!state.overrides[currentWeekKey]) state.overrides[currentWeekKey] = {};
  if (!state.overrides[currentWeekKey][currentDayIdx]) state.overrides[currentWeekKey][currentDayIdx] = {};
  if (!state.overrides[currentWeekKey][currentDayIdx][slotIdx]) state.overrides[currentWeekKey][currentDayIdx][slotIdx] = {};
  state.overrides[currentWeekKey][currentDayIdx][slotIdx][empId] = sel.value;
  sel.className = `loc-select ${LOC_CLS[sel.value]||''}`;
  sel.closest('.cell-wrap').classList.add('overridden');
  persistAll();
  showToast('Schedule updated');
  updateDayPillDots();
  renderSchedAlerts();
}

function resetCell(empId, slotIdx) {
  pushUndo('Reset cell', state);
  if (state.overrides[currentWeekKey]?.[currentDayIdx]?.[slotIdx]) {
    delete state.overrides[currentWeekKey][currentDayIdx][slotIdx][empId];
  }
  persistAll();
  renderSchedule();
}

function applyDefaultToDay() {
  pushUndo('Apply default', state);
  if (!state.overrides[currentWeekKey]) state.overrides[currentWeekKey] = {};
  state.overrides[currentWeekKey][currentDayIdx] = {};
  const def = state.defaults[currentDayIdx] || {};
  state.overrides[currentWeekKey][currentDayIdx] = JSON.parse(JSON.stringify(def));
  persistAll();
  renderSchedule();
  showToast('Default applied');
}

function clearOverridesForDay() {
  pushUndo('Clear overrides', state);
  if (state.overrides[currentWeekKey]?.[currentDayIdx]) {
    delete state.overrides[currentWeekKey][currentDayIdx];
  }
  persistAll();
  renderSchedule();
  showToast('Overrides cleared');
}

function copyDayTo(targetDayIdx) {
  pushUndo('Copy day', state);
  const src = state.overrides[currentWeekKey]?.[currentDayIdx] || {};
  if (!state.overrides[currentWeekKey]) state.overrides[currentWeekKey] = {};
  state.overrides[currentWeekKey][targetDayIdx] = JSON.parse(JSON.stringify(src));
  persistAll();
  showToast(`Copied to ${DAYS_SHORT[targetDayIdx]}`);
}

// ── Default Schedule Page ─────────────────────────────────────
function renderDefaultSchedule() {
  const activeEmps = state.employees.filter(e => e.status === 'Active');
  const thead = document.getElementById('default-head');
  const tbody = document.getElementById('default-body');
  if (!thead || !tbody) return;

  thead.innerHTML = `<tr>
    <th>Time</th>
    ${activeEmps.map(e => `<th>${e.name.split(' ')[0]}</th>`).join('')}
    <th>Cov</th>
  </tr>`;

  tbody.innerHTML = TIME_SLOTS.map((slot, si) => {
    const isLunch = LUNCH_SLOTS.includes(si);
    const cells = activeEmps.map(emp => {
      const loc = state.defaults[currentDowIdx]?.[si]?.[emp.id] ||
                  (emp.fallback ? emp.fallback.toLowerCase().replace(' ','') : 'field');
      const cls = LOC_CLS[loc] || '';
      const options = LOC_OPTIONS.map(o =>
        `<option value="${o.val}" ${loc===o.val?'selected':''}>${o.label}</option>`
      ).join('');
      return `<td>
        <select class="loc-select ${cls}" onchange="handleDefaultChange('${emp.id}',${si},this)">
          ${options}
        </select>
      </td>`;
    }).join('');

    const covered = REQUIRED_LOCS.every(req =>
      activeEmps.some(e => {
        const l = state.defaults[currentDowIdx]?.[si]?.[e.id] ||
                  (e.fallback?e.fallback.toLowerCase().replace(' ',''):'field');
        return l === req;
      })
    );

    return `<tr data-si="${si}">
      <td class="slot-label ${isLunch?'lunch-slot':''}">${slot}</td>
      ${cells}
      <td class="cov-cell ${covered?'cov-ok':'cov-fail'}">${covered?'✔':'✖'}</td>
    </tr>`;
  }).join('');
}

function handleDefaultChange(empId, slotIdx, sel) {
  if (!state.defaults[currentDowIdx]) state.defaults[currentDowIdx] = {};
  if (!state.defaults[currentDowIdx][slotIdx]) state.defaults[currentDowIdx][slotIdx] = {};
  state.defaults[currentDowIdx][slotIdx][empId] = sel.value;
  sel.className = `loc-select ${LOC_CLS[sel.value]||''}`;
}

function saveDefault() {
  pushUndo('Save default', state);
  persistAll();
  showToast('Default schedule saved');
}

// ── Plan modal ────────────────────────────────────────────────
function openPlanSchedule(empId) {
  planWeekKey = currentWeekKey;
  editingEmpId = empId;
  renderPlanModal();
  openModal('plan-modal');
}

function planShiftWeek(dir) {
  const d = new Date(planWeekKey + 'T00:00:00');
  d.setDate(d.getDate() + dir * 7);
  planWeekKey = weekKey(d);
  renderPlanModal();
}

function renderPlanModal() {
  const emp = state.employees.find(e => e.id === editingEmpId);
  if (!emp) return;
  document.getElementById('plan-modal-title').textContent = `Plan – ${emp.name}`;
  const wStart = new Date(planWeekKey + 'T00:00:00');
  document.getElementById('plan-week-label').textContent =
    `${wStart.toLocaleDateString('en-GB',{day:'numeric',month:'short'})} – ${
      new Date(wStart.getTime()+6*86400000).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}`;

  const container = document.getElementById('plan-days-container');
  container.innerHTML = DAYS_FULL.map((day, di) => {
    const slots = TIME_SLOTS.map((slot, si) => {
      const loc = state.overrides[planWeekKey]?.[di]?.[si]?.[editingEmpId] ||
                  state.defaults[di]?.[si]?.[editingEmpId] ||
                  (emp.fallback?emp.fallback.toLowerCase().replace(' ',''):'field');
      const cls = LOC_CLS[loc] || '';
      const options = LOC_OPTIONS.map(o =>
        `<option value="${o.val}" ${loc===o.val?'selected':''}>${o.label}</option>`
      ).join('');
      return `<div class="plan-slot-row">
        <span class="plan-slot-label">${slot}</span>
        <select class="loc-select ${cls}" style="flex:1" onchange="handlePlanChange(${di},${si},this)">
          ${options}
        </select>
      </div>`;
    }).join('');
    return `<div class="plan-day-block">
      <div class="plan-day-hdr">${day}</div>
      ${slots}
    </div>`;
  }).join('');
}

function handlePlanChange(dayIdx, slotIdx, sel) {
  if (!state.overrides[planWeekKey]) state.overrides[planWeekKey] = {};
  if (!state.overrides[planWeekKey][dayIdx]) state.overrides[planWeekKey][dayIdx] = {};
  if (!state.overrides[planWeekKey][dayIdx][slotIdx]) state.overrides[planWeekKey][dayIdx][slotIdx] = {};
  state.overrides[planWeekKey][dayIdx][slotIdx][editingEmpId] = sel.value;
  sel.className = `loc-select ${LOC_CLS[sel.value]||''}`;
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
  const activeEmps = state.employees.filter(e => e.status === 'Active');
  const dateStr = toDateStr(dateOfDayInWeek(currentWeekKey, currentDayIdx));
  const suggestions = [];

  TIME_SLOTS.forEach((_, si) => {
    REQUIRED_LOCS.forEach(req => {
      const covered = activeEmps.some(e => getResolvedLoc(e.id, currentDayIdx, si) === req);
      if (!covered) {
        const candidates = activeEmps.filter(e =>
          !e.blocked?.includes(req) && !isOnLeave(e.id, dateStr) &&
          !state.absences[dateStr]?.[e.id]
        );
        if (candidates.length) {
          suggestions.push({ slot: TIME_SLOTS[si], loc: req, emp: candidates[0].name });
        }
      }
    });
  });

  if (!suggestions.length) { area.innerHTML = ''; return; }
  area.innerHTML = `<div class="suggest-panel">
    <strong>💡 Coverage suggestions:</strong><br>
    ${suggestions.slice(0,5).map(s =>
      `<span class="suggest-chip">${s.emp} → ${LOC_LABEL[s.loc]} @ ${s.slot}</span>`
    ).join('')}
  </div>`;
}
