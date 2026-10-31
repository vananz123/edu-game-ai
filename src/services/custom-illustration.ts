/**
 * Teacher-uploaded illustrations (DECISIONS #124).
 *
 * A teacher can put their own picture on one question ("ảnh minh hoạ phải đi cùng
 * nhau" with the question it illustrates). The picture is copied into the app's data
 * folder and only an opaque id is stored on the item; the play surface loads it through
 * a dedicated `edugame-file:` protocol that serves nothing outside that folder.
 *
 * Why copy instead of keeping the path: the teacher's file can be moved, renamed or
 * deleted (or sit on a USB stick), and a game must still play offline months later.
 *
 * Why not a `file://` URL: the page's CSP allows `img-src 'self' data:
 * edugame-file:` only, and `file://` would let a stored path read anything on disk.
 *
 * Pure-ish module: no Electron import; the caller passes the folder.
 */
import path from 'node:path';

/** Extensions a browser window can decode and that we accept. */
export const CUSTOM_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'] as const;

/** 8 MB: a projector picture, not a photo library. */
export const CUSTOM_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

/** Id shape stored on an item: `ci-` + hex. Anything else is not ours. */
const CUSTOM_IMAGE_ID = /^ci-[a-f0-9]{32}$/u;

/** Magic-byte check: the extension alone is never trusted. */
const SIGNATURES: Array<{ ext: string; mime: string; test: (bytes: Buffer) => boolean }> = [
  { ext: '.png', mime: 'image/png', test: b => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { ext: '.jpg', mime: 'image/jpeg', test: b => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: '.jpeg', mime: 'image/jpeg', test: b => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: '.webp', mime: 'image/webp', test: b => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
  { ext: '.gif', mime: 'image/gif', test: b => b.length > 6 && b.toString('ascii', 0, 3) === 'GIF' }
];

export class CustomImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CustomImageError';
  }
}

/** True when `value` is an id this module produced. */
export function isCustomImageId(value: unknown): value is string {
  return typeof value === 'string' && CUSTOM_IMAGE_ID.test(value);
}

/**
 * Checks a candidate file's extension, size and magic bytes, returning the canonical
 * extension and MIME type to store it under. Throws `CustomImageError` with a sentence
 * a teacher can act on.
 */
export function inspectCustomImage(filePath: string, bytes: Buffer): { ext: string; mime: string } {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  if (!(CUSTOM_IMAGE_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new CustomImageError('Chỉ nhận ảnh PNG, JPG, WEBP hoặc GIF.');
  }
  if (!bytes || bytes.length === 0) throw new CustomImageError('Tệp ảnh rỗng.');
  if (bytes.length > CUSTOM_IMAGE_MAX_BYTES) {
    throw new CustomImageError(`Ảnh lớn hơn ${Math.round(CUSTOM_IMAGE_MAX_BYTES / (1024 * 1024))} MB — hãy chọn ảnh nhỏ hơn.`);
  }
  const signature = SIGNATURES.find(candidate => candidate.test(bytes));
  if (!signature) throw new CustomImageError('Tệp không phải ảnh hợp lệ (đuôi tệp không khớp nội dung).');
  return { ext: signature.ext === '.jpeg' ? '.jpg' : signature.ext, mime: signature.mime };
}

/** The stored file name for an id; ids are validated, so no traversal is possible. */
export function customImageFileName(id: unknown): string | null {
  return isCustomImageId(id) ? `${id}.img` : null;
}

/**
 * MIME type from the stored bytes (the file keeps no extension on purpose, so a rename
 * cannot change how it is read).
 */
export function customImageMime(bytes: Buffer): string | null {
  const signature = SIGNATURES.find(candidate => candidate.test(bytes));
  return signature ? signature.mime : null;
}
