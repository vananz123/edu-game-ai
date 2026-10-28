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
      stop.hidden = !ready;
      stop.disabled = !ready || taskActive;
      stop.title = taskActive ? 'Đang có tác vụ AI, không thể dừng llama.cpp' : '';
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
      notify('Đã dừng llama.cpp.');
    } catch (e) {
      notify((e && e.message) || 'Không dừng được llama.cpp.', 6000);
    }
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

  function toggleIdle() {
    idleVisible = !idleVisible;
    writeIdlePref(idleVisible);
    render();
  }

  function bind(id, handler) {
    const el = $(id);
    if (el) el.addEventListener('click', handler);
  }
  function wire() {
    function closeDropdown() {
      const dropdown = $('aiStatusDropdown');
      if (dropdown) dropdown.classList.add('hidden');
    }
    function toggleDropdown(e) {
      if (e) e.stopPropagation();
      const dropdown = $('aiStatusDropdown');
      if (dropdown) dropdown.classList.toggle('hidden');
    }

    bind('aiStatusStart', function() {
      closeDropdown();
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

    if (menuBtn) menuBtn.addEventListener('click', toggleDropdown);
    if (bar) {
      bar.addEventListener('click', function(e) {
        if (!e.target.closest('#aiStatusMenuBtn') && !e.target.closest('#aiStatusDropdown')) {
          toggleDropdown(e);
        }
      });
    }
    if (modalBtn) {
      modalBtn.addEventListener('click', function() {
        closeDropdown();
        startRuntime();
      });
    }
    document.addEventListener('click', function(e) {
      if (!e.target.closest('#aiStatusContainer')) {
        closeDropdown();
      }
    });
  }

  function init() {
    if (initialized) return;
    initialized = true;
    idleVisible = readIdlePref();
    wire();
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
