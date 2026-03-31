// ── ui/alerts-bar.js ─────────────────────────────────────────

function renderAlertsBar(containerId, iso) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const alerts = scanAlerts(iso);
  if (!alerts.length) { el.innerHTML = ''; return; }

  const MAX_SHOWN = 5;
  const shown     = alerts.slice(0, MAX_SHOWN);
  const extra     = alerts.length - MAX_SHOWN;

  el.innerHTML = `
    <div class="alert-flat-list">
      ${shown.map((a, i) => `
        <div class="alert-flat-item alert-flat-${a.type}" id="${containerId}-item-${i}">
          <span class="alert-flat-icon">${ALERT_TYPE_ICONS[a.type] || '⚠️'}</span>
          <span class="alert-flat-msg">${escH(a.msg)}</span>
          ${a.type === ALERT_TYPES.GAP && state.mode === 'admin'
            ? `<button class="btn btn-sm btn-warn alert-fill-btn"
                onclick="openFillGapModal('${a.iso}','${a.loc}',${a.gapStart},${a.gapEnd})">
                Fill</button>`
            : ''}
          <button class="alert-dismiss-btn"
            onclick="document.getElementById('${containerId}-item-${i}')?.remove()">✕</button>
        </div>`).join('')}
      ${extra > 0
        ? `<div class="alert-flat-more">+${extra} more alert${extra>1?'s':''}</div>`
        : ''}
    </div>`;
}

function renderGlobalAlerts() {
  if (state.mode !== 'admin') return;
  const el = document.getElementById('global-alerts-bar');
  if (!el) return;
  el.classList.remove('hidden');
  renderAlertsBar('global-alerts-bar', todayStr());
}

function renderSchedAlerts() {
  renderAlertsBar('rota-alerts-bar', state.currentDateISO);
}

function openFillGapModal(iso, loc, gapStart, gapEnd) {
  const inner = document.getElementById('fill-gap-modal-inner');
  if (!inner) return;
  const color      = LOCCOLOR[loc] || '#888';
  const label      = LOCLABEL[loc] || loc;
  const activeEmps = state.employees.filter(e =>
    e.status === 'Active' &&
    !isEmpDayOff(e.id, iso) &&
    !isOnLeave(e.id, iso) &&
    !state.absences?.[iso]?.[e.id]
  );
  inner.innerHTML = `
    <div style="margin-bottom:14px">
      <div style="font-size:15px;font-weight:800;color:var(--text)">
        Fill Gap — <span style="color:${color}">${label}</span>
      </div>
      <div style="font-size:12px;color:var(--muted);margin-top:4px">
        ${fmtDate(iso)} &nbsp;${minsToHHMM(gapStart)}–${minsToHHMM(gapEnd)}
      </div>
    </div>
    ${activeEmps.length
      ? activeEmps.map(e => {
          const used    = calcScheduledHrsWeek(e.id, state.currentWeekMon || toDateStr(getWeekMonday(new Date())));
          const cap     = getEmpHourCap(e.id);
          const overCap = used >= cap;
          const curLoc  = getEmpLocAtTime(iso, e.id, gapStart + 1);
          return `
            <div class="fgw-emp-row ${overCap?'fgw-overcap':''}">
              <div class="fgw-emp-info">
                <span class="fgw-emp-name">${escH(e.name)}</span>
                <span class="fgw-emp-cur" style="color:var(--muted)">
                  Currently: ${LOCLABEL[curLoc]||curLoc}
                </span>
                <span class="fgw-emp-hrs" style="color:${overCap?'var(--red)':'var(--muted)'}">
                  ${used.toFixed(1)}/${cap}h ${overCap?'⚠ over cap':''}
                </span>
              </div>
              <button class="btn btn-sm btn-success"
                onclick="fillGapAssign('${iso}','${e.id}','${loc}',${gapStart},${gapEnd})">
                Assign
              </button>
            </div>`;
        }).join('')
      : '<div class="fgw-empty">No available employees.</div>'}`;
  openModal('fill-gap-modal');
}

function fillGapAssign(iso, empId, loc, gapStart, gapEnd) {
  addShift(iso, empId, loc, gapStart, gapEnd);
  closeModal('fill-gap-modal');
  renderAll();
  showToast(`Gap filled — ${LOCLABEL[loc]||loc}`);
}
