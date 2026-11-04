import assert from 'node:assert/strict';
import type { UpdateState } from '../../src/shared/about-types';
import {
  clampPercent,
  compareVersions,
  canCheckForUpdates,
  canDownloadUpdate,
  canInstallUpdate,
  classifyUpdateError,
  createUpdateState,
  estimatedSecondsLeft,
  formatBytes,
  formatDuration,
  isNewerVersion,
  parseVersion,
  phaseLabel,
  reduceUpdateState,
  type UpdateEvent
} from '../../src/services/update/update-policy';

/**
 * Máy trạng thái của bộ cập nhật (#188). Phần khó của tự cập nhật không nằm ở việc
 * gọi electron-updater mà ở chỗ biết lúc nào được phép bấm gì, nên toàn bộ luật ở
 * đây test được mà không cần bộ cài thật hay mạng.
 */

const NOW = 1_700_000_000_000;
const state = (over: Partial<UpdateState> = {}): UpdateState => ({
  ...createUpdateState('0.4.0'),
  ...over
});
const run = (source: UpdateState, ...events: UpdateEvent[]): UpdateState =>
  events.reduce((acc, event) => reduceUpdateState(acc, event, NOW), source);

// --- parseVersion / compareVersions ---------------------------------------

assert.deepEqual(parseVersion('v0.4.0'), { major: 0, minor: 4, patch: 0, prerelease: false }, 'leading v is ignored');
assert.deepEqual(parseVersion(' 0.4 '), { major: 0, minor: 4, patch: 0, prerelease: false }, 'a two-part version is valid');
assert.deepEqual(parseVersion('0.4.0-beta.1+build.7'), { major: 0, minor: 4, patch: 0, prerelease: true }, 'prerelease is flagged');
assert.equal(parseVersion(''), null, 'empty text is not a version');
assert.equal(parseVersion('abc'), null, 'letters are not a version');
assert.equal(parseVersion(null), null, 'null is not a version');
assert.equal(parseVersion(42 as unknown as string), null, 'a bare number is not a version');

assert.equal(compareVersions('0.4.1', '0.4.0'), 1, 'patch beats patch');
assert.equal(compareVersions('0.5.0', '0.4.9'), 1, 'minor beats a higher patch');
assert.equal(compareVersions('1.0.0', '0.9.9'), 1, 'major beats everything');
assert.equal(compareVersions('0.4.0', '0.4.0'), 0, 'same version compares equal');
assert.equal(compareVersions('0.4.0', '0.4'), 0, 'a missing patch part counts as 0');
assert.equal(compareVersions('0.4.0-beta.2', '0.4.0'), -1, 'a beta is never newer than its release');
assert.equal(compareVersions('0.4.0', '0.4.0-beta.2'), 1, 'and a release is newer than its own beta');
assert.equal(compareVersions('garbage', '0.4.0'), null, 'unparseable candidate is refused, not guessed');
assert.equal(compareVersions('0.4.0', null), null, 'unparseable current is refused too');

// isNewerVersion là cổng duy nhất quyết định "có bản mới" — equal phải là false.
assert.equal(isNewerVersion('0.5.0', '0.4.0'), true, 'a higher version invites the update');
assert.equal(isNewerVersion('0.4.0', '0.4.0'), false, 'the feed pointing at the running version is not an update');
assert.equal(isNewerVersion('0.3.0', '0.4.0'), false, 'an older release is never an update');
assert.equal(isNewerVersion('0.4.0-beta.1', '0.4.0'), false, 'prerelease is not an update for a stable build');

// --- classifyUpdateError --------------------------------------------------

