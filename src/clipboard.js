export async function copyTextToClipboard(
  document,
  value,
  gmSetClipboard = globalThis.GM_setClipboard
) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error('没有识别到影片番号。');

  if (typeof gmSetClipboard === 'function') {
    await Promise.resolve(gmSetClipboard(text, 'text'));
    return text;
  }

  const clipboard = document?.defaultView?.navigator?.clipboard;
  if (clipboard?.writeText) {
    await clipboard.writeText(text);
    return text;
  }

  if (!document?.body) throw new Error('当前页面无法访问剪切板。');
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  Object.assign(textarea.style, {
    position: 'fixed',
    left: '-9999px',
    top: '0',
    opacity: '0',
  });
  document.body.append(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  const copied = typeof document.execCommand === 'function' && document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('浏览器不支持自动复制，请手动复制。');
  return text;
}

export async function copyCodeWithButtonFeedback(button, document, code) {
  if (!button) return false;
  const originalText = button.textContent || '📋';
  const originalTitle = button.title || '复制番号到剪切板';
  button.disabled = true;
  try {
    const copied = await copyTextToClipboard(document, code);
    button.textContent = '✓';
    button.title = `已复制：${copied}`;
    return true;
  } catch (error) {
    button.textContent = '!';
    button.title = error?.message || '复制番号失败';
    document?.defaultView?.alert?.(`复制番号失败：${error?.message || error}`);
    return false;
  } finally {
    document?.defaultView?.setTimeout?.(() => {
      button.disabled = false;
      button.textContent = originalText;
      button.title = originalTitle;
    }, 1200);
  }
}
