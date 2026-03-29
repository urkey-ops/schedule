// ── pages/grandview.js ────────────────────────────────────────

let _grandView     = 'now';
let _grandRefTimer = null;

function stopGrandRefresh() {
  clearInterval(_grandRefTimer);
  _grandRefTimer = null;
}

function renderGrandView() {
  // Update header
  const now = new Date();
  const gc  = document.getElementById('grand-clock');
  const gd  = document.getElementById('grand-date');
  if (gc) gc.textContent = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  if (gd) gd.textContent = now.toLocaleDateString('en-GB', {
    weekday:'long', day:'numeric', month:'long', year:'numeric'
  });

  renderGrandSummaryStrip();

  // Auto-refresh every 60s while grand view is active
  if (!_grandRefTimer) {
    _grandRefTimer = setInterval(() => {
      if (document.getElementById('page-grand')?.classList.contains('active')) {
        renderGrandView();
      } else {
        stopGrandRefresh();
      }
    }, 60000);
  }

  // Render active subview
  if (_grandView === 'now')      renderGrandNow();
  if (_grandView === 'timeline') renderGrandTimeline();
  if (_grandView === 'status')   renderGrandStatus();
}

function setGrandView(view, tabEl) {
  _grandView = view;
  document.querySelectorAll('.grand-subview').forEach(el =>
    el.classList.add('hidden'));
  document.querySelectorAll('.grand-tab').forEach(t =>
    t.classList.remove('active'));
  document.getElementById(`gview-${view}`)?.classList.remove('hidden');
  tabEl?.classList.add('active');

  if (view === 'now')      renderGrandNow();
  if (view === 'timeline') renderGrandTimeline();
  if (view === 'status')   renderGrandStatus();
}

function triggerPrint() {
  window.print();
}

// ── Summary strip ─────────────────────────────────────────────

function renderGrandSummaryStrip() {
  const el  = document.getElementById('grand-summary-strip');
  if (!el) return;
  const iso = todayStr();

  const activeEmps  = state.employees.filter(e => e.status === 'Active');
  const onLeave     = activeEmps.filter(e => isOnLeave(e.id, iso)).length;
  const onDayOff    = activeEmps.filter(e => isEmpDayOff(e.id, iso)).length;
  const absent      = Object.keys(state.absences?.[iso] || {}).length;
  const working     = activeEmps.length - onLeave - onDayOff;
  const gaps        = getDayGapCount(iso);

  el.innerHTML = `
    <div class="grand-summary-chip">👥 ${working} working</div>
    ${onLeave  ? `<div class="grand-summary-chip chip-leave">🔒 ${onLeave} on leave</div>` : ''}
    ${onDayOff ? `<div class="grand-summary-chip chip-dayoff">😴 ${onDayOff} day off</div>` : ''}
    ${absent   ? `<div class="grand-summary-chip chip-absent">✖ ${absent} absent</div>` : ''}
    ${gaps     ? `<div class="grand-summary-chip chip-gap">⚠️ ${gaps} gap${gaps>1?'s':''}</div>` : ''}`;
}

// ── Right Now grid ────────────────────────────────────────────

