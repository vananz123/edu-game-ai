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
  const structureState = typeof wizardStructureState === 'function' ? wizardStructureState() : null;
  const tree = structureState ? structureState.tree : null;
  const treeCount = tree && tree.headingsFound ? Number(tree.headingsFound) : 0;
  const hasStructure = Boolean(tree && !tree.empty);
  const activeTab = s.inputTab || (ready ? 'structure' : 'content');
  // The panes are layout-only visibility (`display`), never `aria-hidden`:
  // keeping both panes in the accessibility tree means a screen reader, the
  // DOM checks and `wizardSyncStructureCheckboxes()` always find the tree.
  const tabButton = (id, label, badge) => `<button type="button" role="tab" aria-selected="${activeTab === id ? 'true' : 'false'}" aria-controls="wizardTabPane-${id}" id="wizardTab-${id}" class="wizard-tab-btn flex items-center gap-2 py-2.5 px-4 font-bold text-[13px] border-b-2 rounded-t-lg transition-colors ${activeTab === id ? 'border-[#6366f1] text-[#6366f1] bg-[#f8f7ff] dark:bg-[#1e2544]' : 'border-transparent text-[#64748b] dark:text-[#94a3b8] hover:text-[#1e293b]'}" data-wizard-input-tab="${id}">
        <span>${label}</span>
        ${badge}
      </button>`;

  return `<section class="form-panel wizard-step-input-panel" data-wizard-step-body="input">
    <div class="flex items-center justify-between gap-3 mb-4 flex-wrap pb-3 border-b border-[#f1f5f9] dark:border-[#2a324b]">
      <div>
        <div class="flex items-center gap-2 mb-1">
          <span class="d-badge d-badge-primary d-badge-sm font-bold">BƯỚC 1 / 5</span>
          <h3 class="text-[17px] font-bold text-[#1e293b] dark:text-[#f1f5f9] m-0">Nhập nội dung bài học & giáo án</h3>
        </div>
        <p class="text-[12px] text-[#64748b] dark:text-[#94a3b8] m-0 leading-relaxed">
          Tải tệp giáo án từ máy tính hoặc dán nội dung văn bản. Dữ liệu chỉ lưu trên máy, AI local xử lý ngoại tuyến an toàn.
        </p>
      </div>
      <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#effaf5] border border-[#ddf4e8] text-[#16a34a] text-[11px] font-semibold dark:bg-[#132d24] dark:border-[#1e4a3b] dark:text-[#4ade80]">
        🔒 Bảo mật cục bộ · 100% Offline
      </span>
    </div>

    <!-- Khối 1: Tải lên tệp tài liệu -->
    <div class="wizard-import-card border-2 border-dashed border-[#cbd5e1] dark:border-[#334155] rounded-xl p-4 bg-[#f8fafc] dark:bg-[#151a30] transition hover:border-[#8b82ff] mb-4">
      ${meta || s.documentName ? `
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-10 h-10 rounded-lg bg-[#e0e7ff] text-[#4f46e5] dark:bg-[#283060] dark:text-[#a5b4fc] grid place-items-center text-[20px] shrink-0">📄</div>
            <div class="min-w-0">
              <div class="font-bold text-[13px] text-[#1e293b] dark:text-[#f8fafc] truncate" title="${escapeHtml(s.documentName)}">${escapeHtml(s.documentName)}</div>
              <div class="text-[11px] text-[#64748b] dark:text-[#94a3b8] flex items-center gap-2 mt-0.5">
                <span class="font-semibold text-[#16a34a]">✓ Đã nạp thành công</span>
                <span>·</span>
                <span>${Number(meta?.characters || characters).toLocaleString('vi-VN')} ký tự</span>
                <span>·</span>
                <span class="uppercase font-semibold">${escapeHtml(meta?.ext || 'Tệp')}</span>
              </div>
            </div>
          </div>
          <button type="button" class="btn btn-secondary btn-small" data-wizard-action="import-file"${s.busy ? ' disabled' : ''}>
            ↻ Đổi tệp khác
          </button>
        </div>
      ` : `
        <div class="flex items-center justify-between gap-4 flex-wrap">
          <div class="flex items-center gap-3.5">
            <div class="w-11 h-11 rounded-xl bg-[#eef2ff] text-[#6366f1] dark:bg-[#262c55] dark:text-[#818cf8] grid place-items-center text-[22px] shrink-0">
              📂
            </div>
            <div>
              <strong class="block text-[13px] text-[#1e293b] dark:text-[#f1f5f9]">Tải lên tệp tài liệu giáo án</strong>
              <div class="flex items-center gap-1.5 mt-1 text-[10px] text-[#64748b] dark:text-[#94a3b8] flex-wrap">
                <span>Hỗ trợ định dạng:</span>
                <span class="px-1.5 py-0.5 rounded bg-white dark:bg-[#1e2544] border border-[#e2e8f0] dark:border-[#334155] font-mono font-semibold text-[#475569] dark:text-[#cbd5e1]">DOCX</span>
                <span class="px-1.5 py-0.5 rounded bg-white dark:bg-[#1e2544] border border-[#e2e8f0] dark:border-[#334155] font-mono font-semibold text-[#475569] dark:text-[#cbd5e1]">PDF</span>
                <span class="px-1.5 py-0.5 rounded bg-white dark:bg-[#1e2544] border border-[#e2e8f0] dark:border-[#334155] font-mono font-semibold text-[#475569] dark:text-[#cbd5e1]">PPTX</span>
                <span class="px-1.5 py-0.5 rounded bg-white dark:bg-[#1e2544] border border-[#e2e8f0] dark:border-[#334155] font-mono font-semibold text-[#475569] dark:text-[#cbd5e1]">TXT / MD</span>
              </div>
            </div>
          </div>
          <button type="button" class="btn btn-primary" data-wizard-action="import-file"${s.busy ? ' disabled' : ''}>
            ⇧ Chọn tệp giáo án
          </button>
        </div>
      `}
    </div>

    <!-- Tên tài liệu -->
    <div class="field mb-4">
      <label class="text-[11px] font-bold text-[#475569] dark:text-[#cbd5e1] mb-1 block">TÊN BÀI HỌC / TÀI LIỆU</label>
      <input id="wizardDocName" class="w-full px-3 py-2 border border-[#cbd5e1] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1e2544] text-[#1e293b] dark:text-[#f8fafc] text-[13px] focus:outline-none focus:border-[#6366f1]" placeholder="Ví dụ: Bài 10 - Quang hợp ở thực vật" value="${escapeHtml(s.documentName || '')}"${s.busy ? ' disabled' : ''}>
    </div>

    <!-- Thanh Tabs: Cấu trúc tài liệu & Nội dung giáo án -->
    <div class="wizard-tab-header flex items-center border-b border-[#e2e8f0] dark:border-[#2a324b] mb-4 gap-2" role="tablist">
      ${tabButton('structure', '📑 Cấu trúc tài liệu', hasStructure ? `<span data-wizard-tab-count class="px-1.5 py-0.5 rounded-full text-[10px] bg-[#eef2ff] text-[#4f46e5] dark:bg-[#283060] dark:text-[#a5b4fc]">${treeCount} mục</span>` : '')}
      ${tabButton('content', '📝 Nội dung giáo án', `<span data-wizard-tab-count class="px-1.5 py-0.5 rounded-full text-[10px] bg-[#f1f5f9] text-[#475569] dark:bg-[#1e2544] dark:text-[#cbd5e1]">${characters.toLocaleString('vi-VN')} ký tự</span>`)}
    </div>

    <!-- Tab 1 Pane: Cấu trúc tài liệu -->
    <div class="wizard-tab-pane ${activeTab === 'structure' ? '' : 'hidden'}" data-tab-pane="structure" role="tabpanel" aria-labelledby="wizardTab-structure" id="wizardTabPane-structure" data-active-pane="${activeTab === 'structure' ? 'true' : 'false'}">
      ${renderWizardStructureTabContent()}
    </div>

    <!-- Tab 2 Pane: Nội dung giáo án -->
    <div class="wizard-tab-pane ${activeTab === 'content' ? '' : 'hidden'}" data-tab-pane="content" role="tabpanel" aria-labelledby="wizardTab-content" id="wizardTabPane-content" data-active-pane="${activeTab === 'content' ? 'true' : 'false'}">
      <div class="field mb-4">
        <div class="flex items-center justify-between mb-1.5">
          <label class="text-[11px] font-bold text-[#475569] dark:text-[#cbd5e1]">NỘI DUNG VĂN BẢN ĐẦY ĐỦ *</label>
          <button type="button" class="text-[11px] text-[#6366f1] hover:underline bg-transparent border-0 cursor-pointer" data-wizard-action="insert-sample"${s.busy ? ' disabled' : ''}>✨ Thử giáo án mẫu</button>
        </div>
        <textarea id="wizardDocText" rows="13" class="w-full p-3 border border-[#cbd5e1] dark:border-[#334155] rounded-xl bg-white dark:bg-[#1e2544] text-[#1e293b] dark:text-[#f8fafc] text-[13px] leading-relaxed focus:outline-none focus:border-[#6366f1] transition font-sans" placeholder="Dán nội dung bài học, mục tiêu cần đạt, kiến thức trọng tâm, câu hỏi hoặc ví dụ thực tế..."${s.busy ? ' disabled' : ''}>${escapeHtml(s.text || '')}</textarea>
        <div class="flex items-center justify-between mt-1.5 flex-wrap gap-2 text-[11px]">
          <div class="field-hint text-[#64748b] dark:text-[#94a3b8]" id="wizardDocHint">
            ${ready ? `✓ Đã có ${characters.toLocaleString('vi-VN')} ký tự. Đủ điều kiện phân tích bằng AI local.` : `Cần tối thiểu ${WIZARD_MIN_CHARACTERS} ký tự (${characters}/${WIZARD_MIN_CHARACTERS}).`}
          </div>
          <div class="text-[11px] font-semibold ${ready ? 'text-[#16a34a]' : 'text-[#f59e0b]'}">
            ${ready ? '● Sẵn sàng phân tích' : '○ Chưa đủ độ dài'}
          </div>
        </div>
      </div>
    </div>

    <!-- Actions Row -->
    <div class="publish-actions flex items-center justify-between pt-3 border-t border-[#f1f5f9] dark:border-[#2a324b] gap-3 flex-wrap mt-4">
      <button class="btn btn-secondary" data-page="create">Tôi đã biết muốn tạo trò chơi nào</button>
      <button class="btn btn-primary btn-large !py-2.5 !px-5 !text-[13px] !font-bold" id="wizardNextBtn" data-wizard-action="next"${ready && !s.busy && !wizardStructureScopeError() ? '' : ' disabled'}>
        ${s.busy === 'save' ? '⏳ Đang lưu giáo án…' : 'Tiếp tục: Phân tích giáo án bằng AI ➔'}
      </button>
    </div>
  </section>`;
}

