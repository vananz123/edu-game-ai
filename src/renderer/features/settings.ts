// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
async function saveSettings() {
  const settings = {
    ai: { ...state.settings.ai, mode: $('#settingAiMode').value, cloudProvider: $('#settingCloudProvider').value, baseUrl: $('#settingBaseUrl').value.trim(), model: $('#settingModel').value.trim(), apiKey: $('#settingApiKey').value },
    preferences: {
      ...(state.settings.preferences || {}),
      largeText: $('#settingLargeText').checked,
      sound: $('#settingSound').checked,
      audience: $('#settingAudience')?.value || 'teen',
      teachingStyle: {
        tone: $('#settingStyleTone')?.value || 'thân thiện',
        humor: $('#settingStyleHumor')?.value || 'vừa phải',
        examples: $('#settingStyleExamples')?.value.trim() || '',
        visualStyle: $('#settingVisualStyle')?.value || 'hiện đại sinh động',
        notes: $('#settingStyleNotes')?.value.trim() || ''
      }
    }
  };
  await window.eduGame.saveSettings(settings);
  state.settings = await window.eduGame.getSettings();
  if (state.draft) {
    state.draft = {
      ...state.draft,
      mode: state.settings.ai?.mode || 'offline',
      localModelId: state.settings.ai?.localModelId
    };
  }
  toast('Đã lưu cài đặt.');
}
async function testAi() {
  const settings = { ai: { ...state.settings.ai, mode: $('#settingAiMode').value, cloudProvider: $('#settingCloudProvider').value, baseUrl: $('#settingBaseUrl').value.trim(), model: $('#settingModel').value.trim(), apiKey: $('#settingApiKey').value }, preferences: state.settings.preferences };
  await window.eduGame.saveSettings(settings); state.settings = await window.eduGame.getSettings();
  if ($('#settingAiMode').value === 'offline') return toast('Chế độ ngoại tuyến không cần kiểm tra kết nối.');
  const button = $('#testAiBtn'); button.disabled = true; button.textContent = 'Đang kiểm tra…';
  try {
    const result = await window.eduGame.generateGame({ mode:settings.ai.mode, localModelId: state.settings.ai?.localModelId, baseUrl: settings.ai.baseUrl, model: settings.ai.model, apiKey: settings.ai.apiKey, text:'Bài học mẫu: Cây cần ánh sáng, nước và chất dinh dưỡng để sinh trưởng. Hãy tạo 3 câu hỏi ngắn.', questionCount:3, template:'quiz', subject:'Khoa học' });
    toast(`Kết nối AI thành công (${result.provider}).`);
  } catch(e) { toast(`Chưa kết nối được: ${e.message}`, 5000); }
  finally { button.disabled = false; button.textContent = 'Kiểm tra kết nối AI'; }
}
