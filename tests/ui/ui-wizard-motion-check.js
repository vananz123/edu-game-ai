#!/usr/bin/env node
/**
 * DECISIONS #329 — the wizard moves in the DIRECTION of travel, and only when it moves.
 *
 * Plan item S3-4 ("wizard direction"). Two things must hold, and the second is the
 * one that breaks in practice:
 *   1. going forward slides in from the right, going back from the left;
 *   2. a re-render that does NOT change the step draws NO slide — a page that slides
 *      on every keystroke is worse than a page that never slides.
 *
 * Usage: `node tests/ui/ui-wizard-motion-check.js [port]`.
 */
process.argv[2] = process.argv[2] || process.env.CDP_PORT || '9349';

const { connect, check, results } = require('../manual/lib/ui-check-lib');

const SCENARIO = String.raw`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const out = {};
  for (let i = 0; i < 40; i++) {
    if (document.querySelector('#modalRoot .setup-fullscreen')) break;
    await new Promise(r => setTimeout(r, 100));
  }
  if (typeof closeSetupWizard === 'function') closeSetupWizard('close');
  await sleep(250);
  if (typeof closeGame === 'function') { try { closeGame(); } catch (e) { void e; } }
  await sleep(250);

  const read = () => {
    const body = document.querySelector('.wizard-step');
    if (!body) return null;
    const cs = getComputedStyle(body);
    return { cls: body.className, animation: cs.animationName, transform: cs.transform, opacity: cs.opacity };
  };

  // The wizard is a PAGE: navigate to it first. Reading wizardState without the page
  // open finds nothing and made the first version of this gate fail on a correct build.
  navigate('create-wizard');
  for (let i = 0; i < 40; i++) {
    if (document.querySelector('.wizard-step')) break;
    await new Promise(r => setTimeout(r, 100));
  }
  await sleep(300);

  wizardState.step = 'input';
  render();
  await sleep(350);
  out.baseline = read();

  // A re-render that does NOT change the step must not slide.
  render();
  await sleep(60);
  out.sameStep = read();

  // Forward: the step index goes up.
  wizardState.step = 'analyze';
  render();
  out.forward = read();
  const forwardSamples = [];
  for (let i = 0; i < 8; i += 1) { forwardSamples.push(read()); await sleep(30); }
  out.forwardSamples = forwardSamples;
  await sleep(300);

  // Back: the real back path (it clamps at the first step).
  out.beforeBack = read();
  wizardGoBack();
  await sleep(20);
  out.back = read();
  await sleep(320);
  out.afterBack = read();
  out.stepAfterBack = wizardState.step;

  wizardState.step = 'input';
  render();
  await sleep(200);
  return out;
})()`;

(async () => {
  const cdp = await connect();
  const raw = await cdp.evaluate(SCENARIO);
  const r = raw.result ? raw.result.value : raw;

  const cls = value => String((value && value.cls) || '');

  check('the wizard page is open and draws a step body', Boolean(r.baseline), r.baseline && r.baseline.cls);
  check('a first draw does not slide — arriving at the wizard is not a move',
    r.baseline && r.baseline.animation === 'none', r.baseline && r.baseline.animation);
  check('re-rendering the SAME step draws nothing — typing must not restart the slide',
    r.sameStep && r.sameStep.animation === 'none' && !cls(r.sameStep).includes('is-forward')
      && !cls(r.sameStep).includes('is-back'),
    r.sameStep && `${r.sameStep.animation} | ${r.sameStep.cls}`);
  check('moving FORWARD slides in from the right',
    r.forward && r.forward.animation === 'wizard-step-forward' && cls(r.forward).includes('is-forward'),
    r.forward && `${r.forward.animation} | ${r.forward.cls}`);
  const offsets = (r.forwardSamples || []).map(sample => {
    const match = /^matrix\(1, 0, 0, 1, (-?[\d.]+),/.exec(String((sample && sample.transform) || ''));
    return match ? Number(match[1]) : 0;
  });
  check('the forward slide really travels from the right edge inward',
    offsets.length > 0 && offsets.some(value => value > 2) && offsets[offsets.length - 1] === 0,
    offsets.join(' '));
  check('moving BACK slides in from the left',
    r.back && r.back.animation === 'wizard-step-back' && cls(r.back).includes('is-back'),
    r.back && `${r.back.animation} | ${r.back.cls}`);
  check('the back move really went to the previous step', r.stepAfterBack === 'input', String(r.stepAfterBack));
  check('the step body ends fully visible and flat',
    r.afterBack && Number(r.afterBack.opacity) === 1
      && (r.afterBack.transform === 'none' || r.afterBack.transform === 'matrix(1, 0, 0, 1, 0, 0)'),
    r.afterBack && `${r.afterBack.opacity} / ${r.afterBack.transform}`);

  const failed = results.filter(entry => !entry.ok).length;
  console.log('');
  console.log(failed === 0
    ? `ui-wizard-motion-check: ${results.length}/${results.length} passed`
    : `${failed} check(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
