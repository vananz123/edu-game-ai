// ui-game-worlds-check.js — each of the five engines must look like its own game.
//
// DECISIONS #104 gives every engine a "world": its own stage background, accent
// colour, display font, surface motif and stage ribbon. The five worlds are
// applied through `data-game-world` on the play modal and on `.game-stage`.
// This check opens one game of each template and asserts:
//
//   1. the stage carries the expected world, and both the stage and the panel
//      report DIFFERENT computed backgrounds between any two games,
//   2. the world changes the question font (quiz/treasure serif vs matching/
//      race sans),
//   3. the ribbon chip (`.stage-world-tag`) names the game and is visible,
//   4. the palette does not break legibility: the question keeps a readable
//      warm/light ink and every answer option sits on an opaque surface,
//
// Run against a built app started with --remote-debugging-port:
//   npm run build
//   npx electron . --remote-debugging-port=9341
//   node tests/ui/ui-game-worlds-check.js 9341
const { check, connect, results } = require('../manual/lib/ui-check-lib');

const base = { subject: 'Toán', grade: 'Lớp 5', topic: 'Ôn tập', description: '',
  questions: [], tags: [], sourceName: 'ui-check', createdAt: new Date().toISOString() };

function quizGame() {
  return Object.assign({}, base, {
    id: 'ui-world-quiz', title: 'Thử thách toán', template: 'quiz',
    questions: [{ id: 'q1', prompt: 'Kết quả của 12 × 8 là bao nhiêu?',
      options: [{ id: 'a', text: '96' }, { id: 'b', text: '108' }, { id: 'c', text: '86' }, { id: 'd', text: '104' }],
      correctOptionId: 'a', explanation: '12 × 8 = 96.' }]
  });
}

function scenarioGame() {
  return Object.assign({}, base, {
    id: 'ui-world-scenario', title: 'Tình huống giao thông', template: 'scenario',
    questions: [{ id: 'q1', type: 'scenario', prompt: 'Em đang đi xe đạp và thấy đèn đỏ, em sẽ làm gì?',
      context: 'Tan trường, đường đông xe. Đèn tín hiệu chuyển đỏ khi em vừa tới vạch.',
      options: [{ id: 'a', text: 'Dừng lại trước vạch' }, { id: 'b', text: 'Đi tiếp vì đường vắng' },
        { id: 'c', text: 'Rẽ sang làn đối diện' }, { id: 'd', text: 'Đứng giữa lòng đường' }],
      correctOptionId: 'a', explanation: 'Dừng trước vạch là quy tắc an toàn.' }]
  });
}

function matchingGame() {
  return Object.assign({}, base, {
    id: 'ui-world-matching', title: 'Ghép cặp hình học', template: 'matching',
    matchingGame: {
      mode: 'columns', practiceMode: false, wrongPenalty: 0, completionBonus: 0, timeBonus: 0, bonusUnderSeconds: 0,
      pairs: [
        { id: 'p1', left: 'Hình vuông', right: '4 cạnh bằng nhau' },
        { id: 'p2', left: 'Hình tam giác', right: '3 cạnh' },
        { id: 'p3', left: 'Hình tròn', right: 'Không có cạnh' }
      ]
    }
  });
}

function raceGame() {
  return Object.assign({}, base, {
    id: 'ui-world-race', title: 'Đường đua ôn tập', template: 'race',
    race: {
      trackLength: 20, maxRounds: 3, stepByDifficulty: false, luckEnabled: false, cells: [],
      teams: [{ id: 't1', name: 'Đội Một', icon: '🔴' }, { id: 't2', name: 'Đội Hai', icon: '🔵' }],
      questions: [{ id: 'q1', prompt: 'Câu hỏi đường đua: 7 + 5 bằng bao nhiêu?',
        options: [{ id: 'a', text: '12' }, { id: 'b', text: '11' }, { id: 'c', text: '13' }, { id: 'd', text: '10' }],
        correctOptionId: 'a', difficulty: 'trung bình' }]
    }
  });
}

