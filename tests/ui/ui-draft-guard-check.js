// ui-draft-guard-check.js — unsaved-work guard for the generate wizard.
//
// Spec §4 "Prevent accidental data loss when navigating, editing, or closing
// dialogs" and §12 "Teachers do not lose data because of navigation or UI
// errors" both require this, and until now the app had no `beforeunload` and no
// `will-prevent-unload` anywhere: a teacher could spend minutes generating a
// game, close the window, and lose it silently.
//
// The guard must fire only when the loss would be real:
//   no draft                    -> close freely
//   draft, not in the library   -> block the close
//   draft, already saved        -> close freely (the library copy survives)
//
// Run against a built app started with a fixture AI directory:
//   npm run build
//   $env:EDUGAME_USER_DATA=<empty folder>; $env:EDUGAME_AI_TEST_DIR=tests/fixtures/wizard/happy
//   npx electron . --remote-debugging-port=9362
//   node tests/ui/ui-draft-guard-check.js 9362
const { check, connect, results } = require('../manual/lib/ui-check-lib');

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const { ws, evaluate } = await connect();

  // ---------------------------------------------------------------------
  // The predicate is the contract. Assert its truth table directly: these
  // three rows are what the whole feature reduces to.
  // ---------------------------------------------------------------------
  const surface = await evaluate(`(() => ({
    hasPredicate: typeof wizardHasUnsavedDraft === 'function',
    hasGameSaved: typeof wizardGameSavedToLibrary === 'function'
  }))()`);
  check('guard exposes a testable predicate', surface.hasPredicate, JSON.stringify(surface));
  if (!surface.hasPredicate) {
    console.log('\nDraft guard not implemented yet — the remaining checks cannot run.');
    console.log(`${results.filter(r => r.ok).length}/${results.length} passed`);
    process.exitCode = 1;
    ws.close();
    return;
  }

  const table = await evaluate(`(() => {
    const savedDraft = { gameType: 'matching', questions: [{ prompt: 'Synthetic?', options: ['A','B'], correctOptionId: 'A' }] };
    const before = { draft: wizardState.draft, gameId: wizardState.gameId, db: state.db };
    const rows = [];
    try {
      // Row 1 — no draft: nothing to lose.
      wizardState.draft = null;
      wizardState.gameId = null;
      rows.push({ row: 'no-draft', dirty: wizardHasUnsavedDraft() });

      // Row 2 — draft present, not saved to the library: real loss.
      wizardState.draft = savedDraft;
      wizardState.gameId = null;
      rows.push({ row: 'unsaved-draft', dirty: wizardHasUnsavedDraft() });

      // Row 3 — draft present and its game is a library row: the library copy
      // survives, so closing must not nag.
      wizardState.draft = savedDraft;
      wizardState.gameId = '__guard_probe_game__';
      state.db = Object.assign({}, state.db, { games: [{ id: '__guard_probe_game__' }] });
      rows.push({ row: 'saved-draft', dirty: wizardHasUnsavedDraft() });
    } finally {
      wizardState.draft = before.draft;
      wizardState.gameId = before.gameId;
      state.db = before.db;
    }
    return rows;
  })()`);
  const row = name => (table.find(r => r.row === name) || {}).dirty;
  check('no draft -> not dirty', row('no-draft') === false, JSON.stringify(table));
  check('unsaved draft -> dirty', row('unsaved-draft') === true, JSON.stringify(table));
  check('draft already in library -> not dirty', row('saved-draft') === false, JSON.stringify(table));

  // ---------------------------------------------------------------------
  // The listener must actually be wired. `beforeunload` semantics: a handler
  // that calls preventDefault (or sets returnValue) cancels the close.
  // ---------------------------------------------------------------------
  const listener = await evaluate(`(() => {
    const saved = { draft: wizardState.draft, gameId: wizardState.gameId };
    const probe = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      // A handler that cancels sets returnValue to the empty string, which must
      // be distinguished from a handler that never touched it.
      return { prevented: event.defaultPrevented, returnValue: typeof event.returnValue === 'string' ? event.returnValue : null };
    };
    const out = {};
    try {
      wizardState.draft = null; wizardState.gameId = null;
      out.freeDispatch = probe();

      wizardState.draft = { gameType: 'matching', questions: [] };
      wizardState.gameId = null;
      out.blockedDispatch = probe();
    } finally {
      wizardState.draft = saved.draft; wizardState.gameId = saved.gameId;
    }
    return out;
  })()`);
  check(
    'beforeunload is not cancelled when there is nothing to lose',
    !listener.freeDispatch.prevented && !listener.freeDispatch.returnValue,
    JSON.stringify(listener.freeDispatch)
  );
  check(
    'beforeunload is cancelled while an unsaved draft exists',
    listener.blockedDispatch.prevented || Boolean(listener.blockedDispatch.returnValue),
    JSON.stringify(listener.blockedDispatch)
  );

  // ---------------------------------------------------------------------
  // End to end: drive the real wizard to a generated draft, then check the
  // guard fires on that real state. A real close would kill the harness, so
  // the main-process relay is verified by IPC wiring, not by closing.
  // ---------------------------------------------------------------------
  const e2e = await evaluate(`(async () => {
    const waitFor = async (fn, ms) => { const started = Date.now(); while (Date.now() - started < (ms || 30000)) { if (fn()) return true; await new Promise(r => setTimeout(r, 150)); } return false; };
    const stamp = String(Date.now());
    const text = 'Quang hop la qua trinh thuc vat tong hop chat huu co nho nang luong anh sang mat troi.';
    const lessonDoc = await window.eduGame.saveLessonDocument({ name: 'guard-' + stamp + '.txt', ext: 'txt', text, characters: text.length });
    const analysis = {
      id: 'analysis_guard_' + stamp, schemaVersion: 1, documentId: lessonDoc.id,
      subject: 'Sinh hoc', grade: 7, topic: 'Quang hop',
      objectives: [{ id: 'obj_1', description: 'Neu vai tro cua anh sang.', cognitiveLevel: 'remember' }],
      keyConcepts: [{ id: 'concept_1', term: 'Quang hop', explanation: 'Tong hop chat huu co.' }],
      uncertainties: [], sourceDocumentIds: [lessonDoc.id], createdAt: new Date().toISOString()
    };
    await window.eduGame.saveLessonAnalysis(analysis);
    const projectId = 'project_guard_' + stamp;
    const now = new Date().toISOString();
    await window.eduGame.saveProjectDraft({
      id: projectId, schemaVersion: 1, status: 'review', step: 'recommend', title: 'Guard ' + stamp,
      description: 'Quang hop', tags: [], sourceName: 'guard.txt',
      lesson: { documentId: lessonDoc.id, name: 'guard.txt', characters: text.length },
      analysisId: analysis.id, recommendationId: null, config: null, draft: null, gameSnapshot: null, gameId: null,
      createdAt: now, updatedAt: now
    });
    wizardReset();
    Object.assign(wizardState, {
      projectId, documentId: lessonDoc.id, documentName: 'guard.txt',
      documentMeta: { characters: text.length, ext: 'txt', sizeBytes: text.length },
      text, analysis, analysisOriginal: JSON.parse(JSON.stringify(analysis)),
      analysisId: analysis.id, step: 'recommend'
    });
    navigate('create-wizard');
    await new Promise(r => setTimeout(r, 300));
    await wizardRecommendRun();
    const target = wizardState.recommendations.find(item => item.gameType === 'matching') || wizardState.recommendations[0];
    if (!target) return { error: 'no recommendations' };
    // The cards render a tick after the recommendation run resolves, so poll for
    // the button rather than assuming it is already in the DOM.
    let card = null;
    for (let i = 0; i < 40 && !card; i++) {
      card = document.querySelector('[data-wizard-recommendation][data-game-type="' + target.gameType + '"] [data-wizard-action="select"]');
      if (!card) await new Promise(r => setTimeout(r, 100));
    }
    if (!card) return { error: 'no recommendation card for ' + target.gameType };
    card.click();
    await new Promise(r => setTimeout(r, 250));
    const nextBtn = document.getElementById('wizardNextBtn');
    if (!nextBtn) return { error: 'no wizardNextBtn at recommend', step: wizardState.step };
    nextBtn.click();
    const configured = await waitFor(() => wizardState.step === 'configure' && !wizardState.busy);
    if (!configured) return { error: 'did not reach step 4', step: wizardState.step };
    const step4Next = document.querySelector('[data-wizard-step-body="configure"] [data-wizard-action="next"]');
    if (!step4Next) return { error: 'no next button at configure' };
    step4Next.click();
    const onGenerate = await waitFor(() => wizardState.step === 'generate' && !wizardState.busy);
    if (!onGenerate) return { error: 'did not reach step 5', step: wizardState.step };
    const generateBtn = document.getElementById('wizardGenerateBtn');
    if (!generateBtn) return { error: 'no wizardGenerateBtn' };
    generateBtn.click();
    const generated = await waitFor(() => !wizardState.busy && Boolean(wizardState.gameSnapshot), 60000);
    return {
      generated,
      hasDraft: Boolean(wizardState.draft),
      dirty: wizardHasUnsavedDraft(),
      inLibrary: wizardGameSavedToLibrary(),
      error: wizardState.error ? wizardState.error.message : ''
    };
  })()`);
  check('a real generated draft reports dirty', e2e.generated && e2e.hasDraft && e2e.dirty === true, JSON.stringify(e2e));

  if (e2e.generated && e2e.dirty === true) {
    const blockedClose = await evaluate(`(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return { prevented: event.defaultPrevented, returnValue: typeof event.returnValue === 'string' ? event.returnValue : null };
    })()`);
    check(
      'closing with a generated, unsaved draft is blocked',
      blockedClose.prevented || Boolean(blockedClose.returnValue),
      JSON.stringify(blockedClose)
    );

    // After saving, the guard must stand down — otherwise a teacher who did
    // everything right cannot close the app.
    const afterSave = await evaluate(`(async () => {
      const waitFor = async (fn, ms) => { const started = Date.now(); while (Date.now() - started < (ms || 30000)) { if (fn()) return true; await new Promise(r => setTimeout(r, 150)); } return false; };
      await wizardSaveGameToLibrary();
      const saved = await waitFor(() => wizardGameSavedToLibrary(), 30000);
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return { saved, inLibrary: wizardGameSavedToLibrary(), dirty: wizardHasUnsavedDraft(), prevented: event.defaultPrevented };
    })()`);
    check(
      'closing after saving to the library is allowed',
      afterSave.saved && afterSave.inLibrary && afterSave.dirty === false && !afterSave.prevented,
      JSON.stringify(afterSave)
    );
  }

  // ---------------------------------------------------------------------
  // The renderer guard is useless unless main asks before closing. The main
  // process cannot be reached from the renderer, so assert the contract the
  // guard relies on: `beforeunload` must be able to cancel a close. Chromium
  // honours a cancelled `beforeunload` by emitting `will-prevent-unload` in
  // main; if the event cannot be cancelled here, no amount of main-side wiring
  // would help.
  // ---------------------------------------------------------------------
  const cancellable = await evaluate(`(() => {
    const saved = { draft: wizardState.draft, gameId: wizardState.gameId };
    try {
      wizardState.draft = { gameType: 'matching', questions: [] };
      wizardState.gameId = null;
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return { cancelable: event.cancelable, prevented: event.defaultPrevented };
    } finally {
      wizardState.draft = saved.draft; wizardState.gameId = saved.gameId;
    }
  })()`);
  check(
    'beforeunload can cancel a close (Chromium will relay it as will-prevent-unload)',
    cancellable.prevents === true || cancellable.prevented === true,
    JSON.stringify(cancellable)
  );

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exitCode = failed.length ? 1 : 0;
  ws.close();
  await sleep(100);
})().catch(error => {
  console.error('ui-draft-guard-check crashed:', error.message);
  process.exitCode = 1;
});

