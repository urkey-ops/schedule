// ── js/pages/wizard.js ────────────────────────────────────────
// Schedule Suggestion Wizard — Engine + State helpers

// ── Constants ─────────────────────────────────────────────────
const EARLY_GATE_SI_END  = 5;
const LUNCH_WAVE1_SLOTS  = [6, 7];
const LUNCH_WAVE2_SLOTS  = [8, 9];
const MIN_BLOCK_SLOTS    = 4;
const MAX_BLOCK_SLOTS    = 6;

// ── Draft persistence ─────────────────────────────────────────
function saveDraftLocal() {
  try {
    localStorage.setItem('smPro_draft_nextweek', JSON.stringify({
      draftSchedule    : state.draftSchedule,
      draftBlocks      : state.draftBlocks,
      lunchWaves       : state.lunchWaves,
      wizardEarlyGate  : state.wizardEarlyGate,
      wizardMaintenance: state.wizardMaintenance,
    }));
  } catch(e) {}
}

function clearDraftLocal() {
  localStorage.removeItem('smPro_draft_nextweek');
  state.draftSchedule    = {};
  state.draftBlocks      = {};
  state.lunchWaves       = {};
  state.wizardEarlyGate  = {};
  state.wizardMaintenance = null;
}

function hasSavedDraft() {
  return !!localStorage.getItem('smPro_draft_nextweek');
}

function getNextWeekDates() {
  const mon = new Date(state.currentWeekMon + 'T00:00:00');
  mon.setDate(mon.getDate() + 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon); d.setDate(d.getDate() + i);
    return toDateStr(d);
  });
}

// ── Availability Matrix ───────────────────────────────────────
function buildAvailabilityMatrix(isoDates) {
  const matrix = {};
  const activeEmps = state.employees.filter(e => e.status === 'Active');

  activeEmps.forEach(e => {
    matrix[e.id] = {};
    isoDates.forEach(iso => {
      if (isOnLeave(e.id, iso)) {
        matrix[e.id][iso] = 'leave';
      } else if (isEmpDayOff(e.id, iso)) {
        // FIX: swap status is 'active', not 'approved' — 'approved' never exists
        // in the data model. Also match on toDate (the new work day) not newWorkDay.
        const swapped = (state.swapRequests || []).some(s =>
          s.empId === e.id && s.status === 'active' && s.toDate === iso
        );
        matrix[e.id][iso] = swapped ? 'available' : 'dayoff';
      } else if (state.absences?.[iso]?.[e.id]) {
        matrix[e.id][iso] = 'absent';
      } else {
        matrix[e.id][iso] = 'available';
      }
    });
  });

  return matrix;
}

// ── Lunch Wave Assignment ─────────────────────────────────────
function assignLunchWaves(iso, availableEmpIds) {
  const half      = Math.ceil(availableEmpIds.length / 2);
  const prevWaves = state.lunchWaves;
  const prevWave2 = Object.values(prevWaves).flatMap(w => w.wave2 || []);

  const preferWave1 = availableEmpIds.filter(id => prevWave2.includes(id));
  const preferWave2 = availableEmpIds.filter(id => !prevWave2.includes(id));

  const wave1 = [...preferWave1, ...preferWave2].slice(0, half);
  const wave2 = availableEmpIds.filter(id => !wave1.includes(id));

  state.lunchWaves[iso] = { wave1, wave2 };
  return { wave1, wave2 };
}

// ── Core: build one employee's block sequence for a day ───────
function buildEmpDayBlocks(empId, iso, waves, isEarlyGate, isMaintenance) {
  const blocks = [];
  const { wave1, wave2 } = waves;
  const lunchSlots = wave1.includes(empId) ? LUNCH_WAVE1_SLOTS : LUNCH_WAVE2_SLOTS;
  const lunchSi    = lunchSlots[0];

  if (isEarlyGate) {
    blocks.push({
      empId, loc: 'gate', siStart: 0, siEnd: EARLY_GATE_SI_END,
      locked: true, type: 'work', source: 'early-gate'
    });
    const afterEarly = buildRotationBlocks(
      empId, iso, EARLY_GATE_SI_END + 1, lunchSi, 'gate', isMaintenance
    );
    blocks.push(...afterEarly);
  } else if (isMaintenance) {
    blocks.push({
      empId, loc: 'maintenance', siStart: 0, siEnd: TIMESLOTS.length - 1,
      locked: true, type: 'maintenance', source: 'maintenance'
    });
  } else {
    const preLunch = buildRotationBlocks(empId, iso, 0, lunchSi, null, false);
    blocks.push(...preLunch);
  }

  if (!isMaintenance) {
    blocks.push({
      empId, loc: 'lunch', siStart: lunchSlots[0], siEnd: lunchSlots[1],
      locked: false, type: 'lunch', source: 'auto'
    });
  }

  if (!isMaintenance) {
    const afterLunch = lunchSlots[1] + 1;
    const postLunch  = buildRotationBlocks(
      empId, iso, afterLunch, TIMESLOTS.length - 1, null, false
    );
    blocks.push(...postLunch);
  }

  return blocks;
}