function renderGrandNow() {
  const el  = document.getElementById('grand-now-grid');
  const hs  = document.getElementById('grand-handover-strip');
  if (!el) return;

  const iso        = todayStr();
  const si         = currentSlotIdx();
  const activeEmps = state.employees.filter(e => e.status === 'Active');

  if (si < 0) {
    el.innerHTML = `<div style="grid-column:1/-1;text-align:center;
      padding:40px;color:var(--muted);font-size:14px">
      Outside operating hours.</div>`;
    if (hs) hs.innerHTML = '';
    return;
  }

  // Group by location
  const groups = {};
  REQUIREDLOCS.forEach(loc => { groups[loc] = { emps:[], uncovered: false }; });

  activeEmps.forEach(e => {
    if (isEmpDayOff(e.id, iso) || isOnLeave(e.id, iso)) return;
    if (state.absences?.[iso]?.[e.id]) return;
    const { loc } = getResolvedLoc(iso, si, e.id);
    if (!groups[loc]) groups[loc] = { emps:[], uncovered: false };
    groups[loc].emps.push(e);
  });

  REQUIREDLOCS.forEach(loc => {
    if (!groups[loc]) groups[loc] = { emps:[], uncovered: false };
    groups[loc].uncovered = groups[loc].emps.length === 0;
  });

  // Handover check — next slot
  const nextSi    = si + 1;
  const handovers = [];
  if (nextSi < TIMESLOTS.length) {
    activeEmps.forEach(e => {
      if (isEmpDayOff(e.id, iso) || isOnLeave(e.id, iso)) return;
      const { loc: curLoc  } = getResolvedLoc(iso, si,     e.id);
      const { loc: nextLoc } = getResolvedLoc(iso, nextSi, e.id);
      if (curLoc !== nextLoc && curLoc !== 'off' && nextLoc !== 'off') {
        handovers.push({ emp: e, from: curLoc, to: nextLoc });
      }
    });
  }

  el.innerHTML = Object.entries(groups).map(([loc, { emps, uncovered }]) => {
    const color = LOCCOLOR[loc] || '#888';
    const label = LOCLABEL[loc] || loc;

    return `<div class="live-card ${uncovered?'uncovered':''}">
      <div class="live-card-stripe"
        style="background:${uncovered?'var(--red)':color}"></div>
      <div class="live-card-hdr">
        <span class="live-loc-tag"
          style="background:${color}22;color:${color}">${label}</span>
        <span class="live-slot-time">${TIMESLOTS[si]}</span>
      </div>
      <div class="live-card-body">
        ${uncovered
          ? `<div class="live-uncovered">⚠️ Uncovered
              ${state.mode==='admin'
                ? `<button class="btn btn-sm btn-warn" style="margin-left:auto"
                    onclick="openFillGapWizard('${iso}',${si},'${loc}')">
                    Fill</button>`
                : ''}</div>`
          : emps.map(e => {
              const absent = !!state.absences?.[iso]?.[e.id];
              const isHO   = handovers.some(h => h.emp.id === e.id);
              return `<div class="live-emp-name">${escH(e.name)}</div>
                <div class="live-sub">
                  ${absent ? '<span class="absent-badge">Absent</span>' : ''}
                  ${isHO  ? '<span class="handover-badge">Handover soon</span>' : ''}
                </div>
                ${state.mode==='admin'
                  ? `<button class="present-toggle ${absent?'absent':'present'}"
                      onclick="toggleAbsent('${e.id}','${iso}')">
                      ${absent?'✖ Mark Present':'✔ Present'}</button>`
                  : ''}`;
            }).join('')}
        ${renderUpNextGrand(loc, iso, si)}
      </div>
    </div>`;
  }).join('');

  // Handover strip
  if (hs) {
    hs.innerHTML = handovers.length
      ? `<div class="card" style="padding:12px 16px;margin-top:8px">
          <div style="font-size:11px;font-weight:700;color:var(--orange);
                      text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px">
            🔄 Upcoming Handovers (next slot)
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${handovers.map(h =>
              `<div style="padding:5px 10px;background:var(--orange-bg);
                           border:1px solid rgba(217,79,12,.2);border-radius:8px;
                           font-size:12px;font-weight:600;color:var(--orange)">
                ${escH(h.emp.name)}:
                ${LOCLABEL[h.from]||h.from} → ${LOCLABEL[h.to]||h.to}
              </div>`
            ).join('')}
          </div>
        </div>`
      : '';
  }
}

