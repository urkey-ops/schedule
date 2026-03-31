// ── domain/audit.js ───────────────────────────────────────────

const MAX_AUDIT_ENTRIES = 20;

function logAction(action, detail) {
  if (!state.auditLog) state.auditLog = [];
  state.auditLog.unshift({
    id    : uid(),
    ts    : Date.now(),
    action,
    detail,
  });
  // Cap at max entries
  if (state.auditLog.length > MAX_AUDIT_ENTRIES) {
    state.auditLog = state.auditLog.slice(0, MAX_AUDIT_ENTRIES);
  }
  persistAll('auditLog');
}

function getAuditLog() {
  return state.auditLog || [];
}

function renderAuditLog(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const log = getAuditLog();

  if (!log.length) {
    el.innerHTML = `<div style="color:var(--muted);font-size:13px;padding:12px 0">
      No actions logged yet.</div>`;
    return;
  }

  el.innerHTML = log.map(entry => {
    const d   = new Date(entry.ts);
    const ts  = d.toLocaleDateString('en-GB', {
      day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'
    });
    return `<div class="audit-row">
      <span class="audit-ts">${ts}</span>
      <span class="audit-action">${escH(entry.action.replace(/_/g,' '))}</span>
      <span class="audit-detail">${escH(entry.detail || '')}</span>
    </div>`;
  }).join('');
}
