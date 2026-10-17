import JSZip from 'jszip';
import type { GameQuestion, QuestionDifficulty } from '../shared/types';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_SHEET_XML_BYTES = 5 * 1024 * 1024;
const MAX_QUESTIONS = 100;
const MAX_COLUMNS = 32;
const DIFFICULTIES = new Set<QuestionDifficulty>(['dễ', 'trung bình', 'khó']);

export async function importQuestionsFromFile(
  fileName: string,
  file: Buffer
): Promise<GameQuestion[]> {
  if (file.length > MAX_FILE_BYTES) throw new Error('Tệp câu hỏi vượt quá giới hạn 10 MB.');
  const extension = fileName.toLowerCase().split('.').pop();
  let rows: string[][];
  if (extension === 'csv' || extension === 'tsv') {
    rows = parseDelimitedText(file.toString('utf8'), extension === 'tsv' ? '\t' : undefined);
  } else if (extension === 'xlsx') {
    rows = await parseXlsx(file);
  } else {
    throw new Error('Chỉ hỗ trợ tệp .csv, .tsv hoặc .xlsx.');
  }
  return rowsToQuestions(rows);
}

function parseDelimitedText(input: string, forcedDelimiter?: string): string[][] {
  const text = input.replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const delimiter = forcedDelimiter || [',', ';', '\t']
    .map(candidate => ({ candidate, count: countOutsideQuotes(firstLine, candidate) }))
    .sort((left, right) => right.count - left.count)[0].candidate;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && character === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell.trim());
      if (row.some(value => value.length > 0)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error('Tệp bảng tính có dấu ngoặc kép chưa được đóng.');
  row.push(cell.trim());
  if (row.some(value => value.length > 0)) rows.push(row);
  return rows;
}

function countOutsideQuotes(line: string, delimiter: string): number {
  let quoted = false;
  let count = 0;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"') {
      if (quoted && line[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && line[index] === delimiter) {
      count += 1;
    }
  }
  return count;
}

async function parseXlsx(buffer: Buffer): Promise<string[][]> {
  let archive: JSZip;
  try {
    archive = await JSZip.loadAsync(buffer);
  } catch (error) {
    throw new Error(`Không đọc được tệp XLSX: ${error instanceof Error ? error.message : String(error)}`);
  }
  const workbook = archive.file('xl/workbook.xml');
  const relationships = archive.file('xl/_rels/workbook.xml.rels');
  if (!workbook || !relationships) throw new Error('Tệp XLSX thiếu thông tin bảng tính.');

  const workbookXml = await readZipText(workbook);
  const relationshipsXml = await readZipText(relationships);
  const firstSheet = workbookXml.match(/<sheet\b[^>]*\br:id="([^"]+)"/);
  if (!firstSheet) throw new Error('Tệp XLSX không có trang tính.');
  const relationPattern = /<Relationship\b([^>]*)\/?>/g;
  let relationMatch: RegExpExecArray | null;
  let target: string | undefined;
  while ((relationMatch = relationPattern.exec(relationshipsXml))) {
    const attributes = parseXmlAttributes(relationMatch[1]);
    if (attributes.Id === firstSheet[1]) {
      target = attributes.Target;
      break;
    }
  }
  if (!target || target.includes('\\') || target.startsWith('/') && !target.startsWith('/xl/')) {
    throw new Error('Đường dẫn trang tính XLSX không hợp lệ.');
  }
  const sheetPath = target.startsWith('/xl/')
    ? target.slice(1)
    : resolveWorkbookTarget(target);
  const sheetFile = archive.file(sheetPath);
  if (!sheetFile) throw new Error('Không tìm thấy trang tính đầu tiên trong XLSX.');

  const sharedStringsFile = archive.file('xl/sharedStrings.xml');
  const sharedStrings = sharedStringsFile
    ? parseSharedStrings(await readZipText(sharedStringsFile))
    : [];
  return parseWorksheet(await readZipText(sheetFile), sharedStrings);
}

async function readZipText(file: JSZip.JSZipObject): Promise<string> {
  const internalData = Object.getOwnPropertyDescriptor(file, '_data')?.value;
  if (typeof internalData === 'object' && internalData !== null &&
      'uncompressedSize' in internalData && typeof internalData.uncompressedSize === 'number' &&
      internalData.uncompressedSize > MAX_SHEET_XML_BYTES) {
    throw new Error('Trang tính XLSX vượt quá giới hạn kích thước.');
  }
  const text = await file.async('text');
  if (Buffer.byteLength(text, 'utf8') > MAX_SHEET_XML_BYTES) {
    throw new Error('Trang tính XLSX vượt quá giới hạn kích thước.');
  }
  return text;
}

