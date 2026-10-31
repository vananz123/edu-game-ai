/**
 * Offline structure analyzer tests
 * (docs/archive/specs/update_AI_plan_7.txt §3.2, §3.4, §3.5, §5.1, §10.1).
 *
 * These tests exist because the analyzer is the only thing standing between a
 * teacher's tick and "the AI read text I excluded": they pin the guarantees the
 * spec names explicitly — headings are never invented from list items, ranges
 * cover the whole document, and a broken analyzer still lets a teacher proceed.
 */
import assert from 'node:assert/strict';
import {
  LESSON_STRUCTURE_VERSION,
  MAX_STRUCTURE_NODES,
  MAX_STRUCTURE_TOTAL_NODES,
  NO_TEXT_LAYER_MIN_CHARS,
  buildBlocks,
  buildLessonStructure,
  detectHeadingStyle,
  detectHeadings,
  flatten,
  isContentLine,
  isNumberedListBlock,
  repeatedMarkers,
  splitSourceLines
} from '../../src/services/lesson/lesson-structure';
import { normalizeLessonSource } from '../../src/services/lesson/lesson-chunker';

const LESSON = [
  'Giáo án Khoa học 6',
  '',
  'I. MỤC TIÊU',
  'Học sinh mô tả được quá trình bay hơi của nước.',
  'Học sinh giải thích được vai trò của nhiệt độ.',
  '',
  'II. THIẾT BỊ DẠY HỌC',
  '| Thời gian | Nhiệt độ | Ghi chú |',
  '| --- | --- | --- |',
  '| 0 phút | 20°C | Bắt đầu |',
  '| 5 phút | 45°C | Sôi nhẹ |',
  '',
  'III. TIẾN TRÌNH DẠY HỌC',
  'Hoạt động 1: Khởi động',
  'Giáo viên đặt câu hỏi mở đầu tiết học.',
  '',
  'Hoạt động 2: Khám phá',
  'Câu hỏi: Khi nước sôi thì hiện tượng gì xảy ra?',
  'Đáp án: Nước chuyển thành hơi nước.',
  '',
  'IV. TỔNG KẾT',
  'Giáo viên chốt lại kiến thức trọng tâm.'
].join('\n');

function find(structure: ReturnType<typeof buildLessonStructure>, title: string) {
  const node = structure.nodes.find(item => item.title === title);
  assert.ok(node, `expected a node titled "${title}", got: ${structure.nodes.map(n => n.title).join(' | ')}`);
  return node;
}