function renderUpNextGrand(loc, iso, curSi) {
  for (let si = curSi + 1; si < TIMESLOTS.length; si++) {
    const emps = state.employees
      .filter(e =>
        e.status==='Active' &&
        !isEmpDayOff(e.id, iso) &&
        !isOnLeave(e.id, iso) &&
        getResolvedLoc(iso, si, e.id).loc === loc
      );
    if (emps.length) {
      return `<div class="live-next">
        <div class="live-next-title">Up next</div>
        <div class="live-next-slot">
          <span>${emps.map(e => escH(e.name.split(' ')[0])).join(', ')}</span>
          <span class="live-next-time">
            ${TIMESLOTS[si].split('–')[0].trim()}</span>
        </div>
      </div>`;
    }
  }
  return '';
}

// ── Today Timeline ────────────────────────────────────────────

function renderGrandTimeline() {
  const wrap = document.getElementById('grand-timeline-wrap');
  if (!wrap) return;

  const iso        = todayStr();
  const filter     = document.getElementById('grand-tl-filter')?.value || 'all';
  const locFilter  = document.getElementById('grand-tl-loc')?.value    || '';

  // Show/hide loc filter
  const locSel = document.getElementById('grand-tl-loc');
  if (locSel) locSel.style.display = filter === 'location' ? '' : 'none';

  const activeEmps = state.employees.filter(e => e.status === 'Active');

  // Timeline bounds — first slot start to last slot end
  const [startH, startM] = parseSlotTime(TIMESLOTS[0]);
  const [endH,   endM  ] = parseSlotTime(TIMESLOTS[TIMESLOTS.length-1]);
  const startMins = startH * 60 + startM;
  const endMins   = endH   * 60 + endM + (SLOT_DURATION_MINS || 30);
  const totalMins = endMins - startMins;

  const nowPct = Math.min(100, Math.max(0,
    ((nowMins() - startMins) / totalMins) * 100
  ));

  // Build time labels
  const timeLabels = [];
  for (let m = startMins; m <= endMins; m += 60) {
    const h = Math.floor(m/60);
    timeLabels.push({ pct: ((m-startMins)/totalMins)*100, label: `${h}:00` });
  }

  const rows = activeEmps.map(e => {
    if (isEmpDayOff(e.id, iso) || isOnLeave(e.id, iso)) return null;

    const segments = TIMESLOTS.map((slot, si) => {
      const { loc } = getResolvedLoc(iso, si, e.id);
      const [sh, sm] = parseSlotTime(slot);
      const slotStart = sh * 60 + sm;
      const slotEnd   = slotStart + (SLOT_DURATION_MINS || 30);
      const left  = ((slotStart - startMins) / totalMins) * 100;
      const width = ((slotEnd   - slotStart) / totalMins) * 100;
      return { loc, left, width, slot };
    });

    if (filter === 'location' && locFilter) {
      if (!segments.some(s => s.loc === locFilter)) return null;
    }

    return { e, segments };
  }).filter(Boolean);

  wrap.innerHTML = `
    <div style="margin-bottom:4px">
      <div class="timeline-time-labels" style="margin-left:100px">
        ${timeLabels.map(tl =>
          `<div style="position:absolute;left:calc(100px + ${tl.pct}% * (100% - 100px) / 100);
                       font-size:9px;color:var(--subtle);
                       font-family:'DM Mono',monospace;transform:translateX(-50%)">
            ${tl.label}</div>`
        ).join('')}
      </div>
    </div>
    <div style="position:relative">
      ${rows.map(({ e, segments }) => `
        <div class="grand-tl-row" style="display:flex;align-items:center;
             margin-bottom:4px;gap:0">
          <div class="grand-tl-rowlabel"
            style="min-width:100px;font-size:11px;font-weight:600;
                   color:var(--text);padding:4px 8px;flex-shrink:0;
                   white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${escH(e.name.split(' ')[0])}
          </div>
          <div style="flex:1;height:28px;background:var(--surface3);
                      border-radius:8px;overflow:hidden;position:relative;
                      border:1px solid var(--border)">
            ${segments.map(seg => {
              const color = LOCCOLOR[seg.loc] || 'transparent';
              if (seg.loc === 'off' || seg.loc === 'vac') return '';
              return `<div style="position:absolute;left:${seg.left}%;
                                  width:${seg.width}%;height:100%;
                                  background:${color};opacity:.85;
                                  display:flex;align-items:center;
                                  justify-content:center;overflow:hidden"
                title="${LOCLABEL[seg.loc]||seg.loc} — ${seg.slot}">
                <span style="font-size:8px;font-weight:700;color:#fff;
                             white-space:nowrap;padding:0 2px">
                  ${LOCLABEL[seg.loc]||seg.loc}
                </span>
              </div>`;
            }).join('')}
            <div style="position:absolute;top:0;bottom:0;
                        left:${nowPct}%;width:2px;
                        background:var(--text);opacity:.35;
                        border-radius:1px;z-index:5"></div>
          </div>
        </div>`
      ).join('')}
    </div>`;
}