function resolveWorkbookTarget(target: string): string {
  const parts = ['xl'];
  for (const part of target.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (parts.length <= 1) throw new Error('Đường dẫn trang tính XLSX không hợp lệ.');
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join('/');
}

function parseWorksheet(xml: string, sharedStrings: string[]): string[][] {
  const rows: string[][] = [];
  const rowPattern = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowPattern.exec(xml))) {
    const row: string[] = [];
    const cellPattern = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellPattern.exec(rowMatch[1]))) {
      const attributes = parseXmlAttributes(cellMatch[1]);
      const reference = attributes.r || '';
      const column = columnIndex(reference);
      if (column < 0 || column >= MAX_COLUMNS) continue;
      const content = cellMatch[2] || '';
      const type = attributes.t;
      let value = '';
      if (type === 'inlineStr') {
        value = [...content.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
          .map(match => decodeXml(match[1])).join('');
      } else {
        const raw = content.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] || '';
        const decoded = decodeXml(raw);
        if (type === 's') {
          const sharedIndex = Number(decoded);
          value = Number.isInteger(sharedIndex) ? sharedStrings[sharedIndex] || '' : '';
        } else {
          value = decoded;
        }
      }
      row[column] = value;
    }
    rows.push(Array.from({ length: Math.min(MAX_COLUMNS, row.length) }, (_, index) => row[index] || ''));
  }
  return rows;
}

function parseSharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(item =>
    [...item[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
      .map(match => decodeXml(match[1])).join('')
  );
}

function parseXmlAttributes(raw: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of raw.matchAll(/([^\s=]+)="([^"]*)"/g)) {
    attributes[match[1]] = decodeXml(match[2]);
  }
  return attributes;
}

function columnIndex(reference: string): number {
  const letters = reference.match(/^[A-Z]+/i)?.[0].toUpperCase();
  if (!letters) return -1;
  let index = 0;
  for (const letter of letters) index = index * 26 + letter.charCodeAt(0) - 64;
  return index - 1;
}

function decodeXml(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, token: string) => {
    const normalized = token.toLowerCase();
    if (normalized === 'amp') return '&';
    if (normalized === 'lt') return '<';
    if (normalized === 'gt') return '>';
    if (normalized === 'quot') return '"';
    if (normalized === 'apos') return "'";
    const codePoint = normalized.startsWith('#x')
      ? Number.parseInt(normalized.slice(2), 16)
      : Number.parseInt(normalized.slice(1), 10);
    return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : entity;
  });
}

