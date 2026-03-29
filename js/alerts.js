// ── alerts.js ─────────────────────────────────────────────────
// Proactive alerts engine — reusable across all admin pages

const ALERT_TYPES = {
  GAP            : 'GAP',
  LEAVE_CONFLICT : 'LEAVE_CONFLICT',
  HOUR_CAP       : 'HOUR_CAP',
  ABSENT_NO_COVER: 'ABSENT_NO_COVER',
  SWAP_PENDING   : 'SWAP_PENDING',
  HOLIDAY        : 'HOLIDAY',
};

// ── Master scan ───────────────────────────────────────────────
function scanAlerts(iso) {
  const alerts     = [];
  const activeEmps = state.employees.filter(e => e.status === 'Active');

  // Holiday
  const holiday = getHolidayForDate(iso);
  if (holiday) alerts.push({
    type    : ALERT_TYPES.HOLIDAY,
    severity: 'info',
    key     : `holiday-${iso}`,
    msg     : `${holiday.emoji} ${holiday.name} today`,
    iso,
  });

  // Gaps — required locations uncovered
  TIMESLOTS.forEach((slot, si) => {
    REQUIREDLOCS.forEach(req => {
      const covered = activeEmps.some(e => {
        if (isEmpDayOff(e.id, iso))          return false;
        if (isOnLeave(e.id, iso))            return false;
        if (state.absences?.[iso]?.[e.id])   return false;
        const { loc } = getResolvedLoc(iso, si, e.id);
        return loc === req;
      });
      if (!covered) alerts.push({
        type    : ALERT_TYPES.GAP,
        severity: 'high',
        key     : `gap-${iso}-${si}-${req}`,
        msg     : `${LOCLABEL[req]} uncovered — ${slot}`,
        iso, si, loc: req,
        action  : 'fillGap',
      });
    });
  });

  // Leave conflicts — on leave but has explicit schedule override
  activeEmps.forEach(emp => {
    if (!isOnLeave(emp.id, iso)) return;
    TIMESLOTS.forEach((slot, si) => {
      const ovr = state.schedule?.[iso]?.[si]?.[emp.id];
      if (ovr && ovr !== 'off' && ovr !== 'vac') {
        alerts.push({
          type    : ALERT_TYPES.LEAVE_CONFLICT,
          severity: 'warn',
          key     : `leavecfx-${iso}-${si}-${emp.id}`,
          msg     : `${emp.name} on leave but scheduled for ${LOCLABEL[ovr]||ovr} at ${slot}`,
          iso, si, empId: emp.id,
          action  : 'clearOverride',
        });
      }
    });
  });

  // FIX: pass the correct weekMon derived from iso, not state.currentWeekMon
  const weekMon = getWeekMonStr(iso);

  // Hour cap — at or over
  activeEmps.forEach(emp => {
    const used = calcScheduledHrsWeek(emp.id, weekMon);
    const cap  = emp.hourCap || DEFAULTHRSCAP;
    if (used >= cap) alerts.push({
      type    : ALERT_TYPES.HOUR_CAP,
      severity: used > cap ? 'high' : 'warn',
      key     : `hrcap-${iso}-${emp.id}`,
      msg     : `${emp.name} at ${used.toFixed(1)}h — cap is ${cap}h`,
      iso, empId: emp.id,
      action  : 'viewEmployee',
    });
  });

  // Absent with no cover for required location
  activeEmps.forEach(emp => {
    if (!state.absences?.[iso]?.[emp.id]) return;
    TIMESLOTS.forEach((_, si) => {
      const { loc } = getResolvedLoc(iso, si, emp.id);
      if (!REQUIREDLOCS.includes(loc)) return;
      const covered = activeEmps.some(e => {
        if (e.id === emp.id)               return false;
        if (isEmpDayOff(e.id, iso))        return false;
        if (state.absences?.[iso]?.[e.id]) return false;
        const { loc: l } = getResolvedLoc(iso, si, e.id);
        return l === loc;
      });
      if (!covered) alerts.push({
        type    : ALERT_TYPES.ABSENT_NO_COVER,
        severity: 'high',
        key     : `absentcover-${iso}-${si}-${emp.id}`,
        msg     : `${emp.name} absent — ${LOCLABEL[loc]} uncovered at ${TIMESLOTS[si]}`,
        iso, si, empId: emp.id, loc,
        action  : 'fillGap',
      });
    });
  });

  // Swap pending
  (state.swapRequests || []).forEach(s => {
    if (s.status !== 'active') return;
    const emp = state.employees.find(e => e.id === s.empId);
    if (!emp) return;
    alerts.push({
      type    : ALERT_TYPES.SWAP_PENDING,
      severity: 'info',
      key     : `swap-${s.id}`,
      msg     : `${emp.name} swap: off ${fmtDate(s.fromDate)}, works ${fmtDate(s.toDate)}`,
      iso     : s.fromDate,
      empId   : s.empId,
      swapId  : s.id,
      action  : 'viewSwap',
    });
  });

  return alerts;
}

// ── Week scan ─────────────────────────────────────────────────
function scanWeekAlerts(weekMon) {
  const all = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekMon + 'T00:00:00');
    d.setDate(d.getDate() + i);
    all.push(...scanAlerts(toDateStr(d)));
  }
  return all;
}

// ── Day gap count ─────────────────────────────────────────────
function getDayGapCount(iso) {
  return scanAlerts(iso).filter(a => a.type === ALERT_TYPES.GAP).length;
}

