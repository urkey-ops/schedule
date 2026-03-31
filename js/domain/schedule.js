// ── domain/schedule.js ───────────────────────────────────────

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

function getResolvedLoc(iso, si, empId) {
  if (isEmpDayOff(empId, iso)) return { loc: 'off',  source: 'dayoff'  };
  if (isOnLeave(empId, iso))   return { loc: 'vac',  source: 'leave'   };
  if (state.absences?.[iso]?.[empId]) return { loc: 'off', source: 'absent' };

  const slotMins  = DISPLAY_START_MINS + si * SLOT_DURATION_MINS;
  const loc       = getEmpLocAtTime(iso, empId, slotMins);
  const isEarlyGate = state.earlyGate?.[iso] === empId &&
                      slotMins >= EARLY_GATE_START && slotMins < EARLY_GATE_END;

  if (isEarlyGate) return { loc: 'gate', source: 'earlygate' };
  if (loc !== 'off') return { loc, source: 'shift' };

  const emp = state.employees.find(e => e.id === empId);
  return { loc: emp?.fallback || 'off', source: 'fallback' };
}

function countDayOverrides(iso) {
  return new Set((state.shifts?.[iso] || []).map(s => s.empId)).size;
}

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
      state.shifts[iso] = (state.shifts[iso] || []).filter(s => s.empId !== e.id);
      blocks.forEach(b => {
        state.shifts[iso].push({ id: uid(), empId: e.id, loc: b.loc,
                                 start: b.start, end: b.end, updatedAt: Date.now() });
      });
    });

  persistAll('shifts');
  logAction('apply_default', `Base rota applied to ${iso}`);
  showToast('Default rota applied to ' + fmtDate(iso));
}

function applyDefaultToNextWeek() {
  const nextMon = getNextWeekMon();
  if (!confirm(`Apply base rota to all 7 days of week starting ${nextMon}?`)) return;
  pushUndo('Apply default to next week', state);
  const mon = new Date(nextMon + 'T00:00:00');
  for (let di = 0; di < 7; di++) {
    const d   = new Date(mon); d.setDate(d.getDate() + di);
    const iso = toDateStr(d);
    // Silent apply (no toast per day)
    const dow     = DAYSSHORT[(d.getDay() + 6) % 7];
    const empRota = state.defaultSchedule?.[dow] || {};
    if (!state.shifts)      state.shifts      = {};
    state.shifts[iso] = [];
    state.employees
      .filter(e => e.status === 'Active' && !isEmpDayOff(e.id, iso))
      .forEach(e => {
        const blocks = empRota[e.id] || [];
        blocks.forEach(b => {
          state.shifts[iso].push({ id: uid(), empId: e.id, loc: b.loc,
                                   start: b.start, end: b.end, updatedAt: Date.now() });
        });
      });
  }
  markDirty('shifts');
  persistAll();
  logAction('apply_default_week', `Base rota applied to all 7 days of ${nextMon}`);
  showToast('Base rota applied to next week');
}

function clearOverridesForDay(iso) {
  if (!confirm(`Clear all shift overrides for ${fmtDate(iso)}?`)) return;
  pushUndo('Clear overrides', state);
  delete state.shifts?.[iso];
  persistAll('shifts');
  showToast('Overrides cleared');
}
