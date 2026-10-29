const PREFIX = 'x1080x-ex:sehuatang-';
export const SHT_ATTACHMENTS_ENABLED_KEY = PREFIX + 'attachments-enabled';
export const SHT_DOWNLOAD_ENABLED_KEY = PREFIX + 'attachment-download-enabled';
export const SHT_REPLY_ENABLED_KEY = PREFIX + 'quick-reply-enabled';
export const SHT_HIDDEN_NOTICE_ENABLED_KEY = PREFIX + 'reply-hidden-notice-enabled';
export const SHT_REPLY_PHRASE_KEY = PREFIX + 'reply-phrase';
export const SHT_POSITION_KEY = PREFIX + 'toolbar-position';
export const DEFAULT_SHT_REPLY_PHRASE = '感谢楼主分享，辛苦了！';
const TOOLBAR_ID = 'x1080x-ex-sehuatang-toolbar';
const PANEL_ID = 'x1080x-ex-sehuatang-settings';
const LOCATE_HASH = '#x1080x-ex-locate-attachments';
const DOWNLOAD_HASH = '#x1080x-ex-download-attachments';

function read(key, fallback) {
  return typeof GM_getValue === 'function' ? GM_getValue(key, fallback) : fallback;
}

function save(key, value) {
  if (typeof GM_setValue === 'function') GM_setValue(key, value);
}

export function isSehuatangHost(location = globalThis.location) {
  return /^(www\.)?sehuatang\.org$/i.test(location?.hostname || '');
}

export function getSehuatangSettings() {
  const phrase = read(SHT_REPLY_PHRASE_KEY, DEFAULT_SHT_REPLY_PHRASE);
  return {
    attachments: read(SHT_ATTACHMENTS_ENABLED_KEY, true) !== false,
    download: read(SHT_DOWNLOAD_ENABLED_KEY, true) !== false,
    reply: read(SHT_REPLY_ENABLED_KEY, true) !== false,
    hiddenNotice: read(SHT_HIDDEN_NOTICE_ENABLED_KEY, true) !== false,
    phrase: typeof phrase === 'string' ? phrase : DEFAULT_SHT_REPLY_PHRASE,
  };
}

function isThread(location) {
  return /^\/thread-\d+-\d+-\d+\.html$/i.test(location.pathname)
    || (location.pathname.endsWith('/forum.php')
      && new URLSearchParams(location.search).get('mod') === 'viewthread'
      && /^\d+$/.test(new URLSearchParams(location.search).get('tid') || ''));
}