// ── Dismissed alerts store ────────────────────────────────────
const _dismissedAlerts = new Set(
  JSON.parse(sessionStorage.getItem('smPro_dismissed') || '[]')
);

function dismissAlert(key) {
  _dismissedAlerts.add(key);
  sessionStorage.setItem('smPro_dismissed',
    JSON.stringify([..._dismissedAlerts]));
  document.getElementById(`alert-chip-${CSS.escape(key)}`)?.remove();
}

function dismissAlertGroup(keys, containerId, iso) {
  keys.forEach(k => _dismissedAlerts.add(k));
  sessionStorage.setItem('smPro_dismissed',
    JSON.stringify([..._dismissedAlerts]));
  renderAlertsBar(containerId, iso);
}

function toggleAlertGroup(groupId) {
  const body = document.getElementById(groupId);
  const arr  = document.getElementById(`${groupId}-arr`);
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'flex';
  if (arr) arr.textContent = isOpen ? '▾' : '▴';
}

// ── Render alerts bar (grouped) ───────────────────────────────
function renderAlertsBar(containerId, iso) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const alerts = scanAlerts(iso || todayStr())
    .filter(a => !_dismissedAlerts.has(a.key));

  if (!alerts.length) { el.innerHTML = ''; return; }

  // Deduplicate by key
  const seen   = new Set();
  const unique = alerts.filter(a => {
    if (seen.has(a.key)) return false;
    seen.add(a.key); return true;
  });

  // Group by type
  const groups = {
    [ALERT_TYPES.GAP]            : { label:'Coverage Gaps',     icon:'🚨', severity:'high', items:[] },
    [ALERT_TYPES.ABSENT_NO_COVER]: { label:'Absent — No Cover', icon:'🚨', severity:'high', items:[] },
    [ALERT_TYPES.LEAVE_CONFLICT] : { label:'Leave Conflicts',    icon:'⚠️', severity:'warn', items:[] },
    [ALERT_TYPES.HOUR_CAP]       : { label:'Hour Cap Warnings',  icon:'⚠️', severity:'warn', items:[] },
    [ALERT_TYPES.SWAP_PENDING]   : { label:'Active Swaps',       icon:'ℹ️', severity:'info', items:[] },
    [ALERT_TYPES.HOLIDAY]        : { label:'Holidays',           icon:'ℹ️', severity:'info', items:[] },
  };

  unique.forEach(a => {
    if (groups[a.type]) groups[a.type].items.push(a);
  });

  const activeGroups = Object.entries(groups)
    .filter(([_, g]) => g.items.length > 0)
    .sort((a, b) => {
      const order = { high:0, warn:1, info:2 };
      return order[a[1].severity] - order[b[1].severity];
    });

  if (!activeGroups.length) { el.innerHTML = ''; return; }

  el.innerHTML = `<div class="admin-alerts-bar">
    ${activeGroups.map(([type, group]) => {
      const groupId = `ag-${containerId}-${type}`;
      return `
        <div class="alert-group alert-group-${group.severity}">
          <div class="alert-group-hdr"
            onclick="toggleAlertGroup('${groupId}')">
            <span class="alert-chip-icon">${group.icon}</span>
            <span class="alert-group-label">${group.label}</span>
            <span class="alert-group-count alert-${group.severity}">
              ${group.items.length}
            </span>
            <span class="alert-group-arr"
              id="${groupId}-arr">▾</span>
            <button class="alert-chip-dismiss"
              onclick="event.stopPropagation();dismissAlertGroup(${JSON.stringify(group.items.map(a => a.key))},'${containerId}','${iso || todayStr()}')"
              title="Dismiss all in group">×</button>
          </div>
          <div class="alert-group-body"
            id="${groupId}" style="display:none">
            ${group.items.map(a => `
              <div class="alert-group-item alert-${a.severity}">
                <span class="alert-chip-msg">${escH(a.msg)}</span>
                <div style="display:flex;gap:6px;flex-shrink:0">
                  ${a.action === 'fillGap'
                    ? `<button class="alert-chip-action"
                        onclick="openFillGapWizard('${a.loc}',${a.si},'${a.iso}')">
                        Fill</button>`
                    : ''}
                  ${a.action === 'clearOverride'
                    ? `<button class="alert-chip-action"
                        onclick="clearSingleOverride('${a.iso}',${a.si},'${a.empId}')">
                        Clear</button>`
                    : ''}
                  <button class="alert-chip-dismiss"
                    onclick="dismissAlert('${escH(a.key)}')"
                    title="Dismiss">×</button>
                </div>
              </div>`).join('')}
          </div>
        </div>`;
    }).join('')}
  </div>`;
}

// ── Severity icon ─────────────────────────────────────────────
function severityIcon(s) {
  return s === 'high' ? '🚨' : s === 'warn' ? '⚠️' : 'ℹ️';
}

// ── Helpers ───────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day:'numeric', month:'short' });
}

function getWeekMonStr(iso) {
  const d = new Date(iso + 'T00:00:00');
  return toDateStr(getWeekMonday(d));
}

function clearSingleOverride(iso, si, empId) {
  if (!state.schedule?.[iso]?.[si]) return;
  delete state.schedule[iso][si][empId];
  if (!Object.keys(state.schedule[iso][si]).length)
    delete state.schedule[iso][si];
  if (!Object.keys(state.schedule[iso]).length)
    delete state.schedule[iso];
  persistAll('schedule');
  renderAll();
  showToast('Override cleared');
}
