import { buildAttachmentFilename, getThreadHeadingText, parseThreadTitle } from './core.js';

// Mirror the site's preview -> CSRF -> claim -> receipt delivery flow. Paid
// quotes stay on the original controls so their confirmation is preserved.
const pendingClaims = new WeakMap();

export function collectModernNativeAttachments(document) {
  if (!document?.querySelector('#first-post')) return [];
  return [...document.querySelectorAll('#first-post .attachments-section .attachment')]
    .map((element) => {
      const button = element.querySelector('.file-get button:not([disabled])');
      const name = element.querySelector('.file-name')?.getAttribute('title')
        || element.querySelector('.file-name')?.textContent?.trim()
        || '';
      if (!button) return null;
      return { name: String(name).trim() || '未命名附件', button, slotId: element.getAttribute('data-slot-id') || '' };
    })
    .filter(Boolean);
}

export async function prepareModernAttachmentDownload(document, file, fetchImpl = document.defaultView.fetch.bind(document.defaultView)) {
  if (!/^[a-z0-9]+$/i.test(file.slotId || '')) throw new Error('站内附件缺少有效编号，请刷新页面');
  const view = document.defaultView;
  const origin = view.location.origin;
  const name = buildAttachmentFilename(parseThreadTitle(getThreadHeadingText(document)), file.name);
  const request = async (url, options = {}) => {
    const controller = new view.AbortController();
    const timer = view.setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetchImpl(new URL(url, origin).href, {
        ...options, credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      });
      if (!response.ok) throw new Error(`站内附件请求失败（HTTP ${response.status}），请刷新页面或使用网站按钮查看原因`);
      return await response.json();
    } finally {
      view.clearTimeout(timer);
    }
  };
  const quote = await request(`/api/slots/${file.slotId}/preview`);
  if (quote.status === 'denied' || quote.file_ready !== true) throw new Error('当前账号无下载资格或附件暂不可用，请查看网站提示');
  if (quote.payable_points === null || quote.payable_points === undefined
    || !/^\d+(?:\.\d+)?$/.test(String(quote.payable_points))) throw new Error('无法确认附件价格，未申请下载');
  if (Number(quote.payable_points) > 0) {
    const result = requestModernNativeAttachmentDownload(document, [file]);
    if (!result.total) throw new Error('无法打开网站的附件购买确认');
    return { delegated: true };
  }
  if (!quote.viewer_id || !quote.version_id || quote.price_points === undefined) throw new Error('网站下载报价信息不完整，未申请下载');
  let claims = pendingClaims.get(document);
  if (!claims) { claims = new Map(); pendingClaims.set(document, claims); }
  const quoteKey = JSON.stringify([quote.viewer_id, quote.version_id, quote.price_points, quote.payable_points]);
  let attempt = claims.get(file.slotId);
  if (!attempt || attempt.quoteKey !== quoteKey) {
    attempt = { quoteKey, payload: {
      expected_user_id: quote.viewer_id, slot_id: file.slotId,
      expected_version: quote.version_id, expected_price: quote.price_points,
      expected_payable: quote.payable_points, idempotency_key: view.crypto.randomUUID(),
    } };
    claims.set(file.slotId, attempt);
  }
  if (!attempt.receiptId) {
    const csrf = await request('/api/auth/csrf');
    if (!csrf.csrf_token) throw new Error('无法取得网站的下载校验信息，请刷新页面');
    const claim = await request('/api/downloads/claim', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf.csrf_token },
      body: JSON.stringify(attempt.payload),
    });
    if (claim.requires_new_claim) {
      claims.delete(file.slotId);
      throw new Error('网站下载凭证已过期，请再次点击下载');
    }
    if (!/^[a-z0-9-]{1,128}$/i.test(claim.receipt_id || '')) throw new Error('网站未返回有效下载凭证，未重复申请');
    attempt.receiptId = claim.receipt_id;
    view.dispatchEvent(new view.Event('memberchanged'));
  }
  return {
    url: new URL(`/api/downloads/file/${attempt.receiptId}`, origin).href,
    name,
    complete: () => claims.delete(file.slotId),
  };
}

export function requestModernNativeAttachmentDownload(document, files = collectModernNativeAttachments(document)) {
  if (!files.length) return { status: 'none', total: 0 };

  // Clicking the original website controls preserves its own login, permission,
  // quota and confirmation behavior. The userscript adds no second prompt.
  const triggered = [];
  const failedNames = [];
  for (const file of files) {
    try {
      if (!file.button.isConnected || file.button.disabled) throw new Error('附件按钮已不可用');
      file.button.click();
      triggered.push(file.name);
    } catch (error) {
      failedNames.push(file.name);
      console.warn('[x1080x-ex] native attachment click failed', {
        name: file.name,
        error: String(error?.message || error),
      });
    }
  }
  return {
    status: triggered.length ? 'triggered' : 'failed',
    total: triggered.length,
    attempted: files.length,
    failedNames,
    names: triggered,
  };
}
