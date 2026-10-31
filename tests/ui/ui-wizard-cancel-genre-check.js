// ui-wizard-cancel-genre-check.js — DECISIONS #112 (fixes a review CRITICAL).
//
// Pressing Cancel in the genre-change dialog must change NOTHING: same genre, same
// draft, same config. Before the fix the old draft was stored against the new genre
// and the stale-content guard then deleted the teacher's work.
//
// Run:
//   npm run build
//   powershell -ExecutionPolicy Bypass -File tests/ui/launch-app.ps1 -Port 9410
//   node tests/ui/ui-wizard-cancel-genre-check.js 9410
const { connect } = require('../manual/lib/ui-check-lib');

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

const ARENA_DRAFT = {
  gameType: 'arena', schemaVersion: 1,
  questions: [
    { id: 'q1', type: 'multiple-choice', prompt: 'Câu một?', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctOptionId: 'a', explanation: 'Vì A.', difficulty: 'dễ', points: 100 },
    { id: 'q2', type: 'multiple-choice', prompt: 'Câu hai?', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctOptionId: 'b', explanation: 'Vì B.', difficulty: 'dễ', points: 100 }
  ]
};

(async () => {
  const cdp = await connect();

  // Convert-then-Cancel: arena → matching is not convertible, so the dialog is the
  // "cannot convert, restart?" one. Cancel must be a no-op.
  const out = await cdp.evaluate(`(async () => {
    navigate('create-wizard');
    await new Promise(r => setTimeout(r, 300));
    wizardState.draft = ${JSON.stringify(ARENA_DRAFT)};
    wizardState.selectedGameType = 'arena';
    wizardState.config = { ...wizardConfigForImportedQuestions('arena') };
    const before = { type: wizardState.draft.gameType, q: wizardState.draft.questions.length, sel: wizardState.selectedGameType, cfg: wizardState.config.gameType };
    const originalConfirm = window.confirm;
    window.confirm = () => false;   // the teacher presses Cancel
    let threw = null;
    try { await wizardConvertOrDiscardForGenre('matching'); } catch (e) { threw = String(e && e.message); }
    window.confirm = originalConfirm;
    const outcome = await (async () => {
      const originalConfirm2 = window.confirm;
      window.confirm = () => false;
      const r = await wizardConvertOrDiscardForGenre('matching');
      window.confirm = originalConfirm2;
      return r;
    })();
    return { before, threw, outcomeKind: outcome && outcome.kind, outcomeHasDraft: Boolean(outcome && outcome.draft),
             after: { type: wizardState.draft.gameType, q: wizardState.draft.questions.length, sel: wizardState.selectedGameType } };
  })()`);
  check('cancel returns "cancelled" (not a draft)', out.outcomeKind === 'cancelled', out.outcomeKind);
  check('cancel does not hand back the old draft', out.outcomeHasDraft === false);
  check('cancel leaves the draft untouched', out.after.type === 'arena' && out.after.q === 2, `${out.after.type}, ${out.after.q} questions`);
  check('cancel leaves the selected genre untouched', out.after.sel === 'arena', out.after.sel);

  // The full recommend handler with Cancel: genre must not change.
  const viaHandler = await cdp.evaluate(`(async () => {
    wizardState.draft = ${JSON.stringify(ARENA_DRAFT)};
    wizardState.selectedGameType = 'arena';
    wizardState.recommendations = [{ id: 'r-match', gameType: 'matching', reasons: [], score: 1 }];
    wizardState.config = { ...wizardConfigForImportedQuestions('arena') };
    const originalConfirm = window.confirm;
    window.confirm = () => false;
    try { await wizardRecommendSelect('r-match'); } finally { window.confirm = originalConfirm; }
    return { sel: wizardState.selectedGameType, draftType: wizardState.draft && wizardState.draft.gameType, q: wizardState.draft && wizardState.draft.questions.length };
  })()`);
  check('Cancel in the real genre picker keeps the genre', viaHandler.sel === 'arena', viaHandler.sel);
  check('Cancel in the real genre picker keeps the content', viaHandler.draftType === 'arena' && viaHandler.q === 2, `${viaHandler.draftType}/${viaHandler.q}`);

  // OK path still works for a genre that CAN be converted: arena → race. Treasure is
  // refused on purpose (it needs an intro/story/task the question bank has not got).
  const okPath = await cdp.evaluate(`(async () => {
    wizardState.draft = ${JSON.stringify(ARENA_DRAFT)};
    wizardState.config = { ...wizardConfigForImportedQuestions('race') };
    const originalConfirm = window.confirm;
    window.confirm = () => true;
    let r;
    try { r = await wizardConvertOrDiscardForGenre('race'); } finally { window.confirm = originalConfirm; }
    return {
      kind: r && r.kind,
      type: r && r.draft && r.draft.gameType,
      questions: r && r.draft && Array.isArray(r.draft.questions) ? r.draft.questions.length : 0
    };
  })()`);
  check('OK converts arena → race with both questions', okPath.kind === 'converted' && okPath.type === 'race' && okPath.questions === 2, `${okPath.kind}/${okPath.type}/${okPath.questions}`);

  // And treasure is refused with a reason instead of producing an invalid draft.
  const refusedTreasure = await cdp.evaluate(`(async () => {
    wizardState.draft = ${JSON.stringify(ARENA_DRAFT)};
    wizardState.config = { ...wizardConfigForImportedQuestions('treasure') };
    const originalConfirm = window.confirm;
    window.confirm = () => false;   // keep the current draft
    let r;
    try { r = await wizardConvertOrDiscardForGenre('treasure'); } finally { window.confirm = originalConfirm; }
    return { kind: r && r.kind, stillArena: wizardState.draft && wizardState.draft.gameType };
  })()`);
  check('treasure conversion is refused and keeps the draft', refusedTreasure.kind === 'cancelled' && refusedTreasure.stillArena === 'arena', `${refusedTreasure.kind}/${refusedTreasure.stillArena}`);

  cdp.ws.close();
  const failed = results.filter(ok => !ok).length;
  console.log(`\n${results.length - failed}/${results.length} genre-change cancel checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(error => { console.error('probe failed:', (error && error.stack) || error); process.exit(2); });
