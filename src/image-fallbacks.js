export function alternateImageUrls(value) {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || !/(?:^|\.)hxmmdd\.com$/i.test(url.hostname)) return [];
    let alternatePath = '';
    if (url.pathname.includes('/images/pics/')) {
      alternatePath = url.pathname.replace('/images/pics/', '/images-v2/pics/');
    } else if (url.pathname.includes('/images-v2/pics/')) {
      alternatePath = url.pathname.replace('/images-v2/pics/', '/images/pics/');
    }
    if (!alternatePath || alternatePath === url.pathname) return [];
    url.pathname = alternatePath;
    return [url.href];
  } catch {
    return [];
  }
}
