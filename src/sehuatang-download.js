import { saveDownloadBlob } from './blob-download.js';

// A same-origin page fetch includes the session and Referer of Discuz's signed
// attachment URL. Saving its Blob removes the remote Content-Disposition name.
export async function downloadSehuatangNamedTxtBlob(document, link, filename) {
  const view = document?.defaultView;
  const url = new URL(link?.getAttribute('href') || '', document?.baseURI);
  if (url.origin !== document?.location?.origin || !/\.txt$/i.test(filename)) {
    throw new Error('附件来源或目标文件名无效');
  }
  if (typeof view?.fetch !== 'function') {
    throw new Error('当前浏览器不支持同源附件读取');
  }
  const response = await view.fetch(url.href, {
    method: 'GET',
    credentials: 'include',
    redirect: 'follow',
    cache: 'no-store',
  });
  if (!response?.ok) throw new Error('网站返回 HTTP ' + (response?.status ?? '未知状态'));
  const type = response.headers?.get?.('content-type') || '';
  if (/(?:text\/html|application\/(?:json|xml|xhtml\+xml))/i.test(type)) {
    throw new Error('网站返回了网页或验证提示，而非附件');
  }
  const blob = await response.blob();
  if (!blob || blob.size === 0) throw new Error('附件为空');
  const prefix = await blob.slice(0, 512).text();
  if (/^\s*(?:<!doctype\s+html|<html\b|<head\b|<body\b|<script\b|<form\b)/i.test(prefix)) {
    throw new Error('网站返回了登录或权限页面，而非 TXT 附件');
  }
  return saveDownloadBlob(blob, filename, document, { browserDownload: true });
}
