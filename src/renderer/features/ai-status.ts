// @ts-nocheck -- status bar for llama.cpp / AI-local: independent runtime + task state.
(function () {
  const IDLE_KEY = 'edugame.aiStatus.idleVisible';
  // Keys written by the first iteration of this bar; read once so the teacher's
  // preference survives, then only the single IDLE_KEY is used.
  const LEGACY_IDLE_KEYS = ['ai-status-idle-visible', 'aiStatusIdleVisible', 'ai-status-bar-idle-visible', 'aiStatusBarIdleVisible'];
  const POLL_MS = 2000;
  // AiTaskManager states that still need the cancel button.
  const ACTIVE_TASK_STATES = ['queued', 'running'];
  // Stage ids sent by main (`aiTasks.progress`) → text a teacher understands.
  const STAGE_LABELS = {
    queued: 'đang chờ',
    running: 'đang chạy',
    prepare: 'đang đọc giáo án',
    retrieve: 'đang tìm ngữ cảnh',
    generate: 'đang tạo nội dung',
    repair: 'đang sửa phần chưa đạt',
    validate: 'đang kiểm tra',
    ready: 'đang hoàn tất',
    cached: 'dùng lại kết quả đã tạo'
  };

  function formatClock(milliseconds) {
    const totalSeconds = Math.max(0, Math.floor(Number(milliseconds) / 1000));
    return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
  }

  let timer = null;
  let initialized = false;
  let wiredBar = null;
  let wiredNodes = [];
  let modelsLoaded = false;
  let lastRuntimeState = null;
  let runtime = { state: 'STOPPED', modelId: null, message: '' };
  let activeTask = null;
  let idleVisible = readIdlePref();

  function readIdlePref() {
    try {
      const stored = localStorage.getItem(IDLE_KEY);
      if (stored === '1' || stored === '0') return stored === '1';
      for (let i = 0; i < LEGACY_IDLE_KEYS.length; i++) {
        const legacy = localStorage.getItem(LEGACY_IDLE_KEYS[i]);
        if (legacy === '1' || legacy === 'true' || legacy === 'yes') {
          writeIdlePref(true);
          return true;
        }
      }
    } catch (e) {}
    return false;
  }
  function writeIdlePref(value) {
    try {
      localStorage.setItem(IDLE_KEY, value ? '1' : '0');
      for (let i = 0; i < LEGACY_IDLE_KEYS.length; i++) localStorage.removeItem(LEGACY_IDLE_KEYS[i]);
    } catch (e) {}
  }
  function $(id) {
    const target = String(id || '');
    return document.getElementById(target.charAt(0) === '#' ? target.slice(1) : target);
  }
  // `state` is a top-level `const` in shared.js, so it is NOT window.state.
  function rendererState() {
    try { return typeof state !== 'undefined' ? state : null; } catch (e) { return null; }
  }
  function notify(message, duration) {
    try { if (typeof toast === 'function') toast(message, duration); } catch (e) {}
  }
  function isTaskActive() { return Boolean(activeTask); }

  async function refreshRuntime(forceModels) {
    try {
      runtime = (await window.eduGame.getLocalRuntimeStatus()) || runtime;
    } catch (e) {
      runtime = { state: 'STOPPED', modelId: null, message: (e && e.message) || '' };
    }
    const changed = lastRuntimeState !== runtime.state;
    // Reading the model catalog touches disk, so only do it when the runtime
    // actually changed state (or when the caller explicitly asked).
    if (changed || forceModels || !modelsLoaded) {
      try {
        const result = await window.eduGame.getLocalAiModels();
        const shared = rendererState();
        if (shared) {
          shared.localAiModels = result.models;
          shared.localAiMachine = result.machine;
        }
        modelsLoaded = true;
      } catch (e) {}
    }
    lastRuntimeState = runtime.state;
  }

  async function refreshTasks() {
    try {
      const result = await window.eduGame.listAiTasks({ limit: 10, history: false });
      const live = ((result && result.live) || []).filter(function (task) {
        return task && ACTIVE_TASK_STATES.indexOf(task.state) !== -1;
      });
      live.sort(function (a, b) { return String(b.startedAt || '').localeCompare(String(a.startedAt || '')); });
      activeTask = live.length ? live[0] : null;
    } catch (e) {
      activeTask = null;
    }
  }

  function taskLabel(task) {
    if (!task) return 'Không có tác vụ AI đang chạy';
    // `progress` is the raw stage id from the main process; show the Vietnamese
    // stage so the bar matches the wizard's stage list and timer.
    const stageId = String(task.progress || '');
    const stage = STAGE_LABELS[stageId] || (stageId && stageId !== 'running' ? stageId : 'đang chạy');
    const startedAt = task.startedAt ? Date.parse(task.startedAt) : 0;
    const elapsed = startedAt ? ' · ' + formatClock(Date.now() - startedAt) : '';
    return (task.label || 'Tác vụ AI') + ' · ' + stage + elapsed;
  }

  function runningModelName() {
    const shared = rendererState();
    const modelId = runtime.modelId || (shared && shared.localAiMachine ? shared.localAiMachine.runtimeModelId : null);
    if (!modelId || !shared) return '';
    const model = (shared.localAiModels || []).find(function (item) { return item.id === modelId; });
    return model ? (model.friendlyName || model.displayName) : '';
  }

  function runtimeLabel() {
    if (runtime.state === 'READY') {
      const name = runningModelName();
      return name ? 'llama.cpp đang chạy · ' + name : 'llama.cpp đang chạy';
    }
    if (runtime.state === 'STARTING') return 'llama.cpp đang khởi động…';
    return 'llama.cpp chưa chạy';
  }

  function render() {
    ensureWired();
    const ready = runtime.state === 'READY';
    const starting = runtime.state === 'STARTING';
    const idle = !ready && !starting;
    const taskActive = isTaskActive();

    const runtimeEl = $('#aiStatusRuntime');
    if (runtimeEl) {
      runtimeEl.textContent = runtimeLabel();
      runtimeEl.title = runtime.message || runtimeLabel();
    }
    const taskEl = $('#aiStatusTask');
    if (taskEl) {
      taskEl.textContent = taskLabel(activeTask);
      if (taskActive) {
        taskEl.classList.remove('hidden');
      } else {
        taskEl.classList.add('hidden');
      }
    }

    const dot = $('#aiStatusRuntimeDot');
    if (dot) {
      dot.classList.remove('bg-[#18ae7b]', 'bg-[#f5a524]', 'bg-[#b3261e]');
      dot.classList.add(ready ? 'bg-[#18ae7b]' : starting ? 'bg-[#f5a524]' : 'bg-[#b3261e]');
      dot.hidden = idle && !idleVisible;
      dot.title = ready ? 'llama.cpp đang chạy' : starting ? 'llama.cpp đang khởi động' : 'llama.cpp chưa chạy';
    }

    const start = $('#aiStatusStart');
    if (start) {
      start.hidden = !idle;
      start.disabled = !idle;
      start.title = 'Mở hộp AI local để chọn model và khởi động llama.cpp';
    }
    const stop = $('#aiStatusStop');
    if (stop) {
      // Visible whenever llama.cpp may be running; a stale "not ready" hid the one
      // control the teacher needed. stopRuntime() re-checks before doing anything.
      stop.hidden = false;
      stop.disabled = false;
      stop.title = ready
        ? (taskActive ? 'Đang có tác vụ AI, sẽ dừng sau khi tác vụ xong' : 'Dừng llama.cpp')
        : 'llama.cpp hiện không chạy';
    }
    const cancel = $('#aiStatusCancel');
    if (cancel) {
      cancel.hidden = !taskActive;
      cancel.disabled = !taskActive;
    }
    const toggle = $('#aiStatusToggle');
    if (toggle) {
      toggle.textContent = idleVisible ? 'Ẩn khi rảnh' : 'Hiện khi rảnh';
      toggle.setAttribute('aria-pressed', idleVisible ? 'true' : 'false');
    }
  }

  async function refresh() {
    if (document.visibilityState === 'hidden') return;
    await refreshRuntime(false);
    await refreshTasks();
    render();
  }

  function startRuntime() {
    if (typeof openLocalAiModal === 'function') return openLocalAiModal();
    notify('Không mở được hộp AI local. Hãy vào Tạo dự án mới để khởi động llama.cpp.', 6000);
  }

  async function stopRuntime() {
    // The bar can be stale after a page re-render (it is refreshed at the end of every
    // render, but a page whose render threw leaves the previous state on screen). Read
    // the truth first: starting from a stale "running" view after llama.cpp really
    // stopped must not end in a silent failure.
    await refreshRuntime(false).catch(function () {});
    await refreshTasks().catch(function () {});
    render();
    if (runtime.state !== 'READY') {
      notify('llama.cpp hiện không chạy nên không có gì để dừng.');
      return;
    }
    if (isTaskActive()) {
      notify('Đang có tác vụ AI, không thể dừng llama.cpp.');
      return;
    }
    try {
      const result = await window.eduGame.stopLocalRuntime();
      const shared = rendererState();
      if (shared && result && result.models) {
        shared.localAiModels = result.models.models;
        shared.localAiMachine = result.models.machine;
      }
      lastRuntimeState = null;
      await refresh();
      if (runtime.state === 'READY') {
        notify('Yêu cầu dừng đã được gửi nhưng llama.cpp vẫn đang chạy. Hãy thử lại sau vài giây.', 6000);
        return;
      }
      notify('Đã dừng llama.cpp.');
    } catch (e) {
      lastRuntimeState = null;
      await refresh().catch(function () {});
      const detail = bridgeMessage(e);
      notify(detail ? 'Không dừng được llama.cpp: ' + detail : 'Không dừng được llama.cpp.', 7000);
    }
  }

  /** The message an IPC refusal carries, without Electron's wrapper text. */
  function bridgeMessage(error) {
    const text = String((error && error.message) || error || '');
    return text.replace(/^Error invoking remote method '[^']*':\s*/, '').replace(/^Error:\s*/, '').trim();
  }

  async function cancelAi() {
    const task = activeTask;
    if (!task || !task.requestId) return;
    try {
      await window.eduGame.cancelAi(task.requestId);
      notify('Đang huỷ yêu cầu AI…');
      await refresh();
    } catch (e) {
      notify((e && e.message) || 'Không huỷ được yêu cầu AI.', 6000);
    }
  }

  /**
   * Identifies "the same bar element" across re-renders of the shell. When the page
   * is re-rendered the navbar markup is replaced, and this bar was created once with
   * the old markup, so its controls (and therefore the menu's buttons) would be dead
   * on every page after the first navigation. Re-wiring is idempotent (`wire()`
   * and `bind()` both guard on a data flag).
   */
  function currentBar() {
    // The bar is replaced whenever the shell re-renders the navbar.
    const bar = $('aiStatusBar');
    return bar || null;
  }
  let wiring = false;
  function ensureWired() {
    const bar = currentBar();
    // Never start a pass inside a pass; the outer pass finishes the job.
    if (!bar || wiring) return;
    // A node is "wired" when this module attached its own listener, marked by a
    // property (not a data attribute: the shell round-trips innerHTML, which would keep
    // a stale marker on brand-new nodes). `wiredNodes` remembers the exact nodes, so a
    // navbar that was replaced (even with identical markup) is detected at once.
    const controls = [bar, $('aiStatusMenuBtn'), $('aiStatusOpenModalBtn')];
    const stale = bar !== wiredBar
      || wiredNodes.length !== controls.length
      || controls.some(function (node, index) { return Boolean(node) && wiredNodes[index] !== node; });
    if (stale) {
      wiredBar = bar;
      wiredNodes = controls;
      wiring = true;
      try {
        wire();
      } catch (error) {
        // A failed pass must not leave the module half-bound; report it and let the
        // next click/refresh try again.
        try { console.error('[ai-status] could not wire the status bar:', error && error.message ? error.message : error); } catch (e) {}
        wiredBar = null;
      } finally {
        wiring = false;
      }
    }
  }
  // Whether the menu is open is derived from the DOM, never from a module variable that a
  // re-rendered navbar could contradict.
  function menuIsOpen() {
    const dropdown = $('aiStatusDropdown');
    return Boolean(dropdown && !dropdown.classList.contains('hidden'));
  }
  function syncAria() {
    const menuBtn = $('aiStatusMenuBtn');
    if (menuBtn) menuBtn.setAttribute('aria-expanded', menuIsOpen() ? 'true' : 'false');
  }
  function openDropdown() {
    const dropdown = $('aiStatusDropdown');
    if (dropdown) dropdown.classList.remove('hidden');
    syncAria();
  }
  function closeDropdown() {
    const dropdown = $('aiStatusDropdown');
    if (dropdown) dropdown.classList.add('hidden');
    const menuBtn = $('aiStatusMenuBtn');
    if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
  }  function bind(id, handler) {
    const el = $(id);
    // Nodes are replaced when the shell re-renders the navbar, so every fresh node is
    // bound once; a property flag (unlike a data attribute) cannot survive a
    // serialise/parse round trip.
    if (!el || el.aiStatusWired === true) return;
    el.aiStatusWired = true;
    el.addEventListener('click', handler);
  }

  function toggleIdle() {
    idleVisible = !idleVisible;
    writeIdlePref(idleVisible);
    render();
  }

  function wire() {
    function toggleDropdown(e) {
      if (e) e.stopPropagation();
      const dropdown = $('aiStatusDropdown');
      if (!dropdown) return;
      dropdown.classList.toggle('hidden');
      syncAria();
    }

    // Every control first reads the live runtime state: the bar's render can be a
    // poll behind (or a page whose render threw), and a control that silently refuses
    // because of a stale flag is indistinguishable from a broken button.
    bind('aiStatusStart', async function() {
      closeDropdown();
      await refresh().catch(function () {});
      startRuntime();
    });
    bind('aiStatusStop', function() {
      closeDropdown();
      stopRuntime();
    });
    bind('aiStatusCancel', function() {
      closeDropdown();
      cancelAi();
    });
    bind('aiStatusToggle', toggleIdle);

    const bar = $('aiStatusBar');
    const menuBtn = $('aiStatusMenuBtn');
    const modalBtn = $('aiStatusOpenModalBtn');

    // The bar toggles the menu; the button handler below stops propagation so the
    // same click never toggles twice (that used to end closed → open → closed).
    bind('aiStatusBar', function(e) {
      if (e.target.closest('#aiStatusDropdown')) return;
      // Always open. A page re-render re-created the bar this very click targeted, and
      // its fresh dropdown starts hidden, so "toggle" would look like "nothing happened"
      // (this module is refreshed after `render()`, see the note in `render()`).
      openDropdown();
    });
    if (modalBtn && modalBtn.aiStatusWired !== true) {
      modalBtn.aiStatusWired = true;
      modalBtn.addEventListener('click', function() {
        closeDropdown();
        startRuntime();
      });
    }
    if (menuBtn && menuBtn.aiStatusWired !== true) {
      // Its own handler: stop the bar handler from toggling again in the same click.
      menuBtn.aiStatusWired = true;
      menuBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleDropdown(e);
      });
    }
    // Document-level listeners belong to the page, not to the bar: bind them once per
    // document, and outside any bar click so they cannot fight with the bar handler.
    // Document-level listeners belong to this page: bind them once per document (a new
    // document is a new page and gets its own copy). Bubble phase, not capture:
    // capture fires before the bar/button handlers, so it would see this very click as
    // "outside" and close the menu the same click opened. The button's
    // stopPropagation keeps an opening click away from this listener.
    if (!document.documentElement.__aiStatusDocBound) {
      document.documentElement.__aiStatusDocBound = true;
      // Capture phase: repair a bar that a page re-render replaced after the render
      // that was meant to do it, before this click reaches the fresh nodes. Only
      // clicks on the bar itself: anywhere else the next status poll will do it, and
      // re-wiring during an unrelated click could act on the page being swapped.
      document.addEventListener('click', function(e) {
        if (e.target.closest('#aiStatusContainer')) ensureWired();
        if (!e.target.closest('#aiStatusContainer')) closeDropdown();
      }, true);
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeDropdown();
      });
      document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'hidden') closeDropdown();
      });
    }
  }

  function init() {
    if (initialized) return;
    initialized = true;
    idleVisible = readIdlePref();
    wire();
    wiredBar = currentBar();
    render();
    if (timer) clearInterval(timer);
    timer = setInterval(function () { refresh().catch(function () {}); }, POLL_MS);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') refresh().catch(function () {});
    });
    refresh().catch(function () {});
  }

  window.initAiStatusBar = init;
  window.refreshAiStatusBar = refresh;
  window.aiStatusRefresh = refresh;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    setTimeout(init, 0);
  }
})();