/** Patches the tab counters in place (typing must not re-render the page). */
function wizardSyncStepInputStats() {
  const characters = String(wizardState.text || '').trim().length;
  const contentCount = document.querySelector('[data-wizard-input-tab="content"] [data-wizard-tab-count]');
  if (contentCount) contentCount.textContent = `${characters.toLocaleString('vi-VN')} ký tự`;
  const structureCount = document.querySelector('[data-wizard-input-tab="structure"] [data-wizard-tab-count]');
  if (structureCount) {
    const structureState = typeof wizardStructureState === 'function' ? wizardStructureState() : null;
    const tree = structureState ? structureState.tree : null;
    const hasStructure = Boolean(tree && !tree.empty);
    structureCount.textContent = hasStructure ? `${Number(tree.headingsFound || 0)} mục` : '';
    structureCount.classList.toggle('hidden', !hasStructure);
  }
}

function renderWizardStructureTabContent() {
  const characters = String(wizardState.text || '').trim().length;
  if (characters < WIZARD_MIN_CHARACTERS) {
    return `<div class="p-8 text-center border-2 border-dashed border-[#e2e8f0] dark:border-[#2a324b] rounded-xl bg-[#f8fafc] dark:bg-[#151a30] my-2">
      <span class="text-[32px] block mb-2">📑</span>
      <strong class="block text-[14px] text-[#1e293b] dark:text-[#f8fafc] mb-1">Chưa có cấu trúc tài liệu</strong>
      <p class="text-[12px] text-[#64748b] dark:text-[#94a3b8] max-w-[440px] mx-auto mb-4 leading-relaxed">
        Hãy tải lên tệp giáo án hoặc dán nội dung văn bản ở tab "Nội dung giáo án". Hệ thống sẽ tự động bóc tách các chương, mục để bạn lựa chọn trọng tâm bài giảng.
      </p>
      <button type="button" class="btn btn-secondary btn-small" data-wizard-input-tab="content">
        Chuyển sang tab Nội dung giáo án ➔
      </button>
    </div>`;
  }
  const treeState = typeof wizardStructureState === 'function' ? wizardStructureState() : null;
  const beforeFirstScan = treeState && !treeState.tree && !treeState.loading && !treeState.error;
  if (beforeFirstScan && typeof wizardStructureSchedule === 'function') {
    // The debounced analyzer has not run yet (the teacher pasted, typed, or the
    // page was opened on an existing draft). Without this the pane stayed blank
    // until the next keystroke — it looked stuck right after switching tabs.
    wizardStructureSchedule(0);
    return `<div class="p-6 text-center border border-[#e2e8f0] dark:border-[#2a324b] rounded-xl bg-[#f8fafc] dark:bg-[#151a30] my-2">
      <strong class="block text-[13px] text-[#1e293b] dark:text-[#f8fafc] mb-1">Đang đọc cấu trúc tài liệu…</strong>
      <p class="text-[11px] text-[#64748b] dark:text-[#94a3b8] m-0">Tách chương/mục bằng quy tắc cục bộ — không gọi AI.</p>
    </div>`;
  }
  return typeof renderWizardStructureTree === 'function' ? renderWizardStructureTree() : '';
}

