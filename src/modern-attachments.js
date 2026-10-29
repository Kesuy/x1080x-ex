// The redesigned x1080x site serves attachments via authenticated React
// controls instead of public attachment URLs. Never infer an API endpoint from
// data-slot-id; delegate to the site's own button after explicit confirmation.
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

export function requestModernNativeAttachmentDownload(
  document,
  view = document?.defaultView
) {
  const files = collectModernNativeAttachments(document);
  if (!files.length) return { status: 'none', total: 0 };
  if (!view || typeof view.confirm !== 'function') {
    return { status: 'unsupported', total: files.length };
  }

  let selected = files[0];
  if (files.length > 1) {
    if (typeof view.prompt !== 'function') return { status: 'unsupported', total: files.length };
    const choices = files.map((file, index) => `${index + 1}. ${file.name}`).join('\n');
    const answer = view.prompt(
      `发现 ${files.length} 个附件。为避免重复计次，请选择本次下载的一个附件编号：\n${choices}`,
      '1'
    );
    if (answer === null) return { status: 'cancelled', total: files.length };
    const index = Number(answer.trim()) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= files.length) {
      view.alert?.('附件编号无效，本次未触发下载。');
      return { status: 'cancelled', total: files.length };
    }
    selected = files[index];
  }

  const approved = view.confirm(
    `将通过网站原生下载按钮获取：${selected.name}\n可能消耗网站下载次数或要求确认权限。是否继续？`
  );
  if (!approved) return { status: 'cancelled', total: files.length };
  // Exactly one click; never silently request all attachments.
  selected.button.click();
  return { status: 'triggered', total: files.length, name: selected.name };
}
