// MV3: overwrite the filename of the SAME native Chrome download.
// Do not issue a network request: original site cookies, referrer and download
// authorization remain untouched. Suggestions survive service-worker suspension
// by being stored in chrome.storage.session.
const PREFIX = 'sht-filename:';
const MAX_AGE = 12 * 60 * 60 * 1000;

function attachment(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !/^(?:www\.)?sehuatang\.org$/i.test(parsed.hostname)) return null;
    if (!(parsed.pathname.endsWith('/attachment.php') ||
      (parsed.pathname.endsWith('/forum.php') && parsed.searchParams.get('mod') === 'attachment'))) return null;
    const aid = parsed.searchParams.get('aid');
    return aid && aid.length < 500 ? { url: parsed.href, aid } : null;
  } catch { return null; }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  const source = attachment(sender.url || '');
  const candidate = attachment(message?.url || '');
  const filename = message?.filename;
  if (message?.type !== 'sht-suggest' || !candidate ||
      !source && !/^(?:https:\/\/)(?:www\.)?sehuatang\.org\//i.test(sender.url || '') ||
      typeof filename !== 'string' || filename.length > 210 ||
      /[\\/:*?"<>|\x00-\x1f]/.test(filename) || !filename.toLowerCase().endsWith('.txt')) return;
  const key = PREFIX + candidate.aid;
  chrome.storage.session.set({ [key]: { url: candidate.url, filename, at: Date.now() } })
    .then(() => respond({ ok: true }), () => respond({ ok: false }));
  return true;
});

chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  const target = attachment(downloadItem.url);
  if (!target) return;
  const key = PREFIX + target.aid;
  chrome.storage.session.get(key).then((result) => {
    const saved = result[key];
    if (saved?.url === target.url && Date.now() - saved.at >= 0 &&
        Date.now() - saved.at < MAX_AGE) {
      suggest({ filename: saved.filename, conflictAction: 'uniquify' });
    } else {
      suggest();
    }
  }).catch(() => suggest());
  return true;
});