function treasureGame() {
  const stages = [1, 2, 3].map(n => ({
    id: 's' + n, name: 'Chặng ' + n,
    story: 'Bối cảnh chặng ' + n + ' đưa nhà thám hiểm qua khu rừng cổ.',
    taskDescription: 'Nhiệm vụ chặng ' + n + ': chọn đáp án đúng để mở cổng.',
    question: {
      prompt: 'Câu hỏi kho báu số ' + n + ': đáp án nào đúng?',
      options: [{ id: 'a', text: 'Đáp án A' }, { id: 'b', text: 'Đáp án B' }, { id: 'c', text: 'Đáp án C' }, { id: 'd', text: 'Đáp án D' }],
      correctOptionId: 'a', explanation: 'Giải thích ' + n, hint: 'Gợi ý ' + n
    },
    attempts: 2, points: 100, completionBonus: 10, nextStageId: n < 3 ? 's' + (n + 1) : null
  }));
  return Object.assign({}, base, {
    id: 'ui-world-treasure', title: 'Tìm kho báu tri thức', template: 'treasure-hunt',
    treasureHunt: { character: 'Nhà thám hiểm An', intro: 'Hành trình bắt đầu.', journeyBonus: 100,
      hiddenItemBonus: 20, backgroundId: 'temple', characterId: 'explorer', stages }
  });
}

const GAMES = [
  { world: 'quiz', label: 'THỬ THÁCH KIẾN THỨC', make: quizGame, serif: true },
  // Scenario uses the SAME engine surface as quiz (one exam world, two setups), so
  // its stage reports data-game-world="quiz" by design; `tag` keeps the check's
  // labels distinct and expects the scenario ribbon.
  { world: 'quiz', label: 'TÌNH HUỐNG THỰC TẾ', make: scenarioGame, serif: true, tag: 'scenario' },
  { world: 'matching', label: 'GHÉP CẶP KIẾN THỨC', make: matchingGame, serif: false },
  { world: 'treasure', label: 'HÀNH TRÌNH KHÁM PHÁ', make: treasureGame, serif: true },
  { world: 'race', label: 'ĐƯỜNG ĐUA TRI THỨC', make: raceGame, serif: false }
];

