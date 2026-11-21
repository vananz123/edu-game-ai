/**
 * #295 — the scene editor panel: one big canvas, drag the pieces, close.
 *
 * The inline handles on the 132px thumbnail (#294) work but are too small to aim
 * at, so the teacher asked for a Canva-like surface behind a button. This panel
 * is deliberately small in scope: it moves and resizes the nodes the current
 * layout already draws. It never adds an element, never changes the layout and
 * never touches the icon or the palette — that is what the row's own controls are
 * for — and it writes nothing but `freePos` into the blueprint.
 *
 * Layout note: the handles are DOM siblings of the picture, not children of it,
 * so the picture can be re-rendered on every pointer move without losing the node
 * being dragged (#128: a re-render that replaces the dragged element kills the
 * gesture).
 */
function openSceneEditor(options) {
  const opts = options || {};
  const host = opts.host || document.body;
  if (typeof stageNormalizeBlueprint !== 'function') return;
  const initial = stageNormalizeBlueprint(opts.blueprint);
  if (!initial) return;

  let blueprint = initial;
  let selectedKey = 'subject';

  const overlay = document.createElement('div');
  overlay.className = 'scene-editor';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Chỉnh cảnh minh hoạ');
  overlay.innerHTML =
    '<div class="scene-editor-panel">' +
      '<div class="scene-editor-head">' +
        '<div><strong>Chỉnh cảnh</strong>' +
        '<span class="scene-editor-hint">Kéo từng hình đến chỗ bạn muốn. Đổi cỡ bằng thanh trượt bên phải.</span></div>' +
        '<button type="button" class="btn btn-secondary btn-small" data-se-close>Xong</button>' +
      '</div>' +
      '<div class="scene-editor-body">' +
        '<div class="scene-editor-stage" data-se-stage>' +
          '<div class="scene-editor-art" data-se-art></div>' +
          '<div class="scene-editor-handles" data-se-handles></div>' +
        '</div>' +
        '<div class="scene-editor-side">' +
          '<div class="scene-editor-field"><span>Đang chọn</span><strong data-se-name>Hình chính</strong></div>' +
          '<label class="scene-editor-field"><span>Hình</span><select data-se-icon></select></label>' +
          '<label class="scene-editor-field is-hidden" data-se-sign-row><span>Dấu</span><select data-se-sign></select></label>' +
          '<label class="scene-editor-field"><span>Cỡ</span>' +
            '<input type="range" min="50" max="160" step="5" value="100" data-se-scale>' +
            '<em data-se-scale-value>100%</em></label>' +
          '<button type="button" class="btn btn-secondary btn-small" data-se-reset-one>Đặt lại hình này</button>' +
          '<button type="button" class="btn btn-secondary btn-small" data-se-reset-all>Đặt lại tất cả</button>' +
          '<div class="scene-editor-note">Cảnh vẫn được lưu theo bố cục, nên đổi bố cục sau đó sẽ xếp lại các hình.</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  const art = overlay.querySelector('[data-se-art]');
  const layer = overlay.querySelector('[data-se-handles]');
  const stage = overlay.querySelector('[data-se-stage]');
  const nameOut = overlay.querySelector('[data-se-name]');
  const scaleInput = overlay.querySelector('[data-se-scale]') as HTMLInputElement;
  const iconSelect = overlay.querySelector('[data-se-icon]') as HTMLSelectElement;
  const signSelect = overlay.querySelector('[data-se-sign]') as HTMLSelectElement;
  const signRow = overlay.querySelector('[data-se-sign-row]') as HTMLElement;
  const icons: Array<{ id: string; label: string }> = Array.isArray(opts.icons) ? opts.icons : [];
  const signs: Array<{ id: string; label: string }> = Array.isArray(opts.signs) ? opts.signs : [];
  iconSelect.innerHTML = icons
    .map(entry => `<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.label)}</option>`)
    .join('');
  signSelect.innerHTML = signs
    .map(entry => `<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.label)}</option>`)
    .join('');
  const scaleOut = overlay.querySelector('[data-se-scale-value]');

  const paint = () => {
    const slots = typeof stageSceneNodeSlots === 'function' ? stageSceneNodeSlots(blueprint) : [];
    if (!slots.some(slot => slot.key === selectedKey)) selectedKey = slots.length ? slots[0].key : 'subject';
    if (typeof opts.render === 'function') art.innerHTML = opts.render(blueprint) || '';
    // Paint the big boxes first and the small ones last: a corner icon that sits
    // inside the subject's box must still be the thing the pointer hits.
    layer.innerHTML = slots.slice().sort((a, b) => b.size - a.size).map(slot => {
      const left = (slot.x / 320) * 100;
      const top = (slot.y / 200) * 100;
      const width = Math.max(6, (slot.size / 320) * 100);
      const height = (slot.size / 200) * 100;
      const active = slot.key === selectedKey ? ' is-active' : '';
      return `<button type="button" class="scene-editor-handle${active}" data-se-handle="${escapeHtml(slot.key)}" ` +
        `style="left:${left.toFixed(2)}%;top:${top.toFixed(2)}%;width:${width.toFixed(2)}%;height:${height.toFixed(2)}%" ` +
        `title="${escapeHtml(slot.label)}"><i>${escapeHtml(slot.label)}</i></button>`;
    }).join('');
    const chosen = slots.filter(slot => slot.key === selectedKey)[0];
    const isSign = selectedKey === 'sign';
    iconSelect.disabled = isSign;
    signRow.classList.toggle('is-hidden', !isSign);
    if (!isSign && icons.some(entry => entry.id === iconOf(selectedKey))) {
      iconSelect.value = iconOf(selectedKey);
    }
    if (isSign && signs.some(entry => entry.id === iconOf(selectedKey))) {
      signSelect.value = iconOf(selectedKey);
    }
    if (chosen) {
      nameOut.textContent = chosen.label;
      const percent = Math.round(chosen.scale * 100);
      scaleInput.value = String(percent);
      scaleOut.textContent = percent + '%';
    }
    layer.querySelectorAll('[data-se-handle]').forEach(handle => {
      handle.addEventListener('pointerdown', event => startDrag(event, handle));
      handle.addEventListener('focus', () => {
        selectedKey = handle.getAttribute('data-se-handle') || selectedKey;
        paint();
      });
    });
  };

  const commit = next => {
    const clean = stageNormalizeBlueprint(next);
    if (!clean) return;
    blueprint = clean;
    if (typeof opts.onChange === 'function') opts.onChange(JSON.stringify(clean));
    paint();
  };

  const setPosition = (key, x, y, s) => {
    const freePos = Object.assign({}, blueprint.freePos || {});
    freePos[key] = {
      x: Math.round(Math.min(1, Math.max(0, x)) * 1000) / 1000,
      y: Math.round(Math.min(1, Math.max(0, y)) * 1000) / 1000,
      s: Math.round(Math.min(1.6, Math.max(0.5, s)) * 100) / 100,
    };
    const next = Object.assign({}, blueprint, { freePos });
    return next;
  };

  /** Which icon the selected node currently draws. One key, one answer. */
  function iconOf(key: string): string {
    const list = (value: unknown): string[] => (Array.isArray(value) ? (value as string[]) : []);
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
    return '';
  }

  /**
   * The same write, but into the node the picker belongs to. A key that the
   * normaliser refuses (a duplicate icon, a sign on a non-compare scene) simply
   * comes back unchanged — this never throws and never invents a node.
   */
  function withIcon(key: string, id: string) {
    const next: any = Object.assign({}, blueprint);
    const list = (value: unknown): string[] => (Array.isArray(value) ? (value as string[]).slice() : []);
    if (key === 'subject') next.mainIcon = id;
    else if (key === 'second') next.compareIcon = id;
    else if (key === 'sign') {
      if (id) next.compareSign = id;
      else delete next.compareSign;
    } else {
      const sub = /^sub-(\d+)$/.exec(key);
      const prop = /^prop-(\d+)$/.exec(key);
      const step = /^step-(\d+)$/.exec(key);
      const around = /^around-(\d+)$/.exec(key);
      if (sub) {
        const items = (Array.isArray(blueprint.subIcons) ? blueprint.subIcons : []).slice();
        const index = Number(sub[1]);
        if (!items[index]) return next;
        items[index] = Object.assign({}, items[index], { icon: id });
        next.subIcons = items;
      } else if (prop) {
        const items = list(blueprint.props);
        items[Number(prop[1])] = id;
        next.props = items;
      } else if (step) {
        const index = Number(step[1]);
        if (index === 1) next.mainIcon = id;
        else {
          const items = list(blueprint.steps);
          items[index - 2] = id;
          next.steps = items;
        }
      } else if (around) {
        const items = list(blueprint.around);
        items[Number(around[1]) - 1] = id;
        next.around = items;
      }
    }
    return next;
  }

  function startDrag(event, handle) {
    if (event.button !== 0) return;
    event.preventDefault();
    const key = handle.getAttribute('data-se-handle') || '';
    selectedKey = key;
    const box = stage.getBoundingClientRect();
    const slot = (stageSceneNodeSlots(blueprint) || []).filter(item => item.key === key)[0];
    if (!slot || !box.width || !box.height) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const startCx = slot.x / 320 + slot.size / 640;
    const startCy = slot.y / 200 + slot.size / 400;
    const scale = slot.scale;
    let nextBlueprint = null;
    let frame = 0;
    const onMove = moveEvent => {
      const dx = (moveEvent.clientX - startX) / box.width;
      const dy = (moveEvent.clientY - startY) / box.height;
      nextBlueprint = setPosition(key, startCx + dx, startCy + dy, scale);
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!nextBlueprint) return;
        const clean = stageNormalizeBlueprint(nextBlueprint);
        if (!clean) return;
        // Live feedback: only the picture is re-rendered. The handles keep their
        // nodes, so the pointer capture survives the whole gesture.
        blueprint = clean;
        if (typeof opts.render === 'function') art.innerHTML = opts.render(blueprint) || '';
        const moved = (stageSceneNodeSlots(blueprint) || []).filter(item => item.key === key)[0];
        if (moved) {
          handle.style.left = ((moved.x / 320) * 100).toFixed(2) + '%';
          handle.style.top = ((moved.y / 200) * 100).toFixed(2) + '%';
        }
        if (typeof opts.onChange === 'function') opts.onChange(JSON.stringify(blueprint));
      });
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      if (nextBlueprint) commit(nextBlueprint);
      else paint();
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  iconSelect.addEventListener('change', () => {
    const id = iconSelect.value;
    if (!id) return;
    commit(withIcon(selectedKey, id));
  });

  signSelect.addEventListener('change', () => {
    commit(withIcon('sign', signSelect.value));
  });

  scaleInput.addEventListener('input', () => {
    const percent = Number((scaleInput as HTMLInputElement).value);
    scaleOut.textContent = String(percent) + '%';
    const slot = (stageSceneNodeSlots(blueprint) || []).filter(item => item.key === selectedKey)[0];
    if (!slot) return;
    const cx = slot.x / 320 + slot.size / 640;
    const cy = slot.y / 200 + slot.size / 400;
    commit(setPosition(selectedKey, cx, cy, percent / 100));
  });

  overlay.querySelector('[data-se-reset-one]').addEventListener('click', () => {
    if (!blueprint.freePos || !blueprint.freePos[selectedKey]) return;
    const freePos = Object.assign({}, blueprint.freePos);
    delete freePos[selectedKey];
    const next = Object.assign({}, blueprint);
    if (Object.keys(freePos).length) next.freePos = freePos;
    else delete next.freePos;
    commit(next);
  });

  overlay.querySelector('[data-se-reset-all]').addEventListener('click', () => {
    const next = Object.assign({}, blueprint);
    delete next.freePos;
    commit(next);
  });

  const close = () => {
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    if (typeof opts.onClose === 'function') opts.onClose(JSON.stringify(blueprint));
  };
  const onKey = event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };
  overlay.querySelector('[data-se-close]').addEventListener('click', close);
  overlay.addEventListener('pointerdown', event => {
    if (event.target === overlay) close();
  });
  document.addEventListener('keydown', onKey);

  host.appendChild(overlay);
  paint();
  const first = layer.querySelector('[data-se-handle]') as HTMLElement | null;
  if (first) first.focus();
  return overlay;
}
