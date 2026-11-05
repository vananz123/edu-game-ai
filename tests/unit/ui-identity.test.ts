import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('UI Identity & Form Labels (Sprint 1)', async (t) => {
  const rootDir = path.resolve(__dirname, __dirname.includes('dist') ? '../../../' : '../../');
  const createSrc = fs.readFileSync(path.join(rootDir, 'src/renderer/pages/create.ts'), 'utf8');
  const editorPageSrc = fs.readFileSync(path.join(rootDir, 'src/renderer/features/editor/page.ts'), 'utf8');
  const sharedSrc = fs.readFileSync(path.join(rootDir, 'src/renderer/shared.ts'), 'utf8');

  await t.test('form labels in create.ts do not contain aggressive ALL CAPS shouting', () => {
    const shoutingLabels = [
      'TÊN TRÒ CHƠI',
      'MÔN HỌC',
      'SỐ CÂU HỎI',
      'CHẾ ĐỘ TÍNH ĐIỂM',
      'ĐỘ KHÓ',
      'THỜI LƯỢNG (PHÚT)',
      'ĐIỂM / CÂU ĐÚNG',
      'PHONG CÁCH',
      'SỐ NGƯỜI CHƠI',
      'CHẾ ĐỘ THI ĐẤU',
      'ĐIỂM THƯỞNG NHANH',
      'ĐIỂM · DỄ',
      'ĐIỂM · TRUNG BÌNH',
      'ĐIỂM · KHÓ'
    ];
    for (const label of shoutingLabels) {
      assert.ok(!createSrc.includes(`>${label}<`), `create.ts should not have uppercase label "${label}"`);
    }
  });

  await t.test('form labels in editor/page.ts use standard capitalization', () => {
    const shoutingLabels = [
      'TÊN TRÒ CHƠI',
      'THỂ LOẠI',
      'MÔN HỌC',
      'MÔ TẢ',
      'MINH HỌA',
      'CÁCH CHƠI',
      'MẪU NHÀ 3D'
    ];
    for (const label of shoutingLabels) {
      assert.ok(!editorPageSrc.includes(`>${label}<`), `editor/page.ts should not have uppercase label "${label}"`);
    }
  });

  await t.test('templateLabel in shared.ts uses standard case instead of ALL CAPS', () => {
    assert.ok(sharedSrc.includes("quiz: 'Đấu trường kiến thức'"), 'quiz label is title case');
    assert.ok(sharedSrc.includes("scenario: 'Thử thách tình huống'"), 'scenario label is title case');
    assert.ok(sharedSrc.includes("matching: 'Ghép cặp kiến thức'"), 'matching label is title case');
    assert.ok(sharedSrc.includes("'treasure-hunt': 'Giải mã kho báu'"), 'treasure label is title case');
    assert.ok(sharedSrc.includes("race: 'Đường đua chinh phục'"), 'race label is title case');
    assert.ok(!sharedSrc.includes('ĐẤU TRƯỜNG KIẾN THỨC'), 'shared.ts has no ALL CAPS ĐẤU TRƯỜNG KIẾN THỨC');
  });

  await t.test('shared.ts defines template-specific theme colors and mascot illustration', () => {
    assert.ok(sharedSrc.includes('templateThemes = {'), 'templateThemes defined');
    assert.ok(sharedSrc.includes('border-l-[#f59e0b]'), 'quiz has gold accent border');
    assert.ok(sharedSrc.includes('border-l-[#10b981]'), 'scenario has emerald accent border');
    assert.ok(sharedSrc.includes('border-l-[#8b5cf6]'), 'matching has purple accent border');
    assert.ok(sharedSrc.includes('border-l-[#f43f5e]'), 'treasure has rose accent border');
    assert.ok(sharedSrc.includes('border-l-[#3b82f6]'), 'race has blue accent border');
    assert.ok(sharedSrc.includes('border-l-[#06b6d4]'), 'constellation has cyan accent border');
    assert.ok(sharedSrc.includes('function emptyStateIllustrationSvg'), 'emptyState has mascot SVG');
  });
});