function wizardInputInsertSample() {
  wizardState.documentName = 'Bai-10-Quang-hop-o-thuc-vat.txt';
  wizardState.documentMeta = null;
  wizardState.documentId = null;
  wizardState.text = `BÀI 10: QUANG HỢP Ở THỰC VẬT

I. Khái niệm và vai trò của quang hợp
1. Khái niệm quang hợp
Quang hợp ở thực vật là quá trình lục lạp hấp thụ và sử dụng năng lượng ánh sáng để chuyển hóa CO2 và H2O thành hợp chất hữu cơ (C6H12O6), đồng thời giải phóng O2.
Phương trình tổng quát: 6CO2 + 12H2O --(ánh sáng, diệp lục)--> C6H12O6 + 6O2 + 6H2O.

2. Vai trò của quang hợp
- Cung cấp nguồn chất hữu cơ làm thức ăn cho sinh vật dị dưỡng.
- Cung cấp năng lượng cho mọi hoạt động sống của sinh giới qua chuỗi thức ăn.
- Cung cấp O2 cho hô hấp của sinh vật và tạo tầng ozone bảo vệ Trái Đất.
- Hấp thụ CO2 giúp điều hòa khí hậu toàn cầu.

II. Hệ sắc tố quang hợp
1. Các loại sắc tố
Hệ sắc tố quang hợp gồm 2 nhóm chính:
- Diệp lục (chlorophyll): Diệp lục a tham gia trực tiếp chuyển hóa năng lượng ánh sáng, diệp lục b hấp thụ và truyền năng lượng cho diệp lục a. Diệp lục tạo nên màu xanh lục của lá.
- Carotenoid (sắc tố vàng, cam, đỏ): Gồm carotene và xanthophyll. Carotenoid hấp thụ ánh sáng và truyền năng lượng cho diệp lục, đồng thời bảo vệ diệp lục khỏi bị phân hủy khi cường độ ánh sáng quá mạnh.

2. Sự phân bố và vai trò của lá cây đối với quang hợp
Lá cây là cơ quan quang hợp chính. Diện tích bề mặt lá rộng giúp thu nhận nhiều ánh sáng. Khí khổng phân bố nhiều ở biểu bì dưới giúp trao đổi khí CO2 và O2 thuận lợi.

III. Các giai đoạn của quá trình quang hợp
1. Pha sáng
Xảy ra tại màng thylakoid của lục lạp. Cần có ánh sáng mặt trời để quang phân ly nước và tổng hợp ATP, NADPH, giải phóng O2.
2. Pha tối (chu trình Calvin)
Xảy ra tại chất nền (stroma) của lục lạp. Sử dụng CO2 cùng ATP và NADPH từ pha sáng để tổng hợp glucose (C6H12O6). Không cần ánh sáng trực tiếp nhưng phụ thuộc vào sản phẩm của pha sáng.`;
  wizardClearMessages();
  if (typeof wizardResetStructure === 'function') {
    wizardResetStructure({ rebuild: true });
  }
  wizardState.inputTab = 'content';
  render();
}