// ── Build rotation blocks for a slot range ────────────────────
function buildRotationBlocks(empId, iso, siFrom, siTo, lastLoc, isMaint) {
  if (siFrom > siTo) return [];
  const blocks  = [];
  let   cursor  = siFrom;
  let   prevLoc = lastLoc;

  const rotOrder = [...REQUIREDLOCS, 'field', 'giftshop'];

  while (cursor <= siTo) {
    const remaining = siTo - cursor + 1;
    if (remaining <= 0) break;

    const blockLen = Math.min(
      remaining,
      Math.floor(Math.random() * (MAX_BLOCK_SLOTS - MIN_BLOCK_SLOTS + 1)) + MIN_BLOCK_SLOTS
    );

    const blocked   = state.employees.find(e => e.id === empId)?.blocked || [];
    const available = rotOrder.filter(l =>
      l !== prevLoc && !blocked.includes(l)
    );

    let loc = pickBestLoc(available, iso, cursor, cursor + blockLen - 1, empId);

    blocks.push({
      empId,
      loc,
      siStart : cursor,
      siEnd   : Math.min(cursor + blockLen - 1, siTo),
      locked  : false,
      type    : 'work',
      source  : 'auto',
    });

    prevLoc  = loc;
    cursor  += blockLen;
  }

  return blocks;
}

