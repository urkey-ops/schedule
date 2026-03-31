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

function undoLastChange() {
  if (!state._undoStack?.length) { showToast('Nothing to undo'); return; }
  const snap = state._undoStack.pop();
  Object.keys(snap).forEach(k => { state[k] = snap[k]; });
  FBKEYS.forEach(k => markDirty(k));
  persistAll();
  renderAll();
  hideToast();
  showToast('Undone');
}

function pushUndo(label, currentState) {
  if (!state._undoStack) state._undoStack = [];
  const snap = {};
  Object.keys(currentState).forEach(k => {
    if (k !== '_undoStack') snap[k] = JSON.parse(JSON.stringify(currentState[k]));
  });
  state._undoStack.push(snap);
  if (state._undoStack.length > 20) state._undoStack.shift();
}

// ── Inline confirm toast (replaces window.confirm on mobile) ─
function showConfirm(msg, onConfirm) {
  const t = document.getElementById('undo-toast');
  const m = document.getElementById('undo-msg');
  if (!t || !m) { if (confirm(msg)) onConfirm(); return; }

  m.innerHTML = `${escH(msg)}
    <button class="undo-btn" style="margin-left:8px;background:var(--green)"
      onclick="(${onConfirm.toString()})();hideToast()">Yes</button>
    <button class="undo-btn" onclick="hideToast()">No</button>`;

  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 8000);
}
