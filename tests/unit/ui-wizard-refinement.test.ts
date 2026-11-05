import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('UI Wizard UX Refinement (Decision #195)', async (t) => {
  const rootDir = path.resolve(__dirname, __dirname.includes('dist') ? '../../../' : '../../');
  const inputSrc = fs.readFileSync(path.join(rootDir, 'src/renderer/features/wizard/step-input.ts'), 'utf8');
  const analysisSrc = fs.readFileSync(path.join(rootDir, 'src/renderer/features/wizard/step-analysis.ts'), 'utf8');
  const recommendSrc = fs.readFileSync(path.join(rootDir, 'src/renderer/features/wizard/step-recommend.ts'), 'utf8');
  const configureSrc = fs.readFileSync(path.join(rootDir, 'src/renderer/features/wizard/step-configure.ts'), 'utf8');
  const generateSrc = fs.readFileSync(path.join(rootDir, 'src/renderer/features/wizard/step-generate.ts'), 'utf8');

  await t.test('Sprint A: Form labels use sentence/title case without aggressive ALLCAPS', () => {
    // Step 1
    assert.ok(!inputSrc.includes('TÊN BÀI HỌC / TÀI LIỆU'), 'Step 1 doc name label is not shouting ALLCAPS');
    assert.ok(inputSrc.includes('Tên bài học / tài liệu'), 'Step 1 doc name uses clean title case');
    assert.ok(!inputSrc.includes('NỘI DUNG VĂN BẢN ĐẦY ĐỦ *'), 'Step 1 doc text label is not shouting ALLCAPS');
    assert.ok(inputSrc.includes('Nội dung giáo án *'), 'Step 1 doc text uses friendly title case');

    // Step 2
    assert.ok(!analysisSrc.includes('<label>CHỦ ĐỀ</label>'), 'Step 2 topic label is not ALLCAPS');
    assert.ok(analysisSrc.includes('<label>Chủ đề</label>'), 'Step 2 topic uses standard case');
    assert.ok(!analysisSrc.includes('<label>SỐ MỤC TIÊU</label>'), 'Step 2 objective count is not ALLCAPS');
    assert.ok(analysisSrc.includes('<label>Số mục tiêu</label>'), 'Step 2 objective count uses standard case');
    assert.ok(analysisSrc.includes('Lưu ý &amp; điểm cần xem lại'), 'Step 2 uncertainty header is teacher-friendly');

    // Step 4
    assert.ok(!configureSrc.includes('<label>TÊN TRÒ CHƠI *</label>'), 'Step 4 title label is not ALLCAPS');
    assert.ok(configureSrc.includes('<label>Tên trò chơi *</label>'), 'Step 4 title uses standard case');
    assert.ok(!configureSrc.includes('<label>CHÒM SAO</label>'), 'Constellation label is not ALLCAPS');
    assert.ok(configureSrc.includes('<label>Chòm sao</label>'), 'Constellation label uses standard case');
  });

  await t.test('Sprint A: Technical jargon and verbose descriptions are simplified with tooltips', () => {
    // Technical subtitle in kind picker dropped
    assert.ok(!inputSrc.includes('quy tắc trước, bộ đọc hiểu chỉ xác nhận'), 'Technical parser subtitle is dropped from input kind picker');
    // Model CPU technical explanation is preserved in tooltip on info icon
    assert.ok(configureSrc.includes('title="Model Qwen 3.5 trên CPU chưa trả nội dung suy luận'), 'Technical Qwen model info is preserved in tooltip');
    assert.ok(configureSrc.includes('data-icon="info"'), 'Info icon used for tooltip');
    // Step 5 quality text is clear and concise
    assert.ok(generateSrc.includes('✓ Đã kiểm tra: Nội dung hoàn chỉnh'), 'Step 5 quality text is positive and concise');
  });

  await t.test('Sprint B: Action buttons and navigation are streamlined', () => {
    // Step 1 secondary button completely removed
    assert.ok(!inputSrc.includes('data-page="create"'), 'Step 1 button to bypass wizard is completely removed');
    assert.ok(!inputSrc.includes('Tôi đã biết muốn tạo trò chơi nào'), 'Old bypass text is removed');

    // Step 2 layout: 4 buttons kept, concise labels
    assert.ok(analysisSrc.includes('data-wizard-action="back"'), 'Step 2 has back button');
    assert.ok(analysisSrc.includes('data-wizard-action="rerun"'), 'Step 2 has rerun button');
    assert.ok(analysisSrc.includes('data-wizard-action="quick-generate"'), 'Step 2 has quick generate button');
    assert.ok(analysisSrc.includes('id="wizardNextBtn"'), 'Step 2 has next button');
    assert.ok(analysisSrc.includes('Quay lại</button>'), 'Back button label is shortened to Quay lại');
    assert.ok(analysisSrc.includes('Phân tích lại</button>'), 'Rerun button label is concise');
    assert.ok(analysisSrc.includes('Tạo nhanh</button>'), 'Quick generate button label is shortened to Tạo nhanh');
    assert.ok(analysisSrc.includes('Tiếp tục <span data-icon="arrow-right"'), 'Next button label is shortened to Tiếp tục');

    // Step 3 layout
    assert.ok(recommendSrc.includes('justify-between gap-2 flex-wrap'), 'Step 3 actions row uses clean flex layout');
  });

  await t.test('Sprint C: Step 4 uses progressive disclosure for advanced settings', () => {
    assert.ok(configureSrc.includes('create-advanced-options'), 'Step 4 uses collapsible details container');
    assert.ok(configureSrc.includes('Tuỳ chọn nâng cao (Luật chơi, tính điểm, thi đấu)'), 'Step 4 summary clearly labels advanced options');
    assert.ok(configureSrc.includes('wizardConfigCoreTypeFields'), 'Core fields function defined');
    assert.ok(configureSrc.includes('wizardConfigAdvancedTypeFields'), 'Advanced fields function defined');
    assert.ok(configureSrc.includes('wizardConfigTypeFields'), 'Backward-compatible combined fields function maintained');
  });
});
