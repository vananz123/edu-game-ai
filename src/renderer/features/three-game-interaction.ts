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

  // A gently drifting field of points tinted to the world accent.
  function buildParticles(count, accent) {
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 26;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 15;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 8;
      speeds[i] = 0.05 + Math.random() * 0.25;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: accent,
      size: 0.09,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const points = new THREE.Points(geometry, material);
    points.userData.speeds = speeds;
    points.userData.count = count;
    return points;
  }

  // The rotating "world emblem" — a low-poly torus knot tinted to the accent.
  function buildEmblem(accent) {
    const geometry = new THREE.TorusKnotGeometry(2.1, 0.62, 96, 12);
    const material = new THREE.MeshStandardMaterial({
      color: accent,
      roughness: 0.35,
      metalness: 0.25,
      emissive: accent,
      emissiveIntensity: 0.12
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.baseScale = 1;
    return mesh;
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

      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
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

      const accent = color(opts.accent, 0x6d7cf0);
      const particles = buildParticles(opts.count !== undefined ? opts.count : 46, accent);
      scene.add(particles);

      const emblem = buildEmblem(accent);
      // Park it top-left so it never fights the centred question text.
      emblem.position.set(-6.5, 2.7, -2);
      emblem.visible = opts.emblem !== false;
      scene.add(emblem);

      const handle = {
        id: nextId++,
        canvas,
        container,
        renderer,
        scene,
        camera,
        particles,
        emblem,
        bursts: [],
        tweens: [],
        effects: [],
        anchors: [],
        hoverables: [],
        clickables: [],
        paused: false,
        pointerOn: false,
        raf: 0,
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
   * Requires a rendered frame: the camera aspect only settles after step().
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
    return object;
  }

  function step(handle) {
    const dt = Math.min(handle.clock.getDelta(), 0.1);
    if (handle.paused) {
      handle.renderer.render(handle.scene, handle.camera);
      return;
    }
    const w = handle.container.clientWidth || 1;
    const h = handle.container.clientHeight || 1;
    const pw = handle.renderer.domElement.width / handle.renderer.getPixelRatio();
    const ph = handle.renderer.domElement.height / handle.renderer.getPixelRatio();
    if (w !== pw || h !== ph) {
      handle.renderer.setSize(w, h, false);
      handle.camera.aspect = w / h;
      handle.camera.updateProjectionMatrix();
    }
    // Screen-fraction anchors are re-projected every frame, so a prop keeps its
    // place on screen when the stage resizes (native fullscreen arrives after
    // the surface is rendered, and step() is where the new aspect is absorbed).
    for (const a of handle.anchors) applyAnchor(handle, a);
    // ambient drift
    const pos = handle.particles.geometry.attributes.position;
    const speeds = handle.particles.userData.speeds;
    const n = handle.particles.userData.count;
    for (let i = 0; i < n; i++) {
      let y = pos.getY(i) + speeds[i] * dt;
      if (y > 7.5) y = -7.5;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
    handle.particles.rotation.y += dt * 0.03;
    // emblem spin (skipped when the caller parked it, e.g. the house showcase)
    if (handle.emblem.visible) {
      handle.emblem.rotation.x += dt * 0.25;
      handle.emblem.rotation.y += dt * 0.4;
    }
    // hover / click targets
    if (handle.pointerOn && (handle.hoverables.length || handle.clickables.length)) {
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

  // (E) Celebration — staggered multicolour bursts + an emblem pop.
  function celebrate(handle, opts = {}) {
    if (!handle || !handles.has(handle.id)) return;
    const count = opts.count !== undefined ? opts.count : 3;
    const palette = [0x34d399, 0xf2b24a, 0x6d7cf0, 0xff8a3d];
    for (let i = 0; i < count; i++) {
      effect(handle, () => {}, i * 0.18, () => {
        burst(handle, { color: palette[i % palette.length], count: 30 });
      });
    }
    tween(handle, {
      target: handle.emblem,
      from: 1,
      to: 1.3,
      duration: 0.25,
      ease: 'easeOutBack',
      apply: (v) => handle.emblem.scale.setScalar(v),
      onComplete: () => {
        tween(handle, {
          target: handle.emblem,
          from: 1.3,
          to: 1,
          duration: 0.4,
          ease: 'easeOutCubic',
          apply: (v) => handle.emblem.scale.setScalar(v)
        });
      }
    });
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
    anchor,
    tween,
    effect,
    makeDestructible,
    makeUnlockable,
    makeConstruction,
    makeReactive,
    celebrate,
    on,
    emit
  };
})();
