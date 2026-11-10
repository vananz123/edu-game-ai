/**
 * Hai kênh nhập tài liệu cho vỏ Tauri, chạy trong V8 nhúng (`deno_core`).
 *
 * Bản Electron xử lý năm định dạng ngay trong `main.ts` (`files:import-document`,
 * `files:import-document-from-path`): `.txt`/`.md` đọc UTF-8, `.docx` qua
 * mammoth, `.pdf` qua pdf-parse, `.pptx` qua jszip. Tệp này giữ ĐÚNG chuỗi xử lý
 * đó — cùng thư viện, cùng thứ tự ưu tiên, cùng câu lỗi, cùng trần 120 000 ký
 * tự — để một giáo án nhập vào vỏ Tauri ra chữ y như ở bản Electron.
 *
 * Ba khác biệt so với `main.ts`, tất cả do lớp chạy khác nhau:
 *
 *   • Đầu vào là `Uint8Array` (Rust đọc byte), không phải `Buffer` của Node.
 *   • Không hỏi đường dẫn: Rust chọn tệp qua hộp thoại của tiến trình rồi đưa TÊN
 *     TỆP và byte sang đây. Kênh `files:import-document-from-path` (kéo thả) nhận
 *     đường dẫn từ renderer trong bản Electron; ở vỏ Tauri frontend không có
 *     quyền đọc tệp, nên nó nhận byte đọc từ đường dẫn đó và đi cùng hàm này.
 *   • Hai thư viện đọc tệp được nhập THEO TÊN GÓI, và `scripts/build-embedded-js.js`
 *     (chỉ cho bundle V8) trỏ tên đó sang bản trình duyệt của chúng: bản Node của
 *     mammoth mở zip bằng luồng Node còn bản Node của pdf-parse dựng một thư mục
 *     bộ nhớ đệm trên đĩa cho trang tả — cả hai đều không chạy trong V8 nhúng.
 *
 * Không I/O, không `node:*` ở lối ra.
 */
import JSZip from 'jszip';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

import { MAX_FILE_BYTES as QUESTIONS_MAX_BYTES } from '../../../src/services/input/question-import';

export { importQuestionsFromFile } from '../../../src/services/input/question-import';

/** Trần ký tự của `text` trong kết quả — cùng con số `main.ts` cắt. */
export const DOCUMENT_MAX_CHARACTERS = 120000;

/**
 * Trần BYTE của tệp nhập. Bản Electron không có trần này (nó đọc cả tệp rồi mới
 * xử lý); vỏ Tauri cần một con số trước khi đọc, vì một tệp vài GB đi thẳng vào
 * bộ nhớ. 10 MB = cùng trần `question-import.ts` đã áp cho bảng tính, đủ cho một
 * giáo án Word/PowerPoint/PDF của một buổi học.
 */
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

/** Trần byte của bảng câu hỏi — lấy từ chính `question-import.ts`, không gõ lại. */
export { QUESTIONS_MAX_BYTES };

/** Đuôi tệp nhận được; `main.ts` liệt kê đúng năm cái này ở cả hai handler. */
const SUPPORTED = ['.txt', '.md', '.docx', '.pdf', '.pptx'];

/**
 * `main.ts` trả `text: text.trim().slice(0, 120000)` nhưng `characters: text.length`
 * của chuỗi CHƯA trim — hai con số lệch nhau đúng phần khoảng trắng hai đầu, và
 * renderer tin `characters`. Giữ y như vậy: `clamp` chỉ cắt trần, KHÔNG trim.
 * Thứ tự trong chữ là UTF-16, nên `slice` cắt theo đơn vị của JavaScript.
 */
function clamp(text: string): string {
  return text.slice(0, DOCUMENT_MAX_CHARACTERS);
}

function extensionOf(name: string): string {
  const base = String(name || '').split(/[\\/]/).pop() || '';
  const dot = base.lastIndexOf('.');
  return dot < 0 ? '' : base.slice(dot).toLowerCase();
}

/** Tên tệp của kết quả: `path.basename` của Node, chấp nhận cả hai dấu phân cách. */
export function baseName(fileName: string): string {
  return String(fileName || '').split(/[\\/]/).pop() || '';
}

async function pptxText(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const slides = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = Number((a.match(/slide(\d+)/) || [0, '0'])[1]);
      const nb = Number((b.match(/slide(\d+)/) || [0, '0'])[1]);
      return na - nb;
    });
  const chunks: string[] = [];
  for (const slide of slides) {
    const xml = await zip.files[slide].async('text');
    const words = [...String(xml).matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
      .map(match => match[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"'));
    if (words.length) chunks.push(words.join(' '));
  }
  return chunks.join('\n\n');
}

/**
 * byte của một tệp + tên tệp → chữ. Ném câu tiếng Việt mà `main.ts` ném cho
 * đuôi tệp lạ; lỗi của bản thân thư viện (docx hỏng, pdf mã hoá) giữ nguyên vì
 * đó là thứ giáo viên cần đọc.
 */
export async function readDocument(fileName: string, bytes: Uint8Array): Promise<string> {
  const ext = extensionOf(fileName);
  // `buffer` của mammoth (và đầu vào pdf-parse) là `Buffer`; truyền
  // `Uint8Array` dưới DÙNG bộ nhớ của nó thay vì chép. `Buffer.from` của Rust
  // (cầu `__eg_bytes`) đã gói chính mảng đó, nên đường này chỉ là để hàm gọi
  // được từ test và từ một `Uint8Array` thô.
  if (ext === '.txt' || ext === '.md') return new TextDecoder('utf-8').decode(bytes);
  if (ext === '.docx') {
    const parsed = await mammoth.extractRawText({ buffer: bytes });
    return parsed.value || '';
  }
  if (ext === '.pdf') {
    const parsed = await pdfParse(bytes);
    return parsed.text || '';
  }
  if (ext === '.pptx') return pptxText(bytes);
  throw new Error('Định dạng này chưa được hỗ trợ.');
}

/** Kết quả của `files:import-document`: không có `sizeBytes` — bản Electron cũng vậy. */
export async function importDocument(fileName: string, bytes: Uint8Array) {
  if (!SUPPORTED.includes(extensionOf(fileName))) throw new Error('Định dạng này chưa được hỗ trợ.');
  const text = await readDocument(fileName, bytes);
  return { name: baseName(fileName), path: fileName, text: clamp(text), characters: text.length };
}

/** Kết quả của `files:import-document-from-path`: thêm `sizeBytes` của tệp trên đĩa. */
export async function importDocumentFromPath(fileName: string, bytes: Uint8Array, sizeBytes: number) {
  if (!SUPPORTED.includes(extensionOf(fileName))) throw new Error('Định dạng này chưa được hỗ trợ.');
  const text = await readDocument(fileName, bytes);
  return {
    name: baseName(fileName),
    path: fileName,
    text: clamp(text),
    characters: text.length,
    sizeBytes: Math.max(0, Math.floor(Number(sizeBytes) || bytes.byteLength))
  };
}
