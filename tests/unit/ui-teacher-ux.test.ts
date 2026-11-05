import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('UI Teacher UX & Progressive Disclosure (Sprint 4)', async (t) => {
  const rootDir = path.resolve(__dirname, __dirname.includes('dist') ? '../../../' : '../../');
  const createSrc = fs.readFileSync(path.join(rootDir, 'src/renderer/pages/create.ts'), 'utf8');
  const chatSrc = fs.readFileSync(path.join(rootDir, 'src/renderer/features/lesson-chat.ts'), 'utf8');
  const componentsCss = fs.readFileSync(path.join(rootDir, 'src/renderer/styles/components.css'), 'utf8');

  await t.test('4.1: Progressive disclosure in create game form keeps core fields visible and folds advanced options', () => {
    assert.ok(createSrc.includes('class="create-advanced-options'), 'create.ts wraps advanced options in collapsible details');
    assert.ok(createSrc.includes('Tùy chọn nâng cao (Luật chơi, tính điểm, thi đấu)'), 'summary label is clear and descriptive');

    // All original form IDs must be present and functional for controller.ts
    const requiredIds = [
      'gameTitle',
      'gameSubject',
      'gameGrade',
      'questionCount',
      'setupScoringMode',
      'setupDifficulty',
      'setupDuration',
      'setupPoints',
      'setupStyle',
      'setupPlayers',
      'setupCompetition',
      'setupTimeBonus',
      'setupPointsEasy',
      'setupPointsMedium',
      'setupPointsHard'
    ];
    for (const id of requiredIds) {
      assert.ok(createSrc.includes(`id="${id}"`), `form field id="${id}" is preserved`);
    }
  });

  await t.test('4.2: Game templates have pedagogical purpose tags for teacher clarity', () => {
    const purposes = [
      'Khởi động & Ôn tập',
      'Kỹ năng thực tế',
      'Thuật ngữ & Ghi nhớ',
      'Khám phá chủ đề',
      'Thi đấu đồng đội'
    ];
    for (const purpose of purposes) {
      assert.ok(createSrc.includes(purpose), `template has pedagogical purpose "${purpose}"`);
    }
  });

  await t.test('4.3: Lesson chat offers teacher-friendly completeness badge and dynamic attached hint', () => {
    assert.ok(chatSrc.includes('Đầy đủ 100%'), 'chat reads html includes friendly 100% badge');
    assert.ok(chatSrc.includes('Trích đoạn'), 'chat reads html includes friendly excerpt badge');
    assert.ok(chatSrc.includes('AI sẽ đối chiếu và trả lời bám sát nội dung'), 'composer displays friendly dynamic hint when documents attached');
  });

  await t.test('4.4: CSS supports collapsible progressive disclosure summary styling', () => {
    assert.ok(componentsCss.includes('.create-advanced-options summary'), 'components.css defines summary styling');
    assert.ok(componentsCss.includes('::-webkit-details-marker'), 'hides native details marker');
  });
});