function originalPost(document) {
  const floor = [...document.querySelectorAll('#postlist [id^="postnum"]')]
    .find((node) => /^(楼主|樓主|1\s*#|1\s*楼)$/.test(node.textContent.trim()));
  const id = floor?.id.replace(/^postnum/, '');
  return id ? document.getElementById('post_' + id) || document.getElementById('pid' + id) : null;
}

export function hasSehuatangReplyHiddenContent(document) {
  const post = originalPost(document);
  if (!post) return false;
  const body = post.querySelector('[id^="postmessage_"]');
  return [...(body?.querySelectorAll('.locked') || [])].some((node) => {
    if (node.closest('.quote, blockquote, .tip, [id$="_menu"]')) return false;
    const text = node.textContent.replace(/\s+/g, '');
    if (!/[隐隱]藏/.test(text) || !/回[复覆復]/.test(text)) return false;
    for (let element = node; element && post.contains(element); element = element.parentElement) {
      const style = document.defaultView?.getComputedStyle(element);
      if (element.hidden || style?.display === 'none' || style?.visibility === 'hidden') return false;
    }
    return true;
  });
}

export function collectSehuatangAttachments(document) {
  const post = originalPost(document);
  if (!post) return [];
  const seen = new Set();
  return [...post.querySelectorAll('a[href]')].flatMap((link) => {
    // Only native file attachments; do not include preview images, menu copies or replies.
    if (link.querySelector('img') || link.closest('[id$="_menu"], .tip, .pattimg')) return [];
    let url;
    try { url = new URL(link.getAttribute('href'), document.baseURI); } catch { return []; }
    const aid = url.searchParams.get('aid');
    if (url.origin !== document.location.origin || !aid
      || !(url.pathname.endsWith('/attachment.php')
        || (url.pathname.endsWith('/forum.php') && url.searchParams.get('mod') === 'attachment'))
      || seen.has(aid)) return [];
    seen.add(aid);
    return [{ link, name: link.textContent.trim() || '附件 ' + (seen.size) }];
  });
}

export function sehuatangFirstPageUrl(location, action = 'locate') {
  const url = new URL(location.href);
  url.pathname = url.pathname.replace(/^(\/thread-\d+)-\d+-(\d+\.html)$/i, '$1-1-$2');
  for (const key of ['page', 'authorid', 'ordertype', 'pid', 'goto']) url.searchParams.delete(key);
  if (url.pathname.endsWith('/forum.php')) url.searchParams.set('page', '1');
  url.hash = action === 'download' ? DOWNLOAD_HASH : LOCATE_HASH;
  return url.href;
}

function createSehuatangButton(document, text, action) {
  const node = document.createElement('button');
  node.type = 'button';
  node.textContent = text;
  node.dataset.action = action;
  return node;
}

function focusAttachment(link) {
  link.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  link.focus({ preventScroll: true });
  link.animate?.([
    { outline: '4px solid #f59e0b', backgroundColor: '#fef3c7' },
    { outline: '4px solid #f59e0b', backgroundColor: '#fef3c7', offset: .8 },
    { outline: '0 solid transparent', backgroundColor: 'transparent' },
  ], { duration: 2500 });
}

export function downloadSehuatangAttachment(document, link) {
  if (!getSehuatangSettings().download) {
    return '附件下载已关闭，请在「⚙️ 98堂设置」中开启。';
  }
  const file = collectSehuatangAttachments(document).find((file) => file.link === link);
  if (!file) {
    return '附件链接已变化，请重新选择楼主附件。';
  }
  // Prefer native saving even for inline TXT responses, while keeping the signed URL,
  // original target and onclick (including native purchase/permission dialogs).
  const originalDownload = link.getAttribute('download');
  link.setAttribute('download', file.name);
  try { link.click(); }
  finally {
    if (originalDownload === null) link.removeAttribute('download');
    else link.setAttribute('download', originalDownload);
  }
  return '已触发网站附件下载，请查看浏览器下载列表或网站提示。';
}

// Use the site's own button, form validation and result UI. No direct POST or automatic retry.
export function submitSehuatangQuickReply(document, phrase) {
  const editor = document.getElementById('fastpostmessage');
  const submit = document.getElementById('fastpostsubmit');
  const form = document.getElementById('fastpostform');
  if (!editor || !submit || !form?.contains(editor) || !form.contains(submit)
    || editor.disabled || editor.readOnly || submit.disabled) {
    document.getElementById('f_pst')?.scrollIntoView?.({ block: 'center' });
    return { submitted: false, message: '快捷回复不可用，请先登录或查看网站的回复权限提示。' };
  }
  const text = String(phrase || '').trim();
  if (!text) return { submitted: false, message: '请先在「⚙️ 98堂设置」中填写回复短语。' };
  if (editor.value.trim()) {
    editor.scrollIntoView?.({ block: 'center' });
    editor.focus({ preventScroll: true });
    return { submitted: false, message: '回复框已有草稿，已保留；请在原回复框检查并发表。' };
  }
  const view = document.defaultView;
  editor.value = text;
  editor.dispatchEvent(new view.Event('input', { bubbles: true }));
  editor.dispatchEvent(new view.Event('change', { bubbles: true }));
  form.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  // Discuz initializes reply rules/captcha from the native button's mouseover handler.
  submit.dispatchEvent(new view.MouseEvent('mouseover', { bubbles: true }));
  submit.click();
  return { submitted: true, message: '已交给网站发表，请查看原生回复结果；如需验证码请手动完成。' };
}

export function openSehuatangSettings(document = globalThis.document) {
  if (!document?.body) return null;
  document.getElementById(PANEL_ID)?.remove();
  const settings = getSehuatangSettings();
  const overlay = document.createElement('div');
  overlay.id = PANEL_ID;
  Object.assign(overlay.style, { position: 'fixed', inset: '0', zIndex: '2147483646',
    display: 'grid', placeItems: 'center', padding: '16px', background: '#0006' });
  const form = document.createElement('form');
  Object.assign(form.style, { width: 'min(440px, 100%)', maxHeight: '85vh', overflow: 'auto',
    padding: '24px', boxSizing: 'border-box', background: '#fff', color: '#222',
    borderRadius: '12px', font: '14px/1.7 system-ui, sans-serif' });
  form.innerHTML = `<h2 style="margin:0 0 16px">98堂设置</h2>
    <label style="display:block;margin:12px 0"><input type="checkbox" data-setting="attachments"> 附件列表显示定位图标</label>
    <label style="display:block;margin:12px 0"><input type="checkbox" data-setting="download"> 附件列表显示下载图标</label>
    <label style="display:block;margin:12px 0"><input type="checkbox" data-setting="reply"> 显示「快捷回复」按钮</label>
    <label style="display:block;margin:12px 0"><input type="checkbox" data-setting="hidden-notice"> 提示楼主回复后可见的隐藏内容</label>
    <label style="display:block">回复短语<textarea data-setting="phrase" rows="3" style="display:block;width:100%;box-sizing:border-box;margin-top:6px"></textarea></label>
    <p>点击快捷回复会立即使用该短语发表，已有草稿时保留草稿。验证码、权限和限流仍由网站处理。</p>
    <p>浮动栏直接列出楼主附件，每个文件右侧提供定位和下载图标；悬浮图标可查看用途。下载沿用网站原生链接、权限及付费确认。</p>
    <p>拖动浮动栏顶部可移动并记住位置，按钮随页面滚动保持可见。</p>
    <button type="button" data-action="reset-position">重置按钮位置</button>
    <div style="display:flex;justify-content:flex-end;gap:12px;margin-top:20px">
      <button type="button" data-action="cancel">取消</button><button type="submit">保存</button>
    </div>`;
  const field = (name) => form.querySelector(`[data-setting="${name}"]`);
  field('attachments').checked = settings.attachments;
  field('download').checked = settings.download;
  field('reply').checked = settings.reply;
  field('hidden-notice').checked = settings.hiddenNotice;
  field('phrase').value = settings.phrase;
  let resetPosition = false;
  form.querySelector('[data-action="reset-position"]').addEventListener('click', (event) => {
    resetPosition = true;
    event.target.textContent = '保存后恢复默认位置';
  });
  form.querySelector('[data-action="cancel"]').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (event) => { if (event.target === overlay) overlay.remove(); });
  overlay.addEventListener('keydown', (event) => { if (event.key === 'Escape') overlay.remove(); });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (field('reply').checked && !field('phrase').value.trim()) {
      field('phrase').setCustomValidity('请填写回复短语，或关闭快捷回复按钮。');
      field('phrase').reportValidity();
      return;
    }
    save(SHT_ATTACHMENTS_ENABLED_KEY, field('attachments').checked);
    save(SHT_DOWNLOAD_ENABLED_KEY, field('download').checked);
    save(SHT_REPLY_ENABLED_KEY, field('reply').checked);
    save(SHT_HIDDEN_NOTICE_ENABLED_KEY, field('hidden-notice').checked);
    save(SHT_REPLY_PHRASE_KEY, field('phrase').value.trim());
    if (resetPosition) save(SHT_POSITION_KEY, null);
    overlay.remove();
    installSehuatangToolbar(document);
  });
  field('phrase').addEventListener('input', () => field('phrase').setCustomValidity(''));
  field('reply').addEventListener('change', () => field('phrase').setCustomValidity(''));
  overlay.append(form);
  document.body.append(overlay);
  return overlay;
}

