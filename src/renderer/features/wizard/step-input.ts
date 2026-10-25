// @ts-nocheck -- renderer UI logic; workflow contracts are typed in src/shared/lesson-types.ts.
/** Wizard step 1 — import or paste the lesson material and store the source text. */

const WIZARD_MIN_CHARACTERS = 40;

function wizardHasText() {
  return String(wizardState.text || '').trim().length >= WIZARD_MIN_CHARACTERS;
}

function renderWizardInput() {
  const s = wizardState;
  const characters = String(s.text || '').trim().length;
  const meta = s.documentMeta;
  const ready = wizardHasText();
  return `<section class="form-panel" data-wizard-step-body="input">
    <div class="section-head"><h3>Bước 1 · Nhập giáo án</h3><span class="tag">Chỉ lưu trên máy</span></div>
    <div class="panel-sub">Dán nội dung hoặc chọn tệp DOCX/PDF/PPTX/TXT/MD. Nội dung giáo án <strong>không</strong> được gửi ra ngoài — bước phân tích chỉ dùng AI local trên máy.</div>
    <div class="flex gap-[9px] flex-wrap mb-[14px]">
      <button type="button" class="btn btn-secondary" data-wizard-action="import-file"${s.busy ? ' disabled' : ''}>⇧ Chọn tệp giáo án</button>
      ${meta ? `<span class="tag">${escapeHtml(s.documentName || 'tài liệu')} · ${Number(meta.characters || characters).toLocaleString('vi-VN')} ký tự</span>` : ''}
    </div>
    <div class="field"><label>TÊN TÀI LIỆU</label><input id="wizardDocName" placeholder="Ví dụ: bai-quang-hop.txt" value="${escapeHtml(s.documentName || '')}"${s.busy ? ' disabled' : ''}></div>
    <div class="field"><label>NỘI DUNG GIÁO ÁN / BÀI HỌC *</label>
      <textarea id="wizardDocText" rows="14" placeholder="Dán nội dung giáo án, kiến thức trọng tâm, mục tiêu, tình huống thực tế..."${s.busy ? ' disabled' : ''}>${escapeHtml(s.text || '')}</textarea>
      <div class="field-hint" id="wizardDocHint">${ready ? `Đã có ${characters.toLocaleString('vi-VN')} ký tự. Tiếp tục để phân tích bằng AI local.` : `Cần tối thiểu ${WIZARD_MIN_CHARACTERS} ký tự. Tài liệu scan không có chữ cần OCR trước khi nhập.`}</div>
    </div>
    ${wizardAiReadinessHint()}
    <div class="publish-actions">
      <button class="btn btn-primary" id="wizardNextBtn" data-wizard-action="next"${ready && !s.busy && !wizardStructureScopeError() ? '' : ' disabled'}>${s.busy === 'save' ? 'Đang lưu…' : 'Tiếp tục · Phân tích →'}</button>
      <button class="btn btn-secondary" data-page="create">Tôi đã biết muốn tạo trò chơi nào</button>
    </div>
  </section>
  ${renderWizardStructureTree()}`;
}

/** Small status strip about the local AI runtime, reused by the analyze step. */
function wizardAiReadinessHint() {
  const machine = state.localAiMachine || {};
  const models = state.localAiModels || [];
  const selectedId = state.settings.ai && state.settings.ai.localModelId;
  const model = models.find(item => item.id === selectedId) || models[0];
  const running = machine.runtimeState === 'READY';
  const modelReady = Boolean(model && model.installed);
  const tone = running ? 'border-[#ddf4e8] bg-[#effaf5]' : 'border-[#f2e3c8] bg-[#fdf7ec]';
  const title = running ? 'AI local đang chạy' : 'AI local chưa chạy';
  const detail = running
    ? `Model ${escapeHtml((model && (model.friendlyName || model.displayName)) || 'đang dùng')} sẵn sàng phân tích.`
    : modelReady
      ? 'Model đã tải. Hãy mở cửa sổ AI local và nhấn “Bắt đầu chạy”.'
      : 'Chưa có model. Hãy mở cửa sổ AI local để tải model Qwen trước khi phân tích.';
  return `<div class="flex gap-[12px] items-start border rounded-[10px] p-[13px] mb-[14px] ${tone}" id="wizardAiStatus" data-ai-running="${running ? 'true' : 'false'}">
    <span class="text-[18px]">${running ? '🟢' : '🟡'}</span>
    <div class="min-w-0"><strong class="text-[12px] block">${escapeHtml(title)}</strong><small class="block text-[11px] text-[#788196] mt-[4px]">${detail}</small></div>
    <button class="btn btn-secondary btn-small ml-auto shrink-0" data-wizard-action="open-ai">Mở AI local</button>
  </div>`;
}

async function wizardInputImportFile() {
  try {
    const document = await window.eduGame.importDocument();
    if (!document) return; // dialog cancelled
    wizardState.text = document.text || '';
    wizardState.documentName = document.name || 'giao-an.txt';
    wizardState.documentMeta = {
      characters: document.characters || String(document.text || '').length,
      ext: (document.name || '').split('.').pop() || 'txt',
      sizeBytes: document.sizeBytes || 0
    };
    wizardState.documentId = null; // re-save on advance so the new text is stored
    wizardClearMessages();
    if (!wizardHasText()) wizardSetError(new Error('Tệp không có nội dung văn bản đọc được. Hãy dùng tệp khác hoặc dán nội dung thủ công.'));
    else wizardSetNotice(`Đã trích xuất ${wizardState.documentMeta.characters.toLocaleString('vi-VN')} ký tự từ “${wizardState.documentName}”.`);
    // A new document invalidates the reviewed scope: the tree is rebuilt locally.
    wizardResetStructure({ rebuild: true });
  } catch (error) {
    wizardSetError(error);
  }
  render();
}

/** Stores the lesson text and moves to the analysis step. */
async function wizardInputNext() {
  if (!wizardHasText()) {
    wizardSetError(new Error(`Hãy nhập hoặc chọn giáo án có tối thiểu ${WIZARD_MIN_CHARACTERS} ký tự.`));
    render();
    return;
  }
  const scopeError = wizardStructureScopeError();
  if (scopeError) {
    wizardSetError(new Error(scopeError));
    render();
    return;
  }
  if (wizardState.busy) return;
  wizardState.busy = 'save';
  wizardClearMessages();
  render();
  try {
    const name = (wizardState.documentName || '').trim() || `giao-an-${Date.now()}.txt`;
    const document = await window.eduGame.saveLessonDocument({
      documentId: wizardState.documentId || undefined,
      name,
      ext: (name.split('.').pop() || 'txt').toLowerCase(),
      sizeBytes: (wizardState.documentMeta && wizardState.documentMeta.sizeBytes) || undefined,
      text: wizardState.text,
      characters: String(wizardState.text).length
    });
    wizardState.documentId = document.id;
    wizardState.documentName = document.name;
    wizardState.documentMeta = { characters: document.characters, ext: document.ext, sizeBytes: document.sizeBytes };
    wizardState.step = 'analyze';
    await wizardSaveProject('analyze');
    wizardState.busy = '';
    wizardSetNotice('Đã lưu giáo án và tạo dự án. Bước tiếp theo: phân tích bằng AI local.');
  } catch (error) {
    wizardState.busy = '';
    wizardSetError(error);
  }
  render();
}
