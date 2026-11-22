import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('UI Identity & Form Labels (Sprint 1)', async (t) => {
  const rootDir = path.resolve(__dirname, __dirname.includes('dist') ? '../../../' : '../../');
  const createSrc = fs.readFileSync(path.join(rootDir, 'src/renderer/pages/create.ts'), 'utf8');
  const editorPageSrc = fs.readFileSync(path.join(rootDir, 'src/renderer/features/editor/page.ts'), 'utf8');
  const sharedSrc = fs.readFileSync(path.join(rootDir, 'src/renderer/shared.ts'), 'utf8');
  // #307: the per-template colour theme moved out of inline Utility classes and into one
  // CSS block, so this test has to read the stylesheet too instead of the string map that
  // used to live in shared.ts.
  const componentsCss = fs.readFileSync(path.join(rootDir, 'src/renderer/styles/components.css'), 'utf8');

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

  await t.test('every template keeps its own accent theme, now declared in CSS', () => {
    // #307: one tinted cover per template instead of six copies of a Utility map.
    const accents = {
      quiz: '#b45309',
      scenario: '#047857',
      matching: '#6d28d9',
      'treasure-hunt': '#be123c',
      race: '#1d4ed8',
      connection: '#0e7490'
    };
    for (const [template, ink] of Object.entries(accents)) {
      assert.ok(componentsCss.includes(`.lib-card.is-${template} .lib-card-cover`), `.lib-card.is-${template} has a cover tint`);
      assert.ok(componentsCss.includes(`.lib-card.is-${template} .lib-card-glyph{color:${ink}}`), `.lib-card.is-${template} uses ${ink}`);
    }
    // The card asks for the class without naming colours in JavaScript, and the glyph is a
    // registry icon rather than a system emoji the renderer cannot control.
    assert.ok(sharedSrc.includes("' is-' + template"), 'the card derives its theme class from the template');
    assert.ok(sharedSrc.includes('CARD_GLYPH'), 'the card glyph comes from the icon registry');
    assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(sharedSrc.split('function gameCard')[1] || ''), 'no emoji inside gameCard');
    assert.ok(sharedSrc.includes('function emptyStateIllustrationSvg'), 'emptyState has mascot SVG');
  });
});
