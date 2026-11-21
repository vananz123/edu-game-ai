// ui-scene-designer-check.js — #297 "Xưởng cảnh": picture editing as its own screen.
//
// The teacher asked for the picture editor to be a real feature — several objects,
// grow/shrink, turn, visual templates, easy drag and drop. This gate drives all of
// that in the real app and checks the BLUEPRINT after every step, because the
// blueprint is the only thing that is saved.
//
// Contract notes:
//  - a template is a LAYOUT, so switching one may never leave an undrawable scene;
//  - an added object lives in `extras[]` and never changes the layout;
//  - "Huỷ" must leave the stored blueprint untouched, "Xong" must write it.
//
// Run against a built app with --remote-debugging-port; ui-check-lib reads argv[2]:
//   node tests/ui/ui-scene-designer-check.js 9574
//
// Data in this file is synthetic; no student data.
const { check, connect, results } = require('../manual/lib/ui-check-lib');

(async () => {
  const ctx = await connect();
  const out = await ctx.evaluate(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const out = {};
    const game = {
      id: 'sd-1', title: 'Kiểm tra xưởng cảnh', subject: 'Tự nhiên', grade: '3',
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
    const row = () => document.querySelector('#editorQuestions .editor-question');
    const field = () => row().querySelector('[data-field="sceneBlueprint"]');
    const bp = () => { try { return JSON.parse(field().value || 'null'); } catch (error) { return null; } };
    const sd = () => document.querySelector('.scene-designer');
    const handles = () => Array.from(sd()?.querySelectorAll('[data-sd-handle]') || []);
    // #299: a handle is selected by POINTERDOWN (a click alone selects nothing), so
    // the gate must pick a node the same way a teacher does.
    const pick = async node => {
      const box = node.getBoundingClientRect();
      node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 }));
      document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 }));
      await sleep(250);
    };

    out.noButtonWithoutScene = !row().querySelector('[data-editor-art-edit]');
    row().querySelector('[data-editor-art-blueprint]').click();
    await sleep(300);
    out.buttonAfterScene = !!row().querySelector('[data-editor-art-edit]');

    // ---- 1. it is its own screen, not a dialog on the row ----
    row().querySelector('[data-editor-art-edit]').click();
    await sleep(500);
    out.opens = !!sd();
    out.isRegion = sd()?.getAttribute('role') === 'region';
    const box = sd()?.getBoundingClientRect();
    out.coversWindow = !!box && box.width >= window.innerWidth - 1 && box.height >= window.innerHeight - 1;
    out.drawsScene = !!sd()?.querySelector('[data-sd-art] [data-scene-layer="subject"]');

    // ---- 2. visual templates: four, each with a real preview ----
    const templates = Array.from(sd()?.querySelectorAll('[data-sd-template]') || []);
    out.templateCount = templates.length;
    out.templateKeys = templates.map(node => node.getAttribute('data-sd-template')).join(',');
    out.templatesDrawArt = templates.every(node => !!node.querySelector('.sd-template-art [data-scene-layer]'));
    out.templateLabels = templates.every(node => (node.textContent || '').trim().length > 3);

    // ---- 3. the picture palette: every icon, as a picture ----
    const beforeExtra = bp();
    const palette = Array.from(sd()?.querySelectorAll('[data-sd-add]') || []);
    out.paletteCount = palette.length;
    out.paletteDraws = palette.every(node => !!node.querySelector('svg'));
    out.paletteDraggable = palette.every(node => node.getAttribute('draggable') === 'true');

    // ---- 3b. #298: the place (backdrop) picker ----
    const places = Array.from(sd()?.querySelectorAll('[data-sd-place]') || []);
    out.placeCount = places.length;
    out.placesDrawArt = places.every(node => !!node.querySelector('.sd-place-art [data-scene-layer]'));
    out.placesLabelled = places.every(node => (node.textContent || '').trim().length > 2);
    out.placeIsCurrent = places.filter(node => node.classList.contains('is-active')).length === 1;
    // The place grid is re-rendered after every choice, so a cached node would be
    // detached: always query the live DOM.
    const placeOf = id => sd().querySelector('[data-sd-place="' + id + '"]');
    const beforePlace = bp().backdrop;
    placeOf('road').click();
    await sleep(500);
    out.placeWrote = !!bp() && bp().backdrop === 'road' && beforePlace !== 'road';
    // the street is proved by the street it draws, not by the key alone
    out.placeDrewRoad = !!sd()?.querySelector('[data-sd-art] [data-scene-primitive="road"]');
    out.placeMarksActive = !!sd().querySelector('[data-sd-place="road"].is-active');
    placeOf('market').click();
    await sleep(500);
    out.placeSecond = !!bp() && bp().backdrop === 'market';
    out.placeKeepsIcons = !!bp() && bp().mainIcon === beforeExtra.mainIcon;
    out.placeKeepsLayout = !!bp() && bp().layout === beforeExtra.layout;
    placeOf(beforePlace).click();
    await sleep(400);

    // ---- 4. clicking an icon ADDS an object ----
    palette[4].click();
    await sleep(350);
    out.addedToBlueprint = !!bp().extras && bp().extras.length === 1;
    out.addedIconMatches = !!bp().extras && bp().extras[0].icon === palette[4].getAttribute('data-sd-add');
    out.addedDrawn = !!sd()?.querySelector('[data-sd-art] [data-scene-extra="0"]');
    out.addedHandle = handles().some(node => node.getAttribute('data-sd-handle') === 'extra-0');
    out.addedKeepsLayout = !!bp() && bp().layout === beforeExtra.layout;

    // ---- 5. dragging the added object moves it ----
    const extraHandle = handles().filter(node => node.getAttribute('data-sd-handle') === 'extra-0')[0];
    const stageBox = sd().querySelector('[data-sd-canvas]').getBoundingClientRect();
    const startX = stageBox.left + stageBox.width * 0.25;
    const startY = stageBox.top + stageBox.height * 0.75;
    const xBefore = bp().extras[0].x;
    extraHandle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: startX, clientY: startY }));
    for (let step = 1; step <= 5; step += 1) {
      document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: startX + step * 10, clientY: startY }));
      await sleep(20);
    }
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: startX + 50, clientY: startY }));
    await sleep(350);
    out.dragMovedExtra = !!bp().extras && bp().extras[0].x > xBefore;

    // ---- 6. size and angle of the selected node ----
    const rotate = sd().querySelector('[data-sd-rotate]');
    rotate.value = '45';
    rotate.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(300);
    out.rotateWrote = !!bp().extras && bp().extras[0].r === 45;
    out.rotateDrawn = /rotate\\(45\\)/.test(sd()?.querySelector('[data-sd-art]')?.innerHTML || '');
    const scale = sd().querySelector('[data-sd-scale]');
    scale.value = '130';
    scale.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(300);
    out.scaleWrote = !!bp().extras && Math.abs(bp().extras[0].s - 1.3) < 0.001;

    // ---- 6b. #299: turn the selected object with the knob on the canvas ----
    const knob = sd().querySelector('[data-sd-rotator]');
    out.rotatorPresent = !!knob;
    if (knob) {
      const box = sd().querySelector('[data-sd-canvas]').getBoundingClientRect();
      const node = bp().extras[0];
      const centreX = box.left + node.x * box.width;
      const centreY = box.top + node.y * box.height;
      const radius = box.height * 0.3;
      const angleBefore = bp().extras[0].r;
      knob.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: centreX, clientY: centreY + radius }));
      for (let step = 1; step <= 6; step += 1) {
        const angle = -Math.PI / 2 + step * 0.12;
        document.dispatchEvent(new PointerEvent('pointermove', {
          bubbles: true,
          clientX: centreX + Math.cos(angle) * radius,
          clientY: centreY + Math.sin(angle) * radius,
        }));
        await sleep(20);
      }
      document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      await sleep(300);
      out.rotatorTurned = !!bp().extras && bp().extras[0].r !== angleBefore;
      out.rotatorWroteSlider = (sd().querySelector('[data-sd-rotate]').value | 0) === (bp().extras[0].r | 0);
    }

    // ---- 6c. #299: zoom the view, which must not touch the scene ----
    const zoomBefore = sd().querySelector('[data-sd-canvas]').getBoundingClientRect().width;
    const widthBefore = JSON.stringify(bp());
    sd().querySelector('[data-sd-zoom-in]').click();
    sd().querySelector('[data-sd-zoom-in]').click();
    await sleep(250);
    out.zoomLabel = (sd().querySelector('[data-sd-zoom-value]').textContent || '').trim();
    out.zoomGrew = sd().querySelector('[data-sd-canvas]').getBoundingClientRect().width > zoomBefore + 1;
    out.zoomWroteNothing = JSON.stringify(bp()) === widthBefore;
    sd().querySelector('[data-sd-zoom-fit]').click();
    await sleep(200);
    out.zoomFit = (sd().querySelector('[data-sd-zoom-value]').textContent || '').trim() === '100%';
    sd().querySelector('[data-sd-zoom-out]').click();
    await sleep(200);
    out.zoomOutLabel = (sd().querySelector('[data-sd-zoom-value]').textContent || '').trim();
    sd().querySelector('[data-sd-zoom-fit]').click();
    await sleep(200);

    // ---- 7. dropping an icon puts it where it was dropped ----
    const transfer = new DataTransfer();
    transfer.setData('text/plain', palette[7].getAttribute('data-sd-add'));
    const dropCanvas = sd().querySelector('[data-sd-canvas]');
    dropCanvas.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: transfer, clientX: stageBox.left + stageBox.width * 0.3, clientY: stageBox.top + stageBox.height * 0.3 }));
    dropCanvas.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer, clientX: stageBox.left + stageBox.width * 0.3, clientY: stageBox.top + stageBox.height * 0.3 }));
    await sleep(350);
    out.dropAdded = !!bp().extras && bp().extras.length === 2;
    out.dropNearPoint = !!bp().extras && Math.abs(bp().extras[1].x - 0.3) < 0.06 && Math.abs(bp().extras[1].y - 0.3) < 0.06;

    // ---- 8. delete the object the teacher just added ----
    out.removeLabelForExtra = (sd().querySelector('[data-sd-remove]').textContent || '').trim();
    // The knob turned object 0, so "the others are kept" must compare with what is
    // there NOW, not with a number from an earlier step.
    const keptRotation = bp().extras[0].r;
    sd().querySelector('[data-sd-remove]').click();
    await sleep(350);
    out.deleteRemoved = !!bp().extras && bp().extras.length === 1;
    out.deleteKeepsFirst = !!bp().extras && bp().extras[0].r === keptRotation;

    // ---- 8b. #299: undo brings the object back, redo removes it again ----
    const undoButton = sd().querySelector('[data-sd-undo]');
    const redoButton = sd().querySelector('[data-sd-redo]');
    out.undoStartsEnabled = !undoButton.disabled;
    out.redoStartsDisabled = !!redoButton.disabled;
    undoButton.click();
    await sleep(400);
    out.undoRestored = !!bp().extras && bp().extras.length === 2;
    out.redoEnabledNow = !sd().querySelector('[data-sd-redo]').disabled;
    sd().querySelector('[data-sd-redo]').click();
    await sleep(400);
    out.redoRemoved = !!bp().extras && bp().extras.length === 1;

    // ---- 8c. Ctrl+Z must work without clicking anything first ----
    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ctrlKey: true, key: 'z' }));
    await sleep(400);
    out.ctrlZRestored = !!bp().extras && bp().extras.length === 2;
    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ctrlKey: true, shiftKey: true, key: 'z' }));
    await sleep(400);
    out.ctrlShiftZRedid = !!bp().extras && bp().extras.length === 1;

    // ---- 9. a template is a layout, and it must stay drawable ----
    const compareCard = Array.from(sd().querySelectorAll('[data-sd-template]'))
      .filter(node => node.getAttribute('data-sd-template') === 'compare')[0];
    compareCard.click();
    await sleep(450);
    out.templateApplied = !!bp() && bp().layout === 'compare';
    out.templateKeepsExtras = !!bp().extras && bp().extras.length === 1;
    out.templateSignHandle = handles().some(node => node.getAttribute('data-sd-handle') === 'sign');
    // ---- 9b. #299: one delete button for every node (still on the compare scene) ----
    out.handleKeys = handles().map(node => node.getAttribute('data-sd-handle')).join(',');
    const subjectHandle = handles().filter(node => node.getAttribute('data-sd-handle') === 'subject')[0];
    if (subjectHandle) await pick(subjectHandle);
    out.deleteMainRefused = sd().querySelector('[data-sd-remove]').disabled === true;
    const secondHandle = handles().filter(node => node.getAttribute('data-sd-handle') === 'second')[0];
    out.secondHandlePresent = !!secondHandle;
    if (secondHandle) {
      await pick(secondHandle);
      out.deleteLabelForNode = (sd().querySelector('[data-sd-remove]').textContent || '').trim();
      sd().querySelector('[data-sd-remove]').click();
      await sleep(500);
    }
    out.deleteSecondDowngraded = !!bp() && bp().layout !== 'compare' && !bp().compareIcon;
    out.deleteSecondStillDraws = !!sd()?.querySelector('[data-sd-art] [data-scene-layer="subject"]');

    const surroundCard = Array.from(sd().querySelectorAll('[data-sd-template]'))
      .filter(node => node.getAttribute('data-sd-template') === 'surround')[0];
    surroundCard.click();
    await sleep(500);
    out.surroundApplied = !!bp() && bp().layout === 'surround' && Array.isArray(bp().around) && bp().around.length > 0;
    out.surroundStillDraws = !!sd()?.querySelector('[data-sd-art] [data-scene-layer="subject"]');

    // ---- 10. "Xong" writes, "Huỷ" does not ----
    // Writes are LIVE (#297: closing the app must never lose a drag), so "Xong"
    // is proved by the scene SURVIVING the close, not by the field changing then.
    const insideValue = field().value;
    sd().querySelector('[data-sd-done]').click();
    await sleep(450);
    out.doneClosed = !sd();
    out.doneWrote = field().value === insideValue && !!bp() && bp().layout === 'surround';
    row().querySelector('[data-editor-art-edit]').click();
    await sleep(450);
    const kept = field().value;
    const scale2 = sd().querySelector('[data-sd-scale]');
    scale2.value = '80';
    scale2.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(300);
    const changedInside = sd() !== null;
    sd().querySelector('[data-sd-cancel]').click();
    await sleep(450);
    out.cancelClosed = !sd() && changedInside;
    out.cancelKeptStored = field().value === kept;

    // Leave the app exactly as it was found (DECISIONS #288 sequel).
    document.getElementById('modalRoot').innerHTML = '';
    if (typeof closeEditorPage === 'function') closeEditorPage();
    await sleep(300);
    out.appRestored = !document.querySelector('.scene-designer') && !document.querySelector('#editorQuestions .editor-question');
    return out;
  })()`);

  check('no "Chỉnh cảnh" button before a scene exists', out.noButtonWithoutScene === true);
  check('the button appears once the scene exists', out.buttonAfterScene === true);
  check('the button opens the workshop', out.opens === true);
  check('the workshop is its own screen', out.isRegion === true && out.coversWindow === true, JSON.stringify({ region: out.isRegion, covers: out.coversWindow }));
  check('the workshop draws the current scene', out.drawsScene === true);
  check('the workshop offers four visual templates', out.templateCount === 4, String(out.templateCount));
  check('the templates are the four layouts', out.templateKeys === 'single,compare,process,surround', out.templateKeys);
  check('every template shows a drawn preview', out.templatesDrawArt === true);
  check('every template is labelled', out.templateLabels === true);
  check('the workshop offers all twelve places', out.placeCount === 12, String(out.placeCount));
  check('every place is shown as a real picture', out.placesDrawArt === true);
  check('every place is labelled', out.placesLabelled === true);
  check('exactly one place is marked as current', out.placeIsCurrent === true);
  check('choosing a place writes the backdrop', out.placeWrote === true);
  check('the street place really draws a street', out.placeDrewRoad === true);
  check('the chosen place is marked', out.placeMarksActive === true);
  check('a second place can be chosen', out.placeSecond === true);
  check('changing the place keeps the icons', out.placeKeepsIcons === true);
  check('changing the place keeps the layout', out.placeKeepsLayout === true);
  check('the palette lists every icon', out.paletteCount === 47, String(out.paletteCount));
  check('the palette shows pictures, not names', out.paletteDraws === true);
  check('palette pictures can be dragged', out.paletteDraggable === true);
  check('clicking an icon adds an object', out.addedToBlueprint === true);
  check('the added object is the icon that was clicked', out.addedIconMatches === true);
  check('the added object is drawn', out.addedDrawn === true);
  check('the added object gets a handle', out.addedHandle === true);
  check('adding an object never changes the layout', out.addedKeepsLayout === true);
  check('dragging the object moves it', out.dragMovedExtra === true);
  check('the angle slider writes the rotation', out.rotateWrote === true);
  check('the turned object is drawn turned', out.rotateDrawn === true);
  check('the size slider writes the scale', out.scaleWrote === true);
  check('dropping an icon adds an object', out.dropAdded === true);
  check('the dropped object lands where it was dropped', out.dropNearPoint === true);
  check('the delete button says "vật" for an added object', /vật/.test(out.removeLabelForExtra || ''), out.removeLabelForExtra);
  check('"Xoá vật này" removes the object', out.deleteRemoved === true);
  check('the rotate knob is on the selection', out.rotatorPresent === true);
  check('dragging the knob turns the object', out.rotatorTurned === true);
  check('the knob and the angle slider agree', out.rotatorWroteSlider === true);
  check('zoom changes the label', out.zoomLabel === '120%', out.zoomLabel);
  check('zoom really makes the canvas bigger', out.zoomGrew === true);
  check('zoom writes nothing into the scene', out.zoomWroteNothing === true);
  check('"Vừa khung" returns to 100%', out.zoomFit === true);
  check('zoom out goes below 100%', out.zoomOutLabel === '90%', out.zoomOutLabel);
  check('undo is available after a change', out.undoStartsEnabled === true);
  check('redo starts disabled', out.redoStartsDisabled === true);
  check('undo brings the deleted object back', out.undoRestored === true);
  check('undo enables redo', out.redoEnabledNow === true);
  check('redo deletes it again', out.redoRemoved === true);
  check('Ctrl+Z undoes without touching a button', out.ctrlZRestored === true);
  check('Ctrl+Shift+Z redoes', out.ctrlShiftZRedid === true);
  check('the main picture refuses to be deleted', out.deleteMainRefused === true);
  check('a compare scene has a second handle', out.secondHandlePresent === true, out.handleKeys + ' layout=' + out.layoutHere);
  check('the delete button says "hình" for a layout node', /hình/.test(out.deleteLabelForNode || ''), out.deleteLabelForNode);
  check('deleting the second picture degrades to a single scene', out.deleteSecondDowngraded === true);
  check('the degraded scene still draws', out.deleteSecondStillDraws === true);
  check('deleting one object keeps the others as they were', out.deleteKeepsFirst === true);
  check('a template switches the layout', out.templateApplied === true);
  check('a template keeps the added objects', out.templateKeepsExtras === true);
  check('the compare template offers a sign handle', out.templateSignHandle === true);
  check('the surround template builds a drawable ring', out.surroundApplied === true);
  check('the workshop still draws after a template switch', out.surroundStillDraws === true);
  check('"Xong" closes the workshop', out.doneClosed === true);
  check('"Xong" writes the scene into the question', out.doneWrote === true);
  check('"Huỷ" closes the workshop', out.cancelClosed === true);
  check('"Huỷ" leaves the stored scene untouched', out.cancelKeptStored === true);
  check('the gate leaves the app as it found it', out.appRestored === true);

  const failed = results.filter(entry => !entry.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
