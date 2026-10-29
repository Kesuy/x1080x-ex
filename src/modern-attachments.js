// The redesigned x1080x site serves attachments via authenticated React
// controls instead of public attachment URLs. Never infer an API endpoint from
// data-slot-id; delegate directly to the site's own buttons without an extra prompt.
export function collectModernNativeAttachments(document) {
  if (!document?.querySelector('#first-post')) return [];
  return [...document.querySelectorAll('#first-post .attachments-section .attachment')]
    .map((element) => {
      const button = element.querySelector('.file-get button:not([disabled])');
      const name = element.querySelector('.file-name')?.getAttribute('title')
        || element.querySelector('.file-name')?.textContent?.trim()
        || '';
      if (!button) return null;
      return { name: String(name).trim() || '未命名附件', button };
    })
    .filter(Boolean);
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