const cases: Array<[string, string]> = [
  ['Error: Canceled', 'cancelled'],
  ['ERR_UPDATER_CANCELED by user', 'cancelled'],
  ['publisherName is missing', 'signature'],
  ['binary is not signed', 'signature'],
  ["Cannot quit and install, no update filepath[s] exists", 'install'],
  ['EPERM: operation not permitted, rename', 'install'],
  ['Cannot update when running from un-packed app (not packed)', 'dev-mode'],
  ['Cannot find app-update.yml', 'dev-mode'],
  ['net::ERR_NAME_NOT_RESOLVED at https://github.com', 'offline'],
  ['connect ECONNREFUSED 127.0.0.1', 'offline'],
  ['getaddrinfo ENOTFOUND api.github.com', 'offline'],
  ['Cannot find latest.yml in the latest release assets (404)', 'feed'],
  ['Unexpected HTTP response status code 451', 'feed'],
  ['Something inexplicable happened', 'unknown'],
  ['', 'unknown']
];
for (const [message, expected] of cases) {
  assert.equal(classifyUpdateError(message), expected, `classify ${JSON.stringify(message)}`);
}
// Thứ tự ưu tiên: một message vừa có "installer" vừa có "ERR_CONNECTION" là lỗi cài,
// vì giáo viên đã bấm "Khởi động lại để cài" chứ không phải đang kiểm tra.
assert.equal(classifyUpdateError('installer failed after ERR_CONNECTION'), 'install', 'install beats offline');
assert.equal(classifyUpdateError('canceled: not packed app'), 'cancelled', 'cancelled beats dev-mode');

// --- clampPercent ---------------------------------------------------------

assert.equal(clampPercent(63.4), 63, 'fractional percent rounds');
assert.equal(clampPercent(120), 100, 'over-range clamps to 100');
assert.equal(clampPercent(-5), 0, 'negative clamps to 0');
assert.equal(clampPercent(NaN), 0, 'NaN is 0, not NaN in the DOM');
assert.equal(clampPercent(undefined), 0, 'missing is 0');
assert.equal(clampPercent('42'), 42, 'numeric strings are electron-updater legal');

// --- reduceUpdateState: luồng hạnh phúc -----------------------------------

const happy = run(state(), { type: 'check-started' }, { type: 'update-available', version: '0.5.0' });
assert.equal(happy.phase, 'available', 'available stops at the new version');
assert.equal(happy.newVersion, '0.5.0');
assert.equal(happy.lastCheckedAt, NOW, 'a finished check stamps the time');

const withProgress = run(happy, { type: 'download-started' },
  { type: 'download-progress', percent: 20, transferred: 2_000_000, total: 10_000_000, bytesPerSecond: 500_000 },
  { type: 'download-progress', percent: 55, transferred: 5_500_000, total: 10_000_000, bytesPerSecond: 500_000 });
assert.equal(withProgress.phase, 'downloading');
assert.equal(withProgress.progressPercent, 55, 'percent follows the feed');
assert.equal(withProgress.transferredBytes, 5_500_000);
assert.equal(withProgress.downloadStartedAt, NOW, 'the download stamps its start');

// Một gói tin đến trễ sau khi tải xong không được kéo thanh tiến trình tụt lại.
const lagging = run(withProgress, { type: 'update-downloaded', version: '0.5.0' },
  { type: 'download-progress', percent: 60, transferred: 6_000_000, total: 10_000_000, bytesPerSecond: 500_000 });
assert.equal(lagging.phase, 'downloaded', 'a late progress packet cannot un-finish the download');
assert.equal(lagging.progressPercent, 100, 'and the bar stays full');

// Percent đơn điệu trong lúc tải: hai event đảo thứ tự vẫn giữ mức cao nhất đã thấy.
const jitter = run(state({ phase: 'downloading', newVersion: '0.5.0', progressPercent: 70 }),
  { type: 'download-progress', percent: 40, transferred: 100, total: 1000, bytesPerSecond: 100 });
assert.equal(jitter.progressPercent, 70, 'the bar never runs backwards');

// Kiện tải ngoài luồng tải bị bỏ qua hoàn toàn.
const stray = run(state({ phase: 'up-to-date' }), { type: 'download-progress', percent: 30 });
assert.equal(stray.phase, 'up-to-date', 'a stray progress event does not resurrect a finished check');
assert.equal(stray.progressPercent, 0);

// --- reduceUpdateState: các bẫy đã trả giá -------------------------------