// ── Pick best location from available list ────────────────────
function pickBestLoc(available, iso, siFrom, siTo, empId) {
  if (!available.length) return 'off';

  const scored = available.map(loc => {
    let score = 0;
    if (REQUIREDLOCS.includes(loc)) score += 10;
    const lastWeekMon = toDateStr(
      new Date(new Date(state.currentWeekMon + 'T00:00:00').setDate(
        new Date(state.currentWeekMon + 'T00:00:00').getDate() - 7
      ))
    );
    const dow = (new Date(iso + 'T00:00:00').getDay() + 6) % 7;
    const lastWeekIso = toDateStr(
      new Date(new Date(lastWeekMon + 'T00:00:00').setDate(
        new Date(lastWeekMon + 'T00:00:00').getDate() + dow
      ))
    );
    const lastWeekLoc = state.schedule?.[lastWeekIso]?.[siFrom]?.[empId];
    if (lastWeekLoc === loc) score += 6;

    for (let si = siFrom; si <= siTo; si++) {
      const alreadyCovered = Object.values(state.draftBlocks[iso] || [])
        .some(b => b.loc === loc && b.siStart <= si && b.siEnd >= si);
      if (REQUIREDLOCS.includes(loc) && !alreadyCovered) score += 4;
    }

    return { loc, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].loc;
}

// ── Main: generate full draft for next week ───────────────────
function generateDraft(earlyGateMap, maintenanceEmpId) {
  const isoDates   = getNextWeekDates();
  const matrix     = buildAvailabilityMatrix(isoDates);
  const activeEmps = state.employees.filter(e => e.status === 'Active');

  state.draftBlocks      = {};
  state.draftSchedule    = {};
  state.wizardEarlyGate  = earlyGateMap  || {};
  state.wizardMaintenance = maintenanceEmpId || null;

  isoDates.forEach(iso => {
    state.draftBlocks[iso] = [];

    const availIds = activeEmps
      .filter(e => matrix[e.id]?.[iso] === 'available')
      .map(e => e.id);

    if (!availIds.length) return;

    const waves = assignLunchWaves(iso, availIds);
    patchLunchGateCoverage(iso, waves, maintenanceEmpId);

    availIds.forEach(empId => {
      const isEarlyGate   = earlyGateMap?.[iso] === empId;
      const isMaintenance = maintenanceEmpId === empId;
      const blocks        = buildEmpDayBlocks(empId, iso, waves, isEarlyGate, isMaintenance);
      state.draftBlocks[iso].push(...blocks);
    });

    state.draftSchedule[iso] = {
      blocks  : state.draftBlocks[iso],
      score   : 0,
      gaps    : [],
      locked  : false,
    };
  });

  isoDates.forEach(iso => {
    const { score, gaps } = validateAndScoreDay(iso);
    state.draftSchedule[iso].score = score;
    state.draftSchedule[iso].gaps  = gaps;
  });

  saveDraftLocal();
}

// ── Patch Gate coverage during lunch waves ────────────────────
function patchLunchGateCoverage(iso, waves, maintenanceEmpId) {
  const checkWave = (waveSlots, waveEmpIds) => {
    waveSlots.forEach(si => {
      const nonLunching = state.employees
        .filter(e => e.status === 'Active' && !waveEmpIds.includes(e.id))
        .map(e => e.id);

      const gateAlreadyCovered = (state.draftBlocks[iso] || []).some(b =>
        b.loc === 'gate' && b.siStart <= si && b.siEnd >= si &&
        nonLunching.includes(b.empId)
      );

      if (!gateAlreadyCovered) {
        if (maintenanceEmpId && !waveEmpIds.includes(maintenanceEmpId)) {
          state.draftBlocks[iso] = (state.draftBlocks[iso] || []).filter(b =>
            !(b.empId === maintenanceEmpId && b.siStart <= si && b.siEnd >= si)
          );
          state.draftBlocks[iso].push({
            empId   : maintenanceEmpId,
            loc     : 'gate',
            siStart : si, siEnd: si,
            locked  : false,
            type    : 'work',
            source  : 'lunch-patch',
          });
        }
      }
    });
  };

  checkWave(LUNCH_WAVE1_SLOTS, waves.wave1);
  checkWave(LUNCH_WAVE2_SLOTS, waves.wave2);
}

// ── Validate and score a day's draft ─────────────────────────
function validateAndScoreDay(iso) {
  let score = 100;
  const gaps = [];

  TIMESLOTS.forEach((slot, si) => {
    REQUIREDLOCS.forEach(loc => {
      const covered = (state.draftBlocks[iso] || []).some(b =>
        b.loc === loc && b.siStart <= si && b.siEnd >= si && b.type !== 'lunch'
      );
      if (!covered) {
        const severity = loc === 'gate' ? 'critical' : loc === 'podium' ? 'warn' : 'info';
        gaps.push({ loc, si, slot, severity });
        score -= severity === 'critical' ? 10 : severity === 'warn' ? 2 : 1;
      }
    });
  });

  const activeEmps = state.employees.filter(e => e.status === 'Active');
  activeEmps.forEach(e => {
    const empBlocks = (state.draftBlocks[iso] || [])
      .filter(b => b.empId === e.id && b.type === 'work');
    const hrs = empBlocks.reduce((sum, b) =>
      sum + (b.siEnd - b.siStart + 1) * (SLOT_DURATION_MINS / 60), 0
    );
    if (hrs > 8) score -= 3;
  });

  return { score: Math.max(0, score), gaps };
}

// ── Override a single block ───────────────────────────────────
function overrideDraftBlock(iso, blockIdx, newLoc, newEmpId) {
  const blocks = state.draftBlocks[iso];
  if (!blocks?.[blockIdx]) return;
  blocks[blockIdx].loc    = newLoc    || blocks[blockIdx].loc;
  blocks[blockIdx].empId  = newEmpId  || blocks[blockIdx].empId;
  blocks[blockIdx].locked = true;
  const { score, gaps }   = validateAndScoreDay(iso);
  state.draftSchedule[iso].score = score;
  state.draftSchedule[iso].gaps  = gaps;
  saveDraftLocal();
}

// ── Regenerate single day (keep locked blocks) ────────────────
function regenerateDraftDay(iso, earlyGateEmpId, maintenanceEmpId) {
  const lockedBlocks = (state.draftBlocks[iso] || []).filter(b => b.locked);
  state.draftBlocks[iso] = lockedBlocks;

  const matrix    = buildAvailabilityMatrix([iso]);
  const availIds  = state.employees
    .filter(e => e.status === 'Active' && matrix[e.id]?.[iso] === 'available')
    .map(e => e.id);

  const waves = assignLunchWaves(iso, availIds);
  patchLunchGateCoverage(iso, waves, maintenanceEmpId);

  availIds.forEach(empId => {
    const alreadyLocked = lockedBlocks.some(b => b.empId === empId);
    if (alreadyLocked) return;
    const isEarlyGate   = earlyGateEmpId === empId;
    const isMaintenance = maintenanceEmpId === empId;
    const blocks        = buildEmpDayBlocks(empId, iso, waves, isEarlyGate, isMaintenance);
    state.draftBlocks[iso].push(...blocks);
  });

  const { score, gaps } = validateAndScoreDay(iso);
  state.draftSchedule[iso] = { blocks: state.draftBlocks[iso], score, gaps, locked: false };
  saveDraftLocal();
}

// ── Final approval: write draft → state.schedule ─────────────
function approveAndApplyDraft() {
  const isoDates = getNextWeekDates();
  applyDraftToSchedule(isoDates);
  persistAll('schedule');
  clearDraftLocal();
  showToast('✔ Next week schedule applied successfully');
  renderAll();
}

// ── Weekly hour total from draft ──────────────────────────────
function calcDraftWeekHrs(empId) {
  const isoDates = getNextWeekDates();
  let total = 0;
  isoDates.forEach(iso => {
    (state.draftBlocks[iso] || [])
      .filter(b => b.empId === empId && b.type === 'work')
      .forEach(b => {
        total += (b.siEnd - b.siStart + 1) * (SLOT_DURATION_MINS / 60);
      });
  });
  return total;
}

// ── UI ────────────────────────────────────────────────────────

let _wizardStep = 1;

function openScheduleWizard() {
  const modal = document.getElementById('schedule-wizard-modal');
  if (!modal) return;

  if (hasSavedDraft() &&
      Object.keys(state.draftBlocks).length &&
      getNextWeekDates().some(iso => state.draftBlocks[iso]?.length)) {
    if (confirm('You have an unfinished draft for next week. Continue editing it?')) {
      showWizardStep(2);
      openModal('schedule-wizard-modal');
      return;
    } else {
      clearDraftLocal();
    }
  }

  showWizardStep(1);
  openModal('schedule-wizard-modal');
}

function showWizardStep(step) {
  _wizardStep = step;
  const inner = document.getElementById('wizard-inner');
  if (!inner) return;

  switch(step) {
    case 1: inner.innerHTML = renderWizardScreen1(); break;
    case 2: inner.innerHTML = renderWizardScreen2(); break;
    case 3: inner.innerHTML = renderWizardScreen3(); break;
    case 4: inner.innerHTML = renderWizardScreen4(); break;
  }
}

// ── Screen 1 — Who's In Next Week ────────────────────────────
function renderWizardScreen1() {
  const isoDates   = getNextWeekDates();
  const matrix     = buildAvailabilityMatrix(isoDates);
  const activeEmps = state.employees.filter(e => e.status === 'Active');
  const nextMon    = isoDates[0];
  const nextSun    = isoDates[6];

  const statusIcon = { available:'✅', leave:'🔒', dayoff:'😴', absent:'✖', swap:'🔄' };
  const statusTip  = { available:'Available', leave:'On Leave',
                       dayoff:'Day Off', absent:'Absent', swap:'Swapped Off' };

  const dayCounts = isoDates.map(iso =>
    activeEmps.filter(e => matrix[e.id]?.[iso] === 'available').length
  );

  return `
    <div class="wiz-header">
      <div class="wiz-step-indicator">
        <span class="wiz-step active">1</span>
        <span class="wiz-step-line"></span>
        <span class="wiz-step">2</span>
        <span class="wiz-step-line"></span>
        <span class="wiz-step">3</span>
        <span class="wiz-step-line"></span>
        <span class="wiz-step">4</span>
      </div>
      <div class="wiz-title">Who's In Next Week?</div>
      <div class="wiz-subtitle">${fmtDate(nextMon)} – ${fmtDate(nextSun)}</div>
    </div>

    <div class="wiz-body">
      <div style="overflow-x:auto;margin-bottom:18px">
        <table class="wiz-avail-table">
          <thead>
            <tr>
              <th style="min-width:110px">Staff</th>
              ${isoDates.map((iso, di) => `
                <th style="text-align:center;min-width:44px">
                  <div style="font-size:10px;font-weight:700;color:var(--muted)">
                    ${DAYSSHORT[di]}</div>
                  <div style="font-size:13px;font-weight:800;color:var(--text)">
                    ${new Date(iso+'T00:00:00').getDate()}</div>
                </th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${activeEmps.map(e => `
              <tr>
                <td style="font-size:12px;font-weight:600;color:var(--text);
                            padding:7px 10px;white-space:nowrap">
                  ${escH(e.name)}
                </td>
                ${isoDates.map(iso => {
                  const st = matrix[e.id]?.[iso] || 'available';
                  return `<td style="text-align:center;padding:5px"
                    title="${statusTip[st]||st}">
                    <span style="font-size:16px">${statusIcon[st]||'✅'}</span>
                  </td>`;
                }).join('')}
              </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr style="background:var(--surface2)">
              <td style="font-size:11px;font-weight:700;color:var(--muted);
                          padding:7px 10px">Available</td>
              ${dayCounts.map(c => `
                <td style="text-align:center;font-size:12px;font-weight:800;
                            color:${c < 3 ? 'var(--red)' : 'var(--green)'}">
                  ${c}
                </td>`).join('')}
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="wiz-section-title">🌅 Who opens Gate 6–9am each day?</div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:18px">
        ${isoDates.map((iso, di) => {
          const availForDay = activeEmps.filter(e =>
            matrix[e.id]?.[iso] === 'available'
          );
          const savedVal = state.wizardEarlyGate?.[iso] || '';
          return `
            <div style="display:flex;align-items:center;gap:10px">
              <span style="font-size:12px;font-weight:700;min-width:40px;
                            color:var(--muted)">${DAYSSHORT[di]}</span>
              <select class="wiz-select" id="early-gate-${iso}"
                style="flex:1" ${!availForDay.length ? 'disabled' : ''}>
                <option value="">— No early shift —</option>
                ${availForDay.map(e => `
                  <option value="${e.id}"
                    ${savedVal === e.id ? 'selected' : ''}>
                    ${escH(e.name)}
                  </option>`).join('')}
              </select>
            </div>`;
        }).join('')}
      </div>

      <div class="wiz-section-title">🔧 Maintenance this week? (optional)</div>
      <select class="wiz-select" id="maintenance-emp" style="width:100%;margin-bottom:20px">
        <option value="">— No maintenance assignment —</option>
        ${activeEmps.map(e => `
          <option value="${e.id}"
            ${state.wizardMaintenance === e.id ? 'selected' : ''}>
            ${escH(e.name)}
          </option>`).join('')}
      </select>
    </div>

    <div class="wiz-footer">
      <button class="btn btn-ghost" onclick="closeModal('schedule-wizard-modal')">
        Cancel
      </button>
      <button class="btn btn-primary" onclick="wizardGenerateAndNext()">
        Generate Draft →
      </button>
    </div>`;
}

function wizardGenerateAndNext() {
  const isoDates = getNextWeekDates();

  const earlyGateMap = {};
  isoDates.forEach(iso => {
    const val = document.getElementById(`early-gate-${iso}`)?.value;
    if (val) earlyGateMap[iso] = val;
  });

  const maintenanceEmpId = document.getElementById('maintenance-emp')?.value || null;

  generateDraft(earlyGateMap, maintenanceEmpId);
  showWizardStep(2);
}

// ── Screen 2 — Draft Schedule ─────────────────────────────────
function renderWizardScreen2() {
  const isoDates   = getNextWeekDates();
  const activeEmps = state.employees.filter(e => e.status === 'Active');

  const totalScore = isoDates.reduce((sum, iso) =>
    sum + (state.draftSchedule[iso]?.score || 0), 0
  );
  const avgScore = Math.round(totalScore / 7);
  const scoreColor = avgScore >= 90 ? 'var(--green)' : avgScore >= 70 ? 'var(--amber)' : 'var(--red)';

  const critGaps = isoDates.reduce((sum, iso) =>
    sum + (state.draftSchedule[iso]?.gaps || [])
      .filter(g => g.severity === 'critical').length, 0
  );

  return `
    <div class="wiz-header">
      <div class="wiz-step-indicator">
        <span class="wiz-step done">✔</span>
        <span class="wiz-step-line active"></span>
        <span class="wiz-step active">2</span>
        <span class="wiz-step-line"></span>
        <span class="wiz-step">3</span>
        <span class="wiz-step-line"></span>
        <span class="wiz-step">4</span>
      </div>
      <div class="wiz-title">Draft Schedule</div>
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:6px">
        <span style="font-size:13px;font-weight:800;color:${scoreColor}">
          Draft Quality: ${avgScore}%
        </span>
        ${critGaps
          ? `<span style="font-size:12px;font-weight:700;color:var(--red)">
               ⚠ ${critGaps} critical gap${critGaps > 1 ? 's' : ''}</span>`
          : `<span style="font-size:12px;font-weight:700;color:var(--green)">
               ✔ No critical gaps</span>`}
      </div>
    </div>

    <div class="wiz-body" style="padding:0">
      <div class="wiz-day-tabs">
        ${isoDates.map((iso, di) => {
          const dayGaps   = (state.draftSchedule[iso]?.gaps || []);
          const critCount = dayGaps.filter(g => g.severity === 'critical').length;
          const warnCount = dayGaps.filter(g => g.severity === 'warn').length;
          return `
            <button class="wiz-day-tab ${di === 0 ? 'active' : ''}"
              onclick="wizShowDay('${iso}', this)"
              data-iso="${iso}">
              <span style="font-size:10px;font-weight:700;color:var(--muted)">
                ${DAYSSHORT[di]}</span>
              <span style="font-size:15px;font-weight:800">
                ${new Date(iso+'T00:00:00').getDate()}</span>
              ${critCount
                ? `<span class="wiz-dot wiz-dot-red"></span>`
                : warnCount
                ? `<span class="wiz-dot wiz-dot-amber"></span>`
                : `<span class="wiz-dot wiz-dot-green"></span>`}
            </button>`;
        }).join('')}
      </div>

      <div id="wiz-day-view" style="padding:14px">
        ${renderWizardDayView(isoDates[0])}
      </div>
    </div>

    <div class="wiz-footer">
      <button class="btn btn-ghost" onclick="showWizardStep(1)">← Back</button>
      <button class="btn btn-ghost"
        onclick="generateDraft(state.wizardEarlyGate, state.wizardMaintenance);
                 showWizardStep(2)">
        🔄 Regenerate All
      </button>
      <button class="btn btn-primary" onclick="wizardGoToConflicts()">
        Review & Approve →
      </button>
    </div>`;
}

function wizShowDay(iso, tabEl) {
  document.querySelectorAll('.wiz-day-tab').forEach(t => t.classList.remove('active'));
  tabEl.classList.add('active');
  document.getElementById('wiz-day-view').innerHTML = renderWizardDayView(iso);
}

function renderWizardDayView(iso) {
  const blocks     = state.draftBlocks[iso] || [];
  const gaps       = state.draftSchedule[iso]?.gaps || [];
  const activeEmps = state.employees.filter(e => e.status === 'Active');
  const matrix     = buildAvailabilityMatrix([iso]);
  const waves      = state.lunchWaves[iso] || { wave1: [], wave2: [] };
  const holiday    = getHolidayForDate(iso);

  const byEmp = {};
  blocks.forEach(b => {
    if (!byEmp[b.empId]) byEmp[b.empId] = [];
    byEmp[b.empId].push(b);
  });

  let html = '';

  if (holiday) {
    html += `<div style="padding:8px 12px;border-radius:8px;
      background:${holiday.color}22;border:1.5px solid ${holiday.color}55;
      color:${holiday.color};font-size:12px;font-weight:700;margin-bottom:10px">
      ${holiday.emoji} ${escH(holiday.name)}
    </div>`;
  }

  html += `<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">
    <span style="font-size:11px;font-weight:700;color:var(--muted)">Lunch waves:</span>
    <span class="wiz-wave-chip wave1">
      Wave 1 (12–13): ${waves.wave1.map(id =>
        state.employees.find(e => e.id === id)?.name?.split(' ')[0] || id
      ).join(', ') || '—'}
    </span>
    <span class="wiz-wave-chip wave2">
      Wave 2 (13–14): ${waves.wave2.map(id =>
        state.employees.find(e => e.id === id)?.name?.split(' ')[0] || id
      ).join(', ') || '—'}
    </span>
  </div>`;

  if (gaps.length) {
    html += `<div style="margin-bottom:10px;display:flex;gap:6px;flex-wrap:wrap">
      ${gaps.map(g => `
        <span style="font-size:11px;font-weight:700;padding:3px 8px;border-radius:6px;
          background:${g.severity==='critical'?'#fee2e2':g.severity==='warn'?'#fef3c7':'#eff6ff'};
          color:${g.severity==='critical'?'#991b1b':g.severity==='warn'?'#92400e':'#1e40af'}">
          ${g.severity==='critical'?'🔴':g.severity==='warn'?'🟡':'🔵'}
          ${LOCLABEL[g.loc]||g.loc} ${g.slot} uncovered
        </span>`).join('')}
    </div>`;
  }

  activeEmps.forEach(e => {
    const status = matrix[e.id]?.[iso];
    if (status !== 'available') {
      const icon = status === 'leave' ? '🔒' : status === 'dayoff' ? '😴' : '✖';
      html += `<div class="wiz-emp-row wiz-emp-unavail">
        <div class="wiz-emp-name">${escH(e.name)}</div>
        <div style="font-size:11px;color:var(--muted);font-style:italic">
          ${icon} ${status === 'leave' ? 'On Leave' : status === 'dayoff' ? 'Day Off' : 'Absent'}
        </div>
      </div>`;
      return;
    }

    const empBlocks = (byEmp[e.id] || []).sort((a, b) => a.siStart - b.siStart);
    const dayHrs    = empBlocks
      .filter(b => b.type === 'work')
      .reduce((s, b) => s + (b.siEnd - b.siStart + 1) * (SLOT_DURATION_MINS / 60), 0);

    html += `<div class="wiz-emp-row">
      <div class="wiz-emp-name">
        ${escH(e.name)}
        <span class="wiz-emp-hrs">${dayHrs.toFixed(1)}h</span>
        ${waves.wave1.includes(e.id) ? '<span class="wiz-wave-tag w1">W1</span>' : ''}
        ${waves.wave2.includes(e.id) ? '<span class="wiz-wave-tag w2">W2</span>' : ''}
      </div>
      <div class="wiz-blocks-row">
        ${empBlocks.map((b, bi) => {
          const blockIdx = blocks.indexOf(b);
          const duration = (b.siEnd - b.siStart + 1) * (SLOT_DURATION_MINS / 60);
          const color    = b.type === 'lunch' ? '#94a3b8'
                         : b.type === 'maintenance' ? '#78716c'
                         : (LOCCOLOR[b.loc] || '#888');
          const label    = b.type === 'lunch' ? '🍽 Lunch'
                         : b.type === 'maintenance' ? '🔧 Maint.'
                         : (LOCLABEL[b.loc] || b.loc);
          const lockedIcon = b.locked ? '🔒' : '';
          return `
            <div class="wiz-block ${b.type === 'lunch' ? 'wiz-block-lunch' : ''}"
              style="background:${color}22;border-color:${color}55;color:${color}"
              onclick="openBlockEditor('${iso}',${blockIdx})"
              title="${label} ${TIMESLOTS[b.siStart]?.split('–')[0]}–${TIMESLOTS[b.siEnd]?.split('–')[1] || ''}">
              <span class="wiz-block-loc">${label}</span>
              <span class="wiz-block-time">
                ${TIMESLOTS[b.siStart]?.split('–')[0] || ''}–${TIMESLOTS[b.siEnd]?.split('–')[1] || ''}
              </span>
              <span class="wiz-block-dur">${duration.toFixed(1)}h ${lockedIcon}</span>
            </div>`;
        }).join('')}
        ${!empBlocks.length ? `<span style="font-size:11px;color:var(--muted);
          font-style:italic">Nothing scheduled</span>` : ''}
      </div>
      <button class="wiz-regen-day-btn"
        onclick="regenerateDraftDay('${iso}',
          state.wizardEarlyGate?.['${iso}'],
          state.wizardMaintenance);
          document.getElementById('wiz-day-view').innerHTML=renderWizardDayView('${iso}')"
        title="Regenerate this employee's day">↺</button>
    </div>`;
  });

  html += `<div class="wiz-hrs-strip">
    ${activeEmps.map(e => {
      const wkHrs = calcDraftWeekHrs(e.id);
      const cap   = e.hourCap || DEFAULTHRSCAP;
      const pct   = Math.min((wkHrs / cap) * 100, 100);
      const over  = wkHrs > cap;
      const color = over ? '#dc2626' : pct >= 80 ? '#d97706' : '#059669';
      return `<div style="display:flex;align-items:center;gap:8px;
                          padding:4px 0;font-size:11px">
        <span style="min-width:80px;font-weight:600;color:var(--text);
                     white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${escH(e.name)}
        </span>
        <div class="roster-hr-track" style="flex:1">
          <div class="roster-hr-fill"
            style="width:${pct}%;background:${color}"></div>
        </div>
        <span style="font-weight:700;color:${color};min-width:60px;text-align:right">
          ${wkHrs.toFixed(1)}/${cap}h
        </span>
      </div>`;
    }).join('')}
  </div>`;

  return html;
}

function wizardGoToConflicts() {
  const isoDates = getNextWeekDates();
  const allGaps  = isoDates.flatMap(iso =>
    (state.draftSchedule[iso]?.gaps || []).map(g => ({ ...g, iso }))
  );
  const criticals = allGaps.filter(g => g.severity === 'critical');

  if (!criticals.length) {
    showWizardStep(4);
  } else {
    showWizardStep(3);
  }
}

// ── Screen 3 — Conflict Resolution ───────────────────────────
function renderWizardScreen3() {
  const isoDates  = getNextWeekDates();
  const allIssues = [];

  isoDates.forEach(iso => {
    (state.draftSchedule[iso]?.gaps || []).forEach(g => {
      allIssues.push({ ...g, iso, dateLabel: fmtDate(iso) });
    });
  });

  state.employees.filter(e => e.status === 'Active').forEach(e => {
    const wkHrs = calcDraftWeekHrs(e.id);
    const cap   = e.hourCap || DEFAULTHRSCAP;
    if (wkHrs > cap) {
      allIssues.push({
        severity  : 'warn',
        type      : 'overcap',
        empId     : e.id,
        empName   : e.name,
        excess    : (wkHrs - cap).toFixed(1),
        iso       : null,
        dateLabel : 'Full week',
      });
    }
  });

  const criticals = allIssues.filter(i => i.severity === 'critical');
  const warnings  = allIssues.filter(i => i.severity === 'warn');
  const infos     = allIssues.filter(i => i.severity === 'info');

  const renderIssueRow = (issue) => {
    const isCrit = issue.severity === 'critical';
    const isWarn = issue.severity === 'warn';
    const dot    = isCrit ? '🔴' : isWarn ? '🟡' : '🔵';

    if (issue.type === 'overcap') {
      return `<div class="wiz-conflict-row">
        <span class="wiz-conflict-dot">${dot}</span>
        <span class="wiz-conflict-msg">
          ${escH(issue.empName)} is ${issue.excess}h over cap this week
        </span>
        <span class="wiz-conflict-fix" style="font-size:11px;color:var(--muted)">
          Review in draft
        </span>
      </div>`;
    }

    return `<div class="wiz-conflict-row">
      <span class="wiz-conflict-dot">${dot}</span>
      <span class="wiz-conflict-msg">
        ${issue.dateLabel} — ${LOCLABEL[issue.loc]||issue.loc}
        uncovered at ${issue.slot}
      </span>
      <button class="btn btn-sm btn-ghost"
        onclick="showWizardStep(2)">Fix in Draft</button>
    </div>`;
  };

  return `
    <div class="wiz-header">
      <div class="wiz-step-indicator">
        <span class="wiz-step done">✔</span>
        <span class="wiz-step-line active"></span>
        <span class="wiz-step done">✔</span>
        <span class="wiz-step-line active"></span>
        <span class="wiz-step active">3</span>
        <span class="wiz-step-line"></span>
        <span class="wiz-step">4</span>
      </div>
      <div class="wiz-title">Conflict Check</div>
    </div>

    <div class="wiz-body">
      ${criticals.length
        ? `<div class="wiz-conflict-group">
            <div class="wiz-conflict-group-title" style="color:var(--red)">
              🔴 Critical — Must Fix (${criticals.length})
            </div>
            ${criticals.map(renderIssueRow).join('')}
          </div>`
        : `<div style="padding:14px;background:var(--green-bg);border-radius:10px;
              color:var(--green);font-size:13px;font-weight:700;margin-bottom:12px">
            ✔ No critical gaps — Gate is fully covered all week
          </div>`}

      ${warnings.length
        ? `<div class="wiz-conflict-group">
            <div class="wiz-conflict-group-title" style="color:var(--amber)">
              🟡 Warnings (${warnings.length})
            </div>
            ${warnings.map(renderIssueRow).join('')}
          </div>`
        : ''}

      ${infos.length
        ? `<div class="wiz-conflict-group">
            <div class="wiz-conflict-group-title" style="color:var(--accent)">
              🔵 Info — Acceptable gaps (${infos.length})
            </div>
            ${infos.map(renderIssueRow).join('')}
          </div>`
        : ''}
    </div>

    <div class="wiz-footer">
      <button class="btn btn-ghost" onclick="showWizardStep(2)">← Back to Draft</button>
      <button class="btn btn-primary" onclick="showWizardStep(4)">
        Approve Anyway →
      </button>
    </div>`;
}

// ── Screen 4 — Final Approve ──────────────────────────────────
function renderWizardScreen4() {
  const isoDates  = getNextWeekDates();
  const nextMon   = isoDates[0];
  const nextSun   = isoDates[6];
  const totalEmps = new Set(
    isoDates.flatMap(iso =>
      (state.draftBlocks[iso] || []).map(b => b.empId)
    )
  ).size;
  const allGaps   = isoDates.flatMap(iso =>
    state.draftSchedule[iso]?.gaps || []
  );
  const critGaps  = allGaps.filter(g => g.severity === 'critical').length;
  const softGaps  = allGaps.filter(g => g.severity !== 'critical').length;
  const avgScore  = Math.round(
    isoDates.reduce((s, iso) => s + (state.draftSchedule[iso]?.score || 0), 0) / 7
  );
  const scoreColor = avgScore >= 90 ? 'var(--green)' : avgScore >= 70 ? 'var(--amber)' : 'var(--red)';

  return `
    <div class="wiz-header">
      <div class="wiz-step-indicator">
        <span class="wiz-step done">✔</span>
        <span class="wiz-step-line active"></span>
        <span class="wiz-step done">✔</span>
        <span class="wiz-step-line active"></span>
        <span class="wiz-step done">✔</span>
        <span class="wiz-step-line active"></span>
        <span class="wiz-step active">4</span>
      </div>
      <div class="wiz-title">Ready to Apply</div>
      <div class="wiz-subtitle">${fmtDate(nextMon)} – ${fmtDate(nextSun)}</div>
    </div>

    <div class="wiz-body">
      <div class="wiz-summary-card">
        <div class="wiz-summary-row">
          <span>📅 Days scheduled</span>
          <strong>7</strong>
        </div>
        <div class="wiz-summary-row">
          <span>👥 Staff assigned</span>
          <strong>${totalEmps}</strong>
        </div>
        <div class="wiz-summary-row">
          <span>🔴 Critical gaps</span>
          <strong style="color:${critGaps ? 'var(--red)' : 'var(--green)'}">
            ${critGaps || '✔ None'}
          </strong>
        </div>
        <div class="wiz-summary-row">
          <span>🟡 Soft gaps</span>
          <strong style="color:${softGaps ? 'var(--amber)' : 'var(--green)'}">
            ${softGaps || '✔ None'}
          </strong>
        </div>
        <div class="wiz-summary-row">
          <span>⭐ Draft quality</span>
          <strong style="color:${scoreColor}">${avgScore}%</strong>
        </div>
      </div>

      ${critGaps
        ? `<div style="padding:12px 14px;background:var(--red-bg);border-radius:10px;
              border:1.5px solid rgba(215,43,43,.2);
              color:var(--red);font-size:13px;font-weight:600;margin-top:12px">
            ⚠ ${critGaps} critical gap${critGaps > 1 ? 's' : ''} remain.
            Gate will be uncovered. Go back to fix before applying.
          </div>`
        : `<div style="padding:12px 14px;background:var(--green-bg);border-radius:10px;
              border:1.5px solid rgba(5,150,105,.2);
              color:var(--green);font-size:13px;font-weight:600;margin-top:12px">
            ✔ All critical locations covered. Safe to apply.
          </div>`}
    </div>

    <div class="wiz-footer">
      <button class="btn btn-ghost" onclick="showWizardStep(3)">← Fix More</button>
      <button class="btn btn-primary" onclick="approveAndApplyDraft();
        closeModal('schedule-wizard-modal')">
        ✔ Apply to Schedule
      </button>
    </div>`;
}

// ── Block Editor ──────────────────────────────────────────────
function openBlockEditor(iso, blockIdx) {
  const block = state.draftBlocks[iso]?.[blockIdx];
  if (!block) return;
  const modal = document.getElementById('block-editor-modal');
  const inner = document.getElementById('block-editor-inner');
  if (!modal || !inner) return;

  const activeEmps = state.employees.filter(e => e.status === 'Active');
  const allLocs    = [...REQUIREDLOCS, 'field', 'giftshop', 'maintenance', 'off'];

  inner.innerHTML = `
    <h3 style="margin-bottom:16px">Edit Block</h3>
    <div style="font-size:12px;color:var(--muted);margin-bottom:14px">
      ${fmtDate(iso)} · ${TIMESLOTS[block.siStart]?.split('–')[0]} –
      ${TIMESLOTS[block.siEnd]?.split('–')[1] || ''}
    </div>

    <div class="form-row">
      <label>Location</label>
      <div style="display:flex;gap:6px;flex-wrap:wrap" id="block-loc-toggles">
        ${allLocs.map(loc => `
          <button class="loc-toggle ${block.loc === loc ? 'selected' : ''}"
            style="background:${block.loc===loc?(LOCCOLOR[loc]||'#888')+'22':''};
                   border-color:${block.loc===loc?(LOCCOLOR[loc]||'#888')+'88':'var(--border2)'};
                   color:${block.loc===loc?(LOCCOLOR[loc]||'#888'):'var(--muted)'}"
            onclick="selectBlockLoc(this,'${loc}','${iso}',${blockIdx})">
            ${LOCLABEL[loc]||loc}
          </button>`).join('')}
      </div>
    </div>

    <div class="form-row">
      <label>Reassign to</label>
      <select class="wiz-select" id="block-emp-select" style="width:100%">
        ${activeEmps.map(e => `
          <option value="${e.id}" ${block.empId === e.id ? 'selected' : ''}>
            ${escH(e.name)}
          </option>`).join('')}
      </select>
    </div>

    <div style="display:flex;gap:10px;margin-top:20px">
      <button class="btn btn-ghost" style="flex:1"
        onclick="closeModal('block-editor-modal')">Cancel</button>
      <button class="btn btn-primary" style="flex:1"
        onclick="saveBlockEdit('${iso}',${blockIdx})">Save</button>
    </div>`;

  openModal('block-editor-modal');
}

function selectBlockLoc(btn, loc, iso, blockIdx) {
  document.querySelectorAll('#block-loc-toggles .loc-toggle')
    .forEach(b => {
      b.classList.remove('selected');
      b.style.background  = '';
      b.style.borderColor = 'var(--border2)';
      b.style.color       = 'var(--muted)';
    });
  btn.classList.add('selected');
  btn.style.background   = (LOCCOLOR[loc] || '#888') + '22';
  btn.style.borderColor  = (LOCCOLOR[loc] || '#888') + '88';
  btn.style.color        = LOCCOLOR[loc] || '#888';
  btn.dataset.loc        = loc;
}

function saveBlockEdit(iso, blockIdx) {
  const selectedLocBtn = document.querySelector('#block-loc-toggles .loc-toggle.selected');
  const newLoc   = selectedLocBtn?.dataset.loc || selectedLocBtn?.textContent?.trim();
  const newEmpId = document.getElementById('block-emp-select')?.value;
  overrideDraftBlock(iso, blockIdx, newLoc, newEmpId);
  closeModal('block-editor-modal');
  const activeTab = document.querySelector('.wiz-day-tab.active');
  if (activeTab) {
    document.getElementById('wiz-day-view').innerHTML =
      renderWizardDayView(activeTab.dataset.iso);
  }
}
