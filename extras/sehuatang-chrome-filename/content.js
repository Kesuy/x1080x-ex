// Optional Chrome extension: register filename suggestions before a native download.
// Never fetch attachment bytes, navigate, or synthesize a second download.
(() => {
  'use strict';
  const isSite = (hostname) => /^(?:www\.)?sehuatang\.org$/i.test(hostname);
  if (!isSite(location.hostname)) return;
  const directoryPattern = /(?:目录(?:树)?|目錄(?:樹)?|清单|清單|文件列表|readme|file[\s_-]*list)/iu;
  const reported = new Map();

  function titleFilename(title, original) {
    if (!/\.txt$/i.test(original) || directoryPattern.test(original)) return '';
    const cleaned = String(title || '')
      .replace(/^(?:【[^】]*(?:ED2K|整理)[^】]*】\s*)+/iu, '')
      .trim();
    if (!cleaned) return '';
    const repl = { '\\': '＼', '/': '／', ':': '：', '*': '＊', '?': '？',
      '"': '＂', '<': '〈', '>': '〉', '|': '｜' };
    const safe = cleaned.replace(/[\\/:*?"<>|]/g, (ch) => repl[ch])
      .replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ')
      .replace(/[.\s]+$/g, '').slice(0, 180).replace(/[.\s]+$/g, '');
    return safe ? safe + '.txt' : '';
  }

  function originalPost() {
    const floor = [...document.querySelectorAll('#postlist [id^="postnum"]')]
      .find((node) => /^(楼主|樓主|1\s*#|1\s*楼)$/.test(node.textContent.trim()));
    const id = floor?.id.replace(/^postnum/, '');
    return id ? document.getElementById('post_' + id) || document.getElementById('pid' + id) : null;
  }

  function sync() {
    const post = originalPost();
    const title = document.querySelector('#thread_subject')?.textContent?.trim();
    if (!post || !title) return;
    for (const link of post.querySelectorAll('a[href]')) {
      if (link.querySelector('img') || link.closest('[id$="_menu"], .tip, .pattimg')) continue;
      let url;
      try { url = new URL(link.getAttribute('href'), document.baseURI); } catch { continue; }
      if (!isSite(url.hostname) || url.origin !== location.origin) continue;
      if (!(url.pathname.endsWith('/attachment.php') ||
        (url.pathname.endsWith('/forum.php') && url.searchParams.get('mod') === 'attachment'))) continue;
      if (!url.searchParams.has('aid')) continue;
      const filename = titleFilename(title, link.textContent.trim());
      if (!filename || filename === link.textContent.trim()) continue;
      if (reported.get(url.href) === filename) continue;
      reported.set(url.href, filename);
      chrome.runtime.sendMessage({ type: 'sht-suggest', url: url.href, filename }, () => {
        // The extension can be updated while the page is open.
        void chrome.runtime.lastError;
      });
    }
  }

  sync();
  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; sync(); });
  });
  observer.observe(document.getElementById('postlist') || document.body, { childList: true, subtree: true, characterData: true });
})();