const installations = new WeakMap();

export function installSehuatangToolbar(document) {
  installations.get(document)?.();
  document.getElementById(TOOLBAR_ID)?.remove();
  const view = document.defaultView;
  const settings = getSehuatangSettings();
  if (!isSehuatangHost(view.location) || !isThread(view.location)
    || (!settings.attachments && !settings.download && !settings.reply
      && !(settings.hiddenNotice && hasSehuatangReplyHiddenContent(document)))) return null;
  const host = document.createElement('div');
  host.id = TOOLBAR_ID;
  Object.assign(host.style, { position: 'fixed', zIndex: '2147483640', width: '220px', maxWidth: 'calc(100vw - 16px)' });
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    :host{font:13px/1.5 system-ui,sans-serif;color:#334155;color-scheme:light}
    *{box-sizing:border-box} .bar{padding:8px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 6px 24px #0f172a26;max-height:calc(100vh - 16px);overflow-y:auto}
    .handle{cursor:move;touch-action:none;user-select:none;text-align:center;font-size:12px;color:#64748b;padding:2px 0 8px}
    button{font:inherit;cursor:pointer;border:1px solid #dbe3ee;border-radius:7px;background:#f8fafc;color:#334155;padding:9px 7px;width:100%;text-align:left;overflow-wrap:anywhere}
    button:hover{background:#eff6ff;border-color:#93c5fd}button:focus-visible{outline:2px solid #2563eb}
    .actions{display:flex;justify-content:center}
    button[data-action="reply"]{width:auto;max-width:100%;min-width:112px;display:inline-flex;align-items:center;justify-content:center;padding:7px 14px;border-radius:999px;font-weight:600;background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;border-color:#2563eb;box-shadow:0 2px 6px #2563eb26}
    button[data-action="reply"]:hover{background:linear-gradient(135deg,#2563eb,#1d4ed8)}button:disabled{opacity:.55;cursor:wait}
    .attachments{margin-bottom:12px}.attachments[hidden]{display:none}
    .attachment-list{max-height:40vh;overflow-y:auto;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px}
    .choices:empty{display:none}.files-heading{font-size:12px;color:#64748b;margin-bottom:6px}
    .attachment-row,.hidden-notice{height:56px;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:6px;padding:8px;box-sizing:border-box}
    .attachment-row+.attachment-row,.choices:not(:empty)+.hidden-notice:not(:empty){border-top:1px solid #e2e8f0}
    .attachment-name{min-width:0;overflow-wrap:anywhere;font-size:12px;line-height:18px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .file-actions{display:flex;gap:4px}.file-actions button{width:28px;height:28px;padding:5px;display:grid;place-items:center;flex:none}
    .file-actions svg,.attachment-lock svg{width:16px;height:16px;display:block}
    .hidden-notice{color:#475569;font-size:12px;line-height:18px}
    .hidden-notice:empty{display:none}.hidden-notice strong{display:block;font-weight:600}.hidden-notice small{display:block;font-size:11px;color:#64748b;line-height:16px;margin-top:2px}
    .attachment-lock{width:28px;height:28px;display:grid;place-items:center;border:1px solid #dbe3ee;border-radius:7px;background:#f8fafc;color:#94a3b8}
    .status{font-size:12px;max-height:25vh;overflow:auto;overflow-wrap:anywhere}.status:empty{display:none}
  </style><div class="bar"><div class="handle" title="拖动移动；双击打开98堂设置">⠿ 98堂助手</div><section class="attachments" hidden><div class="files-heading"></div><div class="attachment-list"><div class="choices"></div><div class="hidden-notice" role="note"></div></div></section><div class="actions"></div><div class="status" role="status" aria-live="polite"></div></div>`;
  const actions = root.querySelector('.actions');
  const choices = root.querySelector('.choices');
  const attachmentsSection = root.querySelector('.attachments');
  const filesHeading = root.querySelector('.files-heading');
  const hiddenNotice = root.querySelector('.hidden-notice');
  const status = root.querySelector('.status');
  const handle = root.querySelector('.handle');
  handle.addEventListener('dblclick', () => openSehuatangSettings(document));
  let position = read(SHT_POSITION_KEY, null);
  let drag = null;
  const place = () => {
    const rect = host.getBoundingClientRect();
    const content = document.getElementById('ct') || document.getElementById('wp');
    const edge = content?.getBoundingClientRect().right;
    const x = position?.x ?? (edge ? edge + 18 : view.innerWidth - rect.width - 18);
    const y = position?.y ?? view.innerHeight * .36;
    host.style.left = Math.max(8, Math.min(Number.isFinite(x) ? x : 8, view.innerWidth - rect.width - 8)) + 'px';
    host.style.top = Math.max(8, Math.min(Number.isFinite(y) ? y : 8, view.innerHeight - rect.height - 8)) + 'px';
  };
  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const rect = host.getBoundingClientRect();
    drag = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
    handle.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });
  handle.addEventListener('pointermove', (event) => {
    if (!drag) return;
    position = { x: drag.left + event.clientX - drag.x, y: drag.top + event.clientY - drag.y };
    place();
  });
  const finishDrag = () => {
    if (!drag) return;
    drag = null;
    position = { x: parseFloat(host.style.left), y: parseFloat(host.style.top) };
    save(SHT_POSITION_KEY, position);
  };
  handle.addEventListener('pointerup', finishDrag);
  handle.addEventListener('pointercancel', finishDrag);
  handle.addEventListener('lostpointercapture', finishDrag);
  view.addEventListener('resize', place);
  let replyTimer;
  let attachmentObserver;
  installations.set(document, () => {
    view.removeEventListener('resize', place);
    view.clearTimeout(replyTimer);
    attachmentObserver?.disconnect();
    installations.delete(document);
  });
  const renderAttachments = () => {
    choices.replaceChildren();
    hiddenNotice.replaceChildren();
    attachmentsSection.hidden = true;
    filesHeading.textContent = '';
    status.textContent = '';
    const hiddenReply = settings.hiddenNotice && hasSehuatangReplyHiddenContent(document);
    if (hiddenReply) {
      hiddenNotice.innerHTML = '<div><strong>回复后可见</strong><small>隐藏内容（附件或链接）</small></div><span class="attachment-lock" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/></svg></span>';
      filesHeading.textContent = '楼主附件';
      attachmentsSection.hidden = false;
    }
    if (!settings.attachments && !settings.download) {
      place();
      return;
    }
    if (!originalPost(document)) {
      // Never mistake the first reply on page 2 for the original post.
      const action = settings.attachments ? 'locate' : 'download';
      const target = sehuatangFirstPageUrl(view.location, action);
      const current = new URL(view.location.href);
      current.hash = action === 'download' ? DOWNLOAD_HASH : LOCATE_HASH;
      if (target !== current.href) {
        const back = createSehuatangButton(document, '查看楼主附件', 'original-post');
        back.title = '返回主题第一页查看楼主附件列表';
        back.addEventListener('click', () => {
          const currentSettings = getSehuatangSettings();
          if (currentSettings.attachments || currentSettings.download) view.location.assign(target);
        });
        choices.append(back);
        filesHeading.textContent = '楼主附件';
        attachmentsSection.hidden = false;
      }
      else status.textContent = '当前页面未找到楼主正文，请查看网站的权限或隐藏内容提示。';
      place();
      return;
    }
    const attachments = collectSehuatangAttachments(document);
    if (!attachments.length && !hiddenReply) status.textContent = '楼主暂无可见文件附件；隐藏或付费附件请按网站提示操作。';
    else if (attachments.length) {
      filesHeading.textContent = `楼主附件（${attachments.length}）`;
      attachmentsSection.hidden = false;
      attachments.forEach(({ link, name }) => {
        const row = document.createElement('div');
        row.className = 'attachment-row';
        const filename = document.createElement('span');
        filename.className = 'attachment-name';
        filename.textContent = name;
        filename.title = name;
        const icons = document.createElement('div');
        icons.className = 'file-actions';
        const addIcon = (action, label, path, handler) => {
          const icon = createSehuatangButton(document, '', action);
          icon.title = label;
          icon.setAttribute('aria-label', label);
          icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
          icon.addEventListener('click', handler);
          icons.append(icon);
        };
        if (settings.attachments) addIcon('attachment', `定位附件：${name}`,
          'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0', () => {
            if (getSehuatangSettings().attachments) focusAttachment(link);
          });
        if (settings.download) addIcon('download-attachment', `下载附件：${name}`,
          'M12 3v12m0 0-4-4m4 4 4-4M5 16v5h14v-5', () => {
            status.textContent = downloadSehuatangAttachment(document, link);
            place();
          });
        row.append(filename, icons);
        choices.append(row);
      });
    }
    place();
  };
  if (settings.reply) {
    const replyButton = createSehuatangButton(document, '💬 快捷回复', 'reply');
    replyButton.title = `立即发表：${settings.phrase}`;
    replyButton.addEventListener('click', () => {
      if (replyButton.disabled) return;
      // Read settings again to honor edits made in another tab before posting.
      const current = getSehuatangSettings();
      if (!current.reply) return;
      const result = submitSehuatangQuickReply(document, current.phrase);
      status.textContent = result.message;
      if (result.submitted) {
        replyButton.disabled = true;
        replyTimer = view.setTimeout(() => { replyButton.disabled = false; }, 10000);
      }
      place();
    });
    actions.append(replyButton);
  }
  document.body.append(host);
  if (settings.attachments || settings.download || settings.hiddenNotice) {
    renderAttachments();
    const post = originalPost(document);
    if (post && typeof view.MutationObserver === 'function') {
      const collect = () => settings.attachments || settings.download ? collectSehuatangAttachments(document) : [];
      let previous = collect();
      let previousHidden = settings.hiddenNotice && hasSehuatangReplyHiddenContent(document);
      attachmentObserver = new view.MutationObserver(() => {
        const current = collect();
        const currentHidden = settings.hiddenNotice && hasSehuatangReplyHiddenContent(document);
        if (currentHidden === previousHidden && current.length === previous.length && current.every((file, i) => (
          file.link === previous[i].link && file.name === previous[i].name
        ))) return;
        previous = current;
        previousHidden = currentHidden;
        renderAttachments();
      });
      attachmentObserver.observe(post, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['href', 'class', 'style', 'hidden'] });
    }
  }
  place();
  const arrivedToDownload = settings.download && view.location.hash === DOWNLOAD_HASH;
  if ((settings.attachments && view.location.hash === LOCATE_HASH) || arrivedToDownload) {
    view.history.replaceState(view.history.state, '', view.location.pathname + view.location.search);
  }
  return host;
}

export function installSehuatangEnhancement(document = globalThis.document, location = globalThis.location) {
  if (!document?.body || !isSehuatangHost(location)) return null;
  const view = document.defaultView;
  if (view && view.top !== view) return null;
  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('⚙️ 98堂设置', () => openSehuatangSettings(document));
  }
  return installSehuatangToolbar(document);
}
