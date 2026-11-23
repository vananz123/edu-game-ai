/* The CSV template a teacher downloads when they have no file to import yet
 * (docs/DECISIONS.md #316).
 *
 * The editor's "Nhập CSV/XLSX" button needs a file with a header row; without one
 * the feature is a closed door. This module is the ONE definition of that file:
 * `question-template.test.ts` proves it round-trips through
 * `importQuestionsFromFile`, i.e. the template we hand out is a file the importer
 * actually accepts. The renderer cannot `import`, so
 * `src/renderer/shared/question-template.ts` mirrors the text and
 * `question-template.test.ts` fails if the two drift.
 *
 * Rules kept on purpose:
 *   - `;` delimiter, because Vietnamese Excel uses `;` as its list separator;
 *   - UTF-8 BOM + CRLF, so Excel opens it without mojibake and without asking;
 *   - every column the importer understands, in the order the teacher reads;
 *   - one example per question type the games can play — no invented type.
 */

export const QUESTION_TEMPLATE_FILE_NAME = 'mau-cau-hoi-edugame.csv';

/** Header labels accepted by `rowsToQuestions` (aliases live in question-import.ts). */
export const QUESTION_TEMPLATE_COLUMNS = [
  'Câu hỏi',
  'Dạng câu hỏi',
  'Phương án A',
  'Phương án B',
  'Phương án C',
  'Phương án D',
  'Đáp án',
  'Giải thích',
  'Điểm',
  'Độ khó'
];

/**
 * One example row per question type: trắc nghiệm, đúng/sai, điền từ, trả lời ngắn.
 * The "điền từ" row shows two accepted answers inside one quoted cell; a real
 * teacher replaces these texts, they do not delete the header.
 */
export const QUESTION_TEMPLATE_ROWS: string[][] = [
  [
    'Vì sao cây cần ánh sáng?',
    'trắc nghiệm',
    'Để quang hợp',
    'Để hút nước',
    'Để nhả hơi nước',
    'Để nở hoa',
    'A',
    'Ánh sáng giúp cây quang hợp tạo ra chất hữu cơ.',
    '100',
    'dễ'
  ],
  [
    'Nước sôi ở 100 độ C khi áp suất khí quyển là 1 atm.',
    'đúng/sai',
    '',
    '',
    '',
    '',
    'Đúng',
    'Ở áp suất 1 atm, nước sôi ở 100 độ C.',
    '100',
    'dễ'
  ],
  [
    'Mặt trời mọc ở hướng nào?',
    'điền từ',
    '',
    '',
    '',
    '',
    'hướng đông;đông',
    'Mặt trời mọc ở hướng đông và lặn ở hướng tây.',
    '100',
    'trung bình'
  ],
  [
    'Thủ đô của Việt Nam là thành phố nào?',
    'trả lời ngắn',
    '',
    '',
    '',
    '',
    'Hà Nội',
    'Thủ đô nước ta là Hà Nội; thành phố đông dân nhất là Thành phố Hồ Chí Minh.',
    '100',
    'dễ'
  ]
];

/** One CSV cell: quoted only when it would otherwise break the row. */
function csvCell(value: string): string {
  const text = String(value == null ? '' : value);
  return /["\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * The downloadable file: BOM + header + example rows, CRLF line ends.
 * `\uFEFF` is written literally because Excel (not our parser) is the consumer.
 */
export function questionTemplateCsv(): string {
  const lines = [QUESTION_TEMPLATE_COLUMNS, ...QUESTION_TEMPLATE_ROWS]
    .map(row => row.map(csvCell).join(';'));
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}
