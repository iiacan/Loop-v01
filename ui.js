/* Loop — ui.js: toasts, modals, menus, quick capture, the loop editor and the small stage dialogs. */
(function () {
  'use strict';
  const L = window.Loop, U = L.U, S = L.S, h = U.h, icon = U.icon;
  const UI = (L.UI = {});

  /* ---------- small builders ---------- */
  UI.field = (label, control, hint) => h('label', { class: 'field' }, h('span', { class: 'lbl' }, label), control, hint && h('span', { class: 'hint' }, hint));
  UI.inp = (obj, key, attrs) => {
    attrs = attrs || {};
    return h('input', Object.assign({ type: 'text' }, attrs, { value: obj[key] == null || obj[key] === 0 && attrs.type === 'number' ? '' : obj[key], oninput: (e) => { obj[key] = attrs.type === 'number' ? Math.max(0, Number(e.target.value) || 0) : e.target.value; } }));
  };
  UI.area = (obj, key, attrs) => h('textarea', Object.assign({ rows: 3 }, attrs || {}, { oninput: (e) => { obj[key] = e.target.value; } }), obj[key] || '');
  UI.sel = (value, options, onchange, attrs) => {
    const el = h('select', Object.assign({ onchange: (e) => onchange(e.target.value) }, attrs || {}), options.map((o) => h('option', { value: o[0] }, o[1])));
    el.value = String(value == null ? '' : value); return el;
  };
  UI.btn = (label, onclick, cls, attrs) => h('button', Object.assign({ type: 'button', class: 'btn ' + (cls || ''), onclick: onclick }, attrs || {}), label);
  UI.iconBtn = (name, label, onclick, cls) => h('button', { type: 'button', class: 'icon-btn ' + (cls || ''), 'aria-label': label, title: label, onclick: onclick }, icon(name, 16));
  UI.chip = (stage) => h('span', { class: 'chip st-' + stage.toLowerCase() }, L.STAGE_LABEL[stage]);
  UI.sectorDots = (loop) => {
    const secs = loop.sectorIds.map(S.sector).filter(Boolean);
    if (!secs.length) return h('span', { class: 'faint' }, '—');
    return h('span', { class: 'sector-tag' }, h('span', { class: 'dot', style: 'background:' + secs[0].color }), secs[0].name, secs.length > 1 && h('span', { class: 'faint' }, ' +' + (secs.length - 1)));
  };

  /* ---------- toasts ---------- */
  UI.toast = function (msg, opts) {
    opts = opts || {};
    const box = document.getElementById('toasts');
    const el = h('div', { class: 'toast ' + (opts.kind || ''), role: 'status' }, h('span', null, msg),
      opts.action && UI.btn(opts.action.label, () => { opts.action.run(); el.remove(); }, 'tiny'),
      UI.iconBtn('x', 'Dismiss', () => el.remove()));
    while (box.children.length > 2) box.firstChild.remove(); // never stack more than three
    box.appendChild(el);
    setTimeout(() => el.remove(), opts.ms || 5200);
  };

  /* ---------- modals ---------- */
  const stack = [];
  UI.modalOpen = () => stack.length > 0;
  UI.modal = function (o) {
    const prev = document.activeElement;
    const body = h('div', { class: 'modal-body' }), foot = h('div', { class: 'modal-foot' });
    const api = { body: body, foot: foot };
    const dlg = h('div', { class: 'modal' + (o.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title },
      h('header', { class: 'modal-head' }, h('h2', null, o.title), UI.iconBtn('x', 'Close', () => api.tryClose())), body, foot);
    const back = h('div', { class: 'backdrop', onmousedown: (e) => { if (e.target === back) api.tryClose(); } }, dlg);
    api.el = dlg;
    api.close = function () {
      back.remove(); const i = stack.indexOf(api); if (i >= 0) stack.splice(i, 1);
      if (!stack.length) document.body.classList.remove('modal-open');
      if (prev && prev.focus && document.contains(prev)) prev.focus();
      if (o.onClose) o.onClose();
    };
    api.tryClose = function () { if (o.guard) Promise.resolve(o.guard()).then((ok) => { if (ok) api.close(); }); else api.close(); };
    api.focusFirst = function () { const f = dlg.querySelector('[data-autofocus]') || body.querySelector('input,select,textarea,button') || dlg.querySelector('button'); if (f) f.focus(); };
    document.body.appendChild(back); document.body.classList.add('modal-open'); stack.push(api);
    setTimeout(api.focusFirst, 0);
    return api;
  };
  document.addEventListener('keydown', (e) => {
    const top = stack[stack.length - 1]; if (!top) return;
    if (e.key === 'Escape') { e.preventDefault(); top.tryClose(); return; }
    if (e.key === 'Tab') {
      const f = Array.from(top.el.querySelectorAll('button,input,select,textarea,a[href],[tabindex]:not([tabindex="-1"])')).filter((x) => !x.disabled && x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!top.el.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    }
  });
  UI.confirm = (o) => new Promise((res) => {
    let answer = false;
    const m = UI.modal({ title: o.title, onClose: () => res(answer) });
    m.body.append(h('p', null, o.text), o.extra || '');
    m.foot.append(UI.btn(o.cancelLabel || 'Cancel', () => m.close(), 'ghost'), UI.btn(o.confirmLabel || 'Confirm', () => { answer = true; m.close(); }, o.danger ? 'danger' : 'primary', { 'data-autofocus': !o.danger }));
  });

  /* ---------- popover menu ---------- */
  let openMenu = null;
  UI.closeMenu = () => { if (openMenu) { openMenu.remove(); openMenu = null; document.removeEventListener('mousedown', outside, true); } };
  function outside(e) { if (openMenu && !openMenu.contains(e.target)) UI.closeMenu(); }
  UI.menu = function (anchor, items) {
    UI.closeMenu();
    const m = h('div', { class: 'menu', role: 'menu', onkeydown: (e) => { if (e.key === 'Escape') { UI.closeMenu(); anchor.focus(); } } },
      items.filter(Boolean).map((it) => it.sep ? h('div', { class: 'menu-sep' }) : h('button', { type: 'button', role: 'menuitem', class: it.danger ? 'danger' : '', onclick: () => { UI.closeMenu(); it.run(); } }, it.label)));
    document.body.appendChild(m); openMenu = m;
    const r = anchor.getBoundingClientRect(), w = m.offsetWidth, ht = m.offsetHeight;
    m.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
    m.style.top = (r.bottom + ht + 8 > window.innerHeight ? Math.max(8, r.top - ht - 4) : r.bottom + 4) + 'px';
    setTimeout(() => { document.addEventListener('mousedown', outside, true); const b = m.querySelector('button'); if (b) b.focus(); }, 0);
  };
  window.addEventListener('scroll', () => UI.closeMenu(), true);
  window.addEventListener('resize', () => UI.closeMenu());

  UI.exportLoop = (loop) => { U.download('loop-' + loop.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '-' + U.today() + '.json', JSON.stringify(S.exportLoops([loop]), null, 2)); UI.toast('Loop exported.'); };
  UI.loopMenu = function (anchor, loop) {
    const id = loop.id, t = U.today(), closed = loop.stage === 'CLOSED';
    UI.menu(anchor, [
      { label: 'Open details', run: () => UI.editLoop(id) },
      { sep: true },
      !closed && loop.stage !== 'ACTIVE' && { label: 'Mark active', run: () => S.setStage(id, 'ACTIVE') },
      !closed && loop.stage !== 'WAITING' && { label: 'Mark waiting on…', run: () => UI.waitingDialog(id) },
      !closed && loop.stage !== 'STUCK' && { label: 'Mark stuck…', run: () => UI.stuckDialog(id) },
      !closed && loop.stage !== 'OPENED' && { label: 'Move back to Opened', run: () => S.setStage(id, 'OPENED') },
      !closed && { sep: true },
      !closed && (loop.plannedFor === t ? { label: 'Remove from today', run: () => S.planFor(id, '') } : { label: 'Plan for today', run: () => S.planFor(id, t) }),
      !closed && { label: 'Reschedule…', run: () => UI.rescheduleDialog(id) },
      !closed && { label: 'Close loop…', run: () => UI.closeDialog(id) },
      closed && { label: 'Reopen', run: () => { S.setStage(id, 'OPENED'); UI.toast('Reopened. Its earlier history is kept.'); } },
      { sep: true },
      { label: 'Export this loop (JSON)', run: () => UI.exportLoop(loop) }
    ]);
  };

  /* ---------- quick capture ---------- */
  UI.quickCapture = function (prefill) {
    const d = Object.assign({ title: '', sectorId: '', description: '', expectedDate: '' }, prefill || {});
    const err = h('p', { class: 'form-error', role: 'alert' });
    const m = UI.modal({ title: 'Quick capture' });
    const create = (thenEdit) => {
      if (!d.title.trim()) { err.textContent = 'Give it a title, even a rough one.'; m.focusFirst(); return; }
      const loop = S.addLoop({ title: d.title.trim(), description: d.description.trim(), sectorIds: d.sectorId ? [d.sectorId] : [], expectedDate: d.expectedDate });
      m.close();
      if (thenEdit) UI.editLoop(loop.id); else UI.toast('Captured. You can forget it now.', { action: { label: 'Open', run: () => UI.editLoop(loop.id) } });
    };
    const title = UI.inp(d, 'title', { placeholder: 'What needs to stay on the thread?', 'data-autofocus': true, maxlength: 200, onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); create(false); } } });
    m.body.append(UI.field('Title', title), h('div', { class: 'grid2' },
      UI.field('Sector (optional)', UI.sel(d.sectorId, [['', 'No sector yet']].concat(S.activeSectors().map((s) => [s.id, s.name])), (v) => (d.sectorId = v))),
      UI.field('Expected completion (optional)', UI.inp(d, 'expectedDate', { type: 'date' }))),
      UI.field('Description (optional)', UI.area(d, 'description', { rows: 2 })), err);
    m.foot.append(UI.btn('Capture and add details', () => create(true), 'ghost'), UI.btn('Capture', () => create(false), 'primary'));
  };

  /* ---------- history ---------- */
  UI.historyLine = function (hh) {
    let text = hh.note || '';
    if (hh.type === 'stage') text = L.STAGE_LABEL[hh.from] + ' → ' + L.STAGE_LABEL[hh.to] + (hh.note ? ' · ' + hh.note : '');
    else if (hh.type === 'closed') text = 'Closed: ' + L.RESOLUTIONS[hh.resolution] + (hh.note ? ' · ' + hh.note : '');
    else if (hh.type === 'reopened') text = 'Reopened → ' + L.STAGE_LABEL[hh.to] + (hh.note ? ' · ' + hh.note : '');
    else if (hh.type === 'reschedule') text = 'Rescheduled: ' + U.fmtDate(hh.from, true) + ' → ' + U.fmtDate(hh.to, true) + (hh.note && hh.note !== 'Expected completion moved' ? ' · ' + hh.note : '');
    return text;
  };
  UI.historyList = (loop) => h('ol', { class: 'history' }, loop.history.slice().reverse().map((hh) => h('li', { class: 'h-' + hh.type }, h('span', { class: 'h-when' }, U.fmtStamp(hh.at)), h('span', null, UI.historyLine(hh)))));

  /* ---------- loop editor ---------- */
  UI.editLoop = function (id, prefill) {
    const orig = id ? S.get(id) : null;
    if (id && !orig) { UI.toast('That loop no longer exists.'); return; }
    const draft = orig ? U.clone(orig) : Object.assign(S.blankLoop(), prefill || {});
    let tagsText = draft.tags.join(', ');
    const snapshot = () => JSON.stringify(draft) + tagsText;
    const initial = snapshot();
    const openNotes = new Set();
    let errors = [];
    const m = UI.modal({
      title: orig ? 'Loop details' : 'New loop', wide: true,
      guard: () => snapshot() === initial || UI.confirm({ title: 'Discard changes?', text: 'You have unsaved changes to this loop.', confirmLabel: 'Discard', danger: true })
    });
    const F = UI.field, inp = UI.inp;
    const newStep = () => ({ id: U.uid('t'), title: '', status: 'todo', expectedDate: '', estMinutes: 0, notes: '', children: [] });

    function stepList(steps, depth) {
      return h('ul', { class: 'steps' }, steps.map((s, i) => h('li', null,
        h('div', { class: 'step-row' + (s.status === 'blocked' ? ' blocked' : '') + (s.status === 'done' ? ' done' : '') },
          h('input', { type: 'checkbox', checked: s.status === 'done', 'aria-label': 'Mark step done', onchange: (e) => { s.status = e.target.checked ? 'done' : 'todo'; draw(); } }),
          h('input', { type: 'text', id: 'st-' + s.id, class: 'step-title', value: s.title, placeholder: depth ? 'Sub-step' : 'Step', 'aria-label': 'Step title', oninput: (e) => (s.title = e.target.value),
            onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); const n = newStep(); steps.splice(i + 1, 0, n); draw('st-' + n.id); } } }),
          UI.sel(s.status, Object.keys(L.STEP_STATUS).map((k) => [k, L.STEP_STATUS[k]]), (v) => { s.status = v; draw(); }, { class: 'mini', 'aria-label': 'Step status' }),
          h('input', { type: 'number', min: 0, class: 'mini num', value: s.estMinutes || '', placeholder: 'min', 'aria-label': 'Estimated minutes', title: 'Estimated minutes', oninput: (e) => (s.estMinutes = Math.max(0, Number(e.target.value) || 0)) }),
          h('input', { type: 'date', class: 'mini', value: s.expectedDate, 'aria-label': 'Step expected date', title: 'Expected date', oninput: (e) => (s.expectedDate = e.target.value) }),
          h('span', { class: 'step-tools' },
            UI.iconBtn('up', 'Move step up', () => { if (i > 0) { steps.splice(i - 1, 0, steps.splice(i, 1)[0]); draw(); } }),
            UI.iconBtn('down', 'Move step down', () => { if (i < steps.length - 1) { steps.splice(i + 1, 0, steps.splice(i, 1)[0]); draw(); } }),
            depth < 2 && UI.iconBtn('plus', 'Add sub-step', () => { const n = newStep(); s.children.push(n); draw('st-' + n.id); }),
            UI.iconBtn('dots', 'Step notes', () => { if (openNotes.has(s.id)) openNotes.delete(s.id); else openNotes.add(s.id); draw(); }),
            UI.iconBtn('trash', 'Remove step', () => { steps.splice(i, 1); draw(); }))),
        (openNotes.has(s.id) || s.notes) && h('input', { type: 'text', class: 'step-notes', value: s.notes, placeholder: 'Notes for this step', 'aria-label': 'Step notes', oninput: (e) => (s.notes = e.target.value) }),
        s.children.length ? stepList(s.children, depth + 1) : null)));
    }

    function draw(focusId) {
      const act = document.activeElement; const keep = focusId || (act && act.id && m.body.contains(act) ? act.id : null);
      const top = m.body.scrollTop;
      const next = S.nextStep(draft), stats = S.stepStats(draft);
      const kids = [];
      if (draft.sample) kids.push(h('p', { class: 'note-box' }, 'This is a sample loop. Saving a change keeps it marked as sample; remove all samples in Settings.'));
      if (errors.length) kids.push(h('div', { class: 'form-error', role: 'alert' }, errors.map((e) => h('div', null, e))));
      kids.push(F('Title', inp(draft, 'title', { class: 'big', maxlength: 200, 'data-autofocus': !orig, id: 'f-title' })),
        F('Description', UI.area(draft, 'description', { rows: 2 })));

      // stage, priority, sectors
      kids.push(h('div', { class: 'grid3' },
        F('Stage', UI.sel(draft.stage, L.STAGES.map((s) => [s, L.STAGE_LABEL[s]]), (v) => {
          draft.stage = v;
          if (v === 'WAITING' && !draft.waiting) draft.waiting = { type: L.WAIT_TYPES[0], what: '', who: '', since: U.today(), expectedResponse: '', followUp: '' };
          if (v !== 'CLOSED') draft.resolution = null;
          draw();
        }, { id: 'f-stage' })),
        F('Priority', UI.sel(draft.priority, L.PRIORITIES.map((p) => [p, L.PRIORITY_LABEL[p]]), (v) => (draft.priority = v))),
        F('Next action', inp(draft, 'nextAction', { placeholder: 'The very next thing' }), next ? 'Next open step: ' + next.title : null)));
      if (draft.stage === 'CLOSED') {
        kids.push(h('fieldset', { class: 'box' }, h('legend', null, 'Resolution'), h('div', { class: 'grid3' },
          F('How was it resolved?', UI.sel(draft.resolution || '', [['', 'Choose…']].concat(Object.keys(L.RESOLUTIONS).map((k) => [k, L.RESOLUTIONS[k]])), (v) => (draft.resolution = v || null), { id: 'f-res' })),
          F('Closed on', inp(draft, 'completedAt', { type: 'date' }), 'Left blank, today is used.'),
          F('Actual effort (minutes)', inp(draft, 'actualMinutes', { type: 'number', min: 0 }))),
          F('Reason or note', UI.area(draft, 'closureReason', { rows: 2, placeholder: 'Optional. Why it ended this way.' }))));
      }
      if (draft.stage === 'WAITING') {
        const w = draft.waiting;
        kids.push(h('fieldset', { class: 'box' }, h('legend', null, 'Waiting on'), h('div', { class: 'grid3' },
          F('What is being awaited', inp(w, 'what', { placeholder: 'e.g. signed letter', id: 'f-wwhat' })),
          F('Who or what it depends on', inp(w, 'who', { placeholder: 'Role or office, not a patient' })),
          F('Kind', UI.sel(w.type, L.WAIT_TYPES.map((x) => [x, x]), (v) => (w.type = v))),
          F('Waiting since', inp(w, 'since', { type: 'date' })),
          F('Expected response by', inp(w, 'expectedResponse', { type: 'date' })),
          F('Next follow-up', inp(w, 'followUp', { type: 'date' }), 'Loop stays quiet until this date.'))));
      }
      if (draft.stage === 'STUCK') {
        const blocked = S.blockedStep(draft);
        kids.push(h('fieldset', { class: 'box' }, h('legend', null, 'Where is it stuck?'),
          F('What is in the way', inp(draft, 'stuckNote', { placeholder: 'e.g. budget not confirmed' }), blocked ? 'Stuck at step: ' + blocked.title : 'Tip: set a step’s status to “Stuck here” to mark the exact point.')));
      }
      kids.push(h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Sectors'), h('div', { class: 'chips' },
        S.state.sectors.filter((s) => !s.archived || draft.sectorIds.indexOf(s.id) >= 0).map((s) => {
          const on = draft.sectorIds.indexOf(s.id) >= 0;
          return h('button', { type: 'button', class: 'pick' + (on ? ' on' : ''), 'aria-pressed': String(on), onclick: () => { if (on) draft.sectorIds = draft.sectorIds.filter((x) => x !== s.id); else draft.sectorIds.push(s.id); draw(); } }, h('span', { class: 'dot', style: 'background:' + s.color }), s.name);
        }))));

      // schedule
      const dl = draft.deadline && draft.expectedDate && draft.expectedDate > draft.deadline;
      kids.push(h('fieldset', { class: 'box' }, h('legend', null, 'Schedule'), h('div', { class: 'grid3' },
        F('Start date', inp(draft, 'startDate', { type: 'date' })),
        F('Expected completion', inp(draft, 'expectedDate', { type: 'date', id: 'f-exp', onchange: () => draw() }), 'Your forecast.'),
        F('Deadline', inp(draft, 'deadline', { type: 'date', onchange: () => draw() }), dl ? 'Your forecast is after this deadline.' : 'Only if a real one exists.'),
        F('Start time', inp(draft, 'startTime', { type: 'time' })),
        F('End time', inp(draft, 'endTime', { type: 'time' })),
        F('Planned day', inp(draft, 'plannedFor', { type: 'date' }), 'Shows in Today’s Plan on that day.'),
        h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Reminder'), h('div', { class: 'row' }, inp(draft, 'reminderAt', { type: 'datetime-local', 'aria-label': 'Reminder date and time', id: 'f-rem' }),
          UI.btn('Default', () => {
            const st = S.state.settings, base = st.defaultReminder === 'day-before-deadline' ? (draft.deadline || draft.expectedDate ? U.addDays(draft.deadline || draft.expectedDate, -1) : '') : draft.expectedDate || draft.deadline;
            if (!base) { UI.toast('Set an expected date or deadline first.'); return; }
            draft.reminderAt = base + 'T' + (st.defaultReminderTime || '09:00'); draw();
          }, 'tiny ghost')), h('span', { class: 'hint' }, 'Shown in the app while Loop is open.')),
        F('Repeats', UI.sel(draft.recurrence.freq, [['none', 'Does not repeat'], ['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['yearly', 'Yearly']], (v) => { draft.recurrence.freq = v; draw(); }),
          draft.recurrence.freq !== 'none' ? 'The next one opens when this is completed.' : null),
        draft.recurrence.freq !== 'none' && F('Every', inp(draft.recurrence, 'interval', { type: 'number', min: 1 }), { daily: 'day(s)', weekly: 'week(s)', monthly: 'month(s)', yearly: 'year(s)' }[draft.recurrence.freq]))));

      // steps
      kids.push(h('fieldset', { class: 'box' }, h('legend', null, 'Steps' + (stats.total ? ' · ' + stats.done + ' of ' + stats.total + ' done' : '')),
        draft.steps.length ? stepList(draft.steps, 0) : h('p', { class: 'faint' }, 'No steps yet. Break the loop down only as far as it helps.'),
        UI.btn('+ Add step', () => { const n = newStep(); draft.steps.push(n); draw('st-' + n.id); }, 'ghost small')));

      // effort, tags
      kids.push(h('div', { class: 'grid3' },
        F('Estimated effort (minutes)', inp(draft, 'estMinutes', { type: 'number', min: 0 })),
        draft.stage !== 'CLOSED' && F('Actual effort so far (minutes)', inp(draft, 'actualMinutes', { type: 'number', min: 0 })),
        F('Tags', h('input', { type: 'text', value: tagsText, placeholder: 'comma, separated', oninput: (e) => (tagsText = e.target.value) }))));

      // appointment
      const ap = draft.appointment;
      kids.push(h('fieldset', { class: 'box' }, h('legend', null, 'Appointment'),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!ap, onchange: (e) => { draft.appointment = e.target.checked ? { ref: '', at: '', status: 'Scheduled', followUp: '', admin: '' } : null; draw(); } }), 'Track an appointment (administrative scheduling only)'),
        ap && h('div', null, h('p', { class: 'note-box' }, 'Loop is not a clinical record. Use a non-identifying reference. No patient names, diagnoses or clinical notes.'),
          h('div', { class: 'grid3' },
            F('Reference', inp(ap, 'ref', { placeholder: 'e.g. A-014', maxlength: 24 })),
            F('Date and time', inp(ap, 'at', { type: 'datetime-local' })),
            F('Status', UI.sel(ap.status, L.APPT_STATUS.map((x) => [x, x]), (v) => (ap.status = v))),
            F('Expected follow-up date', inp(ap, 'followUp', { type: 'date' })),
            F('Administrative follow-up', inp(ap, 'admin', { placeholder: 'e.g. confirm room' }))))));

      kids.push(F('Notes', UI.area(draft, 'notes', { rows: 3 })));

      if (orig) {
        const note = { text: '' };
        kids.push(h('details', { class: 'box', open: orig.history.length < 6 }, h('summary', null, 'History · ' + U.plural(orig.history.length, 'entry', 'entries') + (orig.rescheduleCount ? ' · rescheduled ' + orig.rescheduleCount + '×' : '')),
          h('div', { class: 'row' }, inp(note, 'text', { placeholder: 'Add a note to the history', 'aria-label': 'History note' }), UI.btn('Add', () => {
            if (!note.text.trim()) return;
            S.addNote(orig.id, note.text); draw();
          }, 'small ghost')),
          UI.historyList(S.get(orig.id) || orig)));
      }
      m.body.replaceChildren.apply(m.body, kids.filter(Boolean));
      m.body.scrollTop = top;
      if (keep) { const el = document.getElementById(keep); if (el) el.focus(); }
    }

    function save() {
      errors = [];
      if (!draft.title.trim()) errors.push('Give the loop a title.');
      if (draft.startDate && draft.expectedDate && draft.expectedDate < draft.startDate) errors.push('Expected completion is before the start date.');
      if (draft.startTime && draft.endTime && draft.endTime < draft.startTime) errors.push('End time is before the start time.');
      if (draft.stage === 'CLOSED' && !draft.resolution) errors.push('Choose how this loop was resolved. “Decided not to” is a full answer.');
      if (draft.stage === 'WAITING' && !(draft.waiting && draft.waiting.what.trim())) errors.push('Say what you are waiting on.');
      if (errors.length) { draw(); m.body.scrollTop = 0; return; }
      draft.title = draft.title.trim();
      draft.tags = tagsText.split(',').map((x) => x.trim()).filter(Boolean);
      const prune = (steps) => steps.filter((s) => s.title.trim()).map((s) => { s.title = s.title.trim(); s.children = prune(s.children || []); return s; });
      draft.steps = prune(draft.steps);
      const closedOn = draft.completedAt;
      const saved = S.commitDraft(orig, draft, { resolution: draft.resolution, reason: draft.closureReason, actualMinutes: draft.actualMinutes, waiting: draft.waiting, note: draft.stage === 'STUCK' ? draft.stuckNote : '' });
      if (saved.stage === 'CLOSED' && U.isDate(closedOn) && closedOn !== saved.completedAt) { saved.completedAt = closedOn; S.putLoop(saved); }
      forceClose(); UI.toast(orig ? 'Saved.' : 'Loop created.');
    }
    let forced = false;
    const forceClose = () => { forced = true; m.close(); };

    const left = h('span', { class: 'foot-left' },
      orig && UI.btn('Delete', () => UI.confirm({ title: 'Delete this loop?', text: 'This removes the loop and its whole history for good. If you only want it out of the way, close it as “Archived” or “Decided not to” instead.', confirmLabel: 'Delete permanently', danger: true }).then((ok) => { if (ok) { S.removeLoop(orig.id); forceClose(); UI.toast('Loop deleted.'); } }), 'ghost danger-text'),
      orig && UI.btn('Export', () => UI.exportLoop(orig), 'ghost'));
    m.foot.append(left, UI.btn('Cancel', () => m.tryClose(), 'ghost'), UI.btn(orig ? 'Save changes' : 'Create loop', save, 'primary'));
    const g = m.tryClose; m.tryClose = function () { if (forced) m.close(); else g(); };
    m.el.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); save(); } });
    draw();
  };

  /* ---------- stage dialogs ---------- */
  UI.closeDialog = function (id) {
    const loop = S.get(id); if (!loop) return;
    const d = { resolution: 'COMPLETED', reason: '', actualMinutes: loop.actualMinutes || 0 };
    const desc = { COMPLETED: 'Done as intended.', DECIDED_NOT_TO: 'A deliberate choice not to do it. A real resolution.', SUPERSEDED: 'Replaced by something else.', ARCHIVED: 'Set aside without a verdict. Left out of monthly progress.' };
    const m = UI.modal({ title: 'Close loop' });
    const open = S.stepStats(loop);
    function draw() {
      m.body.replaceChildren(h('p', { class: 'strong' }, loop.title),
        h('div', { class: 'radio-cards', role: 'radiogroup', 'aria-label': 'Resolution' }, Object.keys(L.RESOLUTIONS).map((k) => h('label', { class: 'radio-card' + (d.resolution === k ? ' on' : '') },
          h('input', { type: 'radio', name: 'res', checked: d.resolution === k, onchange: () => { d.resolution = k; draw(); } }), h('span', null, h('b', null, L.RESOLUTIONS[k]), h('small', null, desc[k]))))),
        d.resolution === 'COMPLETED' && UI.field('Actual effort (minutes, optional)', UI.inp(d, 'actualMinutes', { type: 'number', min: 0 }), loop.estMinutes ? 'You estimated ' + U.mins(loop.estMinutes) + '.' : null),
        UI.field(d.resolution === 'COMPLETED' ? 'Note (optional)' : 'Reason (optional)', UI.area(d, 'reason', { rows: 2 })),
        d.resolution === 'COMPLETED' && open.total > open.done && h('p', { class: 'hint' }, U.plural(open.total - open.done, 'step') + ' still open. They are kept as they are.'),
        d.resolution === 'COMPLETED' && loop.recurrence.freq !== 'none' && h('p', { class: 'hint' }, 'This loop repeats. The next one opens automatically.'));
    }
    draw();
    m.foot.append(UI.btn('Cancel', () => m.close(), 'ghost'), UI.btn('Close loop', () => {
      const prev = loop.stage; S.setStage(id, 'CLOSED', d); m.close();
      UI.toast('Closed: ' + L.RESOLUTIONS[d.resolution] + '.', { action: { label: 'Undo', run: () => S.setStage(id, prev, { note: 'Closure undone' }) } });
    }, 'primary'));
  };
  UI.waitingDialog = function (id) {
    const loop = S.get(id); if (!loop) return;
    const already = loop.stage === 'WAITING';
    const w = Object.assign({ type: L.WAIT_TYPES[0], what: '', who: '', since: U.today(), expectedResponse: '', followUp: '' }, already ? loop.waiting : {});
    const d = { note: '' };
    const err = h('p', { class: 'form-error', role: 'alert' });
    const m = UI.modal({ title: already ? 'Follow up' : 'Waiting on' });
    m.body.append(h('p', { class: 'strong' }, loop.title), h('div', { class: 'grid2' },
      UI.field('What is being awaited', UI.inp(w, 'what', { 'data-autofocus': !already })),
      UI.field('Who or what it depends on', UI.inp(w, 'who')),
      UI.field('Kind', UI.sel(w.type, L.WAIT_TYPES.map((x) => [x, x]), (v) => (w.type = v))),
      UI.field('Waiting since', UI.inp(w, 'since', { type: 'date' })),
      UI.field('Expected response by', UI.inp(w, 'expectedResponse', { type: 'date' })),
      UI.field('Next follow-up', UI.inp(w, 'followUp', { type: 'date' }), 'Loop will not mention it before then.')),
      already && UI.field('What you did (optional)', UI.inp(d, 'note', { placeholder: 'e.g. sent a reminder email' })), err);
    m.foot.append(UI.btn('Cancel', () => m.close(), 'ghost'),
      already && UI.btn('Response received', () => { S.setStage(id, 'ACTIVE', { note: 'Response received' }); m.close(); UI.toast('Back to Active.'); }, 'ghost'),
      UI.btn(already ? 'Save follow-up' : 'Mark waiting', () => {
        if (!w.what.trim()) { err.textContent = 'Say what you are waiting on.'; return; }
        if (already) { loop.waiting = w; S.logFollowUp(id, w.followUp, d.note); } else S.setStage(id, 'WAITING', { waiting: w });
        m.close(); UI.toast(already ? 'Follow-up logged.' : 'Marked as waiting.');
      }, 'primary'));
  };
  UI.stuckDialog = function (id) {
    const loop = S.get(id); if (!loop) return;
    const d = { note: '', stepId: '' };
    const steps = []; S.walkSteps(loop.steps, (s, depth) => { if (s.status !== 'done' && s.status !== 'skipped') steps.push([s.id, '— '.repeat(depth) + s.title]); });
    const m = UI.modal({ title: 'Mark as stuck' });
    m.body.append(h('p', { class: 'strong' }, loop.title), h('p', { class: 'hint' }, 'Stuck is a state, not a verdict. Naming the blocker is usually half of it.'),
      UI.field('What is in the way?', UI.inp(d, 'note', { 'data-autofocus': true })),
      steps.length ? UI.field('Which step is it stuck at?', UI.sel('', [['', 'Not sure / the whole thing']].concat(steps), (v) => (d.stepId = v))) : '');
    m.foot.append(UI.btn('Cancel', () => m.close(), 'ghost'), UI.btn('Mark stuck', () => { S.setStage(id, 'STUCK', d); m.close(); UI.toast('Marked as stuck.'); }, 'primary'));
  };
  UI.rescheduleDialog = function (id) {
    const loop = S.get(id); if (!loop) return;
    const t = U.today(), d = { date: loop.expectedDate && loop.expectedDate > t ? loop.expectedDate : U.addDays(t, 1), note: '' };
    const m = UI.modal({ title: 'Reschedule' });
    const dateInput = UI.inp(d, 'date', { type: 'date', min: t });
    const quick = (label, date) => UI.btn(label, () => { d.date = date; dateInput.value = date; }, 'ghost small');
    m.body.append(h('p', { class: 'strong' }, loop.title),
      h('p', { class: 'hint' }, loop.expectedDate ? 'Currently expected ' + U.fmtDay(loop.expectedDate) + ' (' + U.rel(loop.expectedDate) + ').' : 'No expected date yet.', loop.deadline ? ' Deadline ' + U.fmtDay(loop.deadline) + '.' : ''),
      h('div', { class: 'row wrap' }, quick('Tomorrow', U.addDays(t, 1)), quick('In 3 days', U.addDays(t, 3)), quick('Next week', U.addDays(t, 7)), quick('In 2 weeks', U.addDays(t, 14)), quick('Next month', U.addMonths(t, 1))),
      UI.field('New expected completion', dateInput), UI.field('Why (optional)', UI.inp(d, 'note')),
      loop.rescheduleCount >= 2 && h('p', { class: 'note-box' }, 'This has moved ' + loop.rescheduleCount + ' times. A smaller next step, or deciding not to, are both fair options.'));
    m.foot.append(UI.btn('Cancel', () => m.close(), 'ghost'), UI.btn('Reschedule', () => { if (!U.isDate(d.date)) return; S.reschedule(id, d.date, d.note); m.close(); UI.toast('Moved to ' + U.fmtDay(d.date) + '.'); }, 'primary'));
  };

  /* ---------- reminders ---------- */
  UI.pendingReminders = () => S.state.loops.filter((l) => l.reminderFired && !l.reminderAck && l.stage !== 'CLOSED');
  UI.remindersDialog = function () {
    const m = UI.modal({ title: 'Reminders' });
    function draw() {
      const list = UI.pendingReminders();
      m.body.replaceChildren(list.length ? h('ul', { class: 'plain-list' }, list.map((l) => h('li', { class: 'row between' }, h('span', null, h('b', null, l.title), h('small', { class: 'faint' }, ' · ' + U.fmtLocalDT(l.reminderAt))),
        h('span', { class: 'row' }, UI.btn('Open', () => { m.close(); UI.editLoop(l.id); }, 'tiny ghost'), UI.btn('Dismiss', () => { l.reminderAck = true; S.putLoop(l); draw(); }, 'tiny'))))) : h('p', { class: 'faint' }, 'No reminders waiting.'),
        h('p', { class: 'hint' }, 'Reminders appear while Loop is open in a browser tab. A static site cannot wake a closed browser.'));
    }
    draw();
    m.foot.append(UI.btn('Done', () => m.close(), 'primary'));
  };
})();
