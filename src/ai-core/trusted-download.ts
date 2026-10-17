const TRUSTED_HOSTS = [
  'huggingface.co',
  'hf.co',
  'github.com',
  'release-assets.githubusercontent.com',
  'objects.githubusercontent.com'
];

export async function fetchTrustedDownload(
  fetcher: typeof fetch,
  initialUrl: string,
  init: RequestInit = {}
): Promise<Response> {
  let current = new URL(initialUrl);
  assertTrustedUrl(current, true);

  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const response = await fetcher(current, { ...init, redirect: 'manual' });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    await response.body?.cancel();
    if (!location || redirects === 5) throw new Error('Máy chủ tải trả về quá nhiều hoặc thiếu thông tin chuyển hướng.');
    current = new URL(location, current);
    assertTrustedUrl(current, false);
  }

  throw new Error('Không thể xác định URL tải tin cậy.');
}

function assertTrustedUrl(url: URL, allowLoopback: boolean): void {
  const hostname = url.hostname.toLowerCase();
  const loopback = allowLoopback && url.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
  const trustedHost = TRUSTED_HOSTS.some(domain =>
    hostname === domain || hostname.endsWith(`.${domain}`)
  );
  if ((!loopback && (url.protocol !== 'https:' || !trustedHost)) ||
      url.username || url.password || url.hash) {
    throw new Error('URL tải hoặc chuyển hướng không thuộc nguồn HTTPS đã cho phép.');
  }
}
