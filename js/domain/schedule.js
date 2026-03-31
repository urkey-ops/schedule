// ── domain/schedule.js ───────────────────────────────────────
// Compatibility + helper layer that sits on top of shifts.js.
// getResolvedLoc is kept so existing rendering code (live.js,
// grandview.js) doesn't need to change signatures immediately.

function isEmpDayOff(empId, iso) {
  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return false;
  const dow = DAYSSHORT[(new Date(iso + 'T00:00:00').getDay() + 6) % 7];
  return (emp.daysOff || []).includes(dow);
}

function isOnLeave(empId, iso) {
  return (state.leaveRequests || []).some(l =>
    l.empId === empId && l.status === 'active' &&
    iso >= l.from && iso <= l.to
  );
}

// Returns { loc, source } at a given display slot index.
// source: 'shift' | 'earlygate' | 'leave' | 'dayoff' | 'absent' | 'fallback'
function getResolvedLoc(iso, si, empId) {
  if (isEmpDayOff(empId, iso)) return { loc: 'off',  source: 'dayoff'  };
  if (isOnLeave(empId, iso))   return { loc: 'vac',  source: 'leave'   };
  if (state.absences?.[iso]?.[empId]) return { loc: 'off', source: 'absent' };

  const slotMins = DISPLAY_START_MINS + si * SLOT_DURATION_MINS;
  const loc      = getEmpLocAtTime(iso, empId, slotMins);

  const isEarlyGate = state.earlyGate?.[iso] === empId &&
                      slotMins >= EARLY_GATE_START &&
                      slotMins < EARLY_GATE_END;

  if (isEarlyGate) return { loc: 'gate', source: 'earlygate' };
  if (loc !== 'off') return { loc, source: 'shift' };

  const emp = state.employees.find(e => e.id === empId);
  return { loc: emp?.fallback || 'off', source: 'fallback' };
}

function getSlotAssignments(iso, si) {
  return state.employees
    .filter(e => e.status === 'Active')
    .map(e => ({ emp: e, ...getResolvedLoc(iso, si, e.id) }));
}

// countDayOverrides — counts how many employees have shift overrides on a day
function countDayOverrides(iso) {
  return new Set((state.shifts?.[iso] || []).map(s => s.empId)).size;
}

// applyDefaultToDay — copies base rota shifts into override layer for a date
function applyDefaultToDay(iso) {
  const dow     = DAYSSHORT[(new Date(iso + 'T00:00:00').getDay() + 6) % 7];
  const empRota = state.defaultSchedule?.[dow] || {};
  if (!state.shifts)      state.shifts      = {};
  if (!state.shifts[iso]) state.shifts[iso] = [];

  pushUndo('Apply default', state);

  state.employees
    .filter(e => e.status === 'Active' && !isEmpDayOff(e.id, iso))
    .forEach(e => {
      const blocks = empRota[e.id] || [];
      // Remove existing overrides for this employee on this day
      state.shifts[iso] = (state.shifts[iso] || []).filter(s => s.empId !== e.id);
      blocks.forEach(b => {
        state.shifts[iso].push({ id: uid(), empId: e.id, loc: b.loc,
                                 start: b.start, end: b.end });
      });
    });

  persistAll('shifts');
  showToast('Default rota applied to ' + fmtDate(iso));
}

function clearOverridesForDay(iso) {
  if (!confirm(`Clear all shift overrides for ${fmtDate(iso)}?`)) return;
  pushUndo('Clear overrides', state);
  delete state.shifts?.[iso];
  persistAll('shifts');
  showToast('Overrides cleared');
}
