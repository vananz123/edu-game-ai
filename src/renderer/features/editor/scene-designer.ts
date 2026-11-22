/**
 * #297 — the scene workshop: picture editing as its own screen.
 *
 * The teacher asked for the picture editor to be a real feature, not two sliders
 * on a thumbnail: edit several objects, grow/shrink them, turn them, start from a
 * visual template, and drag things around. So this is a full-screen surface with
 * four parts:
 *
 *   Mẫu      four VISUAL templates (one picture, two to compare, a three-step
 *            sequence, things around one subject) — a template is the layout, and
 *            the preview is drawn by the game engine, not by a mock-up;
 *   Hình     every icon the engine can draw, as pictures; click adds an object,
 *            dragging one onto the canvas adds it where you dropped it;
 *   canvas   the real scene, with one invisible handle per node;
 *   panel    the selected node: its icon, its size, its angle, delete, reset.
 *
 * What is stored stays a small JSON blueprint: extra objects are `extras[]`, and
 * a moved/turned node is `freePos[key] = {x, y, s, r}`. Never pixels, never SVG.
 *
 * Layout rule from #295 kept: the handles are DOM siblings of the picture, so the
 * picture can be re-rendered on every pointer move without losing the gesture.
 */
const SCENE_DESIGNER_SURROUND_SAMPLE = 4;

