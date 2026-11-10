// Dựng các tệp mẫu cho cổng nhập tài liệu của vỏ Tauri: PDF, DOCX, PPTX, XLSX,
// CSV và ảnh — mỗi thứ một tệp nhỏ, sinh bằng chính các gói trong node_modules.
//   node scripts/build-tauri-import-fixtures.js
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const JSZip = require('jszip');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'tests', 'fixtures', 'tauri-import');
fs.mkdirSync(out, { recursive: true });

function pdfEscape(text) {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/** PDF 1.4 một trang, font Helvetica, chữ ASCII (không cần font nhúng). */
function buildPdf(lines) {
  const content = ['BT', '/F1 18 Tf', '60 760 Td', '24 TL']
    .concat(lines.map((line, index) => (index ? `T* (${pdfEscape(line)}) Tj` : `(${pdfEscape(line)}) Tj`)))
    .concat(['ET'])
    .join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let text = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(text, 'latin1'));
    text += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(text, 'latin1');
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) text += `${String(offset).padStart(10, '0')} 00000 n \n`;
  text += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(text, 'latin1');
}

/** PNG 1×1 đỏ — đủ để `inspectCustomImage` nhận theo magic bytes. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64'
);

async function writeDocx() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '</Types>');
  zip.file('_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>');
  const paragraphs = [
    'Giao an an toan giao thong',
    'Hoc sinh nhan biet den do thi dung lai.',
    'Hoc sinh nhan biet den xanh thi duoc di.'
  ].map(text => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`).join('');
  zip.file('word/document.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}</w:body></w:document>`);
  fs.writeFileSync(path.join(out, 'bai-hoc.docx'), await zip.generateAsync({ type: 'nodebuffer' }));
}

async function writePptx() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '</Types>');
  const slide = (text) =>
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
    `<p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
  zip.file('ppt/slides/slide10.xml', slide('Cau hoi muoi'));
  zip.file('ppt/slides/slide2.xml', slide('Cau hoi hai &amp; an toan'));
  fs.writeFileSync(path.join(out, 'bai-giang.pptx'), await zip.generateAsync({ type: 'nodebuffer' }));
}

/** XLSX một trang: header + một dòng câu hỏi trắc nghiệm (chuỗi nằm trong sharedStrings). */
async function writeXlsx() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '</Types>');
  zip.file('xl/workbook.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets><sheet name="Cau hoi" sheetId="1" r:id="rId1"/></sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '</Relationships>');
  const strings = ['Câu hỏi', 'Phương án A', 'Phương án B', 'Đáp án', 'Giải thích',
    'Đèn đỏ thì làm gì?', 'Đi tiếp', 'Dừng lại', 'B', 'Dừng trước vạch.'];
  zip.file('xl/sharedStrings.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">` +
    strings.map(text => `<si><t>${text}</t></si>`).join('') + '</sst>');
  const cells = [0, 1, 2, 3, 4].map(index => `<c r="${String.fromCharCode(65 + index)}2" t="s"><v>${5 + index}</v></c>`).join('');
  const header = [0, 1, 2, 3, 4].map(index => `<c r="${String.fromCharCode(65 + index)}1" t="s"><v>${index}</v></c>`).join('');
  zip.file('xl/worksheets/sheet1.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
    `<row r="1">${header}</row><row r="2">${cells}</row></sheetData></worksheet>`);
  fs.writeFileSync(path.join(out, 'cau-hoi.xlsx'), await zip.generateAsync({ type: 'nodebuffer' }));
}

async function main() {
  fs.writeFileSync(path.join(out, 'giao-an.txt'),
    'Giáo án: An toàn giao thông\n\nĐèn đỏ thì dừng lại, đèn xanh mới được đi.\n', 'utf8');
  fs.writeFileSync(path.join(out, 'giao-an.md'),
    '# An toàn giao thông\n\nĐèn đỏ thì **dừng lại**.\n', 'utf8');
  fs.writeFileSync(path.join(out, 'giao-an.pdf'), buildPdf([
    'Giao an an toan giao thong',
    'Den do thi dung lai.',
    'Den xanh thi duoc di.'
  ]));
  await writeDocx();
  await writePptx();
  await writeXlsx();
  fs.writeFileSync(path.join(out, 'cau-hoi.csv'),
    'Câu hỏi,Phương án A,Phương án B,Đáp án,Giải thích\n' +
    'Đèn đỏ thì làm gì?,Đi tiếp,Dừng lại,B,Dừng trước vạch.\n', 'utf8');
  fs.writeFileSync(path.join(out, 'cau-hoi.tsv'),
    'Câu hỏi\tPhương án A\tPhương án B\tĐáp án\n' +
    'Đèn đỏ thì làm gì?\tĐi tiếp\tDừng lại\tB\n', 'utf8');
  fs.writeFileSync(path.join(out, 'anh-minh-hoa.png'), PNG_1X1);
  // Tệp không phải ảnh nhưng đổi đuôi `.png`: `inspectCustomImage` phải từ chối.
  fs.writeFileSync(path.join(out, 'anh-gia.png'), Buffer.from('khong phai anh', 'utf8'));
  // Tệp nhị phân đổi đuôi `.pdf`: bộ đọc pdf phải ném câu đọc được, không treo.
  fs.writeFileSync(path.join(out, 'hong.pdf'), Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff]));
  // Định dạng chưa hỗ trợ: kênh nhập tài liệu phải từ chối trước khi đọc.
  fs.writeFileSync(path.join(out, 'bang-tinh.xls'), Buffer.from('không phải bảng tính', 'utf8'));
  const size = fs.readdirSync(out).reduce((sum, name) => sum + fs.statSync(path.join(out, name)).size, 0);
  console.log(`fixtures: ${out} (${fs.readdirSync(out).length} tệp, ${(size / 1024).toFixed(1)} KiB)`);
  void zlib;
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
