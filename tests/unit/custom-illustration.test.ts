/**
 * DECISIONS #124 — teacher-uploaded illustrations.
 *
 * The picture is copied into the app folder and referenced by an opaque id, so the
 * play surface never loads a path the teacher's file system controls. These checks pin
 * the two things that could break that: what is accepted (a renamed `.exe` or a 20 MB
 * photo must not become an image) and how an id maps to a file name (nothing outside the
 * folder).
 */
import assert from 'node:assert/strict';
import {
  CUSTOM_IMAGE_MAX_BYTES,
  CustomImageError,
  customImageFileName,
  customImageMime,
  inspectCustomImage,
  isCustomImageId
} from '../../src/services/custom-illustration';

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
const gif = Buffer.concat([Buffer.from('GIF89a', 'ascii'), Buffer.alloc(16)]);
const webp = Buffer.concat([Buffer.from('RIFF', 'ascii'), Buffer.from([0x10, 0, 0, 0]), Buffer.from('WEBP', 'ascii'), Buffer.alloc(16)]);
const exe = Buffer.from('MZ\x90\x00 this is not a picture', 'binary');

async function run(): Promise<void> {
  // --- accepted formats, by content, not by name ------------------------------
  assert.deepEqual(inspectCustomImage('a.png', png), { ext: '.png', mime: 'image/png' });
  assert.deepEqual(inspectCustomImage('A.JPEG', jpeg), { ext: '.jpg', mime: 'image/jpeg' });
  assert.deepEqual(inspectCustomImage('a.gif', gif), { ext: '.gif', mime: 'image/gif' });
  assert.deepEqual(inspectCustomImage('a.webp', webp), { ext: '.webp', mime: 'image/webp' });

  // --- refused ---------------------------------------------------------------
  assert.throws(() => inspectCustomImage('a.bmp', png), (error: unknown) => error instanceof CustomImageError && /PNG, JPG/u.test(error.message));
  assert.throws(() => inspectCustomImage('virus.png', exe), /không phải ảnh hợp lệ/u, 'an .exe renamed .png is refused');
  assert.throws(() => inspectCustomImage('empty.png', Buffer.alloc(0)), /rỗng/u);
  assert.throws(() => inspectCustomImage('big.png', Buffer.concat([png, Buffer.alloc(CUSTOM_IMAGE_MAX_BYTES)])), /lớn hơn/u);

  // --- ids and file names ----------------------------------------------------
  const id = `ci-${'a'.repeat(32)}`;
  assert.equal(isCustomImageId(id), true);
  assert.equal(customImageFileName(id), `${id}.img`);
  for (const bad of ['', 'ci-', 'ci-xyz', '../etc/passwd', `${'a'.repeat(32)}`, 'ci-' + 'A'.repeat(32), null, 42]) {
    assert.equal(isCustomImageId(bad), false, `rejects ${String(bad)}`);
    assert.equal(customImageFileName(bad), null, `no file name for ${String(bad)}`);
  }
  assert.equal(customImageFileName('ci-' + 'a'.repeat(32) + '/../../secret'), null, 'a path is never a file name');

  // --- MIME for serving is decided by the stored bytes -----------------------
  assert.equal(customImageMime(png), 'image/png');
  assert.equal(customImageMime(jpeg), 'image/jpeg');
  assert.equal(customImageMime(exe), null);

  console.log('Custom illustration tests passed');
}

void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