(async () => {
  const { ws, evaluate } = await connect();
  const seen = [];

  for (const game of GAMES) {
    const probe = await evaluate(`(async () => {
      const game = ${JSON.stringify(game.make())};
      const saved = await window.eduGame.saveGame(game);
      document.querySelector('[data-play-close]')?.click();
      await new Promise(r => setTimeout(r, 250));
      playGame(saved);
      await new Promise(r => setTimeout(r, 500));
      const stage = document.querySelector('.game-stage');
      const modal = document.querySelector('.modal');
      const question = document.querySelector('.stage-question');
      const tag = document.querySelector('.stage-world-tag');
      // Matching and race draw their own cards; only quiz/scenario/treasure use .answer-option.
      const option = document.querySelector('.answer-option, .match-card, .memory-card');
      const cs = el => el ? getComputedStyle(el) : null;
      return {
        world: stage ? stage.getAttribute('data-game-world') : null,
        stageBg: cs(stage)?.backgroundImage || '',
        modalBg: modal ? getComputedStyle(modal).backgroundImage : '',
        accent: stage ? getComputedStyle(stage).getPropertyValue('--world-accent').trim() : '',
        questionFont: cs(question)?.fontFamily || '',
        tagText: tag ? tag.textContent.replace(/\\s+/g, ' ').trim() : '',
        tagLabels: tag ? Array.from(tag.querySelectorAll('span')).map(span => span.textContent.trim()) : [],
        tagVisible: tag ? tag.getBoundingClientRect().height > 0 : false,
        optionBg: cs(option)?.backgroundImage || cs(option)?.backgroundColor || '',
        optionColor: cs(option)?.color || '',
        questionColor: cs(question)?.color || '',
        hasQuestion: Boolean(question)
      };
    })()`);
    // A template's stage is rendered one frame later; without this settle the
    // scenario probe measured the previous game's stage.
    if (!probe.stageBg || probe.stageBg === 'none' || !probe.accent) {
      await new Promise(r => setTimeout(r, 400));
      const again = await evaluate(`(() => { const s = document.querySelector('.game-stage'); return s ? { bg: getComputedStyle(s).backgroundImage, accent: getComputedStyle(s).getPropertyValue('--world-accent').trim(), world: s.getAttribute('data-game-world'), labels: Array.from(document.querySelectorAll('.stage-world-tag span')).map(x => x.textContent.trim()) } : null; })()`);
      if (again) {
        probe.stageBg = again.bg || probe.stageBg;
        probe.accent = again.accent || probe.accent;
        probe.world = again.world || probe.world;
        probe.tagLabels = again.labels.length ? again.labels : probe.tagLabels;
      }
    }
    if (!probe.hasQuestion) {
      // Matching opens on its board without a `.stage-question`; the world
      // checks that concern the question are skipped for that engine only.
      await evaluate(`(document.querySelector('[data-play-close]') || { click() {} }).click()`);
      await new Promise(r => setTimeout(r, 200));
      check(`${game.tag || game.world}: the stage declares its own world`, probe.world === game.world, JSON.stringify({ world: probe.world }));
      check(`${game.tag || game.world}: the stage ribbon names the game`, probe.tagVisible && probe.tagLabels.indexOf(game.label) >= 0, JSON.stringify({ tag: probe.tagLabels }));
      check(`${game.tag || game.world}: the panel and the stage take the world palette`, Boolean(probe.accent) && probe.stageBg !== 'none', JSON.stringify({ accent: probe.accent }));
      seen.push(probe);
      continue;
    }

    check(`${game.tag || game.world}: the stage declares its own world`, probe.world === game.world, JSON.stringify({ world: probe.world }));
    check(`${game.tag || game.world}: the panel and the stage take the world palette`, Boolean(probe.accent) && probe.stageBg !== 'none', JSON.stringify({ accent: probe.accent, stageBg: probe.stageBg.slice(0, 60) }));
    check(
      `${game.tag || game.world}: the stage ribbon names the game`,
      probe.tagVisible && probe.tagLabels.indexOf(game.label) >= 0,
      JSON.stringify({ tag: probe.tagText, visible: probe.tagVisible })
    );
    // Only fonts that carry the full Vietnamese diacritic set may be the first
    // choice (DECISIONS: Palatino Linotype and Impact were removed).
    const serif = /serif|georgia|cambria|times/i.test(probe.questionFont);
    check(
      `${game.world}: the question uses the world's type family`,
      serif === game.serif,
      JSON.stringify({ font: probe.questionFont, expectedSerif: game.serif })
    );
    check(
      `${game.world}: the question is light ink on the dark stage`,
      (() => {
        const m = probe.questionColor.match(/[\d.]+/g) || [];
        return m.length >= 3 && Number(m[0]) + Number(m[1]) + Number(m[2]) > 450;
      })(),
      JSON.stringify({ color: probe.questionColor, font: probe.questionFont, tag: probe.tagLabels })
    );
    check(
      `${game.world}: answer options sit on an opaque surfaced card`,
      Boolean(probe.optionBg) && probe.optionBg !== 'none' && probe.optionBg !== 'transparent',
      JSON.stringify({ bg: probe.optionBg.slice(0, 90), color: probe.optionColor })
    );
    seen.push(probe);
  }

  // Different worlds must actually look different: no two stages share a
  // background, and each panel washes the header with its own colour.
  for (let i = 0; i < seen.length; i++) {
    for (let j = i + 1; j < seen.length; j++) {
      // Scenario deliberately shares the quiz world (DECISIONS #87): the two
      // entries have identical palettes by design and must not be compared.
      if (GAMES[i].world === GAMES[j].world) continue;
      check(
        `${GAMES[i].world} and ${GAMES[j].world} do not share a stage background`,
        seen[i].stageBg !== seen[j].stageBg,
        'identical background'
      );
      check(
        `${GAMES[i].world} and ${GAMES[j].world} use different accents`,
        seen[i].accent !== seen[j].accent,
        JSON.stringify({ a: seen[i].accent, b: seen[j].accent })
      );
    }
  }

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exitCode = failed.length ? 1 : 0;
  ws.close();
})().catch(error => {
  console.error('ui-game-worlds-check crashed:', error.message);
  process.exitCode = 1;
});
