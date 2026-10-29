// Use the userscript manager's completion callback when available. A synthetic
// anchor click only starts a download and cannot prove that the file was saved.
export async function saveDownloadBlob(blob, name, document = globalThis.document, { browserDownload = false } = {}) {
  const view = document.defaultView;
  if (!browserDownload && typeof GM_download === 'function') {
    const info = typeof GM_info === 'object' ? GM_info : {};
    const version = String(info.version || '').split('.').map(Number);
    const supportsBlob = info.scriptHandler === 'Tampermonkey' && (
      version[0] > 5 || (version[0] === 5 && (version[1] > 4
        || (version[1] === 4 && version[2] >= 6226)))
    );
    const objectUrl = supportsBlob ? null : view.URL.createObjectURL(blob);
    let timer;
    try {
      await new Promise((resolve, reject) => {
        let handle;
        timer = view.setTimeout(() => {
          handle?.abort?.();
          reject(new Error('保存文件超时，请检查浏览器下载列表'));
        }, 60000);
        const finish = (callback) => (value) => {
          view.clearTimeout(timer);
          callback(value);
        };
        handle = GM_download({
          url: objectUrl || blob,
          name,
          saveAs: false,
          onload: finish(resolve),
          onerror: finish((error) => {
            const reasons = {
              not_enabled: '请在 Tampermonkey 设置中启用下载功能',
              not_whitelisted: '请在 Tampermonkey 设置中允许此文件扩展名',
              not_permitted: '请授予 Tampermonkey 下载权限',
              not_supported: '当前脚本管理器不支持此下载方式',
            };
            reject(new Error(reasons[error?.error] || '文件保存失败或已取消，请检查浏览器下载列表'));
          }),
          ontimeout: finish(() => reject(new Error('保存文件超时，请检查浏览器下载列表'))),
        });
      });
      return { confirmed: true };
    } finally {
      view.clearTimeout(timer);
      if (objectUrl) view.URL.revokeObjectURL(objectUrl);
    }
  }

  const objectUrl = view.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.hidden = true;
  anchor.download = name;
  anchor.href = objectUrl;
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    // Give the browser time to take ownership before releasing the Blob.
    view.setTimeout(() => view.URL.revokeObjectURL(objectUrl), 10000);
  }
  return { confirmed: false };
}
