#!/usr/bin/env node
/**
 * #372 — nhãn thừa trong Cài đặt, đặc biệt tab "Nhà cung cấp AI".
 *
 * Chủ dự án: "loại bỏ những label không cần thiết gây loạn trong trang cài đặt, đặc biệt là phần
 * nhà cung cấp AI".
 *
 * Vì "rối" là một cảm nhận, cổng này đo bốn thứ đếm được:
 *   1. Không còn nhãn nào nói lại một điều đã có ở chỗ khác: dòng footnote "Kiểm tra gửi một yêu
 *      cầu thật…" từng giống nhau ở cả bốn thẻ, và "RAM đạt mức khuyến nghị" từng là câu thứ ba
 *      nói về RAM trong cùng một thẻ.
 *   2. Dòng "lý do" của một nhà cung cấp CHƯA cấu hình biến mất (nó chỉ nhắc lại chip trạng thái),
 *      nhưng lý do của trạng thái KHÁC THƯỜNG thì vẫn còn — bỏ nhãn không có nghĩa là bỏ thông tin.
 *   3. Nhãn tab "Nhà cung cấp AI" không còn chip riêng (hai chip đó đã có bản đầy đủ trong header).
 *   4. KHÔNG MẤT THÔNG TIN: cả bốn nhà cung cấp vẫn hiện đúng một lần, mỗi thẻ vẫn có chip trạng
 *      thái, và header panel vẫn nói trạng thái AI local + cloud.
 *
 * Usage: `node tests/ui/ui-settings-ai-labels-check.js [port]`.
 */
process.argv[2] = process.argv[2] || process.env.CDP_PORT || '9382';

const { connect, check, results } = require('../manual/lib/ui-check-lib');

const PANEL = String.raw`(() => {
  const panel = document.querySelector('.settings-panel, [data-settings-panel], #pageContent');
  const text = panel ? panel.innerText.replace(/\s+/g, ' ') : '';
  const count = (needle) => text.split(needle).length - 1;
  const tabs = [...document.querySelectorAll('.settings-tab')].map((tab) => ({
    text: tab.innerText.replace(/\s+/g, ' ').trim(),
    chips: tab.querySelectorAll('span[title]').length,
  }));
  const cards = [...document.querySelectorAll('[data-ai-provider]')].map((card) => ({
    id: card.dataset.aiProvider || '',
    status: card.dataset.aiProviderStatus || '',
    chips: card.querySelectorAll('[data-ai-provider-chip]').length,
    reasons: card.querySelectorAll('[data-ai-provider-reason]').length,
    keyState: card.querySelectorAll('[data-ai-key-state]').length,
    label: (card.querySelector('strong') || {}).innerText || '',
    text: card.innerText.replace(/\s+/g, ' '),
  }));
  // Chip của header panel là HAI span duy nhất nói trạng thái AI local và cloud. Chọn theo nội
  // dung chứ không theo class tiện ích (class Tailwind đổi là hỏng phép đo, còn câu chữ thì không).
  const headerChips = [...document.querySelectorAll('span')]
    .filter((el) => {
      const text = (el.innerText || '').trim();
      if (!/^(✓ |○ )?(Sẵn sàng|Chưa cài đầy đủ|Chưa có API key|\d+\/\d+ sẵn sàng)$/u.test(text)) return false;
      return !el.closest('[data-ai-provider]');
    }).length;
  return {
    counts: {
      testFootnote: count('Kiểm tra gửi một yêu cầu thật'),
      ramOk: count('RAM đạt mức khuyến nghị'),
      keyMissing: count('Chưa lưu khoá'),
      pageTrail: 0,
    },
    tabs,
    cards,
    headerChips,
    // Tên nhà cung cấp xuất hiện BAO NHIÊU lần NGOÀI các thẻ (dải "Cho trò chơi mới" từng có bốn
    // chip tên — lặp lại đúng tiêu đề thẻ).
    outsideCardNames: ['Gemini (Google)', 'ChatGPT (OpenAI)', 'OpenCode Zen', 'API tương thích OpenAI (tự cấu hình)']
      .map((name) => {
        const cardsText = [...document.querySelectorAll('[data-ai-provider]')].map((el) => el.innerText).join(' ');
        const all = count(name);
        const inCards = cardsText.split(name).length - 1;
        return { name, outside: all - inCards };
      }),
    // Mỗi tên nhà cung cấp xuất hiện đúng một lần TRONG CÁC THẺ. (Nó còn xuất hiện ở dải chính
    // sách "Cho trò chơi: tự chọn nhà cung cấp sẵn sàng" phía trên — đó là chỗ khác, có tác dụng
    // khác: nói thứ tự fallback, không phải lặp lại tiêu đề thẻ.)
    providerNames: cards.map((card) => ({ name: card.label, seen: card.text.split(card.label).length - 1 })),
  };
})()`;

