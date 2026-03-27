// ── live.js ───────────────────────────────────────────────────
// Owns: renderLiveAlerts, renderLiveVolunteers, renderTimeline,
//       buildAlerts, renderSchedAlerts (schedule page alerts)
//
// REMOVED from this file (now canonical in ui.js):
//   renderLiveBoard, toggleAbsent, isOnLeave,
//   renderMySchedule, renderHistoryToday, renderDeepLookup

// ── Live Alerts ───────────────────────────────────────────────
function buildAlerts() {
  const alerts = [];
  const iso    = todayStr();

  // Leave alerts for today
  (state.leaveRequests || []).filter(l => l.status === 'active').forEach(l => {
    const cur = new Date(iso  + 'T00:00:00');
    const frm = new Date(l.from + 'T00:00:00');
    const to  = new Date(l.to   + 'T00:00:00');
    if (cur >= frm && cur <= to) {
      const emp = state.employees.find(e => e.id === l.empId);
      if (emp) alerts.push({ type: 'leave', msg: `${emp.name} — ${l.type} leave today` });
    }
  });

  // Upcoming leave (next ALERT_DAYS days)
  const soon = new Date();
  soon.setDate(soon.getDate() + ALERTDAYS);
  const soonStr = toDateStr(soon);
  (state.leaveRequests || []).filter(l => l.status === 'active').forEach(l => {
    if (l.from > iso && l.from <= soonStr) {
      const emp = state.employees.find(e => e.id === l.empId);
      if (emp) alerts.push({ type: 'info', msg: `${emp.name} on ${l.type} leave from ${l.from}` });
    }
  });

  // Active swaps today
  (state.swapRequests || []).forEach(s => {
    // Fixed: only active swaps
    if (s.fromDate === iso && s.status === 'active') {
      const emp = state.employees.find(e => e.id === s.empId);
      if (emp) alerts.push({ type: 'info', msg: `${emp.name} swapped day off — working today` });
    }
  });

  return alerts;
}

function renderLiveAlerts() {
  const el = document.getElementById('live-alert-area');
  if (!el) return;
  const alerts = buildAlerts();
  el.innerHTML = alerts.map(a =>
    `<div class="alert-chip alert-${a.type}">${escH(a.msg)}</div>`
  ).join('');
}

// ── Live Volunteers ───────────────────────────────────────────
function renderLiveVolunteers() {
  const iso  = todayStr();
  const dow  = DAYSSHORT[(new Date().getDay() + 6) % 7];
  const avail = (state.volunteers || []).filter(vol =>
    (state.volAvailability?.[vol.id] || []).includes(dow)
  );
  const el = document.getElementById('live-volunteers');
  if (!el) return;
  el.innerHTML = avail.length
    ? `<div class="live-next-title" style="padding:0 0 8px">Volunteers Available</div>` +
      avail.map(v =>
        `<span class="hrs-chip hrs-ok" style="margin-right:6px">${escH(v.name)}</span>`
      ).join('')
    : `<span style="font-size:12px;color:var(--muted)">No volunteers available today.</span>`;
}

// ── Timeline ──────────────────────────────────────────────────
function renderTimeline() {
  const iso        = todayStr();
  const nm         = nowMins();
  const totalMins  = (DAYEND - DAYSTART) * 60;
  const nowPct     = Math.min(100, Math.max(0, (nm - DAYSTART * 60) / totalMins * 100));
  const activeEmps = state.employees.filter(e => e.status === 'Active');
  const tl         = document.getElementById('location-timeline');
  const labels     = document.getElementById('tl-labels');
  if (!tl) return;

  const labelHrs = [6, 8, 10, 12, 14, 16, 18, 20];
  if (labels) {
    labels.innerHTML = labelHrs.map(h => {
      const pct = ((h * 60) - DAYSTART * 60) / totalMins * 100;
      return `<span class="timeline-time-label" style="left:${pct.toFixed(2)}%">${h}:00</span>`;
    }).join('');
  }

  tl.innerHTML = ALLLOCS.map(loc => {
    const color = LOCCOLOR[loc] || '888';
    const segs  = TIMESLOTS.map((_, si) => {
      // Fixed: use shared getSlotAssignments helper
      const empsHere = activeEmps.filter(e => {
        if (isEmpDayOff(e.id, iso)) return false;
        const { loc: l, source } = getResolvedLoc(iso, si, e.id);
        return l === loc && source !== 'absent';
      });
      const slotMins = (SLOTEND[si] - SLOTSTART[si]) * 60;
      const w        = (slotMins / totalMins * 100).toFixed(2);
      const label    = empsHere.length > 1
        ? empsHere.length
        : empsHere[0]?.name.split(' ')[0] || '';
      const bg = empsHere.length ? color : 'transparent';
      return `<div class="timeline-seg"
        style="width:${w}%;background:${bg};${!empsHere.length ? 'opacity:.15' : ''}"
        title="${empsHere.map(e => e.name).join(', ') || 'Uncovered'}">${label}</div>`;
    }).join('');

    return `<div class="timeline-row">
      <div class="timeline-loc-label">${escH(LOCLABEL[loc] || loc)}</div>
      <div class="timeline-bar">${segs}</div>
      <div class="timeline-now-line" style="left:${nowPct.toFixed(2)}%"></div>
    </div>`;
  }).join('');
}