/** Small status strip about the local AI runtime, reused by the analyze step. */
function wizardAiReadinessHint() {
  const machine = state.localAiMachine || {};
  const models = state.localAiModels || [];
  const selectedId = state.settings.ai && state.settings.ai.localModelId;
  const model = models.find(item => item.id === selectedId) || models[0];
  const running = machine.runtimeState === 'READY';
  const modelReady = Boolean(model && model.installed);
  const tone = running
    ? 'border-[#ddf4e8] bg-[#effaf5] dark:bg-[#132d24] dark:border-[#1e4a3b]'
    : 'border-[#f2e3c8] bg-[#fdf7ec] dark:bg-[#2d2413] dark:border-[#4a3b1e]';
  const title = running ? 'AI local đang chạy' : 'AI local chưa chạy';
  const detail = running
    ? `Model ${escapeHtml((model && (model.friendlyName || model.displayName)) || 'đang dùng')} sẵn sàng phân tích.`
    : modelReady
      ? 'Model đã tải. Hãy mở cửa sổ AI local và nhấn “Bắt đầu chạy”.'
      : 'Chưa có model. Hãy mở cửa sổ AI local để tải model Qwen trước khi phân tích.';
  return `<div class="flex gap-[12px] items-center border rounded-xl p-3 mb-4 ${tone}" id="wizardAiStatus" data-ai-running="${running ? 'true' : 'false'}">
    <span class="text-[20px] shrink-0">${running ? '🟢' : '🟡'}</span>
    <div class="min-w-0 flex-1">
      <strong class="text-[12px] block text-[#1e293b] dark:text-[#f8fafc]">${escapeHtml(title)}</strong>
      <small class="block text-[11px] text-[#64748b] dark:text-[#94a3b8] mt-0.5 leading-snug">${detail}</small>
    </div>
    <button type="button" class="btn btn-secondary btn-small shrink-0" data-wizard-action="open-ai">Mở AI local</button>
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
    wizardState.inputTab = 'structure';
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