function openSceneDesigner(options) {
  const opts = options || {};
  const host = opts.host || document.body;
  /* #300: exactly ONE workshop. A second click on "Chỉnh cảnh" (a double-click, or a
     teacher clicking again because the first click felt slow) used to stack a whole
     second screen underneath; "Xong" then closed only the top one, the page stayed
     scroll-locked and the row stopped responding. The newest open wins, and because
     every change is written through live (#297) nothing is lost by dropping the old
     screen. */
  Array.from(document.querySelectorAll('.scene-designer')).forEach(node => node.remove());
  if (typeof stageNormalizeBlueprint !== 'function') return;
  const initial = stageNormalizeBlueprint(opts.blueprint);
  if (!initial) return;

  const icons = Array.isArray(opts.icons) ? opts.icons : [];
  const signs = Array.isArray(opts.signs) ? opts.signs : [];
  const render = blueprint => (typeof opts.render === 'function' ? opts.render(JSON.stringify(blueprint)) || '' : '');
  const iconHtml = (id, size) =>
    typeof stageSceneIconHtml === 'function' ? stageSceneIconHtml(id, size) : '';

  let blueprint = initial;
  let selectedKey = 'subject';
  /* #299: an undo step is a SNAPSHOT of the blueprint, not a command. A scene is a
     small JSON object, so 60 snapshots cost less than one picture and every change
     (drag, slider, template, place, icon, add, delete) becomes undoable for free. */
  const history: string[] = [JSON.stringify(initial)];
  let historyAt = 0;
  /* #299: the view zoom is a VIEW setting — it is never written into the scene. */
  let zoom = 1;
  /* #301: the size the scene is drawn at when zoom is 100%. It is measured from the
     stage, so the picture FILLS the work area instead of floating in the middle of
     it inside a fixed 860px box. */
  let baseWidth = 0;
  // #297: every change is written through immediately, so nothing a teacher did
  // can be lost by an app that closes. "Huỷ" restores this exact snapshot.
  const originalJson = JSON.stringify(initial);

  const root = document.createElement('div');
  root.className = 'scene-designer';
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'Xưởng cảnh');
  root.innerHTML =
    '<div class="sd-head">' +
      '<div class="sd-title"><strong>Xưởng cảnh</strong>' +
        '<span>Kéo hình trên khung để đặt chỗ · chọn một hình để đổi cỡ và góc · kéo một hình mẫu từ cột trái vào khung để thêm vật.</span></div>' +
      /* #303: the two things a teacher needs to know are pinned in the header, not
         left to be discovered: what is selected, and that "Xong" is the save. */ 
      '<div class="sd-head-actions">' +
        '<button type="button" class="btn btn-secondary btn-small" data-sd-undo title="Hoàn tác (Ctrl+Z)">↶ Hoàn tác</button>' +
        '<button type="button" class="btn btn-secondary btn-small" data-sd-redo title="Làm lại (Ctrl+Shift+Z)">↷ Làm lại</button>' +
        '<button type="button" class="btn btn-secondary btn-small" data-sd-cancel>Huỷ</button>' +
        '<button type="button" class="btn btn-primary btn-small" data-sd-done>Xong — lưu cảnh</button>' +
      '</div>' +
    '</div>' +
    '<div class="sd-body">' +
      '<div class="sd-side sd-side-left">' +
        '<div class="sd-group sd-group-templates"><span class="sd-group-title">Bố cục <em>4</em></span>' +
          '<div class="sd-templates" data-sd-templates></div></div>' +
        '<div class="sd-group sd-group-places"><span class="sd-group-title">Nơi diễn ra <em>12</em></span>' +
          '<div class="sd-places" data-sd-places></div></div>' +
        '<div class="sd-group sd-group-icons"><span class="sd-group-title">Hình mẫu — kéo vào khung <em>47</em></span>' +
          '<div class="sd-icons" data-sd-icons></div></div>' +
      '</div>' +
      '<div class="sd-stage">' +
        '<div class="sd-canvas-wrap" data-sd-wrap>' +
          '<div class="sd-canvas" data-sd-canvas>' +
            '<div class="sd-art" data-sd-art></div>' +
            '<div class="sd-handles" data-sd-handles></div>' +
          '</div>' +
        '</div>' +
        /* #300: the zoom bar lives OUTSIDE the scrolling area. At 200% the canvas is
           taller than the column, and a bar that scrolls with it is a bar the teacher
           cannot reach — which reads as "zoom is missing". */
        '<div class="sd-zoom">' +
          '<button type="button" class="btn btn-secondary btn-small" data-sd-zoom-out title="Thu nhỏ khung vẽ">−</button>' +
          '<span class="sd-zoom-value" data-sd-zoom-value>100%</span>' +
          '<button type="button" class="btn btn-secondary btn-small" data-sd-zoom-in title="Phóng to khung vẽ">+</button>' +
          '<button type="button" class="btn btn-secondary btn-small" data-sd-zoom-fit title="Vừa khung">Vừa khung</button>' +
        '</div>' +
        '<div class="sd-status" data-sd-status></div>' +
      '</div>' +
      '<div class="sd-side sd-side-right">' +
        '<div class="sd-group sd-group-selected"><span class="sd-group-title">Đang chọn</span>' +
          '<strong class="sd-selected" data-sd-name>Hình chính</strong></div>' +
        '<div class="sd-group" data-sd-icon-row><span class="sd-group-title">Hình</span>' +
          '<select data-sd-icon></select></div>' +
        '<div class="sd-group is-hidden" data-sd-sign-row><span class="sd-group-title">Dấu so sánh</span>' +
          '<select data-sd-sign></select></div>' +
        '<div class="sd-group"><span class="sd-group-title">Cỡ <em data-sd-scale-value>100%</em></span>' +
          '<input type="range" min="50" max="160" step="5" value="100" data-sd-scale></div>' +
        '<div class="sd-group"><span class="sd-group-title">Góc xoay <em data-sd-rotate-value>0°</em></span>' +
          '<input type="range" min="-180" max="180" step="5" value="0" data-sd-rotate></div>' +
        '<div class="sd-group sd-group-actions"><span class="sd-group-title">Thao tác</span>' +
          '<button type="button" class="btn btn-secondary btn-small" data-sd-reset-one>Trả hình này về chỗ cũ</button>' +
          '<button type="button" class="btn btn-secondary btn-small is-danger" data-sd-remove>Xoá hình này</button>' +
          '<button type="button" class="btn btn-secondary btn-small" data-sd-reset-all>Xoá hết chỉnh tay</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  const art = root.querySelector('[data-sd-art]');
  const handleLayer = root.querySelector('[data-sd-handles]');
  const canvas = root.querySelector('[data-sd-canvas]') as HTMLElement;
  const iconSelect = root.querySelector('[data-sd-icon]') as HTMLSelectElement;
  const signSelect = root.querySelector('[data-sd-sign]') as HTMLSelectElement;
  const signRow = root.querySelector('[data-sd-sign-row]') as HTMLElement;
  const iconRow = root.querySelector('[data-sd-icon-row]') as HTMLElement;
  const scaleInput = root.querySelector('[data-sd-scale]') as HTMLInputElement;
  const scaleOut = root.querySelector('[data-sd-scale-value]') as HTMLElement;
  const rotateInput = root.querySelector('[data-sd-rotate]') as HTMLInputElement;
  const rotateOut = root.querySelector('[data-sd-rotate-value]') as HTMLElement;
  const nameOut = root.querySelector('[data-sd-name]') as HTMLElement;
  const statusOut = root.querySelector('[data-sd-status]') as HTMLElement;
  const removeNode = root.querySelector('[data-sd-remove]') as HTMLElement;
  const templatesBox = root.querySelector('[data-sd-templates]') as HTMLElement;
  const iconsBox = root.querySelector('[data-sd-icons]') as HTMLElement;
  const placesBox = root.querySelector('[data-sd-places]') as HTMLElement;
  const places: Array<{ id: string; label: string }> = Array.isArray(opts.backdrops) ? opts.backdrops : [];

  iconSelect.innerHTML = icons
    .map(entry => '<option value="' + escapeHtml(entry.id) + '">' + escapeHtml(entry.label) + '</option>')
    .join('');
  signSelect.innerHTML = signs
    .map(entry => '<option value="' + escapeHtml(entry.id) + '">' + escapeHtml(entry.label) + '</option>')
    .join('');

  const extrasOf = () => (Array.isArray(blueprint.extras) ? blueprint.extras : []);
  const isExtraKey = key => /^extra-\d+$/.test(key);
  const extraIndex = key => Number(/^extra-(\d+)$/.exec(key)[1]);

  /** Where the selected node currently is, in the same units `freePos` uses. */
  function placementOf(key) {
    const slots = sceneNodeSlotsSafe();
    const slot = slots.filter(item => item.key === key)[0];
    if (!slot) return null;
    return {
      x: (slot.x + slot.size / 2) / 320,
      y: (slot.y + slot.size / 2) / 200,
      s: slot.scale,
      r: slot.rotation,
      slot,
    };
  }

  function sceneNodeSlotsSafe() {
    const slots = typeof stageSceneNodeSlots === 'function' ? stageSceneNodeSlots(blueprint) : [];
    // #297: the added objects live in `extras[]`, so their handles come from there
    // and not from `freePos`.
    return slots;
  }

  function withPlacement(key, next) {
    const copy = Object.assign({}, blueprint);
    const x = Math.round(Math.min(1, Math.max(0, next.x)) * 1000) / 1000;
    const y = Math.round(Math.min(1, Math.max(0, next.y)) * 1000) / 1000;
    const s = Math.round(Math.min(1.6, Math.max(0.5, next.s)) * 100) / 100;
    const r = Math.round(Math.min(180, Math.max(-180, next.r || 0)));
    if (isExtraKey(key)) {
      const items = extrasOf().slice();
      const index = extraIndex(key);
      if (!items[index]) return copy;
      items[index] = Object.assign({}, items[index], { x, y, s }, r ? { r } : {});
      if (!r) delete items[index].r;
      copy.extras = items;
      return copy;
    }
    const freePos = Object.assign({}, copy.freePos || {});
    const entry = { x, y, s };
    freePos[key] = r ? Object.assign(entry, { r }) : entry;
    copy.freePos = freePos;
    return copy;
  }

  function commit(next, note, options?) {
    const clean = stageNormalizeBlueprint(next);
    if (clean) {
      blueprint = clean;
      const json = JSON.stringify(blueprint);
      if (typeof opts.onChange === 'function') opts.onChange(json);
      recordHistory(json, options && options.silent);
    }
    paint();
    if (note) statusOut.textContent = note;
  }

  /** Push one undo step. Repeating the same scene does not create a step. */
  function recordHistory(json: string, silent?: boolean) {
    if (silent) return;
    if (history[historyAt] === json) return;
    history.length = historyAt + 1;
    history.push(json);
    if (history.length > 60) history.shift();
    historyAt = history.length - 1;
    paintHistoryButtons();
  }

  function paintHistoryButtons() {
    const undo = root.querySelector('[data-sd-undo]') as HTMLButtonElement | null;
    const redo = root.querySelector('[data-sd-redo]') as HTMLButtonElement | null;
    if (undo) undo.disabled = historyAt <= 0;
    if (redo) redo.disabled = historyAt >= history.length - 1;
  }

  /** Step back / forward through the snapshots the teacher created. */
  function stepHistory(delta: number) {
    const next = historyAt + delta;
    if (next < 0 || next >= history.length) return;
    historyAt = next;
    const json = history[historyAt];
    const clean = stageNormalizeBlueprint(json);
    if (!clean) return;
    blueprint = clean;
    if (typeof opts.onChange === 'function') opts.onChange(json);
    paint();
    paintPresets();
    paintHistoryButtons();
    statusOut.textContent = delta < 0 ? 'Đã hoàn tác.' : 'Đã làm lại.';
  }

  function paintTemplates() {
    const samples = [
      { layout: 'single', label: 'Một hình' },
      { layout: 'compare', label: 'So sánh hai hình' },
      { layout: 'process', label: 'Quy trình ba bậc' },
      { layout: 'surround', label: 'Vây quanh' },
    ];
    templatesBox.innerHTML = samples.map(sample => {
      const preview = blueprintForLayout(sample.layout);
      const active = blueprint.layout === sample.layout ? ' is-active' : '';
      return '<button type="button" class="sd-template' + active + '" data-sd-template="' + sample.layout + '" ' +
        'title="Dùng bố cục: ' + escapeHtml(sample.label) + '">' +
        '<span class="sd-template-art">' + render(preview) + '</span>' +
        '<span class="sd-template-label">' + escapeHtml(sample.label) + '</span></button>';
    }).join('');
    templatesBox.querySelectorAll('[data-sd-template]').forEach(button => {
      button.addEventListener('click', () => applyLayout(button.getAttribute('data-sd-template') || 'single'));
    });
  }

  /** A preview blueprint for a layout, using the current icons. */
  function blueprintForLayout(layout) {
    const iconList = icons.map(entry => entry.id);
    const other = iconList.filter(id => id !== blueprint.mainIcon)[0] || blueprint.mainIcon;
    const base = stageNormalizeBlueprint(Object.assign({}, blueprint, { layout }));
    if (base && base.layout === layout) return base;
    // The layout needs something it does not have yet: build it from scratch.
    const sample = Object.assign({}, blueprint, {
      layout,
      compareIcon: layout === 'compare' ? other : blueprint.compareIcon,
      compareSign: layout === 'compare' ? 'greater-than' : blueprint.compareSign,
      steps: layout === 'process' ? [other, iconList.filter(id => id !== blueprint.mainIcon && id !== other)[0] || other] : blueprint.steps,
      around: layout === 'surround' ? Array.from({ length: SCENE_DESIGNER_SURROUND_SAMPLE }, (_v, index) =>
        iconList[(index + 1) % Math.max(1, iconList.length)] || other) : blueprint.around,
    });
    return stageNormalizeBlueprint(sample) || blueprint;
  }

  /** A template is the LAYOUT, and the normaliser decides if it can be drawn. */
  function applyLayout(layout) {
    const next = blueprintForLayout(layout);
    if (next.layout !== layout) {
      statusOut.textContent = 'Chưa đổi được bố cục này — cảnh chưa có đủ hình cho nó.';
      return;
    }
    commit(next, 'Đã đổi sang bố cục “' + templateLabel(layout) + '”.');
    paintPresets();
  }

  function templateLabel(layout) {
    const found = [
      ['single', 'Một hình'],
      ['compare', 'So sánh hai hình'],
      ['process', 'Quy trình ba bậc'],
      ['surround', 'Vây quanh'],
    ].filter(entry => entry[0] === layout)[0];
    return found ? found[1] : layout;
  }

  /**
   * #298: the twelve places, each shown as a REAL picture of the current scene in
   * that place. A colour swatch would tell the teacher nothing about a street
   * versus a shop; the engine can draw both, so it should.
   */
  function paintPlaces() {
    if (!places.length) {
      placesBox.innerHTML = '<span class="sd-icons-fallback">Chưa nạp được danh sách nền.</span>';
      return;
    }
    placesBox.innerHTML = places.map(place => {
      const active = blueprint.backdrop === place.id ? ' is-active' : '';
      return '<button type="button" class="sd-place' + active + '" data-sd-place="' + escapeHtml(place.id) + '" ' +
        'title="Đặt cảnh ở: ' + escapeHtml(place.label) + '">' +
        '<span class="sd-place-art">' + render(placePreview(place.id)) + '</span>' +
        '<span class="sd-place-label">' + escapeHtml(place.label) + '</span></button>';
    }).join('');
    placesBox.querySelectorAll('[data-sd-place]').forEach(button => {
      button.addEventListener('click', () => applyPlace(button.getAttribute('data-sd-place') || 'plain'));
    });
    // The grid scrolls; the place in use must be the one the teacher can see
    // without hunting for it.
    const activePlace = placesBox.querySelector('.sd-place.is-active');
    if (activePlace && typeof activePlace.scrollIntoView === 'function') {
      activePlace.scrollIntoView({ block: 'nearest' });
    }
  }

  /**
   * A place preview keeps the icons but drops every hand placement, so the twelve
   * pictures differ ONLY by the place — the thing the teacher is choosing.
   */
  function placePreview(id) {
    const clean = stageNormalizeBlueprint(
      Object.assign({}, blueprint, { backdrop: id, freePos: undefined, extras: undefined })
    );
    return clean || blueprint;
  }

  function applyPlace(id) {
    const clean = stageNormalizeBlueprint(Object.assign({}, blueprint, { backdrop: id }));
    if (!clean) return;
    const label = (places.filter(entry => entry.id === id)[0] || { label: id }).label;
    commit(clean, 'Cảnh giờ diễn ra ở: ' + label + '.');
    paintPlaces();
  }

  function paintIcons() {
    if (!iconHtml('paw-print', 20)) {
      iconsBox.innerHTML = '<span class="sd-icons-fallback">Chưa nạp được hình mẫu.</span>';
      return;
    }
    iconsBox.innerHTML = icons.map(entry =>
      '<button type="button" class="sd-icon" data-sd-add="' + escapeHtml(entry.id) + '" draggable="true" ' +
      'title="' + escapeHtml(entry.label) + '">' + iconHtml(entry.id, 26) + '</button>').join('');
    iconsBox.querySelectorAll('[data-sd-add]').forEach(button => {
      const id = button.getAttribute('data-sd-add') || '';
      // Click = add in a free spot. Drag = add exactly where it was dropped.
      button.addEventListener('click', () => addExtra(id, null));
      button.addEventListener('dragstart', dragEvent => {
        const transfer = (dragEvent as DragEvent).dataTransfer;
        if (transfer) {
          transfer.setData('text/plain', id);
          transfer.effectAllowed = 'copy';
        }
      });
    });
  }

  /** Add an object: at the drop point when there is one, otherwise in a free spot. */
  function addExtra(icon, point) {
    if (!icon) return;
    const items = extrasOf().slice();
    if (items.length >= 6) {
      statusOut.textContent = 'Cảnh đã có 6 vật thêm — xoá bớt một vật trước khi thêm.';
      return;
    }
    const spots = [
      [0.2, 0.78], [0.8, 0.78], [0.16, 0.24], [0.84, 0.24], [0.5, 0.86], [0.5, 0.16],
    ];
    const spot = point || { x: spots[items.length % spots.length][0], y: spots[items.length % spots.length][1] };
    items.push({ icon, x: Math.round(spot.x * 1000) / 1000, y: Math.round(spot.y * 1000) / 1000, s: 1 });
    selectedKey = 'extra-' + (items.length - 1);
    commit(Object.assign({}, blueprint, { extras: items }), 'Đã thêm một vật — kéo để đặt chỗ khác.');
  }

  function paint() {
    const slots = sceneNodeSlotsSafe();
    if (!slots.some(slot => slot.key === selectedKey)) selectedKey = slots.length ? slots[0].key : 'subject';
    art.innerHTML = render(blueprint);
    // Small boxes last: an object dropped on top of the subject must be the thing
    // the pointer hits (same rule as #296).
    handleLayer.innerHTML = slots.slice().sort((a, b) => b.size - a.size).map(slot => {
      const left = (slot.x / 320) * 100;
      const top = (slot.y / 200) * 100;
      const width = Math.max(6, (slot.size / 320) * 100);
      const height = (slot.size / 200) * 100;
      const active = slot.key === selectedKey ? ' is-active' : '';
      const turned = slot.rotation ? ' transform="rotate(' + slot.rotation + ')"' : '';
      return '<button type="button" class="sd-handle' + active + '" data-sd-handle="' + escapeHtml(slot.key) + '" ' +
        'style="left:' + left.toFixed(2) + '%;top:' + top.toFixed(2) + '%;width:' + width.toFixed(2) + '%;height:' + height.toFixed(2) + '%"' +
        turned + ' title="' + escapeHtml(slot.label) + '"><i>' + escapeHtml(slot.label) + '</i></button>';
    }).join('');
    handleLayer.querySelectorAll('[data-sd-handle]').forEach(handle => {
      handle.addEventListener('pointerdown', event => startDrag(event, handle));
    });

    paintRotator();
    const chosen = slots.filter(slot => slot.key === selectedKey)[0];
    const isSign = selectedKey === 'sign';
    nameOut.textContent = chosen ? chosen.label : 'Hình chính';
    iconRow.classList.toggle('is-hidden', isSign);
    signRow.classList.toggle('is-hidden', !isSign);
    /* #299: the main picture cannot be deleted (a scene needs a subject), so the
       button is disabled there instead of removing the question's whole picture. */
    if (canDelete(selectedKey)) removeNode.removeAttribute('disabled');
    else removeNode.setAttribute('disabled', 'disabled');
    removeNode.textContent = isExtraKey(selectedKey) ? 'Xoá vật này' : 'Xoá hình này';
    if (!isSign) {
      const current = iconOf(selectedKey);
      if (icons.some(entry => entry.id === current)) iconSelect.value = current;
    } else if (signs.some(entry => entry.id === (blueprint.compareSign || ''))) {
      signSelect.value = blueprint.compareSign || '';
    }
    if (chosen) {
      const percent = Math.round(chosen.scale * 100);
      scaleInput.value = String(percent);
      scaleOut.textContent = percent + '%';
      rotateInput.value = String(Math.round(chosen.rotation || 0));
      rotateOut.textContent = Math.round(chosen.rotation || 0) + '°';
    }
  }

  /**
   * #299: turning on the canvas. The knob sits under the selected node's box and
   * drags around the node's centre, so "rotate" means the same thing as the slider
   * and writes the same number.
   */
  function paintRotator() {
    const existing = root.querySelector('[data-sd-rotator]');
    if (existing) existing.remove();
    const slots = sceneNodeSlotsSafe();
    const slot = slots.filter(item => item.key === selectedKey)[0];
    if (!slot) return;
    const cx = (slot.x + slot.size / 2) / 320;
    const cy = (slot.y + slot.size / 2) / 200;
    const halfHeight = (slot.size * slot.scale) / 2 / 200;
    const knob = document.createElement('button');
    knob.type = 'button';
    knob.className = 'sd-rotator';
    knob.setAttribute('data-sd-rotator', '1');
    knob.title = 'Kéo để xoay hình đang chọn';
    knob.textContent = '↻';
    knob.style.left = (cx * 100).toFixed(2) + '%';
    knob.style.top = Math.min(96, (cy + halfHeight) * 100 + 4).toFixed(2) + '%';
    handleLayer.appendChild(knob);
    knob.addEventListener('pointerdown', event => startRotate(event));
  }

  function startRotate(event: PointerEvent) {
    if (event.button !== 0) return;
    event.preventDefault();
    const slot = sceneNodeSlotsSafe().filter(item => item.key === selectedKey)[0];
    if (!slot) return;
    const box = canvas.getBoundingClientRect();
    const cx = box.left + ((slot.x + slot.size / 2) / 320) * box.width;
    const cy = box.top + ((slot.y + slot.size / 2) / 200) * box.height;
    const start = Math.atan2(event.clientY - cy, event.clientX - cx);
    const base = slot.rotation || 0;
    let pending = null;
    let frame = 0;
    const onMove = (moveEvent: PointerEvent) => {
      const now = Math.atan2(moveEvent.clientY - cy, moveEvent.clientX - cx);
      let degrees = base + ((now - start) * 180) / Math.PI;
      degrees = Math.max(-180, Math.min(180, Math.round(degrees / 5) * 5));
      rotateOut.textContent = Math.round(degrees) + '°';
      rotateInput.value = String(Math.round(degrees));
      pending = withPlacement(selectedKey, {
        x: (slot.x + slot.size / 2) / 320,
        y: (slot.y + slot.size / 2) / 200,
        s: slot.scale,
        r: degrees,
      });
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!pending) return;
        const clean = stageNormalizeBlueprint(pending);
        if (!clean) return;
        blueprint = clean;
        if (typeof opts.onChange === 'function') opts.onChange(JSON.stringify(blueprint));
        art.innerHTML = render(blueprint);
      });
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove as EventListener);
      document.removeEventListener('pointerup', onUp);
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      if (pending) commit(pending, 'Đã xoay hình.');
    };
    document.addEventListener('pointermove', onMove as EventListener);
    document.addEventListener('pointerup', onUp);
  }

  /**
   * #301: the biggest 16:10 rectangle that fits the stage. Measured, not guessed:
   * the stage is 3 columns wide and one window tall, so the binding limit can be
   * either side and hard-coding it left the picture small with dead space around it.
   */
  function measureBase() {
    const wrap = root.querySelector('[data-sd-wrap]') as HTMLElement | null;
    if (!wrap) return;
    /* #303: the mat has real padding, so the picture must be measured against the
       area INSIDE it. Subtracting a guessed 12px left the canvas one or two pixels
       too wide and the stage grew a scrollbar at 100% — the very thing the fit is
       supposed to remove. */
    const style = getComputedStyle(wrap);
    const padX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    const padY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    const width = Math.max(180, wrap.clientWidth - padX - 2);
    const height = Math.max(120, wrap.clientHeight - padY - 2);
    baseWidth = Math.round(Math.min(width, height * 1.6));
    canvas.setAttribute('data-sd-fit', String(baseWidth));
    paintCanvasSize();
  }

  function paintCanvasSize() {
    if (!baseWidth) return;
    /* #299 kept: zoom is a real SIZE change, not a CSS transform — the drag maths and
       the handle percentages both read the canvas box, so the box must be the truth. */
    canvas.style.flex = '0 0 auto';
    canvas.style.width = Math.round(baseWidth * zoom) + 'px';
    canvas.style.maxWidth = 'none';
  }

  /** View zoom. Never stored: the scene is the same picture at 60% or 160%. */
  function applyZoom(next: number) {
    zoom = Math.max(0.5, Math.min(2, Math.round(next * 100) / 100));
    if (!baseWidth) measureBase();
    paintCanvasSize();
    const out = root.querySelector('[data-sd-zoom-value]') as HTMLElement | null;
    if (out) out.textContent = Math.round(zoom * 100) + '%';
  }

  /** The two preview grids are expensive (16 engine renders); paint on demand. */
  function paintPresets() {
    paintTemplates();
    paintPlaces();
  }

  /** Which icon the selected node draws. */
  function iconOf(key) {
    const list = value => (Array.isArray(value) ? value : []);
    if (key === 'subject') return blueprint.mainIcon;
    if (key === 'second') return blueprint.compareIcon || '';
    if (key === 'sign') return blueprint.compareSign || '';
    const sub = /^sub-(\d+)$/.exec(key);
    if (sub) {
      const entry = (Array.isArray(blueprint.subIcons) ? blueprint.subIcons : [])[Number(sub[1])];
      return entry && entry.icon ? entry.icon : '';
    }
    const prop = /^prop-(\d+)$/.exec(key);
    if (prop) return list(blueprint.props)[Number(prop[1])] || '';
    const step = /^step-(\d+)$/.exec(key);
    if (step) {
      const index = Number(step[1]);
      return index === 1 ? blueprint.mainIcon : list(blueprint.steps)[index - 2] || '';
    }
    const around = /^around-(\d+)$/.exec(key);
    if (around) return list(blueprint.around)[Number(around[1]) - 1] || '';
    if (isExtraKey(key)) {
      const entry = extrasOf()[extraIndex(key)];
      return entry ? entry.icon : '';
    }
    return '';
  }

  /** Write the icon into the node the picker belongs to. */
  function withIcon(key, id) {
    const copy = Object.assign({}, blueprint);
    const list = value => (Array.isArray(value) ? value.slice() : []);
    if (key === 'subject') copy.mainIcon = id;
    else if (key === 'second') copy.compareIcon = id;
    else if (key === 'sign') {
      if (id) copy.compareSign = id;
      else delete copy.compareSign;
    } else if (isExtraKey(key)) {
      const items = extrasOf().slice();
      const index = extraIndex(key);
      if (!items[index]) return copy;
      items[index] = Object.assign({}, items[index], { icon: id });
      copy.extras = items;
    } else {
      const sub = /^sub-(\d+)$/.exec(key);
      const prop = /^prop-(\d+)$/.exec(key);
      const step = /^step-(\d+)$/.exec(key);
      const around = /^around-(\d+)$/.exec(key);
      if (sub) {
        const items = list(blueprint.subIcons);
        const index = Number(sub[1]);
        if (!items[index]) return copy;
        items[index] = Object.assign({}, items[index], { icon: id });
        copy.subIcons = items;
      } else if (prop) {
        const items = list(blueprint.props);
        items[Number(prop[1])] = id;
        copy.props = items;
      } else if (step) {
        const index = Number(step[1]);
        if (index === 1) copy.mainIcon = id;
        else {
          const items = list(blueprint.steps);
          items[index - 2] = id;
          copy.steps = items;
        }
      } else if (around) {
        const items = list(blueprint.around);
        items[Number(around[1]) - 1] = id;
        copy.around = items;
      }
    }
    return copy;
  }

  /** Which selected nodes may be removed at all. `null` = can be deleted. */
  function canDelete(key: string): boolean {
    if (key === 'subject') return false;
    if (key === 'second') return true; // removing the second picture leaves a single
    return true;
  }

  /**
   * #299: delete the selected node. Every branch removes ONE thing and lets the
   * normaliser decide what is still drawable — a compare scene that lost its second
   * picture becomes a single scene, an empty sequence becomes a single scene. The
   * alternative (drawing a scene with a hole in it) is worse for a child.
   */
  function deleteSelected() {
    const key = selectedKey;
    if (!canDelete(key)) {
      statusOut.textContent = 'Hình chính không xoá được — cảnh phải có một hình chính.';
      return;
    }
    const copy: any = Object.assign({}, blueprint);
    const list = value => (Array.isArray(value) ? value.slice() : []);
    if (isExtraKey(key)) {
      const items = list(blueprint.extras);
      items.splice(extraIndex(key), 1);
      if (items.length) copy.extras = items;
      else delete copy.extras;
      delete copy.freePos;
      selectedKey = 'subject';
      commit(copy, 'Đã xoá vật thêm.');
      paintPresets();
      return;
    }
    if (key === 'second') {
      delete copy.compareIcon;
      delete copy.compareSign;
      const freePos = Object.assign({}, copy.freePos || {});
      delete freePos.second;
      delete freePos.sign;
      if (Object.keys(freePos).length) copy.freePos = freePos;
      else delete copy.freePos;
      selectedKey = 'subject';
      commit(copy, 'Đã bỏ hình thứ hai — cảnh trở về một hình.');
      paintPresets();
      return;
    }
    if (key === 'sign') {
      delete copy.compareSign;
      commit(copy, 'Đã bỏ dấu so sánh.');
      return;
    }
    const sub = /^sub-(\d+)$/.exec(key);
    if (sub) {
      const items = list(blueprint.subIcons);
      items.splice(Number(sub[1]), 1);
      if (items.length) copy.subIcons = items;
      else delete copy.subIcons;
      delete copy.freePos;
      selectedKey = 'subject';
      commit(copy, 'Đã xoá một vật ở góc.');
      paintPresets();
      return;
    }
    const prop = /^prop-(\d+)$/.exec(key);
    if (prop) {
      const items = list(blueprint.props);
      items.splice(Number(prop[1]), 1);
      if (items.length) copy.props = items;
      else delete copy.props;
      delete copy.freePos;
      selectedKey = 'subject';
      commit(copy, 'Đã xoá một vật dưới đất.');
      paintPresets();
      return;
    }
    const around = /^around-(\d+)$/.exec(key);
    if (around) {
      const items = list(blueprint.around);
      items.splice(Number(around[1]) - 1, 1);
      if (items.length) copy.around = items;
      else delete copy.around;
      delete copy.freePos;
      selectedKey = 'subject';
      commit(copy, 'Đã xoá một vật trong vòng.');
      paintPresets();
      return;
    }
    const step = /^step-(\d+)$/.exec(key);
    if (step) {
      const index = Number(step[1]);
      if (index === 1) {
        statusOut.textContent = 'Bậc 1 là hình chính — đổi hình chính thay vì xoá nó.';
        return;
      }
      const items = list(blueprint.steps);
      items.splice(index - 2, 1);
      if (items.length) copy.steps = items;
      else delete copy.steps;
      delete copy.freePos;
      selectedKey = 'step-1';
      commit(copy, 'Đã xoá một bậc.');
      paintPresets();
      return;
    }
    statusOut.textContent = 'Hình này thuộc bố cục, không xoá riêng được.';
  }

  function startDrag(event, handle) {
    if (event.button !== 0) return;
    event.preventDefault();
    const key = handle.getAttribute('data-sd-handle') || '';
    selectedKey = key;
    const box = canvas.getBoundingClientRect();
    const current = placementOf(key);
    if (!current || !box.width || !box.height) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const startCx = current.x;
    const startCy = current.y;
    let moved = false;
    let pending = null;
    let frame = 0;
    const onMove = moveEvent => {
      const dx = (moveEvent.clientX - startX) / box.width;
      const dy = (moveEvent.clientY - startY) / box.height;
      if (Math.abs(dx) > 0.004 || Math.abs(dy) > 0.004) moved = true;
      pending = withPlacement(key, { x: startCx + dx, y: startCy + dy, s: current.s, r: current.r });
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!pending) return;
        const clean = stageNormalizeBlueprint(pending);
        if (!clean) return;
        blueprint = clean;
        if (typeof opts.onChange === 'function') opts.onChange(JSON.stringify(blueprint));
        // Only the picture and this handle move: replacing the whole handle layer
        // mid-gesture would drop the pointer capture (#128).
        art.innerHTML = render(blueprint);
        const movedSlot = sceneNodeSlotsSafe().filter(item => item.key === key)[0];
        if (movedSlot) {
          handle.style.left = ((movedSlot.x / 320) * 100).toFixed(2) + '%';
          handle.style.top = ((movedSlot.y / 200) * 100).toFixed(2) + '%';
        }
        const percent = Math.round((movedSlot ? movedSlot.scale : current.s) * 100);
        scaleOut.textContent = percent + '%';
      });
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      // One gesture = ONE undo step: the live frames above are not recorded.
      if (moved && pending) commit(pending, 'Đã đặt lại chỗ cho hình.');
      else paint();
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  // ---- the panel's own controls ----
  iconSelect.addEventListener('change', () => {
    if (!iconSelect.value) return;
    commit(withIcon(selectedKey, iconSelect.value), 'Đã đổi hình.');
    // The place previews are pictures of THIS scene, so they follow the icon.
    paintPlaces();
  });
  signSelect.addEventListener('change', () => commit(withIcon('sign', signSelect.value), 'Đã đổi dấu.'));

  scaleInput.addEventListener('change', () => recordHistory(JSON.stringify(blueprint)));
  rotateInput.addEventListener('change', () => recordHistory(JSON.stringify(blueprint)));
  scaleInput.addEventListener('input', () => {
    const current = placementOf(selectedKey);
    scaleOut.textContent = scaleInput.value + '%';
    if (!current) return;
    // #299: a slider drag is ONE undo step, recorded when the thumb is released.
    commit(withPlacement(selectedKey, { x: current.x, y: current.y, s: Number(scaleInput.value) / 100, r: current.r }), '', { silent: true });
  });

  rotateInput.addEventListener('input', () => {
    const current = placementOf(selectedKey);
    rotateOut.textContent = rotateInput.value + '°';
    if (!current) return;
    commit(withPlacement(selectedKey, { x: current.x, y: current.y, s: current.s, r: Number(rotateInput.value) }), '', { silent: true });
  });

  root.querySelector('[data-sd-reset-one]').addEventListener('click', () => {
    const copy = Object.assign({}, blueprint);
    if (isExtraKey(selectedKey)) {
      // An added object has no "original place": resetting it means turning it
      // upright at its own size, not deleting it (delete is its own button).
      const items = extrasOf().slice();
      const index = extraIndex(selectedKey);
      if (items[index]) {
        items[index] = { icon: items[index].icon, x: items[index].x, y: items[index].y, s: 1 };
        commit(Object.assign(copy, { extras: items }), 'Đã trả vật thêm về cỡ và góc gốc.');
      }
      return;
    }
    if (!copy.freePos || !copy.freePos[selectedKey]) return;
    const freePos = Object.assign({}, copy.freePos);
    delete freePos[selectedKey];
    if (Object.keys(freePos).length) copy.freePos = freePos;
    else delete copy.freePos;
    commit(copy, 'Đã trả hình về chỗ bố cục đặt nó.');
  });

  root.querySelector('[data-sd-reset-all]').addEventListener('click', () => {
    const copy = Object.assign({}, blueprint);
    delete copy.freePos;
    commit(copy, 'Đã xoá mọi chỉnh tay; các vật thêm vẫn được giữ.');
  });

  removeNode.addEventListener('click', () => deleteSelected());

  // ---- undo / redo ----
  root.querySelector('[data-sd-undo]').addEventListener('click', () => stepHistory(-1));
  root.querySelector('[data-sd-redo]').addEventListener('click', () => stepHistory(1));

  // ---- view zoom ----
  root.querySelector('[data-sd-zoom-in]').addEventListener('click', () => applyZoom(zoom + 0.1));
  root.querySelector('[data-sd-zoom-out]').addEventListener('click', () => applyZoom(zoom - 0.1));
  root.querySelector('[data-sd-zoom-fit]').addEventListener('click', () => applyZoom(1));
  canvas.addEventListener('wheel', wheelEvent => {
    const event = wheelEvent as WheelEvent;
    if (!event.ctrlKey) return;
    event.preventDefault();
    applyZoom(zoom + (event.deltaY < 0 ? 0.1 : -0.1));
  }, { passive: false } as AddEventListenerOptions);

  /* #300: a row redrawn while the workshop was open would leave the captured field
     detached, so every keystroke after that wrote into nothing. The lock above makes
     that impossible for a stacked screen, but the guard is cheap and it is the exact
     failure the teacher saw as "Xong does not work". */
  // ---- drop an icon from the palette onto the canvas ----
  canvas.addEventListener('dragover', dragEvent => {
    dragEvent.preventDefault();
    const transfer = (dragEvent as DragEvent).dataTransfer;
    if (transfer) transfer.dropEffect = 'copy';
  });
  canvas.addEventListener('drop', dropEvent => {
    dropEvent.preventDefault();
    const event = dropEvent as DragEvent;
    const id = event.dataTransfer ? event.dataTransfer.getData('text/plain') : '';
    const box = canvas.getBoundingClientRect();
    if (!id || !box.width || !box.height) return;
    addExtra(id, {
      x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)),
      y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)),
    });
  });

  // ---- open / close ----
  const close = apply => {
    document.removeEventListener('keydown', onKey);
    root.dispatchEvent(new Event('sd-close'));
    root.remove();
    const saved = apply ? JSON.stringify(blueprint) : originalJson;
    if (!apply && typeof opts.onChange === 'function') opts.onChange(originalJson);
    else if (apply && typeof opts.onChange === 'function') opts.onChange(saved);
    // #300: the page stays locked while ANY workshop is open; unlocking it early is
    // what made the editor scroll behind a screen that was still there.
    if (!document.querySelector('.scene-designer')) {
      document.documentElement.classList.remove('is-scene-designer');
    }
    /* #300: a redraw that throws must not leave the app half-closed with no message.
       The screen is already gone, so the only honest report is a toast. */
    if (typeof opts.onClose === 'function') {
      try {
        opts.onClose(saved, apply);
      } catch (error) {
        if (typeof toast === 'function') {
          toast('Không vẽ lại được hàng minh hoạ: ' + (error && error.message ? error.message : error));
        }
      }
    }
  };
  const onKey = event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close(false);
      return;
    }
    const modifier = event.ctrlKey || event.metaKey;
    if (!modifier) return;
    const key = (event.key || '').toLowerCase();
    if (key === 'z') {
      event.preventDefault();
      stepHistory(event.shiftKey ? 1 : -1);
    } else if (key === 'y') {
      event.preventDefault();
      stepHistory(1);
    }
  };
  root.querySelector('[data-sd-done]').addEventListener('click', () => close(true));
  root.querySelector('[data-sd-cancel]').addEventListener('click', () => close(false));
  document.addEventListener('keydown', onKey);

  host.appendChild(root);
  document.documentElement.classList.add('is-scene-designer');
  paintIcons();
  paint();
  paintPresets();
  paintHistoryButtons();
  measureBase();
  applyZoom(1);
  // A window that changes size changes the biggest picture that fits.
  if (typeof ResizeObserver === 'function') {
    const wrap = root.querySelector('[data-sd-wrap]') as HTMLElement | null;
    if (wrap) {
      const observer = new ResizeObserver(() => measureBase());
      observer.observe(wrap);
      root.addEventListener('sd-close', () => observer.disconnect());
    }
  }
  statusOut.textContent = 'Chọn một hình để đổi cỡ và góc, hoặc kéo một hình mẫu vào khung.';
  return root;
}