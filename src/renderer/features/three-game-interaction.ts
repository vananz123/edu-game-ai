// @ts-nocheck -- plain global renderer script; THREE is provided by three.global.js.

/**
 * window.threeGame — a minimal, reusable Three.js presentation layer for the five
 * games. Deliberately ignorant of scoring: gameplay.ts owns correctness and passes
 * callback / trigger moments in here. When WebGL is unavailable the existing DOM
 * 2D surface is the fallback — nothing in this file is required for a game to run.
 *
 * Lifecycle: `mount(container, opts)` appends a full-bleed, pointer-transparent
 * canvas behind the stage content (the stage's `.game-stage[data-game-world] > * {
 * z-index: 1 }` rule keeps the DOM on top) and starts one render loop per handle.
 * `unmount(handle)` disposes everything and stops the loop. `burst(handle, …)`
 * spawns a short-lived particle celebration; `setPaused(handle, true)` freezes the
 * loop (the canvas stays put).
 */
(function () {
  'use strict';

  const handles = new Map();
  let nextId = 1;
  // Camera rest distance: the one place the projection's perspective factor is
  // defined. A node graph uses it to keep a far star and a near star the same
  // SIZE on screen — depth that reads as parallax, not as unequal targets.
  const CAMERA_REST_Z = 13;

  function isAvailable() {
    if (typeof THREE === 'undefined') return false;
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      return Boolean(gl);
    } catch (err) {
      return false;
    }
  }

  function color(value, fallbackHex) {
    try {
      if (value === undefined || value === null) return new THREE.Color(fallbackHex);
      return new THREE.Color(value);
    } catch (err) {
      return new THREE.Color(fallbackHex);
    }
  }

  /**
   * The teacher's motion preference, read once per step. Available in this
   * sandbox too (unit tests run without a window), so this never throws.
   */
  function reducedMotion() {
    try {
      return Boolean(typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (err) {
      return false;
    }
  }

  function disposeObject(obj) {
    if (!obj) return;
    obj.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    });
  }

  // --- tween / effect animation manager ------------------------------------

  const EASE = {
    linear: (t) => t,
    easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
    easeOutBack: (t) => {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }
  };

  function ease(name, t) {
    const fn = EASE[name] || EASE.easeOutCubic;
    return fn(t);
  }

  function readPath(target, path) {
    let obj = target;
    for (const key of path) obj = obj[key];
    return obj;
  }

  function writePath(target, path, value) {
    let obj = target;
    for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]];
    obj[path[path.length - 1]] = value;
  }

  // Animate a value from → to over `duration` seconds. Either `path` (a dotted
  // string into `target`, e.g. 'rotation.x') or `apply(value, progress)` drives
  // the write; `apply` wins when both are given.
  function tween(handle, opts = {}) {
    if (!handle || !handles.has(handle.id)) return;
    const duration = opts.duration !== undefined ? opts.duration : 0.4;
    const path = typeof opts.path === 'string' ? opts.path.split('.') : null;
    const easeName = opts.ease || 'easeOutCubic';
    let from = opts.from;
    let to = opts.to;
    if (path) {
      if (from === undefined) from = readPath(opts.target, path);
      if (to === undefined) to = readPath(opts.target, path);
    }
    handle.tweens.push({
      target: opts.target || null,
      path,
      apply: typeof opts.apply === 'function' ? opts.apply : null,
      from,
      to,
      easeName,
      t: 0,
      // `delay` lets a staggered effect (a wire drawn segment by segment) live in
      // one tween list instead of a chain of callbacks. Defaults to 0, so every
      // existing call behaves exactly as before.
      delay: Math.max(0, Number(opts.delay) || 0),
      duration,
      onComplete: typeof opts.onComplete === 'function' ? opts.onComplete : null
    });
  }

  // Run `update(dt, ratio)` every frame for `ttl` seconds; `onDone` fires once
  // at the end. The lightweight counterpart to tween for physics/decay.
  function effect(handle, update, ttl, onDone) {
    if (!handle || !handles.has(handle.id) || typeof update !== 'function') return;
    handle.effects.push({
      update,
      life: ttl,
      ttl,
      onDone: typeof onDone === 'function' ? onDone : null
    });
  }

  function enablePointer(handle) {
    if (handle.pointerOn) return;
    handle.pointerOn = true;
    handle.canvas.style.pointerEvents = 'auto';
    handle.pointer = new THREE.Vector2(-2, -2);
    handle.raycaster = new THREE.Raycaster();
    const onMove = (event) => {
      const rect = handle.canvas.getBoundingClientRect();
      handle.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      handle.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      // Hover easing converges over a few frames after the last move, so the
      // loop keeps drawing for a short tail instead of stopping mid-ease.
      handle.pointerActive = true;
      handle.hoverTail = 0.6;
    };
    const onClick = (event) => {
      handle.raycaster.setFromCamera(handle.pointer, handle.camera);
      const hits = handle.raycaster.intersectObjects(handle.clickables, false);
      if (hits.length && typeof hits[0].object.userData.onClick === 'function') {
        hits[0].object.userData.onClick(hits[0].object, event);
      }
    };
    handle.canvas.addEventListener('pointermove', onMove);
    handle.canvas.addEventListener('click', onClick);
    handle._pointerCleanup = () => {
      handle.canvas.removeEventListener('pointermove', onMove);
      handle.canvas.removeEventListener('click', onClick);
    };
  }

  /**
   * COORDINATES TO A STAR (DECISIONS #171).
   *
   * From `getBoundingClientRect()` in CSS pixels — NOT the backing store — so the
   * device pixel ratio cannot skew the result: the renderer caps DPR at 2 and the
   * rect is already the space of the pointer. The camera matrix is refreshed first
   * because it is not a child of the scene (see `dolly()`).
   */
  function pick(handle, clientX, clientY, opts = {}) {
    const empty = opts.empty || null;
    if (!handle || !handles.has(handle.id)) return empty;
    const targets = Array.isArray(opts.targets) ? opts.targets.filter(Boolean) : handle.clickables.concat(handle.hoverables || []);
    if (!targets.length) return empty;
    const rect = handle.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return empty;
    handle.camera.updateMatrixWorld(true);
    const raycaster = handle.raycaster || new THREE.Raycaster();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(ndc, handle.camera);
    const hits = raycaster.intersectObjects(targets, false);
    if (!hits.length) return empty;
    const object = hits[0].object;
    return { object, id: object.userData.starId || object.userData.nodeId || null, distance: hits[0].distance };
  }

  /**
   * Let a board own its camera aspect.
   *
   * The layer normally keeps `camera.aspect` equal to the canvas, because every
   * other game draws on the whole canvas. A board that fits its own picture inside
   * one frame of that canvas sets this instead, and the layer stops touching it
   * (measured: resetting it shrank the constellation ~30 % and moved every star
   * off its label).
   */
  function fixAspect(handle, aspect) {
    if (!handle || !handles.has(handle.id)) return;
    handle.fixedAspect = true;
    if (aspect > 0) {
      handle.camera.aspect = aspect;
      handle.camera.updateProjectionMatrix();
    }
  }

  /**
   * Re-project after anything that moves the camera.
   *
   * Anchors are applied inside `step()`, but a caller that measures immediately
   * after a resize (a mount, a fullscreen switch) would read the previous frame.
   * This runs ONE projection pass and one draw synchronously, never a loop.
   */
  /**
   * Match the drawing buffer to the container; true when the size changed.
   *
   * The buffer is a SIZE × pixelRatio product that Chromium rounds to whole
   * device pixels, so dividing it back yields 1244.67 for a 1245 px box. Compared
   * exactly, that mismatch repeats on EVERY frame and would mark the picture
   * dirty forever (measured: 60 draws/s on an idle board). A sub-pixel
   * difference is not a resize.
   */
  function matchSize(handle) {
    const w = handle.container.clientWidth || 1;
    const h = handle.container.clientHeight || 1;
    const pw = handle.renderer.domElement.width / handle.renderer.getPixelRatio();
    const ph = handle.renderer.domElement.height / handle.renderer.getPixelRatio();
    if (Math.abs(w - pw) < 1 && Math.abs(h - ph) < 1) return false;
    handle.renderer.setSize(w, h, false);
    if (!handle.fixedAspect) {
      handle.camera.aspect = w / h;
      handle.camera.updateProjectionMatrix();
    }
    return true;
  }

  function refreshAnchors(handle) {
    if (!handle || !handles.has(handle.id)) return;
    matchSize(handle);
    handle.camera.updateMatrixWorld(true);
    for (const a of handle.anchors) applyAnchor(handle, a);
    handle.renderer.render(handle.scene, handle.camera);
  }

  /**
   * Accept DROPS over the canvas (DECISIONS #171).
   *
   * The shared canvas stays pointer-transparent, because the DOM carries every
   * control, and it stays that way: the listeners live on `window` and only answer
   * while a drag is in flight (the caller marks the phase with dragStart/dragEnd).
   */
  function enableDrag(handle) {
    if (!handle || !handles.has(handle.id) || handle.dragOn) return;
    handle.dragActive = false;
    const inCanvas = (event) => {
      const rect = handle.canvas.getBoundingClientRect();
      return event.clientX >= rect.left && event.clientX <= rect.right
        && event.clientY >= rect.top && event.clientY <= rect.bottom;
    };
    const allow = (event) => {
      if (!handle.dragActive || !inCanvas(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    };
    const drop = (event) => {
      if (!handle.dragActive || !inCanvas(event)) return;
      event.preventDefault();
      const data = event.dataTransfer ? event.dataTransfer.getData('text/plain') : '';
      handle.dragActive = false;
      if (typeof handle.onDropStar === 'function') handle.onDropStar(data, event);
    };
    window.addEventListener('dragover', allow, true);
    window.addEventListener('drop', drop, true);
    handle.dragOn = true;
    const prevCleanup = handle._pointerCleanup;
    handle._pointerCleanup = () => {
      window.removeEventListener('dragover', allow, true);
      window.removeEventListener('drop', drop, true);
      handle.dragOn = false;
      handle.dragActive = false;
      if (typeof prevCleanup === 'function') prevCleanup();
    };
  }

  function dragStart(handle) {
    if (!handle || !handles.has(handle.id)) return;
    handle.dragActive = true;
  }

  function dragEnd(handle) {
    if (!handle || !handles.has(handle.id)) return;
    handle.dragActive = false;
  }

  /** The DOM hook the constellation board registers to receive drops. */
  function onDropStar(handle, handler) {
    if (!handle || !handles.has(handle.id)) return;
    handle.onDropStar = typeof handler === 'function' ? handler : null;
  }

  function mount(container, opts = {}) {
    if (!container || !isAvailable()) return null;
    try {
      const canvas = document.createElement('canvas');
      canvas.style.position = 'absolute';
      canvas.style.inset = '0';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.zIndex = '0';
      canvas.style.pointerEvents = 'none';
      container.appendChild(canvas);

      // DECISIONS #220: the loop now STOPS drawing when nothing moves, so the
      // drawing buffer has to survive between frames. Without this flag Chromium
      // clears it as soon as the compositor takes a frame, and an idle board —
      // the whole point of the idle gate — paints its stars for a second and then
      // goes blank (measured: 14 frames at mount, then 0% opaque pixels).
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
      camera.position.set(0, 0, 13);
      // Sized here rather than waiting for the first step(): callers place props
      // with stagePoint() synchronously after mount(), and stagePoint derives the
      // world extents from camera.aspect. Left at 1, every fraction would be
      // converted with the wrong horizontal scale.
      camera.aspect = (container.clientWidth || 1) / (container.clientHeight || 1);
      camera.updateProjectionMatrix();

      scene.add(new THREE.AmbientLight(0xffffff, 0.7));
      const key = new THREE.DirectionalLight(0xffffff, 0.9);
      key.position.set(5, 8, 6);
      scene.add(key);

      // The backdrop is CSS now (DECISIONS #220): the canvas only carries the
      // board's own objects — stars, cubes, chests, bursts. No dust, no emblem;
      // `opts.accent` is still accepted so callers need no change.

      const handle = {
        id: nextId++,
        canvas,
        container,
        renderer,
        scene,
        camera,
        bursts: [],
        tweens: [],
        effects: [],
        anchors: [],
        hoverables: [],
        clickables: [],
        paused: false,
        pointerOn: false,
        pointerActive: false,
        hoverTail: 0,
        raf: 0,
        dirty: true,
        idleAccum: 0,
        clock: new THREE.Clock()
      };
      handles.set(handle.id, handle);

      const tick = () => {
        if (!handles.has(handle.id)) return; // unmounted mid-flight
        step(handle);
        handle.raf = requestAnimationFrame(tick);
      };
      handle.raf = requestAnimationFrame(tick);
      return handle;
    } catch (err) {
      console.warn('threeGame.mount failed:', err && err.message ? err.message : err);
      return null;
    }
  }

  /**
   * Screen-space fraction (0..1, origin top-left) → world point on the plane
   * z = depth. The canvas covers the whole container, so projecting a DOM
   * element's own centre is the only reliable way to line 3D content up with
   * it. `pxPerUnit` lets callers size an object in pixels (fill a slot).
   * Pixels here are LAYOUT pixels (`container.clientHeight`): a DOM
   * `getBoundingClientRect()` of the same box is in *transformed* pixels and has
   * to be converted before the two are compared (#179).
   */
  function stagePoint(handle, fx, fy, z = 0) {
    if (!handle) return { x: 0, y: 0, z: 0, pxPerUnit: 0, halfWidth: 0, halfHeight: 0 };
    const depth = z !== undefined ? z : 0;
    const distance = Math.max(0.1, handle.camera.position.z - depth);
    const halfHeight = Math.tan((handle.camera.fov * Math.PI) / 360) * distance;
    const halfWidth = halfHeight * handle.camera.aspect;
    const nx = Math.min(1, Math.max(0, Number(fx) || 0));
    const ny = Math.min(1, Math.max(0, Number(fy) || 0));
    const height = handle.container.clientHeight || 1;
    return {
      x: (nx * 2 - 1) * halfWidth,
      y: (1 - ny * 2) * halfHeight,
      z: depth,
      pxPerUnit: height / (halfHeight * 2),
      halfWidth,
      halfHeight
    };
  }

  /**
   * The exact inverse of stagePoint(): world point → screen fraction, derived
   * from the camera parameters instead of `camera.matrixWorldInverse`. That
   * matrix is refreshed only by render(), so projecting through it before the
   * first frame of a stage reads an identity matrix — and a point on the z = 0
   * plane then divides by w ≈ 0, which turns a sane placement into 1e7-sized
   * nonsense (measured on a hidden test window, where rAF never fires:
   * houseTarget() returned scale 7e-10). The same assumption stagePoint already
   * makes: the shared camera sits on the z axis looking down -z, no yaw or roll.
   */
  function stageProject(handle, x, y, z = 0) {
    if (!handle) return { fx: 0.5, fy: 0.5 };
    const distance = Math.max(0.1, handle.camera.position.z - (Number(z) || 0));
    const halfHeight = Math.tan((handle.camera.fov * Math.PI) / 360) * distance;
    const halfWidth = halfHeight * handle.camera.aspect;
    return {
      fx: ((Number(x) || 0) / halfWidth + 1) / 2,
      fy: (1 - (Number(y) || 0) / halfHeight) / 2
    };
  }

  /**
   * Keep an object at a screen fraction of the stage. Unlike a one-off
   * stagePoint() conversion, the anchor is re-applied in every step(), so the
   * object stays in the same visual place when the stage is resized after mount
   * — the normal case for native fullscreen, which the main process applies
   * asynchronously.
   */
  function applyAnchor(handle, slot) {
    const p = stagePoint(handle, slot.fx, slot.fy, slot.z);
    slot.object.position.set(p.x, p.y, p.z);
  }

  function anchor(handle, object, fx, fy, z = 0) {
    if (!handle || !object) return null;
    const slot = { object, fx: Number(fx) || 0, fy: Number(fy) || 0, z: z === undefined ? 0 : z };
    const i = handle.anchors.findIndex((a) => a.object === object);
    if (i >= 0) handle.anchors[i] = slot;
    else handle.anchors.push(slot);
    applyAnchor(handle, slot);
    handle.dirty = true;
    return object;
  }

  function step(handle) {
    const dt = Math.min(handle.clock.getDelta(), 0.1);
    if (handle.paused) {
      if (handle.dirty) {
        handle.dirty = false;
        handle.renderer.render(handle.scene, handle.camera);
      }
      return;
    }
    // A board that frames its own picture inside the canvas keeps its aspect.
    if (matchSize(handle)) handle.dirty = true;
    // Screen-fraction anchors are re-projected every frame, so a prop keeps its
    // place on screen when the stage resizes (native fullscreen arrives after
    // the surface is rendered, and step() is where the new aspect is absorbed).
    for (const a of handle.anchors) applyAnchor(handle, a);
    // Worlds that animate themselves (the constellation's twinkle and float)
    // advance here, BEFORE the draw decision — a hook that runs after the gate
    // could never put a frame on screen on its own.
    let hookMoved = false;
    if (typeof handle.onStep === 'function') {
      try {
        hookMoved = handle.onStep(dt, reducedMotion()) === true;
      } catch (err) {
        console.warn('threeGame step hook failed:', err && err.message ? err.message : err);
      }
    }
    // DECISIONS #220: nothing in the scene moves on its own any more. The gate
    // below decides whether this frame is worth a draw at all — the backdrop is
    // CSS, so an idle board costs zero GPU work instead of 60 draws a second.
    // Anything that changes the picture (a burst, a tween, an effect, a hover,
    // a resize, a new object) calls invalidate(), and a world whose own step
    // animates says so through its onStep return value.
    const drawing = handle.dirty || handle.bursts.length > 0 || handle.tweens.length > 0
      || handle.effects.length > 0 || handle.pointerActive;
    if (!drawing) {
      // A self-animating world still gets its picture at a steady half rate; one
      // that reported no motion (reduced motion, a frozen scene) gets nothing.
      if (!hookMoved) {
        handle.idleAccum = 0;
        return;
      }
      handle.idleAccum += dt;
      if (handle.idleAccum < 1 / 30) return;
      handle.idleAccum = 0;
    }
    handle.dirty = false;
    // hover / click targets
    if (handle.pointerActive) {
      handle.hoverTail -= dt;
      if (handle.hoverTail <= 0) handle.pointerActive = false;
    }
    if (handle.pointerActive && (handle.hoverables.length || handle.clickables.length)) {
      handle.raycaster.setFromCamera(handle.pointer, handle.camera);
      const targets = handle.hoverables.concat(handle.clickables);
      const hitIds = new Set(handle.raycaster.intersectObjects(targets, false).map((hit) => hit.object.id));
      for (const obj of targets) {
        const target = obj.userData.hoverScale || 1.14;
        const goal = hitIds.has(obj.id) ? target : 1;
        const scale = obj.scale.x + (goal - obj.scale.x) * 0.2;
        obj.scale.setScalar(scale);
      }
    }
    // bursts
    for (let i = handle.bursts.length - 1; i >= 0; i--) {
      const b = handle.bursts[i];
      b.life -= dt;
      if (b.life <= 0) {
        disposeObject(b.points);
        handle.scene.remove(b.points);
        handle.bursts.splice(i, 1);
        continue;
      }
      const ratio = b.life / b.ttl;
      const attr = b.points.geometry.attributes.position;
      for (let j = 0; j < b.velocities.length; j += 3) {
        const k = j / 3;
        attr.setX(k, attr.getX(k) + b.velocities[j] * dt);
        attr.setY(k, attr.getY(k) + b.velocities[j + 1] * dt);
        attr.setZ(k, attr.getZ(k) + b.velocities[j + 2] * dt);
      }
      attr.needsUpdate = true;
      b.points.material.opacity = ratio * 0.9;
      b.points.scale.setScalar(1 + (1 - ratio) * 0.6);
    }
    // tweens
    for (let i = handle.tweens.length - 1; i >= 0; i--) {
      const tw = handle.tweens[i];
      // A delayed tween holds its starting value until the delay is spent; it is
      // not written at all before that, so nothing flickers to an intermediate
      // state (a wire segment stays collapsed instead of half-drawn).
      if (tw.delay > 0) {
        tw.delay -= dt;
        if (tw.delay > 0) continue;
      }
      tw.t += dt;
      const k = ease(tw.easeName, Math.min(tw.t / tw.duration, 1));
      let value;
      if (typeof tw.from === 'number' && typeof tw.to === 'number') {
        value = tw.from + (tw.to - tw.from) * k;
      } else if (tw.from && tw.to && typeof tw.from.lerp === 'function') {
        value = tw.from.clone().lerp(tw.to, k);
      } else {
        value = tw.to;
      }
      if (tw.apply) tw.apply(value, k);
      else if (tw.path) writePath(tw.target, tw.path, value);
      if (tw.t >= tw.duration) {
        handle.tweens.splice(i, 1);
        if (tw.onComplete) tw.onComplete();
      }
    }
    // effects
    for (let i = handle.effects.length - 1; i >= 0; i--) {
      const e = handle.effects[i];
      e.life -= dt;
      if (e.life <= 0) {
        handle.effects.splice(i, 1);
        if (e.onDone) e.onDone();
        continue;
      }
      e.update(dt, e.life / e.ttl);
    }
    handle.renderer.render(handle.scene, handle.camera);
  }

  /** Mark the picture as changed, so the next frame draws even if nothing animates. */
  function invalidate(handle) {
    if (!handle || !handles.has(handle.id)) return;
    handle.dirty = true;
  }

  function unmount(handle) {
    if (!handle || !handles.has(handle.id)) return;
    handles.delete(handle.id);
    cancelAnimationFrame(handle.raf);
    if (typeof handle._pointerCleanup === 'function') handle._pointerCleanup();
    disposeObject(handle.scene);
    handle.renderer.dispose();
    if (handle.canvas && handle.canvas.parentNode) handle.canvas.parentNode.removeChild(handle.canvas);
  }

  function setPaused(handle, paused) {
    if (!handle) return;
    handle.paused = Boolean(paused);
    handle.dirty = true;
  }

  function burst(handle, opts = {}) {
    if (!handle || !handles.has(handle.id)) return;
    const count = opts.count !== undefined ? opts.count : 26;
    const hue = color(opts.color, 0x34d399);
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 2.2 + Math.random() * 3.4;
      velocities[i * 3] = Math.sin(phi) * Math.cos(theta) * speed;
      velocities[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * speed;
      velocities[i * 3 + 2] = Math.cos(phi) * speed * 0.4;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: hue,
      size: 0.16,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const points = new THREE.Points(geometry, material);
    handle.scene.add(points);
    handle.bursts.push({ points, velocities, life: 0.85, ttl: 0.85 });
  }

  /** Register a hover-only 3D object: it scales up gently under the pointer. */
  function addHoverEffect(handle, object, opts = {}) {
    if (!handle || !object || !handles.has(handle.id)) return;
    object.userData.hoverScale = opts.scale !== undefined ? opts.scale : 1.14;
    handle.hoverables.push(object);
    enablePointer(handle);
  }

  /** Register a clickable 3D object; onClick(object, event) fires on click. */
  function addClickableObject(handle, object, onClick, opts = {}) {
    if (!handle || !object || !handles.has(handle.id)) return;
    object.userData.onClick = onClick;
    if (opts.scale !== undefined) object.userData.hoverScale = opts.scale;
    handle.clickables.push(object);
    enablePointer(handle);
  }

  /** Add a pattern group to a handle's scene at an optional world position. */
  function addObject(handle, object, x, y, z) {
    if (!handle || !object || !handles.has(handle.id)) return;
    if (x !== undefined) object.position.set(x, y, z);
    handle.scene.add(object);
    handle.dirty = true;
  }

  // --- gameplay-driven pattern factories ------------------------------------
  // Each factory returns a disposable `{ group, ... }` the caller adds to a
  // handle's scene; its action methods take `handle` first and no-op without it.

  // (A) Destruction — a cluster of blocks that shatters on a wrong answer.
  function makeDestructible(opts = {}) {
    const size = opts.size !== undefined ? opts.size : 1.1;
    const fragments = opts.fragments !== undefined ? opts.fragments : 8;
    const geometry = new THREE.BoxGeometry(size * 0.3, size * 0.3, size * 0.3);
    const material = new THREE.MeshStandardMaterial({
      color: color(opts.color, 0xf87171),
      roughness: 0.5,
      metalness: 0.1,
      transparent: true
    });
    const group = new THREE.Group();
    const pieces = [];
    for (let i = 0; i < fragments; i++) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.home = new THREE.Vector3(
        (Math.random() - 0.5) * size * 0.6,
        (Math.random() - 0.5) * size * 0.6,
        (Math.random() - 0.5) * size * 0.6
      );
      mesh.position.copy(mesh.userData.home);
      group.add(mesh);
      pieces.push(mesh);
    }
    let broken = false;
    function reset() {
      broken = false;
      material.opacity = 1;
      for (const p of pieces) {
        p.position.copy(p.userData.home);
        p.rotation.set(0, 0, 0);
        p.visible = true;
      }
    }
    function isBroken() { return broken; }
    function shatter(handle, onDone) {
      if (!handle || !handles.has(handle.id) || broken) return;
      broken = true;
      const velocities = pieces.map(() => new THREE.Vector3(
        (Math.random() - 0.5) * 3,
        Math.random() * 2.5 + 0.5,
        (Math.random() - 0.5) * 1.5
      ));
      effect(handle, (dt, ratio) => {
        for (let i = 0; i < pieces.length; i++) {
          const p = pieces[i];
          velocities[i].y -= 4.5 * dt;
          p.position.addScaledVector(velocities[i], dt);
          p.rotation.x += dt * 4;
          p.rotation.y += dt * 3;
        }
        material.opacity = ratio;
      }, 0.7, () => {
        for (const p of pieces) p.visible = false;
        if (typeof onDone === 'function') onDone();
      });
    }
    return { group, pieces, shatter, reset, isBroken, dispose: () => disposeObject(group) };
  }

  // (B) Unlock — a chest whose lid swings open when a challenge completes.
  function makeUnlockable(opts = {}) {
    const mat = new THREE.MeshStandardMaterial({
      color: color(opts.color, 0xe9b95b),
      roughness: 0.6,
      metalness: 0.15
    });
    const group = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 1.0), mat);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 0.9), mat);
    lid.position.y = 0.75;
    group.add(base);
    group.add(lid);
    let opened = false;
    function reset() {
      opened = false;
      lid.rotation.x = 0;
    }
    function isOpen() { return opened; }
    function open(handle, onDone) {
      if (!handle || !handles.has(handle.id) || opened) return;
      opened = true;
      tween(handle, {
        target: lid.rotation,
        path: 'x',
        to: -1.25,
        duration: 0.6,
        ease: 'easeOutBack',
        onComplete: onDone
      });
    }
    return { group, base, lid, open, reset, isOpen, dispose: () => disposeObject(group) };
  }

  // (C) Construction — a structure that grows stage-by-stage (0..steps).
  // Two forms: pass `parts` (an array of stages, each a list of primitive specs —
  // kind 'box' | 'roof' | 'cylinder' + w/h/d/r/color/x/y/z) for a heterogeneous
  // build like a house, or omit it for the legacy uniform stack of `steps` blocks
  // (one per correct answer).
  function makeConstruction(opts = {}) {
    const steps = opts.steps !== undefined ? opts.steps : 5;
    const blockSize = opts.blockSize !== undefined ? opts.blockSize : 0.7;
    const blockHeight = blockSize * 0.6;
    const defaultColor = color(opts.color, 0x34d399);

    const spec = (s) => ({
      kind: s.kind || 'box',
      w: s.w !== undefined ? s.w : blockSize,
      h: s.h !== undefined ? s.h : blockHeight,
      d: s.d !== undefined ? s.d : blockSize,
      r: s.r !== undefined ? s.r : blockSize / 2,
      color: s.color !== undefined ? s.color : defaultColor,
      x: s.x !== undefined ? s.x : 0,
      y: s.y !== undefined ? s.y : 0,
      z: s.z !== undefined ? s.z : 0
    });

    const stages = opts.parts
      ? opts.parts.map((stageSpecs) => (Array.isArray(stageSpecs) ? stageSpecs : [stageSpecs]).map(spec))
      : Array.from({ length: steps }, (_, i) => [spec({ x: 0, y: i * blockHeight + blockHeight / 2, z: 0, color: defaultColor })]);

    const group = new THREE.Group();
    const blocks = [];
    const stageRoots = [];

    for (const stageSpecs of stages) {
      const stageGroup = new THREE.Group();
      stageGroup.scale.setScalar(0.001);
      for (const s of stageSpecs) {
        const mesh = buildPartMesh(s);
        stageGroup.add(mesh);
        blocks.push(mesh);
      }
      group.add(stageGroup);
      stageRoots.push(stageGroup);
    }

    let stage = 0;
    function currentStage() { return stage; }
    function setStage(handle, n, o = {}) {
      if (!handle || !handles.has(handle.id)) return;
      n = Math.max(0, Math.min(Math.round(n), stageRoots.length));
      const animate = o.animate !== false;
      const prev = stage;
      stage = n;
      for (let i = 0; i < stageRoots.length; i++) {
        const show = i < n;
        const root = stageRoots[i];
        if (!animate) {
          root.scale.setScalar(show ? 1 : 0.001);
        } else if (show && i >= prev) {
          root.scale.setScalar(0.001);
          tween(handle, {
            target: root,
            from: 0.001,
            to: 1,
            duration: 0.3,
            ease: 'easeOutBack',
            apply: (v) => root.scale.setScalar(v)
          });
        } else if (!show) {
          tween(handle, {
            target: root,
            from: root.scale.x,
            to: 0.001,
            duration: 0.2,
            ease: 'easeInOut',
            apply: (v) => root.scale.setScalar(v)
          });
        }
      }
    }
    return { group, blocks, steps: stages.length, currentStage, setStage, dispose: () => disposeObject(group) };
  }

  function buildPartMesh(s) {
    const material = new THREE.MeshStandardMaterial({
      color: s.color,
      roughness: 0.55,
      metalness: 0.1
    });
    let geometry;
    if (s.kind === 'roof') {
      geometry = new THREE.BoxGeometry(s.w, s.h, s.d);
    } else if (s.kind === 'cylinder') {
      geometry = new THREE.CylinderGeometry(s.r, s.r, s.h, 12);
    } else {
      geometry = new THREE.BoxGeometry(s.w, s.h, s.d);
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(s.x, s.y, s.z);
    if (s.kind === 'roof') mesh.rotation.z = Math.PI / 4;
    return mesh;
  }

  // (D) Reactive — an object that flashes green/red and pops on feedback.
  function makeReactive(opts = {}) {
    const size = opts.size !== undefined ? opts.size : 1.0;
    const base = color(opts.color, 0x6d7cf0);
    const material = new THREE.MeshStandardMaterial({
      color: base,
      roughness: 0.4,
      metalness: 0.2
    });
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 1), material);
    const group = new THREE.Group();
    group.add(mesh);
    const correct = new THREE.Color(0x34d399);
    const wrong = new THREE.Color(0xf87171);
    function flash(handle, kind) {
      if (!handle || !handles.has(handle.id)) return;
      const target = kind === 'correct' ? correct : wrong;
      tween(handle, {
        target: mesh,
        from: base.clone(),
        to: target,
        duration: 0.16,
        ease: 'easeOutCubic',
        apply: (c) => material.color.copy(c),
        onComplete: () => {
          tween(handle, {
            target: mesh,
            from: target.clone(),
            to: base,
            duration: 0.35,
            ease: 'easeOutCubic',
            apply: (c) => material.color.copy(c)
          });
        }
      });
      tween(handle, {
        target: mesh,
        from: 1,
        to: 1.25,
        duration: 0.16,
        ease: 'easeOutBack',
        apply: (v) => mesh.scale.setScalar(v),
        onComplete: () => {
          tween(handle, {
            target: mesh,
            from: 1.25,
            to: 1,
            duration: 0.3,
            ease: 'easeOutBack',
            apply: (v) => mesh.scale.setScalar(v)
          });
        }
      });
    }
    return { group, mesh, flash, dispose: () => disposeObject(group) };
  }

  // (F) Node graph — the Object Connection picture as real 3D (DECISIONS #169).
  //
  // A template is a list of nodes on a 2D grid plus links between them. This
  // factory turns that into a shallow 3D board: every node gets a shape (a plate
  // for a named idea, a ring for a milestone, a small sphere for a leaf), every
  // link gets a beam that is drawn from A to B when its stage is earned. The
  // whole thing is ONE object, so the caller places it with `anchor()` exactly
  // like the other props and a resize cannot drift it.
  //
  // Unearned parts are not invisible: they are faint "ghosts", so a class can
  // see how much picture is left without being told (update_game.txt §4).
  function makeNodeGraph(opts = {}) {
    const nodes = Array.isArray(opts.nodes) ? opts.nodes : [];
    const links = Array.isArray(opts.links) ? opts.links : [];
    const accent = color(opts.accent, 0x6d7cf0);
    const width = opts.width !== undefined ? opts.width : 8;
    // Depth compression: a real perspective camera would tilt far nodes away and
    // make the far half of the picture bleed into the near half at 16:9. 0.16
    // gives just enough parallax to read as 3D without breaking the layout.
    const depth = opts.depth !== undefined ? opts.depth : 0.16;
    // A star behind the board must LOOK the same size as one in front of it, or a
    // perspective camera turns the figure into a puzzle of unequal targets. With
    // this on, `z` is already in world units and the radius is scaled by the
    // perspective factor.
    const depthCompensated = opts.depthCompensated === true;
    // A board standing on a BRIGHT surface (DECISIONS #220) cannot use additive
    // light: adding to white is white, so the halo and bloom vanish and each star
    // turns into a flat coin. `light` swaps the glows for a solid gold body with
    // a pale rim, and draws the edges in the same solid gold.
    const light = opts.light === true;

    const group = new THREE.Group();
    let fitScale = 1;
    const byId = Object.create(null);
    const nodeSprites = [];
    const linkObjects = [];

    const plateMaterial = new THREE.MeshStandardMaterial({ color: 0xf6f7ff, roughness: 0.55, metalness: 0.05, transparent: true, opacity: 1 });
    const ringMaterial = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.35, metalness: 0.25, transparent: true, opacity: 1, emissive: accent, emissiveIntensity: 0.18 });
    const dotMaterial = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.4, metalness: 0.2, transparent: true, opacity: 1 });
    const slotMaterial = new THREE.MeshBasicMaterial({ color: 0x9aa4c2, transparent: true, opacity: 0.22, depthWrite: false });
    const beamMaterial = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.95 });
    const ghostMaterial = new THREE.MeshBasicMaterial({ color: 0x9aa4c2, transparent: true, opacity: 0.16, depthWrite: false });
    // A star: a warm emissive core that reads against the dark frame.
    const starMaterial = light
      ? new THREE.MeshStandardMaterial({ color: 0xffefb8, roughness: 0.45, metalness: 0.05, transparent: true, opacity: 1, emissive: 0xf2b24a, emissiveIntensity: 0.25 })
      : new THREE.MeshStandardMaterial({ color: 0xfff3c4, roughness: 0.3, metalness: 0, transparent: true, opacity: 1, emissive: 0xffd977, emissiveIntensity: 0.9 });
    // Dark boards get an additive halo; a bright one needs normal blending with a
    // solid gold, because adding light to white paints nothing at all.
    const haloMaterial = light
      ? new THREE.MeshBasicMaterial({ color: 0xfbe3a6, transparent: true, opacity: 0.55, depthWrite: false })
      : new THREE.MeshBasicMaterial({ color: 0xffd977, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending });
    // The outer bloom: a bigger additive shell with no depth write, so it glows
    // through the board without hiding the star behind it.
    const bloomMaterial = light
      ? new THREE.MeshBasicMaterial({ color: 0xffd06a, transparent: true, opacity: 0.3, depthWrite: false })
      : new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending });

    for (const node of nodes) {
      const root = new THREE.Group();
      const z = (Number(node.z) || 0) * depth;
      root.position.set(Number(node.x) || 0, Number(node.y) || 0, z);
      let material;
      let geometry;
      let radius = 0.17;
      if (node.kind === 'plate') {
        material = plateMaterial;
        geometry = new THREE.BoxGeometry(1.7, 0.62, 0.16);
      } else if (node.kind === 'ring') {
        material = ringMaterial;
        geometry = new THREE.TorusGeometry(0.24, 0.075, 8, 20);
      } else if (node.kind === 'star') {
        material = starMaterial;
        // A star is a DROP TARGET a hand can aim at: generous on screen while the
        // halo and the bloom do the "look, a star" work.
        radius = 0.26 * (0.75 + 0.5 * (node.brightness === undefined ? 0.7 : Number(node.brightness)));
        if (depthCompensated) radius *= (CAMERA_REST_Z - z) / CAMERA_REST_Z;
        geometry = new THREE.SphereGeometry(radius, 16, 12);
      } else {
        material = dotMaterial;
        geometry = new THREE.SphereGeometry(0.17, 14, 10);
      }
      const mesh = new THREE.Mesh(geometry, material);
      const ghost = new THREE.Mesh(
        node.kind === 'plate' ? new THREE.BoxGeometry(1.9, 0.82, 0.06) : new THREE.SphereGeometry(node.kind === 'ring' ? 0.3 : radius * 1.3, 10, 8),
        ghostMaterial
      );
      ghost.position.z = -0.05 - z * 0.5;
      root.add(mesh);
      root.add(ghost);
      const halo = node.kind === 'star'
        ? new THREE.Mesh(new THREE.SphereGeometry(radius * 2.1, 14, 10), haloMaterial.clone())
        : null;
      if (halo) {
        halo.position.z = -0.02;
        root.add(halo);
      }
      const bloom = node.kind === 'star'
        ? new THREE.Mesh(new THREE.SphereGeometry(radius * 3.4, 14, 10), bloomMaterial.clone())
        : null;
      if (bloom) {
        bloom.position.z = -0.04;
        root.add(bloom);
      }
      group.add(root);
      // `homeY`/`phase` drive the idle float; they are per node so the board
      // never pulses in lockstep, which reads as one rigid object.
      byId[node.id] = {
        // Its OWN id: the link loop reads `entry.id`, and a graph without it drew
        // no edge at all (measured: `nodeEarned(undefined)` was false for every
        // link, so a match lit its star and no line).
        id: node.id,
        root, mesh, ghost, halo, bloom, kind: node.kind || 'dot', earned: false, base: root.scale.x,
        depth: z,
        homeY: root.position.y,
        phase: (Object.keys(byId).length * 1.7) % (Math.PI * 2)
      };
      // The hit-test (`pick`) answers with `userData.starId`, so the star's body
      // (and its halo, which is part of the target) carries its own id.
      mesh.userData.starId = node.kind === 'star' ? node.id : null;
      if (halo) halo.userData.starId = node.id;
      nodeSprites.push(mesh);
    }

    for (const link of links) {
      const a = byId[link.from];
      const b = byId[link.to];
      if (!a || !b) continue;
      const beam = new THREE.Group();
      // Same bowed shape the SVG uses, so the 2D fallback and the 3D board are
      // the same picture: the midpoint is pushed along the perpendicular.
      const ax = a.root.position.x;
      const ay = a.root.position.y;
      const bx = b.root.position.x;
      const by = b.root.position.y;
      const bend = Number(link.bend) || 0;
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const segments = bend ? 12 : 1;
      const points = [];
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        // Quadratic Bezier through the bowed midpoint.
        const mx = (ax + bx) / 2 + (-dy / len) * bend;
        const my = (ay + by) / 2 + (dx / len) * bend;
        const x = (1 - t) * (1 - t) * ax + 2 * (1 - t) * t * mx + t * t * bx;
        const y = (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * my + t * t * by;
        const z = a.root.position.z + (b.root.position.z - a.root.position.z) * t + 0.02;
        points.push(new THREE.Vector3(x, y, z));
      }
      // A constellation edge is ONE mesh whose shader clips along its length, so
      // revealing it is one uniform write per frame — cheap on a projector laptop,
      // and exact (a chain of boxes shows its joints while it draws).
      const revealMaterial = light
        ? new THREE.MeshBasicMaterial({ color: 0xd99422, transparent: true, opacity: 0.95 })
        : new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          uniforms: { uColor: { value: new THREE.Color(0xf2c46b) }, uReveal: { value: 0 }, uProgress: { value: 0 } },
          vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
          fragmentShader: 'uniform vec3 uColor; uniform float uReveal; uniform float uProgress; varying vec2 vUv; void main() { if (vUv.x > uReveal) discard; float spark = smoothstep(0.8, 1.0, vUv.x) * (1.0 - smoothstep(uReveal - 0.08, uReveal, vUv.x)); gl_FragColor = vec4(uColor * (1.0 + spark * 2.0), 0.92); }'
        });
      const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.0);
      const line = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(24, points.length * 6), light ? 0.05 : 0.035, 4, false), revealMaterial);
      line.visible = false;
      beam.add(line);
      group.add(beam);
      linkObjects.push({ id: link.id, group: beam, segments: [], tube: line, reveal: 0, drawn: false });
    }

    let stageIds = [];
    /**
     * Show exactly the earned part of the picture.
     *
     * `nodeIds` and `linkIds` are the flattened stage lists the caller already
     * computed from `state.connectionProgress` — this factory deliberately takes
     * ids rather than stages so it can never disagree with the SVG renderer
     * about which node a stage opens.
     */
    function setEarned(handle, nodeIds, linkIds, o = {}) {
      stageIds = Array.isArray(linkIds) ? linkIds.slice() : [];
      const earned = new Set(stageIds);
      const animate = o.animate !== false;
      const nodesOn = new Set(Array.isArray(nodeIds) ? nodeIds : []);
      // A link is drawn when its owning stage is earned; a node is shown when its
      // own stage is earned. This mirrors `connectionSvg()`'s rule so both
      // surfaces describe the same picture.
      const nodeEarned = id => nodesOn.has(id);
      for (const node of nodes) {
        const entry = byId[node.id];
        if (!entry) continue;
        const isOn = nodeEarned(node.id);
        entry.earned = isOn;
        entry.mesh.visible = true;
        entry.ghost.visible = !isOn;
        // A star stays BRIGHT when it is lit and dims (never disappears) when it
        // is not: the figure reads as "these stars are still to come", not as
        // empty space. A dot keeps the old, dimmer rule. On a bright board the
        // unearned star needs more presence, or pale gold on white is invisible.
        const targetOpacity = isOn ? 1 : (entry.kind === 'star' ? (light ? 0.62 : 0.4) : 0.25);
        const targetScale = isOn ? 1 : (entry.kind === 'star' ? 0.86 : 0.7);
        if (entry.halo) entry.halo.material.opacity = isOn ? (light ? 0.55 : 0.3) : 0;
        if (entry.bloom) entry.bloom.material.opacity = isOn ? 0.2 : 0.1;
        if (!animate) {
          entry.root.scale.setScalar(targetScale);
          if (entry.mesh.material) entry.mesh.material.opacity = targetOpacity;
        } else if (isOn) {
          entry.root.scale.setScalar(0.7);
          if (entry.mesh.material) entry.mesh.material.opacity = 0.25;
          if (handle && handles.has(handle.id)) tween(handle, { target: entry.root, from: 0.7, to: 1, duration: 0.34, ease: 'easeOutBack', apply: v => entry.root.scale.setScalar(v) });
          if (handle && handles.has(handle.id) && entry.mesh.material) tween(handle, { target: entry.mesh.material, from: 0.25, to: 1, duration: 0.28, ease: 'easeOutCubic', apply: v => { entry.mesh.material.opacity = v; } });
        }
      }
      for (const link of links) {
        const entry = linkObjects.find(item => item.id === link.id);
        if (!entry) continue;
        const a = byId[link.from];
        const b = byId[link.to];
        const isOn = Boolean(a && b) && (nodeEarned(a.id) || nodeEarned(b.id));
        const wasDrawn = entry.drawn;
        entry.drawn = isOn;
        entry.group.visible = true;
        entry.tube.visible = isOn;
        // Draw-on (DECISIONS #172): the reveal runs 0 → 1 over ~0.55 s, advanced by
        // the shared loop (`tick`), so the line visibly takes shape from its first
        // star to its second. A redraw starts from zero; a reset hides it at once.
        if (!animate) entry.reveal = isOn ? 1 : 0;
        else if (isOn && !wasDrawn) entry.reveal = 0;
        else if (!isOn) entry.reveal = 0;
        if (entry.tube.material) {
          if (entry.tube.material.uniforms) entry.tube.material.uniforms.uReveal.value = entry.reveal >= 1 ? 1 : 0;
          else entry.tube.material.opacity = entry.reveal >= 1 ? 0.95 : 0;
        }
      }
    }

    function reset() {
      setEarned(null, [], [], { animate: false });
    }

    /**
     * A slow float + a gentle facing turn on earned nodes. This is what makes the
     * board read as a 3D world instead of a flat picture with depth: earned parts
     * breathe, ghosts stay still so the difference between "done" and "still to do"
     * is motion, not only colour. Runs from the shared render loop, not a timer.
     *
     * DECISIONS #220: the decorative breathing is on HOLD. It ran on every star for
     * the whole lesson (measured: 22–24 renders a second on an idle board, because
     * the caller reports motion and the loop keeps drawing), which is exactly the
     * cost this decision removes. Set BREATHE to true to bring it back; the float
     * and the twinkle are still wired, and the layer's idle gate is what keeps an
     * untouched board at zero frames.
     */
    const BREATHE = false;
    let elapsed = 0;
    function tick(dt, reduced) {
      if (reduced) return false;
      const revealing = linkObjects.some((link) => link.reveal < 1);
      // No reveal running and no breathing: report "nothing moved" so the shared
      // loop can skip the draw entirely instead of pacing frames for a still frame.
      // The caller must forward this value; returning `true` unconditionally is
      // what kept an untouched board drawing ~23 frames a second.
      if (!revealing && !BREATHE) return false;
      elapsed += dt;
      // The edge reveal is time-based, so a caught-up `dt` (a tab that came back)
      // finishes the line instead of leaving it half drawn.
      for (const link of linkObjects) {
        if (link.reveal >= 1) continue;
        link.reveal = Math.min(1, link.reveal + dt / 0.55);
        if (link.tube && link.tube.material) {
          if (link.tube.material.uniforms) {
            link.tube.material.uniforms.uReveal.value = 1 - Math.pow(1 - link.reveal, 3);
            link.tube.material.uniforms.uProgress.value = elapsed;
          } else {
            // A bright board's edge has no clipping shader: opacity carries the
            // draw-on, so the line still grows out of its first star.
            link.tube.material.opacity = 0.95 * (1 - Math.pow(1 - link.reveal, 3));
          }
        }
      }
      for (const node of nodes) {
        const entry = byId[node.id];
        if (!entry || !BREATHE) continue;
        const twinkle = 0.5 + 0.5 * Math.sin(elapsed * (entry.earned ? 1.6 : 0.9) + entry.phase);
        if (entry.bloom) entry.bloom.material.opacity = (entry.earned ? 0.2 : 0.1) + twinkle * (entry.earned ? 0.12 : 0.05);
        if (!entry.earned) continue;
        entry.root.position.y = entry.homeY + Math.sin(elapsed * 1.3 + entry.phase) * 0.045;
        entry.root.rotation.y = Math.sin(elapsed * 0.7 + entry.phase) * 0.12;
      }
      return true;
    }

    let hotId = null;
    /**
     * Mark the star a dragged card is over.
     *
     * The scene answers BEFORE the drop: the ring says "this one", and clearing it
     * is the same call with `''`. Only the graph's own materials are touched, so
     * nothing is created or disposed per pointer move.
     */
    function setHot(handle, starId) {
      hotId = starId || null;
      for (const node of nodes) {
        const entry = byId[node.id];
        if (!entry) continue;
        const hot = node.id === hotId;
        if (entry.halo) entry.halo.material.opacity = hot ? 0.55 : (entry.earned ? 0.3 : 0);
        if (entry.bloom) entry.bloom.material.opacity = hot ? 0.42 : (entry.earned ? 0.2 : 0.1);
        if (entry.earned) continue;
        entry.root.scale.setScalar(hot ? 1.18 : 0.86);
      }
    }

    /** Scale the whole picture (and remember it) without fighting the caller. */
    function setFitScale(value) {
      fitScale = Math.max(0.1, Number(value) || 1);
      group.scale.setScalar(fitScale);
      return fitScale;
    }

    function dispose() {
      disposeObject(group);
    }

    return {
      group,
      nodes: byId,
      links: linkObjects,
      sprites: nodeSprites,
      setEarned,
      reset,
      tick,
      dispose,
      width,
      setHot,
      setFitScale,
      getFitScale: () => fitScale
    };
  }



  // (H) Glow — a halo that swells once at a point. `glowAt` is the one-shot form
  // for a landed node; the returned object is reusable (race orb, link tip).
  function makeGlow(opts = {}) {
    const colorValue = color(opts.color, 0x34d399);
    const material = new THREE.MeshBasicMaterial({ color: colorValue, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(opts.size !== undefined ? opts.size : 0.42, 12, 10), material);
    mesh.visible = false;
    const group = new THREE.Group();
    group.add(mesh);
    function pulse(handle, onDone) {
      if (!handle || !handles.has(handle.id)) return;
      mesh.visible = true;
      mesh.scale.setScalar(0.6);
      material.opacity = 0.5;
      effect(handle, (dt, ratio) => {
        mesh.scale.setScalar(0.6 + (1 - ratio) * 1.1);
        material.opacity = 0.5 * ratio;
      }, opts.duration !== undefined ? opts.duration : 0.55, () => {
        mesh.visible = false;
        if (typeof onDone === 'function') onDone();
      });
    }
    return { group, mesh, pulse, dispose: () => disposeObject(group) };
  }

  // (I) Dolly — push the shared camera in/out around its rest distance. Used when
  // the 3D picture IS the game surface (Object Connection): the camera leans in
  // on a landed link and settles back, so the whole board reads as 3D motion.
  function dolly(handle, distance, duration) {
    if (!handle || !handles.has(handle.id)) return;
    const to = Math.max(4, Math.min(22, CAMERA_REST_Z - (Number(distance) || 0)));
    tween(handle, {
      target: handle.camera.position,
      from: handle.camera.position.z,
      to,
      duration: duration !== undefined ? duration : 0.5,
      ease: 'easeInOut',
      // The camera is not in the scene graph, so its matrix is refreshed only by
      // render(); moving it without this makes stagePoint() and every anchored
      // prop project against the previous position for a frame.
      apply: v => {
        handle.camera.position.z = v;
        handle.camera.updateMatrixWorld(true);
      }
    });
  }
  function resetDolly(handle) {
    if (!handle || !handles.has(handle.id)) return;
    handle.camera.position.z = CAMERA_REST_Z;
    handle.camera.updateMatrixWorld(true);
    handle.dirty = true;
  }

  // (E) Celebration — staggered multicolour bursts. The emblem pop is gone with
  // the emblem itself (DECISIONS #220); the bursts are the celebration.
  function celebrate(handle, opts = {}) {
    if (!handle || !handles.has(handle.id)) return;
    const count = opts.count !== undefined ? opts.count : 3;
    const palette = [0x34d399, 0xf2b24a, 0x6d7cf0, 0xff8a3d];
    for (let i = 0; i < count; i++) {
      effect(handle, () => {}, i * 0.18, () => {
        burst(handle, { color: palette[i % palette.length], count: 30 });
      });
    }
  }

  // --- named-event registry (3D-scoped; gameplay emits intent, never points) ---

  const listeners = Object.create(null);

  function on(event, handler) {
    if (typeof handler !== 'function') return;
    (listeners[event] = listeners[event] || []).push(handler);
  }

  function emit(event, detail) {
    const list = listeners[event];
    if (!list || !list.length) return;
    for (const handler of list.slice()) {
      try {
        handler(detail);
      } catch (err) {
        console.warn('threeGame.emit handler failed:', err && err.message ? err.message : err);
      }
    }
  }

  window.threeGame = {
    isAvailable,
    mount,
    unmount,
    setPaused,
    burst,
    addHoverEffect,
    addClickableObject,
    addObject,
    stagePoint,
    stageProject,
    anchor,
    tween,
    effect,
    makeDestructible,
    makeUnlockable,
    makeConstruction,
    makeReactive,
    makeNodeGraph,
    makeGlow,
    dolly,
    resetDolly,
    celebrate,
    // #220: the loop draws on demand; a caller that changes a prop by hand (a
    // cube turning, a star recoloured) asks for one frame instead of a free-run.
    invalidate,
    // #171: the constellation board is a drop surface; these are the whole input
    // contract (a DOM point → a star, a drop → a handler, a fixed aspect).
    pick,
    refreshAnchors,
    fixAspect,
    enableDrag,
    dragStart,
    dragEnd,
    onDropStar,
    fixAspect,
    on,
    emit
  };
})();
