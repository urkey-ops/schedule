// ── grandview.js ──────────────────────────────────────────────
// Grand View — read-only coordination overview
// Sub-views: Now Snapshot, Today Timeline, Staff Status,
//            Date Lookup, Find Person, Print

let _grandView       = 'now';
let _grandRefreshInt = null;

// ── Entry point ───────────────────────────────────────────────
function renderGrandView() {
  renderGrandHeader();
  renderGrandSummaryStrip();
  setGrandView(_grandView);
  startGrandRefresh();
}

// ── Sub-view switcher ─────────────────────────────────────────
function setGrandView(name, tabEl) {
  _grandView = name;
  document.querySelectorAll('.grand-subview').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.grand-tab').forEach(t  => t.classList.remove('active'));

  const view = document.getElementById(`gview-${name}`);
  if (view) view.classList.remove('hidden');
  if (tabEl) tabEl.classList.add('active');
  else document.getElementById(`gtab-${name}`)?.classList.add('active');

  if (name === 'now')      renderNowSnapshot();
  if (name === 'timeline') renderGrandTimeline();
  if (name === 'status')   renderStatusBoard();
  if (name === 'lookup') {
    const el = document.getElementById('grand-lookup-date');
    if (el && !el.value) el.value = todayStr();
    renderGrandLookup();
  }
  if (name === 'find') document.getElementById('grand-find-input')?.focus();
}

// ── Auto-refresh every 30s while on grand view ────────────────
function startGrandRefresh() {
  stopGrandRefresh();
  _grandRefreshInt = setInterval(() => {
    const page = document.getElementById('page-grand');
    if (!page?.classList.contains('active')) { stopGrandRefresh(); return; }
    renderGrandHeader();
    renderGrandSummaryStrip();
    if (_grandView === 'now')    renderNowSnapshot();
    if (_grandView === 'status') renderStatusBoard();
  }, 30000);
}

function stopGrandRefresh() {
  if (_grandRefreshInt) { clearInterval(_grandRefreshInt); _grandRefreshInt = null; }
}