// Bẫy 1: nguồn trỏ đúng bản đang chạy phải báo "đã mới nhất".
const sameVersion = run(state(), { type: 'check-started' }, { type: 'update-available', version: '0.4.0' });
assert.equal(sameVersion.phase, 'up-to-date', 'the feed naming the running version is not an update');
assert.equal(sameVersion.newVersion, '', 'and no half-baked update card is left behind');

// Bẫy 2: kiểm tra lại không được lấy đi nút "Khởi động lại để cài".
const recheck = run(state({ phase: 'downloaded', newVersion: '0.5.0', progressPercent: 100 }), { type: 'check-started' });
assert.equal(recheck.phase, 'downloaded', 'a second check keeps the installer already on disk');
assert.equal(recheck.newVersion, '0.5.0', 'with its version still shown');
assert.equal(canInstallUpdate(recheck), true, 'so the install button stays alive');

// Bẫy 3: `checkForUpdates()` trả về null khi không phải bản cài → dev-mode, hết quay.
const ignored = run(state({ phase: 'checking' }), { type: 'check-ignored' });
assert.equal(ignored.phase, 'error', 'dev mode settles instead of spinning forever');
assert.equal(ignored.errorKind, 'dev-mode');
assert.equal(ignored.lastCheckedAt, NOW);

// Bẫy 4: kiểm tra xong mà không có kiện nào (feed lạ) cũng phải thoát "đang kiểm tra…".
const settled = run(state({ phase: 'checking' }), { type: 'check-settled' });
assert.equal(settled.phase, 'error');
assert.equal(settled.errorKind, 'feed');
// …nhưng nếu đã có kết quả rồi thì không được ghi đè.
const settledAfterOk = run(state({ phase: 'up-to-date' }), { type: 'check-settled' });
assert.equal(settledAfterOk.phase, 'up-to-date', 'check-settled only rescues a stuck check');

// Bẫy 5: tải dở rồi lỗi thì thanh tiến trình về 0, và vẫn tải lại được.
const failedDownload = run(state({ phase: 'available', newVersion: '0.5.0' }),
  { type: 'download-started' },
  { type: 'download-progress', percent: 63, transferred: 6_300_000, total: 10_000_000, bytesPerSecond: 100_000 },
  { type: 'error', message: 'net::ERR_INTERNET_DISCONNECTED' });
assert.equal(failedDownload.phase, 'error');
assert.equal(failedDownload.errorKind, 'offline', 'the teacher gets a network sentence, not a stack trace');
assert.equal(failedDownload.progressPercent, 0, 'a dead download does not leave a bar stuck at 63%');
assert.equal(failedDownload.newVersion, '0.5.0', 'it still knows which version it wanted');
assert.equal(canDownloadUpdate(failedDownload), true, 'and retrying is allowed');

// Bẫy 6: lỗi đến SAU khi tải xong không xoá quyền cài.
const errorAfterDownload = run(state({ phase: 'downloaded', newVersion: '0.5.0', progressPercent: 100 }),
  { type: 'error', message: 'ERR_NETWORK_CHANGED while logging' });
assert.equal(errorAfterDownload.phase, 'downloaded', 'a late error cannot revoke a ready installer');
assert.equal(errorAfterDownload.errorKind, '', 'it is not shown as an error either');
assert.equal(canInstallUpdate(errorAfterDownload), true);

// reset đưa về trạng thái ban đầu, giữ đúng phiên bản đang chạy.
const reset = reduceUpdateState(state({ phase: 'downloaded', newVersion: '0.5.0' }), { type: 'reset' }, NOW);
assert.equal(reset.phase, 'idle');
assert.equal(reset.currentVersion, '0.4.0', 'reset does not forget what is installed');
assert.equal(reset.newVersion, '');