(async () => {
  const c = await connect();
  await c.settle(1000);

  await c.evaluate(`document.querySelector('.nav-item[data-page="settings"]').click(); 1`);
  await c.settle(900);
  // Tab "Nhà cung cấp AI" chỉ tồn tại khi Cloud AI chưa cấu hình đủ (#305). Nếu nó đã biến mất,
  // cổng này không đo được điều nó hứa — nói thẳng thay vì cho qua.
  const opened = await c.evaluate(String.raw`(() => {
    const tab = [...document.querySelectorAll('.settings-tab')].find((el) => /Nhà cung cấp AI/u.test(el.innerText || ''));
    if (!tab) return false;
    tab.click();
    return true;
  })()`);
  if (opened !== true) {
    console.log('ui-settings-ai-labels-check: KHÔNG ĐO ĐƯỢC — tab "Nhà cung cấp AI" không có mặt (máy này đã cấu hình AI đủ, xem #305).');
    process.exit(2);
  }
  await c.settle(900);

  // Tab con "AI cloud" để thấy cả bốn thẻ nhà cung cấp.
  await c.evaluate(String.raw`(() => {
    const sub = [...document.querySelectorAll('button')].find((el) => /^AI cloud$/u.test((el.innerText || '').trim()));
    if (sub) sub.click();
    return 1;
  })()`);
  await c.settle(800);

  const m = await c.evaluate(PANEL);

  // 1. Nhãn nói lại điều đã có — phải bằng 0.
  check('đã bỏ footnote "Kiểm tra gửi một yêu cầu thật…" (từng lặp ở cả 4 thẻ)', m.counts.testFootnote === 0, String(m.counts.testFootnote));
  check('đã bỏ câu RAM thứ ba "RAM đạt mức khuyến nghị"', m.counts.ramOk === 0, String(m.counts.ramOk));
  check('đã bỏ "Chưa lưu khoá." khi nhà cung cấp chưa có khoá', m.counts.keyMissing === 0, String(m.counts.keyMissing));

  // 2. Nhãn tab không còn chip riêng.
  const aiTab = m.tabs.find((tab) => /^Nhà cung cấp AI/u.test(tab.text));
  check('nhãn tab "Nhà cung cấp AI" đứng một mình, không chip', !!aiTab && aiTab.text === 'Nhà cung cấp AI' && aiTab.chips === 0,
    aiTab ? aiTab.text + ' / chips=' + aiTab.chips : '(không thấy tab)');
  const otherTabWithChip = m.tabs.filter((tab) => /Phong cách|Giao diện/u.test(tab.text) && tab.chips > 0).length;
  check('chip của các tab khác vẫn còn (chỉ bỏ đúng chỗ thừa)', otherTabWithChip === 2, String(otherTabWithChip));

  // 3. Dòng lý do: bỏ khi chỉ nhắc lại chip, giữ khi là dữ kiện.
  const notConfigured = m.cards.filter((card) => card.status === 'not-configured');
  const configured = m.cards.filter((card) => card.status !== 'not-configured');
  check('thẻ chưa cấu hình không còn dòng lý do trùng chip',
    notConfigured.length >= 2 && notConfigured.every((card) => card.reasons === 0), JSON.stringify(notConfigured.map((c2) => [c2.id, c2.reasons])));
  check('thẻ ở trạng thái khác thường VẪN có lý do (không mất thông tin)',
    configured.every((card) => card.reasons === 1), JSON.stringify(configured.map((c2) => [c2.id, c2.reasons])));

  // 4. Không mất thông tin: 4 nhà cung cấp, mỗi thẻ một chip trạng thái, header còn 2 chip.
  check('vẫn đủ bốn nhà cung cấp, mỗi tên đúng một lần trong thẻ',
    m.providerNames.length === 4 && m.providerNames.every((row) => row.seen === 1), JSON.stringify(m.providerNames));
  check('mỗi thẻ vẫn có đúng một chip trạng thái', m.cards.length === 4 && m.cards.every((card) => card.chips === 1),
    JSON.stringify(m.cards.map((card) => [card.id, card.chips])));
  check('header panel vẫn nói trạng thái AI local + cloud (2 chip)', m.headerChips === 2, String(m.headerChips));
  check('không còn chip lặp tên nhà cung cấp ngoài các thẻ',
    m.outsideCardNames.every((row) => row.outside === 0), JSON.stringify(m.outsideCardNames));
  check('thẻ OpenCode không nhắc "Chưa dùng cho luồng tạo trò chơi" quá một lần',
    (m.cards.find((card) => card.id === 'opencode') || { text: '' }).text.split('Chưa dùng cho luồng tạo trò chơi').length - 1 <= 1,
    (m.cards.find((card) => card.id === 'opencode') || { text: '' }).text.slice(0, 120));

  // Trả về tab local cho trạng thái ban đầu.
  await c.evaluate(String.raw`(() => {
    const sub = [...document.querySelectorAll('button')].find((el) => /^AI local$/u.test((el.innerText || '').trim()));
    if (sub) sub.click();
    return 1;
  })()`);
  await c.settle(500);

  const failed = results.filter((row) => !row.ok).length;
  console.log('\nui-settings-ai-labels-check: ' + (results.length - failed) + '/' + results.length + ' passed');
  process.exit(failed ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