function rowsToQuestions(rows: string[][]): GameQuestion[] {
  const headerRow = rows.findIndex(row => row.some(value => ['question', 'cauhoi'].includes(normalizeHeader(value))));
  if (headerRow < 0) {
    throw new Error('Không tìm thấy cột “Câu hỏi”. Dùng các cột: Câu hỏi, Dạng câu hỏi (tùy chọn), Phương án A-D, Đáp án, Giải thích, Điểm, Độ khó.');
  }
  const headers = rows[headerRow].map(normalizeHeader);
  const questionColumn = findColumn(headers, ['question', 'cauhoi']);
  const typeColumn = findColumn(headers, ['type', 'questiontype', 'hinhthuc', 'loaicauhoi', 'dangcauhoi', 'dang', 'kind']);
  const optionColumns = [
    findColumn(headers, ['optiona', 'phuongana', 'dapana', 'option1']),
    findColumn(headers, ['optionb', 'phuonganb', 'dapanb', 'option2']),
    findColumn(headers, ['optionc', 'phuonganc', 'dapanc', 'option3']),
    findColumn(headers, ['optiond', 'phuongand', 'dapand', 'option4'])
  ];
  const answerColumn = findColumn(headers, ['answer', 'correct', 'correctanswer', 'correctoption', 'dapandung', 'dapan']);
  if (questionColumn < 0 || answerColumn < 0) {
    throw new Error('Thiếu cột bắt buộc. Cần “Câu hỏi” và “Đáp án”. Câu trắc nghiệm cần thêm “Phương án A” và “Phương án B”.');
  }
  const explanationColumn = findColumn(headers, ['explanation', 'giaithich', 'loigiai']);
  const pointsColumn = findColumn(headers, ['points', 'diem']);
  const difficultyColumn = findColumn(headers, ['difficulty', 'dokho']);
  const questions: GameQuestion[] = [];
  for (let rowIndex = headerRow + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!row.some(value => value.trim())) continue;
    if (questions.length >= MAX_QUESTIONS) {
      throw new Error(`Mỗi lần chỉ nhập tối đa ${MAX_QUESTIONS} câu hỏi.`);
    }
    const prompt = row[questionColumn]?.trim() || '';
    if (!prompt) throw new Error(`Dòng ${rowIndex + 1}: thiếu nội dung câu hỏi.`);
    const type = resolveQuestionType(typeColumn >= 0 ? row[typeColumn]?.trim() || '' : '');
    const rawAnswer = row[answerColumn]?.trim() || '';
    const pointsValue = pointsColumn >= 0 && row[pointsColumn]?.trim()
      ? Number(row[pointsColumn])
      : 100;
    if (!Number.isInteger(pointsValue) || pointsValue < 0 || pointsValue > 1000) {
      throw new Error(`Dòng ${rowIndex + 1}: điểm phải là số nguyên từ 0 đến 1000.`);
    }
    const difficultyRaw = difficultyColumn >= 0 ? row[difficultyColumn]?.trim().toLowerCase() : '';
    const difficulty = difficultyRaw
      ? [...DIFFICULTIES].find(value => normalizeHeader(value) === normalizeHeader(difficultyRaw))
      : undefined;
    if (difficultyRaw && !difficulty) throw new Error(`Dòng ${rowIndex + 1}: độ khó phải là dễ, trung bình hoặc khó.`);
    const base = {
      id: `imported-${questions.length + 1}`,
      type,
      prompt,
      explanation: explanationColumn >= 0 ? row[explanationColumn]?.trim() || '' : '',
      points: pointsValue,
      ...(difficulty ? { difficulty } : {})
    } as GameQuestion;
    if (type === 'fill-in-blank' || type === 'short-answer') {
      const accepted = rawAnswer.split(';').map(value => value.trim()).filter(Boolean);
      if (!accepted.length) throw new Error(`Dòng ${rowIndex + 1}: câu ${type === 'fill-in-blank' ? 'điền từ' : 'trả lời ngắn'} cần cột “Đáp án” (có thể cách nhiều đáp án hợp lệ bằng dấu chấm phẩy).`);
      base.options = [];
      base.correctOptionId = '';
      base.correctAnswer = accepted[0];
      if (accepted.length > 1) base.alternateAnswers = accepted.slice(1);
    } else if (type === 'true-false') {
      base.options = [{ id: 'a', text: 'Đúng' }, { id: 'b', text: 'Sai' }];
      base.correctOptionId = resolveBooleanAnswer(rawAnswer, rowIndex + 1);
    } else {
      const options = optionColumns
        .map((column, index) => ({ id: String.fromCharCode(97 + index), text: row[column]?.trim() || '' }))
        .filter(option => option.text);
      if (options.length < 2) throw new Error(`Dòng ${rowIndex + 1}: câu trắc nghiệm cần ít nhất hai phương án.`);
      const correct = resolveCorrectOption(rawAnswer, options);
      if (!correct) throw new Error(`Dòng ${rowIndex + 1}: đáp án “${rawAnswer}” không khớp phương án.`);
      base.options = options;
      base.correctOptionId = correct.id;
    }
    questions.push(base);
  }
  if (!questions.length) throw new Error('Tệp không có câu hỏi nào để nhập.');
  return questions;
}

function resolveQuestionType(raw: string): GameQuestion['type'] {
  const normalized = normalizeHeader(raw);
  if (!normalized || ['tracnghiem', 'multiplechoice', 'mc', 'choice'].includes(normalized)) return 'multiple-choice';
  if (['dungsai', 'truefalse', 'boolean', 'tf'].includes(normalized)) return 'true-false';
  if (['dientu', 'fillblank', 'fillinblank', 'blanks', 'fill'].includes(normalized)) return 'fill-in-blank';
  if (['ngan', 'traloingan', 'shortanswer', 'short', 'open', 'essay'].includes(normalized)) return 'short-answer';
  throw new Error(`Dòng dạng câu hỏi “${raw}” không được hỗ trợ. Dùng: trắc nghiệm, đúng/sai, điền từ, trả lời ngắn.`);
}

function resolveBooleanAnswer(answer: string, lineNumber: number): string {
  const normalized = normalizeHeader(answer);
  if (['a', 'dung', 'true', 'yes', 'y', '1', 'dung/true'].includes(normalized)) return 'a';
  if (['b', 'sai', 'false', 'no', 'n', '0'].includes(normalized)) return 'b';
  throw new Error(`Dòng ${lineNumber}: đáp án đúng/sai phải là Đúng/Sai (hoặc True/False).`);
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, '');
}

function findColumn(headers: string[], aliases: string[]): number {
  return headers.findIndex(header => aliases.includes(header));
}

function resolveCorrectOption(
  answer: string,
  options: Array<{ id: string; text: string }>
): { id: string; text: string } | undefined {
  const normalizedAnswer = normalizeHeader(answer);
  const byId = options.find(option =>
    normalizedAnswer === option.id || normalizedAnswer === `option${option.id}` ||
    normalizedAnswer === `phuongan${option.id}` || normalizedAnswer === `dapan${option.id}`
  );
  if (byId) return byId;
  const byText = options.filter(option => option.text.trim().toLocaleLowerCase() === answer.trim().toLocaleLowerCase());
  return byText.length === 1 ? byText[0] : undefined;
}
