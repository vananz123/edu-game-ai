// ui-scene-editor-panel-check.js — #295: the "Chỉnh cảnh" panel.
//
// The teacher asked for a Canva-like surface behind a button, so this gate drives
// the real panel in the real app: it opens it, drags a handle with real pointer
// events, changes the size slider, resets one node and then all of them, and
// closes with Escape — checking the BLUEPRINT after each step, because the
// blueprint is the only thing that is saved.
//
// Contract notes:
//  - the panel writes nothing but `freePos` (a layout change must still own the
//    composition), so every check below looks at `freePos` and nothing else;
//  - the handles are DOM siblings of the picture, so a drag survives the live
//    re-render — this gate proves that by dragging 6 steps.
//
// Run against a built app with --remote-debugging-port; ui-check-lib reads the
// port from argv[2]:
//   node tests/ui/ui-scene-editor-panel-check.js 9569
//
// Data in this file is synthetic; no student data.
const { check, connect, results } = require('../manual/lib/ui-check-lib');

(async () => {
  const ctx = await connect();
  const out = await ctx.evaluate(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const out = {};
    const game = {
      id: 'se-panel', title: 'Kiểm tra bảng chỉnh cảnh', subject: 'Tự nhiên', grade: '3',
      template: 'quiz', description: '', tags: [], sourceName: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      gameSetup: { scoringMode: 'cơ bản', illustrationMode: 'manual' },
      questions: [{
        id: 'q1', type: 'multiple-choice', prompt: 'Con vật nào kêu meo?',
        options: [{ id: 'a', text: 'Con mèo' }, { id: 'b', text: 'Con chó' }],
        correctOptionId: 'a', correctAnswer: '', explanation: 'Mèo kêu meo.', points: 100,
        contentCategory: 'animals', iconName: 'paw-print', illustrationAssetId: 'animals-meadow'
      }]
    };
    document.getElementById('modalRoot').innerHTML = '';
    openEditor(JSON.parse(JSON.stringify(game)), false, 'test');
    await sleep(300);
    // The row is the QUESTION block: the hidden blueprint field is a sibling of
    // the art row, not a child of it (that mistake made every check below read an
    // empty field on the first run of this gate).
    const row = () => document.querySelector('#editorQuestions .editor-question');
    const field = () => row().querySelector('[data-field="sceneBlueprint"]');
    const bp = () => { try { return JSON.parse(field().value || 'null'); } catch (error) { return null; } };

    // 1. the row has a scene only after "Cảnh thử"; the button must be absent before
    const holder = row();
    out.noEditButtonWithoutScene = !holder || !holder.querySelector('[data-editor-art-edit]');
    const build = holder && holder.querySelector('[data-editor-art-blueprint]');
    if (build) build.click();
    await sleep(300);
    out.editButtonAfterScene = !!row().querySelector('[data-editor-art-edit]');

    // 2. opens
    row().querySelector('[data-editor-art-edit]').click();
    await sleep(400);
    const panel = () => document.querySelector('.scene-editor');
    out.panelOpened = !!panel();
    out.panelIsDialog = panel()?.getAttribute('role') === 'dialog';
    out.panelDrawsPicture = !!panel()?.querySelector('[data-se-art] [data-scene-layer="subject"]');
    const handles = () => Array.from(panel()?.querySelectorAll('[data-se-handle]') || []);
    out.handleCount = handles().length;
    out.handleKeys = handles().map(node => node.getAttribute('data-se-handle')).join(',');
    out.handlesAreOnTheArt = handles().every(node => {
      const style = node.style;
      return parseFloat(style.left) >= 0 && parseFloat(style.left) <= 100 &&
        parseFloat(style.top) >= 0 && parseFloat(style.top) <= 100;
    });
    out.panelShowsSize = !!panel()?.querySelector('[data-se-scale]');

    // 3. a real drag on the subject handle
    const subjectHandle = handles().filter(node => node.getAttribute('data-se-handle') === 'subject')[0] || handles()[0];
    const stage = panel().querySelector('[data-se-stage]');
    const box = stage.getBoundingClientRect();
    const startX = box.left + box.width / 2;
    const startY = box.top + box.height / 2;
    subjectHandle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: startX, clientY: startY }));
    for (let step = 1; step <= 6; step += 1) {
      document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: startX - step * 8, clientY: startY + step * 3 }));
      await sleep(20);
    }
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: startX - 48, clientY: startY + 18 }));
    await sleep(400);
    out.dragWroteFreePos = !!(bp() && bp().freePos && bp().freePos.subject);
    out.dragMovedLeft = !!(bp() && bp().freePos && bp().freePos.subject.x < 0.5);
    out.dragKeptVersion = bp() && bp().v === 1;
    out.dragKeptLayout = bp() && bp().layout === 'single' && bp().backdrop === 'forest';
    out.dragRedrewArt = !!panel()?.querySelector('[data-se-art] [data-scene-layer="subject"]');

    // 4. size slider
    const slider = panel().querySelector('[data-se-scale]');
    slider.value = '140';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(300);
    out.sliderWroteScale = !!(bp() && bp().freePos && bp().freePos.subject && Math.abs(bp().freePos.subject.s - 1.4) < 0.001);
    out.sliderRedrewScaled = /scale\\(1\\.4\\)/.test(panel()?.querySelector('[data-se-art]')?.innerHTML || '');

    // 5. reset one node
    panel().querySelector('[data-se-reset-one]').click();
    await sleep(300);
    out.resetOneCleared = !(bp() && bp().freePos && bp().freePos.subject);

    // 6. drag again, then reset everything
    const again = handles().filter(node => node.getAttribute('data-se-handle') === 'subject')[0];
    again.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: startX, clientY: startY }));
    document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: startX + 40, clientY: startY - 10 }));
    await sleep(30);
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: startX + 40, clientY: startY - 10 }));
    await sleep(300);
    out.secondDragWrote = !!(bp() && bp().freePos && bp().freePos.subject);
    panel().querySelector('[data-se-reset-all]').click();
    await sleep(300);
    out.resetAllRemovedKey = !(bp() && bp().freePos);

    // 7. Escape closes and the row is redrawn from the stored blueprint
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(400);
    out.escapeClosed = !document.querySelector('.scene-editor');
    out.rowStillDraws = !!row()?.querySelector('[data-editor-art-thumb] [data-scene-layer="subject"]');
    out.rowKeptBlueprint = !!(bp() && bp().mainIcon === 'paw-print');

    // 8. #296: change the picture of the selected node inside the panel
    row().querySelector('[data-editor-art-edit]').click();
    await sleep(400);
    const iconSel = document.querySelector('.scene-editor [data-se-icon]');
    out.iconOptionCount = iconSel ? iconSel.options.length : 0;
    out.iconShowsCurrent = Boolean(iconSel) && iconSel.value === (bp() || {}).mainIcon;
    const beforeIcon = document.querySelector('.scene-editor [data-se-art]').innerHTML;
    iconSel.value = 'leaf';
    iconSel.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(350);
    out.iconWroteMain = (bp() || {}).mainIcon === 'leaf';
    out.iconRedrewArt = document.querySelector('.scene-editor [data-se-art]').innerHTML !== beforeIcon;
    out.iconKeptVersion = (bp() || {}).v === 1;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(350);

    // 9. #296: the comparison sign is not an icon, so it gets its own picker and
    // appears only when the sign node is selected.
    const layoutSel = row().querySelector('[data-editor-art-layout]');
    layoutSel.value = 'compare';
    layoutSel.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(450);
    out.compareSceneBuilt = (bp() || {}).layout === 'compare';
    row().querySelector('[data-editor-art-edit]').click();
    await sleep(450);
    const signHandle = document.querySelector('.scene-editor [data-se-handle="sign"]');
    out.signHandleExists = Boolean(signHandle);
    if (signHandle) {
      const box2 = document.querySelector('.scene-editor [data-se-stage]').getBoundingClientRect();
      const cx2 = box2.left + box2.width / 2;
      const cy2 = box2.top + box2.height / 2;
      // a click without movement = "select this node", which must not write freePos
      signHandle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: cx2, clientY: cy2 }));
      document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: cx2, clientY: cy2 }));
      await sleep(300);
    }
    const signRow = document.querySelector('.scene-editor [data-se-sign-row]');
    out.signPickerVisible = Boolean(signRow) && !signRow.classList.contains('is-hidden');
    out.selectingWroteNothing = !(bp() && bp().freePos);
    const signSel = document.querySelector('.scene-editor [data-se-sign]');
    out.signOptionCount = signSel ? signSel.options.length : 0;
    if (signSel) {
      signSel.value = 'less-than';
      signSel.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(300);
    }
    out.signWrote = (bp() || {}).compareSign === 'less-than';
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(300);

    // Leave the app exactly as it was found: a gate that leaves the editor open
    // makes the NEXT gate measure another screen (DECISIONS #288 sequel).
    document.getElementById('modalRoot').innerHTML = '';
    if (typeof closeEditorPage === 'function') closeEditorPage();
    await sleep(300);
    out.appRestored = !document.querySelector('.scene-editor') && !document.querySelector('#editorQuestions .editor-question');
    return out;
  })()`);

  check('no "Chỉnh cảnh" button before a scene exists', out.noEditButtonWithoutScene === true);
  check('the button appears once the scene exists', out.editButtonAfterScene === true);
  check('the button opens a dialog', out.panelOpened === true && out.panelIsDialog === true, JSON.stringify(out.panelIsDialog));
  check('the panel draws the current scene', out.panelDrawsPicture === true);
  check('the panel offers one handle for the single subject', out.handleCount === 1, String(out.handleCount));
  check('the handle is keyed by the blueprint key', out.handleKeys === 'subject', out.handleKeys);
  check('every handle sits inside the canvas', out.handlesAreOnTheArt === true);
  check('the panel offers a size control', out.panelShowsSize === true);
  check('a drag writes freePos into the blueprint', out.dragWroteFreePos === true);
  check('dragging left moves the subject left', out.dragMovedLeft === true);
  check('a drag keeps v at 1', out.dragKeptVersion === true);
  check('a drag never changes the layout or the place', out.dragKeptLayout === true);
  check('the picture redraws after a drag', out.dragRedrewArt === true);
  check('the size slider writes the scale', out.sliderWroteScale === true);
  check('the size slider redraws the picture scaled', out.sliderRedrewScaled === true);
  check('"Đặt lại hình này" clears only that node', out.resetOneCleared === true);
  check('a second drag writes again', out.secondDragWrote === true);
  check('"Đặt lại tất cả" removes freePos entirely', out.resetAllRemovedKey === true);
  check('Escape closes the panel', out.escapeClosed === true);
  check('the row draws the scene again after closing', out.rowStillDraws === true);
  check('closing keeps the stored blueprint', out.rowKeptBlueprint === true);
  check('the gate leaves the app as it found it', out.appRestored === true);

  // #296: the panel is also where the picture of the selected node changes.
  check('the panel lists every drawable icon', out.iconOptionCount === 47, String(out.iconOptionCount));
  check('the icon picker shows the icon being drawn', out.iconShowsCurrent === true);
  check('changing the icon writes mainIcon', out.iconWroteMain === true);
  check('changing the icon redraws the canvas', out.iconRedrewArt === true);
  check('changing the icon keeps v at 1', out.iconKeptVersion === true);
  check('a compare scene offers a sign handle', out.compareSceneBuilt === true && out.signHandleExists === true);
  check('selecting the sign node reveals its picker', out.signPickerVisible === true);
  check('selecting a node writes nothing on its own', out.selectingWroteNothing === true);
  check('the sign picker offers the three signs', out.signOptionCount === 3, String(out.signOptionCount));
  check('changing the sign writes compareSign', out.signWrote === true);

  const failed = results.filter(entry => !entry.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
