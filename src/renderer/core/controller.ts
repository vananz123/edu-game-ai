// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
function navigate(page) { state.page = page; render(); }
function wirePage() {
  if (state.page === 'create-wizard') wireCreateWizard();
  $('#pageContent').querySelectorAll('[data-page]').forEach(el => el.addEventListener('click', () => navigate(el.dataset.page)));
  $('#pageContent').querySelectorAll('[data-action]').forEach(el => el.addEventListener('click', () => handleAction(el.dataset.action, el.dataset.id)));
  $('#pageContent').querySelectorAll('[data-template]').forEach(el => el.addEventListener('click', () => { state.draft = { ...collectDraft() }; state.selectedTemplate = el.dataset.template; render(); }));
  ['#setupDifficulty', '#setupDuration', '#setupPoints', '#setupTimeBonus', '#setupStyle', '#setupPlayers', '#setupCompetition', '#setupPointsEasy', '#setupPointsMedium', '#setupPointsHard'].forEach(sel => $(sel)?.addEventListener('change', () => { state.draft = { ...collectDraft() }; }));
  $('#setupScoringMode')?.addEventListener('change', () => { updateScoringVisibility(); state.draft = { ...collectDraft() }; });
  if ($('#setupScoringMode')) updateScoringVisibility();
  const search = $('#librarySearch'); if (search) search.addEventListener('input', e => { state.search = e.target.value; const pos = e.target.selectionStart; render(); const next = $('#librarySearch'); next.focus(); next.setSelectionRange(pos,pos); });
  const filter = $('#templateFilter'); if (filter) filter.addEventListener('change', e => { state.filter = e.target.value; render(); });
  $('#generateBtn')?.addEventListener('click', generateGame);
  ['#settingCloudProvider', '#documentCloudProvider'].forEach(selector => {
    $(selector)?.addEventListener('change', async event => {
      state.settings.ai = applyCloudProvider(event.target.value);
      if (state.draft && state.page === 'create') {
        state.draft = { ...state.draft, mode: 'online' };
      }
      if (state.page === 'settings') {
        $('#settingBaseUrl').value = state.settings.ai.baseUrl;
        $('#settingModel').value = state.settings.ai.model;
        $('#settingApiKey').value = '';
      } else {
        render();
      }
      toast(isZenCloudConfig(state.settings.ai)
        ? 'Đã chọn OpenCode Zen. Nhấn Lưu cài đặt để dùng model miễn phí (khóa tự đọc nếu máy đã đăng nhập OpenCode).'
        : 'Đã chọn nhà cung cấp. Hãy lưu API key trong Cài đặt để bắt đầu.');
    });
  });
  $('#localModelSelect')?.addEventListener('change', async event => {
    const localModelId = event.target.value;
    const draft = state.page === 'create' ? collectDraft() : state.draft;
    const settings = {
      ...state.settings,
      ai: { ...state.settings.ai, localModelId }
    };
    try {
      await window.eduGame.saveSettings(settings);
      state.settings = await window.eduGame.getSettings();
      if (draft) state.draft = { ...draft, localModelId };
      render();
    } catch (error) {
      toast(`Không lưu được model đã chọn: ${error.message}`);
    }
  });
  $('#installLocalModelBtn')?.addEventListener('click', () => installLocalModel());
  $('#openLocalAiSettingsModalBtn')?.addEventListener('click', () => openLocalAiModal());
  // Trang "Tạo trò chơi" chỉ tạo thủ công: cả hai nút đều mở trình chỉnh sửa trống.
  $('#previewManualBtn')?.addEventListener('click', () => window.createBlankGame?.());
  $('#saveSettingsBtn')?.addEventListener('click', saveSettings);
  $('#testAiBtn')?.addEventListener('click', testAi);
}
async function handleAction(action, id) {
  try {
    if (action === 'play') playGame(findGame(id));
    if (action === 'edit') editGame(findGame(id));
    if (action === 'import-document') {
      const doc = await window.eduGame.importDocument();
      if (doc) { state.importedDoc = doc; const old = state.draft || {}; state.draft = { ...old, text: doc.text, sourceName: doc.name }; render(); toast(`Đã trích xuất ${doc.characters.toLocaleString('vi-VN')} ký tự.`); }
    }
    if (action === 'import-game') {
      const game = await window.eduGame.importGame();
      if (game) { const saved = await window.eduGame.saveGame(game); await refreshDb(); toast(`Đã nhập “${saved.title}”`); }
    }
    if (action === 'export-first') {
      const game = state.db.games[0];
      if (!game) return toast('Thư viện chưa có trò chơi để xuất.');
      const result = await window.eduGame.exportGame(game);
      if (result?.ok) toast('Đã xuất gói trò chơi.');
    }
    if (action === 'export-game') {
      const game = findGame(id);
      if (!game) return toast('Không tìm thấy trò chơi.');
      const result = await window.eduGame.exportGame(game);
      if (result?.ok) toast('Đã xuất gói trò chơi ra tệp .egame.');
    }
    if (action === 'clear-lesson') { state.importedDoc = null; render(); toast('Đã xóa giáo án đã nhập.'); }
    if (action === 'delete') {
      const target = findGame(id);
      if (confirm('Xóa vĩnh viễn “' + (target?.title || 'trò chơi này') + '” khỏi máy?\nKhông thể hoàn tác — hãy xuất gói .egame trước nếu muốn giữ bản sao.')) { await window.eduGame.deleteGame(id); await refreshDb(); render(); toast('Đã xóa “' + (target?.title || 'trò chơi') + '”.'); }
    }
    if (action === 'export-results') exportResults();
  } catch (e) { toast(e.message || 'Đã xảy ra lỗi.'); }
}
function findGame(id) { return state.db.games.find(g => g.id === id); }
function updateScoringVisibility() {
  const mode = $('#setupScoringMode')?.value || 'tốc độ';
  const timeBonusField = $('#timeBonusField');
  if (timeBonusField) timeBonusField.classList.toggle('hidden', mode !== 'tốc độ');
  ['pointsEasyField', 'pointsMediumField', 'pointsHardField'].forEach(id => {
    const field = document.getElementById(id);
    if (field) field.classList.toggle('hidden', mode !== 'theo độ khó');
  });
  const hint = $('#scoringModeHint');
  if (hint) hint.textContent = scoringModeHint(mode);
}
function collectDraft() {
  const bonusRaw = Number($('#setupTimeBonus')?.value ?? state.draft?.gameSetup?.timeBonus ?? 20);
  return {
    text: $('#sourceText')?.value || state.draft?.text || state.importedDoc?.text || '',
    title: $('#gameTitle')?.value || '',
    subject: $('#gameSubject')?.value || '',
    grade: $('#gameGrade')?.value || '',
    questionCount: $('#questionCount')?.value || '8',
    template: state.selectedTemplate,
    mode: $('#generationMode')?.value || state.settings.ai?.mode || 'offline',
    localModelId: $('#localModelSelect')?.value || state.settings.ai?.localModelId || '',
    analysis: state.draft?.analysis || null,
    qaEntries: state.draft?.qaEntries || [],
    assistMode: state.draft?.assistMode || '',
    useSuggestedQuestions: Boolean(state.draft?.useSuggestedQuestions),
    qaQuestion: $('#documentQuestion')?.value || state.draft?.qaQuestion || '',
    sourceName: state.importedDoc?.name || state.draft?.sourceName || '',
    contentSource: state.draft?.contentSource || ($('#sourceText') ? 'ai' : 'manual'),
    gameSetup: {
      scoringMode: $('#setupScoringMode')?.value || state.draft?.gameSetup?.scoringMode || 'tốc độ',
      difficulty: $('#setupDifficulty')?.value || state.draft?.gameSetup?.difficulty || 'trung bình',
      duration: $('#setupDuration')?.value || state.draft?.gameSetup?.duration || '10',
      pointsPerCorrect: $('#setupPoints')?.value || state.draft?.gameSetup?.pointsPerCorrect || '100',
      pointsEasy: $('#setupPointsEasy')?.value || state.draft?.gameSetup?.pointsEasy || '100',
      pointsMedium: $('#setupPointsMedium')?.value || state.draft?.gameSetup?.pointsMedium || '200',
      pointsHard: $('#setupPointsHard')?.value || state.draft?.gameSetup?.pointsHard || '300',
      timeBonus: String(Number.isFinite(bonusRaw) ? Math.min(50, Math.max(0, bonusRaw)) : 20),
      style: $('#setupStyle')?.value || state.draft?.gameSetup?.style || 'giáo dục',
      players: $('#setupPlayers')?.value || state.draft?.gameSetup?.players || 'cá nhân',
      competition: $('#setupCompetition')?.value || state.draft?.gameSetup?.competition || 'không'
    }
  };
}