// update-not-available và update-downloaded trực tiếp (electron-updater đổi thứ tự kiện).
assert.equal(run(state({ phase: 'checking' }), { type: 'update-not-available', version: '0.4.0' }).phase, 'up-to-date');
const directDownloaded = run(state({ phase: 'checking' }), { type: 'update-downloaded', version: '0.5.0' });
assert.equal(directDownloaded.phase, 'downloaded');
assert.equal(directDownloaded.progressPercent, 100, 'the bar is full without ever seeing progress');

// update-downloaded không được bỏ trống số bản nếu kiện thiếu version.
const noVersion = run(state({ phase: 'downloading', newVersion: '0.5.0' }), { type: 'update-downloaded', version: '' });
assert.equal(noVersion.newVersion, '0.5.0', 'falls back to the version already known');

// reduceUpdateState là thuần: đối tượng đưa vào không bị sửa.
const frozen = state({ phase: 'available', newVersion: '0.5.0' });
const snapshot = JSON.stringify(frozen);
void reduceUpdateState(frozen, { type: 'download-started' }, NOW);
assert.equal(JSON.stringify(frozen), snapshot, 'the input state object is never mutated');

// --- điều khiển nút -------------------------------------------------------

assert.equal(canCheckForUpdates(state({ phase: 'idle' })), true);
assert.equal(canCheckForUpdates(state({ phase: 'checking' })), false, 'no queueing two checks');
assert.equal(canCheckForUpdates(state({ phase: 'downloading' })), false, 'and not while bytes are moving');
assert.equal(canCheckForUpdates(state({ phase: 'error' })), true, 'an error always allows a retry');

assert.equal(canDownloadUpdate(state({ phase: 'available', newVersion: '0.5.0' })), true);
assert.equal(canDownloadUpdate(state({ phase: 'available' })), false, 'no version means nothing to download');
assert.equal(canDownloadUpdate(state({ phase: 'idle' })), false, 'never download before asking');
assert.equal(canDownloadUpdate(state({ phase: 'downloading', newVersion: '0.5.0' })), false, 'and never twice');
assert.equal(canDownloadUpdate(state({ phase: 'downloaded', newVersion: '0.5.0' })), false, 'already on disk');

assert.equal(canInstallUpdate(state({ phase: 'downloaded', newVersion: '0.5.0' })), true);
assert.equal(canInstallUpdate(state({ phase: 'available', newVersion: '0.5.0' })), false, 'no installer yet');

// --- ước lượng và định dạng ----------------------------------------------

assert.equal(estimatedSecondsLeft(state({ phase: 'downloading', transferredBytes: 4_000_000, totalBytes: 10_000_000, bytesPerSecond: 1_000_000 })), 6);
assert.equal(estimatedSecondsLeft(state({ phase: 'downloading', transferredBytes: 4_000_000, totalBytes: 10_000_000, bytesPerSecond: 0 })), null, 'no speed, no promise');
assert.equal(estimatedSecondsLeft(state({ phase: 'downloaded', transferredBytes: 4, totalBytes: 10, bytesPerSecond: 1 })), null, 'ETA only while downloading');

assert.equal(formatBytes(0), '0 KB', 'zero is not "0 B" noise');
assert.equal(formatBytes(500), '500 B');
assert.equal(formatBytes(1024), '1,0 KB', 'one decimal below 100');
assert.equal(formatBytes(1_572_864), '1,5 MB');
assert.equal(formatBytes(157_286_400), '150 MB', 'no decimal at three digits');
assert.equal(formatBytes('nonsense'), '0 KB', 'junk never reaches the screen as NaN');

assert.equal(formatDuration(null), '');
assert.equal(formatDuration(0), '');
assert.equal(formatDuration(12), 'vài giây nữa');
assert.equal(formatDuration(90), '~90 giây nữa');
assert.equal(formatDuration(180), '~3 phút nữa');
assert.equal(formatDuration(7200), '~2 giờ nữa');

assert.equal(phaseLabel('idle'), 'chưa kiểm tra');
assert.equal(phaseLabel('up-to-date'), 'đã mới nhất');
assert.equal(phaseLabel('downloaded'), 'sẵn sàng cài');

console.log('update-policy.test.ts: all assertions passed');
