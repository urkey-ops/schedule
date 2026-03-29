// ── ui/toast.js ───────────────────────────────────────────────

let _toastTimer = null;

function showToast(msg) {
  const t = document.getElementById('undo-toast');
  const m = document.getElementById('undo-msg');
  if (!t || !m) return;
  m.textContent = msg;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

function hideToast() {
  document.getElementById('undo-toast')?.classList.remove('show');
}

// FIX: canonical undo — uses state._undoStack (one source of truth).
// The old state.js versions (undoStack module-level var + pushUndo/undoLastChange)
// have been removed from state.js to eliminate the dual-definition conflict.
function undoLastChange() {
  if (!state._undoStack?.length) { showToast('Nothing to undo'); return; }
  const snap = state._undoStack.pop();
  Object.keys(snap).forEach(k => { state[k] = snap[k]; });
  persistAll();
  renderAll();
  hideToast();
  showToast('Undone');
}

function pushUndo(label, currentState) {
  if (!state._undoStack) state._undoStack = [];
  // Deep-clone only data keys; skip _undoStack itself to avoid stack inflation
  const snap = {};
  Object.keys(currentState).forEach(k => {
    if (k !== '_undoStack') snap[k] = JSON.parse(JSON.stringify(currentState[k]));
  });
  state._undoStack.push(snap);
  if (state._undoStack.length > 20) state._undoStack.shift();
}
