// ── ui/alerts-bar.js ──────────────────────────────────────────
// Renders the dismissible alert bar UI — depends on domain/alerts.js
// FIX: toggleAlertGroup(id) uses string ID — the conflicting DOM-element version
// that was in adminhq.js has been removed.

function renderAlertsBar(containerId, iso) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const alerts = scanAlerts(iso);
  if (!alerts.length) { el.innerHTML = ''; return; }

  const groups = {};
  alerts.forEach(a => {
    const key = a.type;
    if (!groups[key]) groups[key] = [];
    groups[key].push(a);
  });

  el.innerHTML = Object.entries(groups).map(([type, items]) => {
    const id    = `alert-group-${containerId}-${type}`;
    const title = ALERT_TYPE_LABELS[type] || type;
    const icon  = ALERT_TYPE_ICONS[type]  || '⚠️';
    return `<div class="alert-group alert-group-${type}" id="${id}">
      <div class="alert-group-hdr"
        onclick="toggleAlertGroup('${id}')">
        <span>${icon} ${title}
          <span class="alert-count">${items.length}</span>
        </span>
        <span class="alert-arr">▾</span>
      </div>
      <div class="alert-group-body">
        ${items.map((a,i) => `
          <div class="alert-item" id="${id}-item-${i}">
            <span>${escH(a.msg)}</span>
            ${a.type === ALERT_TYPES.GAP
              ? `<button class="btn btn-sm btn-ghost"
                  onclick="openFillGapWizard('${a.iso}',${a.si},'${a.loc}')">
                  Fill Gap</button>`
              : ''}
            <button class="btn btn-sm btn-ghost alert-dismiss"
              onclick="dismissAlert('${id}-item-${i}')">✕</button>
          </div>`).join('')}
      </div>
    </div>`;
  }).join('');
}

// FIX: canonical toggleAlertGroup — accepts element ID string.
// The conflicting version in adminhq.js (which accepted a DOM element) is removed.
function toggleAlertGroup(id) {
  const el = document.getElementById(id);
  el?.classList.toggle('collapsed');
}

function dismissAlert(itemId) {
  document.getElementById(itemId)?.remove();
}

function renderGlobalAlerts() {
  if (state.mode !== 'admin') return;
  const el = document.getElementById('global-alerts-bar');
  if (!el) return;
  el.classList.remove('hidden');
  renderAlertsBar('global-alerts-bar', todayStr());
}

function renderSchedAlerts() {
  const area = document.getElementById('sched-alert-area');
  if (!area) return;
  const iso = state.currentDateISO;
  let html  = '';

  (state.leaveRequests||[]).filter(l => l.status==='active').forEach(l => {
    const cur = new Date(iso+'T00:00:00');
    if (cur >= new Date(l.from+'T00:00:00') && cur <= new Date(l.to+'T00:00:00')) {
      const emp = state.employees.find(e => e.id === l.empId);
      if (emp) html += `<div class="alert-banner leave">
        🔒 ${escH(emp.name)} is on ${l.type} leave today</div>`;
    }
  });

  (state.swapRequests||[]).forEach(s => {
    if (s.fromDate===iso && s.status==='active') {
      const emp = state.employees.find(e => e.id === s.empId);
      if (emp) html += `<div class="alert-banner swap">
        🔄 ${escH(emp.name)} swapped day off — working today</div>`;
    }
  });

  area.innerHTML = html;
}