function run(): void {
  // --- Line splitting -------------------------------------------------------
  // A trailing newline must not swallow the blank-line separator: that bug made
  // every document a single block and produced zero headings.
  const lines = splitSourceLines('a\n\nb');
  assert.deepEqual(lines.map(line => line.text), ['a\n', '\n', 'b']);
  assert.equal(lines[2].start, 3);

  // --- Headings -------------------------------------------------------------
  // `LESSON` is written the way an extractor emits it: a blank line between
  // paragraphs. See the "no blank lines" section below for the PDF/DOCX shape.
  const structure = buildLessonStructure(LESSON);
  assert.equal(structure.version, LESSON_STRUCTURE_VERSION);
  assert.notEqual(structure.degraded, true, `analyzer degraded: ${structure.degradedReason}`);
  assert.equal(structure.empty, false);

  const titles = structure.nodes.map(node => node.title);
  assert.deepEqual(titles, [
    'Toàn bộ tài liệu',
    'Giáo án Khoa học 6',
    'I. MỤC TIÊU',
    'II. THIẾT BỊ DẠY HỌC',
    'III. TIẾN TRÌNH DẠY HỌC',
    'Hoạt động 1: Khởi động',
    'Hoạt động 2: Khám phá',
    'IV. TỔNG KẾT'
  ], `unexpected tree: ${titles.join(' | ')}`);
  // The document title is a REAL line of the source, so it is a heading like any
  // other (§3.2: never invent a title). The analyser must not invent a wrapper for
  // the text before the first heading — it is simply the title's own section.
  const titleNode = structure.root.children[0];
  assert.equal(titleNode.title, LESSON.split('\n')[0]);
  assert.equal(titleNode.charStart, 0);
  assert.equal(titleNode.charEnd, LESSON.indexOf('I. MỤC TIÊU'));
  // The first *numbered* heading therefore starts at its own offset, not at 0.
  assert.equal(structure.root.children[1].charStart, LESSON.indexOf('I. MỤC TIÊU'));
  // "Hoạt động 1/2" are depth-implying headings, and they nest under III.
  // The title of each subsection must be exactly its source line; this is where
  // an ASCII-only `\b` used to drop the leading keyword from the title.
  const processSection = find(structure, 'III. TIẾN TRÌNH DẠY HỌC');
  assert.deepEqual(processSection.children.map(node => node.title), ['Hoạt động 1: Khởi động', 'Hoạt động 2: Khám phá']);

  // §10.1: the table is data, never a heading, and no node is titled after a row.
  assert.ok(!titles.some(title => title.includes('|')), 'a table row became a heading');
  // The school name is the FIRST line, so it is the document title and a section of
  // its own; what must never happen is a repeated one becoming a section per page
  // (the `paged` case below covers that).

  // --- The extractor shape: NO blank lines at all ---------------------------
  // `pdf-parse` / `mammoth` put one `\n` after every non-empty line, so the whole
  // lesson arrives as ONE block. Measured 2026-10-24: this exact text used to lose
  // "Hoạt động 1" entirely. The document-title line is the one thing that may go:
  // rule 1 needs a title to *start* a block, and here it is glued to "I. MỤC TIÊU".
  const extracted = LESSON.split('\n').filter(line => line.trim()).join('\n');
  const dense = buildLessonStructure(extracted);
  const denseTitles = dense.nodes.map(node => node.title);
  assert.deepEqual(denseTitles.filter(title => !/Giáo án/.test(title)),
    structure.nodes.map(node => node.title).filter(title => !/Giáo án/.test(title)),
    `extractor-shaped text lost sections: ${denseTitles.join(' | ')}`);
  assert.ok(!denseTitles.some(title => title.includes('|')), 'a table row became a heading');
  const denseSections = dense.root.children;
  assert.equal(denseSections[0].charStart, extracted.indexOf('I. MỤC TIÊU'));
  assert.equal(denseSections[denseSections.length - 1].charEnd, extracted.length);
  for (let index = 1; index < denseSections.length; index += 1) {
    assert.ok(denseSections[index].charStart >= denseSections[index - 1].charEnd,
      `extractor-shaped sections overlap: ${denseSections[index - 1].title} / ${denseSections[index].title}`);
  }
  for (const node of dense.nodes) {
    if (node.id === dense.root.id) continue;
    const title = node.title.replace(/…$/, '');
    assert.equal(extracted.slice(node.charStart, node.charStart + title.length), title,
      `node "${node.title}" does not start at its own offset`);
  }
  assert.equal(dense.headingsFound, dense.nodes.length - 1);

  // --- A page header is removed by frequency, not by block shape -------------
  // In an extractor-shaped document the header is never a one-line block, so
  // "single-line block" counting let the school's name become a section per page.
  const paged = buildLessonStructure([
    'TRƯỜNG THCS NGUYỄN HUỆ',
    'Giáo án Khoa học 6',
    'I. MỤC TIÊU',
    'Học sinh mô tả được quá trình bay hơi của nước.',
    'TRƯỜNG THCS NGUYỄN HUỆ',
    'II. THIẾT BỊ DẠY HỌC',
    'Chuẩn bị cốc nước và nhiệt kế.',
    'TRƯỜNG THCS NGUYỄN HUỆ',
    'III. TIẾN TRÌNH DẠY HỌC',
    'Giáo viên hướng dẫn học sinh làm thí nghiệm.'
  ].join('\n'));
  assert.ok(!paged.nodes.some(node => node.title === 'TRƯỜNG THCS NGUYỄN HUỆ'),
    'a page header repeated inside paragraphs became a heading');
  assert.ok(paged.nodes.some(node => node.title === 'III. TIẾN TRÌNH DẠY HỌC'),
    'the real sections around the repeated header must survive');

  // Two lessons in one file may repeat a section title: the second one is a real,
  // selectable section. `\n` is spelled via `String.fromCharCode(10)` on purpose —
  // a literal line break in this source file glues lines together and hides the bug.
  const NL = String.fromCharCode(10);
  const repeatedSource = [
    'IV. Tổng kết',
    'Giáo viên chốt lại kiến thức trọng tâm của buổi học hôm nay.',
    '',
    'IV. Tổng kết',
    'Giáo viên giao bài tập về nhà cho học sinh cả lớp.'
  ].join(NL);
  const repeated = buildLessonStructure(repeatedSource);
  const repeatedTitles = repeated.nodes.map(node => `${node.title}@${node.charStart}`);
  assert.deepEqual(repeatedTitles, ['Toàn bộ tài liệu@0', 'IV. Tổng kết@0', `IV. Tổng kết@${repeatedSource.indexOf('IV. Tổng kết', 1)}`],
    `two lessons with the same section title must both be selectable: ${repeatedTitles.join(' | ')}`);

  // --- Every list is still judged by its own contents (§10.1) ---------------
  const listOnly = buildLessonStructure('1. Bỏ rác\n2. Phân loại\n3. Tái chế\n4. Ủ phân\n5. Khác\n');
  assert.equal(listOnly.headingsFound, 0, 'a numbered list produced headings');
  // The same list one line per line, as an extractor writes it: still no headings.
  assert.equal(buildLessonStructure('1. Bỏ rác\n2. Phân loại\n3. Tái chế\n4. Ủ phân\n5. Khác').headingsFound, 0,
    'a numbered list became a table of contents');

  // Every heading range must start at its own text (offsets, not copies).
  for (const node of structure.nodes) {
    if (node.id === structure.root.id) continue;
    const title = node.title.replace(/…$/, '');
    assert.equal(LESSON.slice(node.charStart, node.charStart + title.length), title,
      `node "${node.title}" does not start at its own offset`);
  }

  // The tree covers the whole document in order. Only SECTIONS that are not each
  // other's ancestor may not overlap — a parent's range deliberately CONTAINS its
  // children's, because ticking a parent must send its subtree.
  const sections = structure.root.children;
  for (let index = 1; index < sections.length; index += 1) {
    assert.ok(sections[index].charStart >= sections[index - 1].charEnd,
      `sections overlap: ${sections[index - 1].title} / ${sections[index].title}`);
  }
  assert.equal(sections[0].charStart, 0, 'the document title section must start at offset 0');
  // Every numbered section begins exactly at its own heading line — a range may only
  // be wider than its heading when it is the title line at the very start.
  assert.equal(sections[1].charStart, LESSON.indexOf('I. MỤC TIÊU'));
  assert.equal(sections[sections.length - 1].charEnd, LESSON.length);
  // The parent swallows its own subsections: ticking it must send their text too.
  const parentSection = find(structure, 'III. TIẾN TRÌNH DẠY HỌC');
  assert.equal(parentSection.children.length, 2);
  assert.equal(parentSection.charEnd, parentSection.children[parentSection.children.length - 1].charEnd,
    'a parent must cover its whole subtree');
  assert.ok(parentSection.charStart < parentSection.children[0].charStart,
    "a parent must start before its first child, or its own body is unselectable");
  // Extending only the innermost open heading used to leave the parent ending at its
  // first child's start; every child must sit strictly inside its parent.
  for (const child of parentSection.children) {
    assert.ok(child.charStart >= parentSection.charStart && child.charEnd <= parentSection.charEnd,
      `child "${child.title}" escapes its parent's range`);
  }

  // Numbered headings are marked low-confidence so the teacher can check them.
  assert.ok(structure.lowConfidence >= 4, 'numbered headings must be flagged low-confidence');
  assert.equal(structure.headingsFound, structure.nodes.length - 1);

  process.stdout.write('lesson-structure: part 1 ok\n');

  // --- What must never become a heading (§10.1) ----------------------------
  assert.ok(detectHeadingStyle('I. MỤC TIÊU'), 'roman-numeral section heading not detected');
  assert.ok(detectHeadingStyle('2. Kiến thức'), 'numbered subheading not detected');
  assert.ok(detectHeadingStyle('4. Bỏ rác'), '`detectHeadingStyle` reports numbering + shape only');
  // ... the *context* decides: a block that opens with 1, 2, 3… is a list.
  assert.equal(isNumberedListBlock([{ text: '1. Bỏ rác' }, { text: '2. Phân loại' }, { text: '3. Tái chế' }]), true,
    'a run of numbers is a list');
  assert.equal(isNumberedListBlock([{ text: '1. MỤC TIÊU' }, { text: 'Học sinh mô tả được quá trình bay hơi.' }]), false,
    'a lesson that starts at 1 is not a list');
  assert.equal(detectHeadingStyle('1. Học sinh đọc bài, trả lời câu hỏi rồi ghi vào vở.'), null,
    'a sentence-shaped list item was promoted');

  assert.equal(isContentLine('Câu hỏi: Nước sôi ở bao nhiêu độ?'), true);
  assert.equal(isContentLine('Đáp án: 100°C'), true);
  assert.equal(isContentLine('| 0 phút | 20°C |'), true);
  assert.equal(isContentLine('- Chuẩn bị dụng cụ'), false, 'a bulleted line is not content for heading purposes');

  // --- Degraded / empty (§3.5) ---------------------------------------------
  const blank = buildLessonStructure('  \n \n');
  assert.equal(blank.empty, true);
  assert.equal(blank.reason, 'no_text');
  assert.equal(blank.nodes.length, 1);
  assert.equal(blank.root.charStart, 0);

  const shortText = buildLessonStructure('Quá ngắn');
  assert.equal(shortText.empty, true, `documents under ${NO_TEXT_LAYER_MIN_CHARS} chars count as "no text"`);

  // Never throws: garbage input still yields a usable whole-document node.
  for (const input of [null, undefined, 0, '\u0000\u0001', 'x'.repeat(2_000)]) {
    const result = buildLessonStructure(input as unknown as string);
    assert.ok(result.nodes.length >= 1);
    assert.equal(result.root.charStart, 0);
    assert.equal(result.root.charEnd, result.textLength);
  }

  // --- Outline hints (DOCX heading styles) ---------------------------------
  const hintedSource = 'Mở đầu\n\nPHẦN MỘT\nNội dung phần một.\n\nPHẦN HAI\nNội dung phần hai.\n';
  const hinted = buildLessonStructure(hintedSource, {
    headings: [
      { text: 'PHẦN MỘT', level: 1, charStart: hintedSource.indexOf('PHẦN MỘT') },
      { text: 'PHẦN HAI', level: 1, charStart: hintedSource.indexOf('PHẦN HAI') }
    ]
  });
  const hintedSections = hinted.nodes.filter(node => node.title.startsWith('PHẦN'));
  assert.equal(hintedSections.length, 2);
  assert.ok(hintedSections.every(node => node.confidence === 'high'), 'outline hints are high-confidence');
  assert.ok(hintedSections.every(node => node.level === 1));
  // --- Node cap (§3.4) -----------------------------------------------------
  const many = Array.from({ length: MAX_STRUCTURE_NODES + 40 }, (_, index) =>
    `III. Phần ${index} của tài liệu dài\nNội dung đoạn ${index} với vài câu mô tả.`).join('\n\n');
  const capped = buildLessonStructure(many);
  assert.ok(capped.nodes.length <= MAX_STRUCTURE_NODES + MAX_STRUCTURE_TOTAL_NODES, `node cap exceeded: ${capped.nodes.length}`);
  assert.equal(capped.reason, 'too_many_nodes');
  assert.equal(capped.nodes[0].id, capped.root.id, 'the root must survive the cap');

  process.stdout.write('lesson-structure: ok\n');
}

run();

