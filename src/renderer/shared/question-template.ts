// @ts-nocheck -- classic renderer script; data + one formatter, no DOM (DECISIONS #168).
/*
 * The downloadable CSV template for "Nhập CSV/XLSX" (DECISIONS #316).
 *
 * The renderer is plain global scripts and cannot `import`, so this file MIRRORS
 * `src/shared/question-template.ts`, which stays the single source of truth.
 * `tests/unit/question-template.test.ts` evaluates this file and compares the CSV
 * it produces with the shared module's byte for byte, so the two cannot drift
 * silently, and it also feeds the result back through `importQuestionsFromFile`
 * to prove the file we hand out is a file the importer accepts.
 *
 * `;` delimiter (Vietnamese Excel), UTF-8 BOM and CRLF are part of the contract —
 * change them here and the test goes red for a reason.
 */
const QUESTION_TEMPLATE_FILE_NAME = 'mau-cau-hoi-edugame.csv';

const QUESTION_TEMPLATE_COLUMNS = [
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

const QUESTION_TEMPLATE_ROWS = [
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
function questionTemplateCell(value) {
  const text = String(value == null ? '' : value);
  return /["\n\r;]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

/** BOM + header + example rows, CRLF line ends, `;` delimiter. */
function questionTemplateCsv() {
  const lines = [QUESTION_TEMPLATE_COLUMNS].concat(QUESTION_TEMPLATE_ROWS)
    .map(row => row.map(questionTemplateCell).join(';'));
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}