// ── Grand Header ──────────────────────────────────────────────
function renderGrandHeader() {
  const now = new Date();
  const clockEl = document.getElementById('grand-clock');
  const dateEl  = document.getElementById('grand-date');
  if (clockEl) clockEl.textContent =
    `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  if (dateEl) dateEl.textContent = now.toLocaleDateString('en-GB', {
    weekday:'long', day:'numeric', month:'long', year:'numeric'
  });

  const holiday = getHolidayForDate(todayStr());
  if (holiday && dateEl) {
    dateEl.innerHTML += ` &nbsp;<span style="color:${holiday.color};font-size:13px">${holiday.emoji} ${escH(holiday.name)}</span>`;
  }
}

// ── Summary Strip ─────────────────────────────────────────────
// "18 assigned · 2 gaps · 1 absent · 1 on leave" at a glance
function renderGrandSummaryStrip() {
  const el  = document.getElementById('grand-summary-strip');
  if (!el) return;
  const iso = todayStr();
  const si  = currentSlotIdx();
  const activeEmps = state.employees.filter(e => e.status === 'Active');

  if (si < 0) {
    el.innerHTML = `<span class="summary-chip">Outside shift hours</span>`;
    return;
  }

  let assigned = 0, gaps = 0, absent = 0, onLeave = 0, dayOff = 0;

  activeEmps.forEach(e => {
    if (isEmpDayOff(e.id, iso))      { dayOff++;  return; }
    if (isOnLeave(e.id, iso))        { onLeave++; return; }
    if (state.absences?.[iso]?.[e.id]) { absent++;  return; }
    const { loc } = getResolvedLoc(iso, si, e.id);
    if (loc !== 'off') assigned++;
  });

  REQUIREDLOCS.forEach(req => {
    const covered = activeEmps.some(e => {
      if (isEmpDayOff(e.id, iso)) return false;
      const { loc, source } = getResolvedLoc(iso, si, e.id);
      return loc === req && source !== 'absent' && source !== 'leave';
    });
    if (!covered) gaps++;
  });

  const slotLabel = TIMESLOTS[si] || '';
  el.innerHTML = `
    <span class="summary-chip chip-slot">🕐 ${slotLabel}</span>
    <span class="summary-chip chip-assigned">✅ ${assigned} on shift</span>
    ${gaps    ? `<span class="summary-chip chip-gap">⚠️ ${gaps} gap${gaps>1?'s':''}</span>` : ''}
    ${absent  ? `<span class="summary-chip chip-absent">✖ ${absent} absent</span>` : ''}
    ${onLeave ? `<span class="summary-chip chip-leave">🔒 ${onLeave} on leave</span>` : ''}
    ${dayOff  ? `<span class="summary-chip chip-off">💤 ${dayOff} day off</span>` : ''}
  `;
}

// ── View 1: Right Now Snapshot ────────────────────────────────
function renderNowSnapshot() {
  const grid = document.getElementById('grand-now-grid');
  const hand = document.getElementById('grand-handover-strip');
  if (!grid) return;

  const iso        = todayStr();
  const si         = currentSlotIdx();
  const activeEmps = state.employees.filter(e => e.status === 'Active');

  // Build location → assignees map for current slot
  const locMap = {};
  ALLLOCS.forEach(loc => { locMap[loc] = []; });

  // Also track off/absent/leave employees
  const offEmps = [];

  activeEmps.forEach(emp => {
    if (isEmpDayOff(emp.id, iso))        { offEmps.push({ emp, reason: 'Day Off' }); return; }
    if (isOnLeave(emp.id, iso))          { offEmps.push({ emp, reason: 'On Leave' }); return; }
    if (state.absences?.[iso]?.[emp.id]) { offEmps.push({ emp, reason: 'Absent' });  return; }
    if (si < 0) { offEmps.push({ emp, reason: 'Off Hours' }); return; }
    const { loc } = getResolvedLoc(iso, si, emp.id);
    if (locMap[loc] !== undefined) locMap[loc].push(emp);
    else offEmps.push({ emp, reason: 'Off' });
  });

  // Render location cards
  grid.innerHTML = ALLLOCS.map(loc => {
    const emps    = locMap[loc] || [];
    const color   = LOCCOLOR[loc] || '#888';
    const isEmpty = emps.length === 0;
    const isReq   = REQUIREDLOCS.includes(loc);

    const namesHtml = isEmpty
      ? `<div class="grand-empty ${isReq ? 'grand-empty-critical' : ''}">
          ${isReq ? '⚠️ UNCOVERED' : '— nobody —'}
        </div>`
      : emps.map(e => `
          <div class="grand-emp-chip">
            <div class="grand-emp-avatar" style="background:${color}">${e.name.charAt(0)}</div>
            <span class="grand-emp-name">${escH(e.name)}</span>
          </div>`).join('');

    // Next slot handover preview
    const nextSi   = si + 1;
    let nextHtml   = '';
    if (nextSi < TIMESLOTS.length) {
      const nextEmps = activeEmps.filter(e => {
        if (isEmpDayOff(e.id, iso)) return false;
        const { loc: nl, source } = getResolvedLoc(iso, nextSi, e.id);
        return nl === loc && source !== 'absent' && source !== 'leave';
      });
      if (nextEmps.length) {
        nextHtml = `<div class="grand-next-label">Next: ${nextEmps.map(e => e.name.split(' ')[0]).join(', ')}</div>`;
      }
    }

    return `<div class="grand-loc-card ${isEmpty && isReq ? 'grand-loc-critical' : ''}"
      style="--loc-color:${color}">
      <div class="grand-loc-header" style="background:${color}">
        <span class="grand-loc-name">${LOCLABEL[loc]}</span>
        <span class="grand-loc-count">${emps.length}</span>
      </div>
      <div class="grand-loc-body">
        ${namesHtml}
        ${nextHtml}
      </div>
    </div>`;
  }).join('');

  // Off/absent/leave employees row at bottom
  if (offEmps.length) {
    grid.innerHTML += `<div class="grand-off-row">
      ${offEmps.map(({ emp, reason }) => `
        <span class="grand-off-chip">
          ${escH(emp.name.split(' ')[0])}
          <span class="grand-off-reason">${reason}</span>
        </span>`).join('')}
    </div>`;
  }

  // Handover strip — 15 min warning
  if (hand) renderHandoverStrip(iso, si, hand);
}

// ── Handover Strip ────────────────────────────────────────────
function renderHandoverStrip(iso, si, el) {
  if (si < 0 || si >= TIMESLOTS.length - 1) { el.innerHTML = ''; return; }
  const nm       = nowMins();
  const slotEnd  = SLOTEND[si] * 60;
  const minsLeft = slotEnd - nm;

  if (minsLeft > 15) { el.innerHTML = ''; return; }

  const nextSi     = si + 1;
  const activeEmps = state.employees.filter(e => e.status === 'Active');
  const changes    = [];

  ALLLOCS.forEach(loc => {
    const nowEmps  = activeEmps.filter(e => {
      if (isEmpDayOff(e.id, iso)) return false;
      const { loc: l } = getResolvedLoc(iso, si, e.id);
      return l === loc;
    });
    const nextEmps = activeEmps.filter(e => {
      if (isEmpDayOff(e.id, iso)) return false;
      const { loc: l } = getResolvedLoc(iso, nextSi, e.id);
      return l === loc;
    });
    const nowNames  = nowEmps.map(e => e.name.split(' ')[0]).join(', ');
    const nextNames = nextEmps.map(e => e.name.split(' ')[0]).join(', ');
    if (nowNames !== nextNames) {
      changes.push({ loc, nowNames: nowNames || '—', nextNames: nextNames || '—' });
    }
  });

  if (!changes.length) { el.innerHTML = ''; return; }

  el.innerHTML = `<div class="grand-handover-banner">
    <span class="handover-title">🔄 Handover in ${minsLeft} min</span>
    ${changes.map(c => `
      <span class="handover-chip">
        <span class="handover-loc">${LOCLABEL[c.loc]}</span>
        <span class="handover-arrow">${escH(c.nowNames)} → ${escH(c.nextNames)}</span>
      </span>`).join('')}
  </div>`;
}

// ── View 2: Today Timeline ────────────────────────────────────
function renderGrandTimeline() {
  const wrap     = document.getElementById('grand-timeline-wrap');
  const filter   = document.getElementById('grand-tl-filter')?.value || 'all';
  const locFilter = document.getElementById('grand-tl-loc')?.value  || '';
  const locSel   = document.getElementById('grand-tl-loc');
  if (!wrap) return;

  // Show/hide location filter
  if (locSel) locSel.style.display = filter === 'location' ? '' : 'none';

  const iso        = todayStr();
  const si         = currentSlotIdx();
  const activeEmps = state.employees.filter(e => e.status === 'Active');
  const nm         = nowMins();

  // Rows = employees, cols = slots
  // If filter = location, rows = locations, cols = slots
  const useLocRows = filter === 'location';

  if (useLocRows) {
    const rows = locFilter ? [locFilter] : ALLLOCS;
    wrap.innerHTML = `<div style="overflow-x:auto">
      <table class="grand-tl-table">
        <thead><tr>
          <th class="grand-tl-rowlabel">Location</th>
          ${TIMESLOTS.map((t, i) => `
            <th class="grand-tl-slothdr ${i === si ? 'grand-tl-now-col' : ''}"
              title="${t}">${t.split('–')[0].trim()}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${rows.map(loc => `<tr>
            <td class="grand-tl-rowlabel" style="color:${LOCCOLOR[loc]};font-weight:700">
              ${LOCLABEL[loc]}
            </td>
            ${TIMESLOTS.map((_, slotI) => {
              const empsHere = activeEmps.filter(e => {
                if (isEmpDayOff(e.id, iso)) return false;
                const { loc: l, source } = getResolvedLoc(iso, slotI, e.id);
                return l === loc && source !== 'absent';
              });
              const isPast   = SLOTEND[slotI] * 60 < nm;
              const isCur    = slotI === si;
              const color    = LOCCOLOR[loc];
              return `<td class="grand-tl-cell ${isCur ? 'grand-tl-cur' : ''} ${isPast ? 'grand-tl-past' : ''}"
                style="${empsHere.length ? `background:${color}22;border-left:3px solid ${color}` : ''}"
                title="${empsHere.map(e=>e.name).join(', ') || 'Uncovered'}">
                ${empsHere.length
                  ? empsHere.map(e => `<span class="grand-tl-name">${e.name.split(' ')[0]}</span>`).join('')
                  : `<span class="grand-tl-empty">${REQUIREDLOCS.includes(loc) ? '⚠' : '·'}</span>`}
              </td>`;
            }).join('')}
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  } else {
    // Rows = employees
    wrap.innerHTML = `<div style="overflow-x:auto">
      <table class="grand-tl-table">
        <thead><tr>
          <th class="grand-tl-rowlabel">Employee</th>
          ${TIMESLOTS.map((t, i) => `
            <th class="grand-tl-slothdr ${i === si ? 'grand-tl-now-col' : ''}"
              title="${t}">${t.split('–')[0].trim()}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${activeEmps.map(emp => {
            const isDayOff = isEmpDayOff(emp.id, iso);
            const onLeave  = isOnLeave(emp.id, iso);
            return `<tr>
              <td class="grand-tl-rowlabel">${escH(emp.name)}</td>
              ${TIMESLOTS.map((_, slotI) => {
                const isPast = SLOTEND[slotI] * 60 < nm;
                const isCur  = slotI === si;
                if (isDayOff) return `<td class="grand-tl-cell grand-tl-dayoff ${isCur?'grand-tl-cur':''} ${isPast?'grand-tl-past':''}"><span class="grand-tl-off">OFF</span></td>`;
                if (onLeave)  return `<td class="grand-tl-cell grand-tl-leave  ${isCur?'grand-tl-cur':''} ${isPast?'grand-tl-past':''}"><span class="grand-tl-off">LEV</span></td>`;
                const { loc } = getResolvedLoc(iso, slotI, emp.id);
                const color   = LOCCOLOR[loc] || 'transparent';
                const label   = loc === 'off' ? '' : (LOCLABEL[loc]||loc).slice(0,3).toUpperCase();
                return `<td class="grand-tl-cell ${isCur?'grand-tl-cur':''} ${isPast?'grand-tl-past':''} ${loc==='off'?'grand-tl-offcell':''}"
                  style="${loc!=='off'?`background:${color}22;border-left:3px solid ${color}`:''}"
                  title="${LOCLABEL[loc]||loc}">
                  <span class="grand-tl-name">${label}</span>
                </td>`;
              }).join('')}
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  }
}

// ── View 3: Staff Status Board ────────────────────────────────
function renderStatusBoard() {
  const el = document.getElementById('grand-status-board');
  if (!el) return;

  const iso        = todayStr();
  const si         = currentSlotIdx();
  const activeEmps = state.employees.filter(e => e.status === 'Active');

  // Sort: on-shift first, then day-off/leave/absent
  const withStatus = activeEmps.map(emp => {
    let status = 'onshift', label = '', loc = '', color = '';
    if (isEmpDayOff(emp.id, iso))          { status = 'dayoff';  label = 'Day Off';  color = 'var(--muted)'; }
    else if (isOnLeave(emp.id, iso))        { status = 'leave';   label = 'On Leave'; color = 'var(--purple)'; }
    else if (state.absences?.[iso]?.[emp.id]) { status = 'absent'; label = 'Absent';  color = 'var(--red)'; }
    else if (si < 0)                        { status = 'offhrs';  label = 'Off Hours'; color = 'var(--muted)'; }
    else {
      const resolved = getResolvedLoc(iso, si, emp.id);
      loc   = resolved.loc;
      label = LOCLABEL[loc] || loc;
      color = LOCCOLOR[loc] || '#888';
    }
    return { emp, status, label, loc, color };
  }).sort((a, b) => {
    const order = { onshift:0, offhrs:1, dayoff:2, leave:3, absent:4 };
    return (order[a.status]??5) - (order[b.status]??5);
  });

  if (!withStatus.length) {
    el.innerHTML = `<div style="text-align:center;padding:32px;color:var(--muted)">No active employees.</div>`;
    return;
  }

  el.innerHTML = `<div class="grand-status-grid">
    ${withStatus.map(({ emp, status, label, loc, color }) => {
      const isOnShift = status === 'onshift';
      const initial   = emp.name.charAt(0).toUpperCase();
      // Show today's full simple timeline as dots
      const dotsHtml  = TIMESLOTS.map((_, slotI) => {
        if (isEmpDayOff(emp.id, iso)) return `<span class="status-dot dot-off" title="Day Off"></span>`;
        if (isOnLeave(emp.id, iso))   return `<span class="status-dot dot-leave" title="On Leave"></span>`;
        const { loc: l } = getResolvedLoc(iso, slotI, emp.id);
        const c = LOCCOLOR[l] || 'var(--border2)';
        const isCur = slotI === si;
        return `<span class="status-dot ${isCur?'dot-current':''}"
          style="background:${l==='off'?'var(--border2)':c}"
          title="${TIMESLOTS[slotI]}: ${LOCLABEL[l]||l}"></span>`;
      }).join('');

      return `<div class="grand-status-card ${isOnShift ? 'card-onshift' : 'card-off'}">
        <div class="status-card-top">
          <div class="status-avatar" style="background:${isOnShift ? color : 'var(--surface3)'}">
            ${initial}
          </div>
          <div class="status-card-info">
            <div class="status-name">${escH(emp.name)}</div>
            <div class="status-loc" style="color:${color}">${label}</div>
          </div>
          ${isOnShift
            ? `<div class="status-loc-badge" style="background:${color}22;color:${color};border:1.5px solid ${color}40">
                ${(LOCLABEL[loc]||loc).toUpperCase()}
              </div>`
            : ''}
        </div>
        <div class="status-dots">${dotsHtml}</div>
      </div>`;
    }).join('')}
  </div>`;
}

// ── View 4: Date Lookup ───────────────────────────────────────
function renderGrandLookup() {
  const el  = document.getElementById('grand-lookup-result');
  const iso = document.getElementById('grand-lookup-date')?.value;
  if (!el || !iso) return;

  const holiday    = getHolidayForDate(iso);
  const activeEmps = state.employees.filter(e => e.status === 'Active');
  const nm         = nowMins();
  const isToday    = iso === todayStr();

  let html = '';

  if (holiday) html += `<div class="grand-holiday-chip"
    style="background:${holiday.color}18;border-color:${holiday.color}40;color:${holiday.color}">
    ${holiday.emoji} <strong>${escH(holiday.name)}</strong>
  </div>`;

  // Summary row for that day
  let totalAbsent = 0, totalLeave = 0, totalDayOff = 0;
  activeEmps.forEach(e => {
    if (isEmpDayOff(e.id, iso))          totalDayOff++;
    else if (isOnLeave(e.id, iso))        totalLeave++;
    else if (state.absences?.[iso]?.[e.id]) totalAbsent++;
  });

  html += `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
    <span class="summary-chip chip-assigned">👥 ${activeEmps.length} total</span>
    ${totalDayOff ? `<span class="summary-chip chip-off">💤 ${totalDayOff} day off</span>`    : ''}
    ${totalLeave  ? `<span class="summary-chip chip-leave">🔒 ${totalLeave} on leave</span>`   : ''}
    ${totalAbsent ? `<span class="summary-chip chip-absent">✖ ${totalAbsent} absent</span>`    : ''}
  </div>`;

  html += `<div style="overflow-x:auto"><table class="grand-tl-table">
    <thead><tr>
      <th class="grand-tl-rowlabel">Employee</th>
      ${TIMESLOTS.map((t, i) => {
        const isPast = isToday && SLOTEND[i] * 60 < nm;
        return `<th class="grand-tl-slothdr ${isPast?'grand-tl-past':''}" title="${t}">
          ${t.split('–')[0].trim()}
        </th>`;
      }).join('')}
    </tr></thead>
    <tbody>
      ${activeEmps.map(emp => {
        const isDayOff = isEmpDayOff(emp.id, iso);
        const onLeave  = isOnLeave(emp.id, iso);
        return `<tr>
          <td class="grand-tl-rowlabel">${escH(emp.name)}</td>
          ${TIMESLOTS.map((_, slotI) => {
            if (isDayOff) return `<td class="grand-tl-cell grand-tl-dayoff" title="Day Off">
              <span class="grand-tl-off">OFF</span></td>`;
            if (onLeave)  return `<td class="grand-tl-cell grand-tl-leave" title="On Leave">
              <span class="grand-tl-off">LEV</span></td>`;
            const { loc } = getResolvedLoc(iso, slotI, emp.id);
            const color   = LOCCOLOR[loc] || 'transparent';
            const label   = loc === 'off' ? '' : (LOCLABEL[loc]||loc).slice(0,3).toUpperCase();
            return `<td class="grand-tl-cell ${loc==='off'?'grand-tl-offcell':''}"
              style="${loc!=='off'?`background:${color}22;border-left:3px solid ${color}`:''}"
              title="${LOCLABEL[loc]||loc}">
              <span class="grand-tl-name">${label}</span>
            </td>`;
          }).join('')}
        </tr>`;
      }).join('')}
    </tbody>
  </table></div>`;

  el.innerHTML = html;
}

// ── View 5: Find Person ───────────────────────────────────────
function renderFindPerson() {
  const query  = document.getElementById('grand-find-input')?.value?.trim().toLowerCase() || '';
  const el     = document.getElementById('grand-find-result');
  if (!el) return;
  if (!query) { el.innerHTML = ''; return; }

  const iso    = todayStr();
  const si     = currentSlotIdx();
  const matches = state.employees.filter(e =>
    e.status === 'Active' && e.name.toLowerCase().includes(query)
  );

  if (!matches.length) {
    el.innerHTML = `<div style="color:var(--muted);font-size:13px;padding:16px">No employee found matching "${escH(query)}".</div>`;
    return;
  }

  el.innerHTML = matches.map(emp => {
    let nowStatus = '', nowColor = '';
    if (isEmpDayOff(emp.id, iso))            { nowStatus = 'Day Off';  nowColor = 'var(--muted)'; }
    else if (isOnLeave(emp.id, iso))          { nowStatus = 'On Leave'; nowColor = 'var(--purple)'; }
    else if (state.absences?.[iso]?.[emp.id]) { nowStatus = 'Absent';   nowColor = 'var(--red)'; }
    else if (si < 0)                          { nowStatus = 'Off Hours'; nowColor = 'var(--muted)'; }
    else {
      const { loc } = getResolvedLoc(iso, si, emp.id);
      nowStatus = LOCLABEL[loc] || loc;
      nowColor  = LOCCOLOR[loc] || '#888';
    }

    // Next change — find next slot with different location
    let nextChange = '';
    if (si >= 0 && !isEmpDayOff(emp.id, iso) && !isOnLeave(emp.id, iso)) {
      const { loc: curLoc } = getResolvedLoc(iso, si, emp.id);
      for (let i = si + 1; i < TIMESLOTS.length; i++) {
        const { loc: nextLoc } = getResolvedLoc(iso, i, emp.id);
        if (nextLoc !== curLoc) {
          nextChange = `<div class="find-next">Next change: ${TIMESLOTS[i]} → <span style="color:${LOCCOLOR[nextLoc]||'inherit'}">${LOCLABEL[nextLoc]||nextLoc}</span></div>`;
          break;
        }
      }
    }

    // Full today schedule
    const slotsHtml = TIMESLOTS.map((slot, slotI) => {
      if (isEmpDayOff(emp.id, iso)) return '';
      if (isOnLeave(emp.id, iso))   return '';
      const { loc } = getResolvedLoc(iso, slotI, emp.id);
      const color   = LOCCOLOR[loc] || 'var(--border2)';
      const isCur   = slotI === si;
      const isPast  = SLOTEND[slotI] * 60 < nowMins();
      return `<div class="find-slot-row ${isCur?'find-slot-cur':''} ${isPast?'find-slot-past':''}">
        <span class="find-slot-time">${slot}</span>
        <span class="find-slot-loc" style="background:${color}22;color:${color};border:1.5px solid ${color}40">
          ${LOCLABEL[loc]||loc}
        </span>
      </div>`;
    }).filter(Boolean).join('');

    return `<div class="grand-find-card">
      <div class="find-card-top">
        <div class="find-avatar" style="background:${nowColor}">${emp.name.charAt(0)}</div>
        <div class="find-info">
          <div class="find-name">${escH(emp.name)}</div>
          <div class="find-now" style="color:${nowColor}">📍 ${nowStatus}</div>
          ${nextChange}
        </div>
      </div>
      ${slotsHtml ? `<div class="find-slots">${slotsHtml}</div>` : ''}
    </div>`;
  }).join('');
}

// ── Print ─────────────────────────────────────────────────────
function triggerPrint() {
  // Switch to timeline view for print — most informative
  setGrandView('timeline');
  setTimeout(() => {
    document.body.classList.add('print-mode');
    window.print();
    document.body.classList.remove('print-mode');
  }, 300);
}
