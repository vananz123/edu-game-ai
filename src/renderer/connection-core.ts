// @ts-nocheck -- classic renderer script; PURE logic, no DOM (DECISIONS #168).
/*
 * Object Connection progression, as a renderer global script.
 *
 * Why this file exists next to `src/shared/connection-progress.ts`: the renderer
 * is plain global scripts and cannot `import`, and `index.html` cannot load a
 * script inside `src/shared/` (it is not copied into `dist/src`). The renderer
 * therefore needs the functions as globals. This file is the same logic, and
 * `connection-parity.test.ts` runs BOTH implementations against the same inputs
 * (every template, 1..30 questions, every answer pattern) and fails the unit
 * suite on any divergence — so there is one behaviour, not two copies that
 * quietly drift.
 *
 * Rules (see `docs/DECISIONS.md` #168): scoring stays in the engine; a wrong
 * answer never removes a connection; a stage is earned at most once; the same
 * correct answer evaluated twice earns nothing; a 100 % run always finishes the
 * picture and an unfinished run keeps exactly what it earned.
 */
function connectionResolveTemplate(id) {
  var key = typeof id === 'string' ? id.trim() : (id && typeof id.id === 'string' ? id.id : '');
  for (var i = 0; i < CONNECTION_TEMPLATES.length; i += 1) {
    if (CONNECTION_TEMPLATES[i].id === key) return CONNECTION_TEMPLATES[i];
  }
  return CONNECTION_TEMPLATES[0];
}

/**
 * Bind every played pair to at most one stage ('' = earns nothing for this plan).
 * Same rules as `planConnectionStages` in `src/shared/connection-progress.ts`;
 * a bare number is accepted because the matching board knows its pair count
 * before it builds ids.
 */
function planConnectionStages(template, items) {
  var stages = connectionResolveTemplate(template).stages;
  var n = typeof items === 'number' ? Math.max(0, Math.round(items) || 0) : (Array.isArray(items) ? items.length : 0);
  var k = stages.length;
  if (!n || !k) return [];
  var plan = [];
  for (var i = 0; i < n; i += 1) {
    plan.push(n <= k ? stages[Math.min(k - 1, Math.floor((i * k) / n))].id : (i < k ? stages[i].id : ''));
  }
  return plan;
}

function resetConnectionProgress(template) {
  return {
    templateId: connectionResolveTemplate(template).id,
    connectedStageIds: [],
    appliedQuestionIds: [],
    wrongQuestionIds: [],
    missed: 0
  };
}

function connectionCloneProgress(progress) {
  return {
    templateId: progress.templateId,
    connectedStageIds: progress.connectedStageIds.slice(),
    appliedQuestionIds: progress.appliedQuestionIds.slice(),
    wrongQuestionIds: (progress.wrongQuestionIds || []).slice(),
    missed: progress.missed
  };
}

/** Same contract as `applyConnectionAnswer` in `src/shared/connection-progress.ts`. */
function applyConnectionAnswer(progress, template, plan, itemIndex, itemId, correct) {
  var resolved = connectionResolveTemplate(template);
  var base = progress || resetConnectionProgress(resolved);
  var id = String(itemId || '');
  var stageIds = resolved.stages.map(function (stage) { return stage.id; });
  var wasComplete = connectionIsComplete(base, resolved);
  var stages = Array.isArray(plan) ? plan : [];

  if (id && base.appliedQuestionIds.indexOf(id) !== -1) {
    return { progress: connectionCloneProgress(base), stageId: null, completedNow: false, alreadyComplete: wasComplete };
  }

  if (!correct || !stageIds.length) {
    var missed = connectionCloneProgress(base);
    missed.missed += correct ? 0 : 1;
    if (id && !correct && missed.wrongQuestionIds.indexOf(id) === -1) missed.wrongQuestionIds.push(id);
    return { progress: missed, stageId: null, completedNow: false, alreadyComplete: wasComplete };
  }

  var applied = connectionCloneProgress(base);
  if (id) applied.appliedQuestionIds.push(id);
  if (wasComplete) {
    return { progress: applied, stageId: null, completedNow: false, alreadyComplete: true };
  }

  var planned = Number.isInteger(itemIndex) && itemIndex >= 0 ? stageIds[itemIndex] : '';
  var stageId = planned && applied.connectedStageIds.indexOf(planned) === -1 ? planned : '';
  if (!stageId) {
    for (var i = 0; i < stageIds.length; i += 1) {
      if (applied.connectedStageIds.indexOf(stageIds[i]) === -1) { stageId = stageIds[i]; break; }
    }
  }
  if (!stageId) {
    return { progress: applied, stageId: null, completedNow: false, alreadyComplete: false };
  }

  // Template order, not completion order (see the note in connection-progress.ts):
  // a short run earns net-1 then net-3, and the closure must not leave the
  // array in completion order or the picture would describe itself differently.
  var connected = [];
  for (var j = 0; j < stageIds.length; j += 1) {
    if (applied.connectedStageIds.indexOf(stageIds[j]) !== -1 || stageIds[j] === stageId) connected.push(stageIds[j]);
  }
  // The sweep needs BOTH: every earning slot answered correctly, and no mistake
  // at all. The plan pads itself with '' past the last stage, and a mistake must
  // never be rewarded with stages the player did not earn (see the shared note).
  var earningSlots = 0;
  for (var k = 0; k < stages.length; k += 1) {
    if (stages[k]) earningSlots += 1;
  }
  if (earningSlots > 0 && applied.appliedQuestionIds.length >= earningSlots && applied.missed === 0) connected = stageIds.slice();
  return {
    progress: { templateId: applied.templateId, connectedStageIds: connected, appliedQuestionIds: applied.appliedQuestionIds, wrongQuestionIds: applied.wrongQuestionIds, missed: applied.missed },
    stageId: stageId,
    completedNow: connected.length >= stageIds.length,
    alreadyComplete: false
  };
}

function connectionIsComplete(progress, template) {
  var resolved = connectionResolveTemplate(template);
  if (!resolved.stages.length || !progress) return false;
  for (var i = 0; i < resolved.stages.length; i += 1) {
    if (progress.connectedStageIds.indexOf(resolved.stages[i].id) === -1) return false;
  }
  return true;
}

function connectionSummary(progress, template) {
  var total = connectionResolveTemplate(template).stages.length;
  var connected = progress ? Math.min(progress.connectedStageIds.length, total) : 0;
  return {
    connected: connected,
    total: total,
    remaining: total - connected,
    completed: total > 0 && connected >= total,
    missed: progress ? progress.missed : 0,
    percent: total ? Math.round((connected / total) * 100) : 0
  };
}