// ── Staff Status board ────────────────────────────────────────

function renderGrandStatus() {
  const el  = document.getElementById('grand-status-board');
  if (!el) return;
  const iso        = todayStr();
  const si         = currentSlotIdx();
  const activeEmps = state.employees.filter(e => e.status === 'Active');

  const categories = {
    working : [],
    dayoff  : [],
    leave   : [],
    absent  : [],
  };

  activeEmps.forEach(e => {
    if (state.absences?.[iso]?.[e.id])  { categories.absent.push(e);  return; }
    if (isOnLeave(e.id, iso))           { categories.leave.push(e);   return; }
    if (isEmpDayOff(e.id, iso))         { categories.dayoff.push(e);  return; }
    categories.working.push(e);
  });

  const catConfig = [
    { key:'working', label:'Working Today',  icon:'✅', cls:'chip-active'  },
    { key:'leave',   label:'On Leave',        icon:'🔒', cls:'chip-leave'   },
    { key:'dayoff',  label:'Day Off',          icon:'😴', cls:'chip-dayoff'  },
    { key:'absent',  label:'Absent',           icon:'✖',  cls:'chip-absent'  },
  ];

  el.innerHTML = `<div class="grand-status-grid"
    style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px">
    ${catConfig.map(({ key, label, icon, cls }) => {
      const emps = categories[key];
      return `<div class="card" style="padding:0;overflow:hidden">
        <div style="padding:10px 14px;border-bottom:1px solid var(--border);
                    display:flex;align-items:center;gap:8px">
          <span style="font-size:14px">${icon}</span>
          <span style="font-size:13px;font-weight:700">${label}</span>
          <span class="status-chip ${cls}" style="margin-left:auto">
            ${emps.length}
          </span>
        </div>
        <div style="padding:10px 14px;display:flex;flex-direction:column;gap:6px">
          ${emps.length
            ? emps.map(e => {
                const { loc } = si >= 0
                  ? getResolvedLoc(iso, si, e.id)
                  : { loc: e.fallback||'off' };
                const color = LOCCOLOR[loc] || 'var(--muted)';
                return `<div style="display:flex;align-items:center;gap:8px;
                                    font-size:13px">
                  <span style="font-weight:600">${escH(e.name)}</span>
                  ${key==='working' && loc !== 'off'
                    ? `<span style="margin-left:auto;font-size:10px;font-weight:700;
                               padding:2px 8px;border-radius:10px;
                               background:${color}22;color:${color}">
                        ${LOCLABEL[loc]||loc}</span>`
                    : ''}
                </div>`;
              }).join('')
            : `<div style="color:var(--muted);font-size:12px">None</div>`}
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

// ── Date Lookup ───────────────────────────────────────────────

function renderGrandLookup() {
  const iso = document.getElementById('grand-lookup-date')?.value;
  const el  = document.getElementById('grand-lookup-result');
  if (!iso || !el) return;

  const activeEmps = state.employees.filter(e => e.status === 'Active');
  const holiday    = getHolidayForDate(iso);

  el.innerHTML = `
    ${holiday
      ? `<div class="holiday-banner" style="margin-bottom:12px;
             background:${holiday.color}22;border-color:${holiday.color}55;
             color:${holiday.color}">
           ${holiday.emoji} <strong>${escH(holiday.name)}</strong>
         </div>`
      : ''}
    <div style="overflow-x:auto">
      <table class="data-table">
        <thead><tr>
          <th>Time Slot</th>
          ${activeEmps.map(e =>
            `<th style="font-size:11px">${escH(e.name.split(' ')[0])}</th>`
          ).join('')}
        </tr></thead>
        <tbody>
          ${TIMESLOTS.map((slot, si) => `
            <tr>
              <td class="slot-label" style="font-size:10px">${slot}</td>
              ${activeEmps.map(e => {
                const isDO    = isEmpDayOff(e.id, iso);
                const onLeave = isOnLeave(e.id, iso);
                if (isDO)    return `<td><div class="dayoff-lock">—</div></td>`;
                if (onLeave) return `<td><div class="leave-lock">🔒</div></td>`;
                const { loc } = getResolvedLoc(iso, si, e.id);
                return `<td>
                  <span class="loc-select ${LOCCLS[loc]||''}"
                    style="font-size:10px;padding:3px 6px">
                    ${LOCLABEL[loc]||loc}
                  </span></td>`;
              }).join('')}
            </tr>`
          ).join('')}
        </tbody>
      </table>
    </div>`;
}

// ── Find Person ───────────────────────────────────────────────

function renderFindPerson() {
  const query = document.getElementById('grand-find-input')?.value?.toLowerCase().trim();
  const el    = document.getElementById('grand-find-result');
  if (!el) return;

  if (!query) { el.innerHTML = ''; return; }

  const matches = state.employees.filter(e =>
    e.name.toLowerCase().includes(query)
  );

  if (!matches.length) {
    el.innerHTML = `<div style="color:var(--muted);font-size:13px;padding:12px 0">
      No employees match "${escH(query)}".</div>`;
    return;
  }

  const iso = todayStr();
  const si  = currentSlotIdx();

  el.innerHTML = matches.map(e => {
    const onLeave = isOnLeave(e.id, iso);
    const isDO    = isEmpDayOff(e.id, iso);
    const absent  = !!state.absences?.[iso]?.[e.id];
    const { loc } = si >= 0 && !isDO && !onLeave
      ? getResolvedLoc(iso, si, e.id)
      : { loc: null };
    const color = loc ? (LOCCOLOR[loc]||'var(--muted)') : 'var(--muted)';

    return `<div class="card" style="padding:14px 18px;margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <div>
          <div style="font-size:18px;font-weight:800;color:var(--text)">
            ${escH(e.name)}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">
            ${e.id}</div>
        </div>
        <div style="margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          ${absent
            ? '<span class="status-chip chip-absent">✖ Absent</span>'
            : onLeave
            ? '<span class="status-chip chip-leave">🔒 On Leave</span>'
            : isDO
            ? '<span class="status-chip chip-dayoff">😴 Day Off</span>'
            : loc
            ? `<span style="font-size:13px;font-weight:700;padding:5px 12px;
                            border-radius:10px;background:${color}22;color:${color}">
                📍 ${LOCLABEL[loc]||loc}</span>`
            : '<span class="status-chip chip-active">Active</span>'}
        </div>
      </div>
      ${!isDO && !onLeave
        ? `<div style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap">
            ${TIMESLOTS.map((slot, i) => {
              const { loc: l } = getResolvedLoc(iso, i, e.id);
              const c = LOCCOLOR[l] || 'var(--border2)';
              return `<div style="font-size:10px;padding:3px 8px;border-radius:6px;
                                  background:${c}22;color:${c};font-weight:700;
                                  border:1px solid ${c}44">
                ${slot.split('–')[0].trim()} ${LOCLABEL[l]||l}
              </div>`;
            }).join('')}
          </div>`
        : ''}
    </div>`;
  }).join('');
}
