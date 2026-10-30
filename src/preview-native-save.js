// Keep the validated bytes available to the native image context menu. A new
// cross-site request made by Save image as can otherwise return a host HTML page.
export function preparePreviewForNativeSave(image, request = globalThis.GM_xmlhttpRequest) {
  const source = image.getAttribute('data-x1080x-hdblog-preview-url');
  const view = image.ownerDocument.defaultView;
  const urls = view?.URL;
  if (!source || typeof request !== 'function' || !urls?.createObjectURL) return Promise.resolve(false);
  return new Promise((resolve) => {
    let finished = false;
    const finish = (value) => { if (!finished) { finished = true; resolve(value); } };
    const referer = image.getAttribute('data-x1080x-preview-referer');
    try {
      request({
        method: 'GET', url: source, responseType: 'blob', timeout: 30000,
        headers: { Accept: 'image/*', ...(referer ? { Referer: referer } : {}) },
        async onload(response) {
          try {
            const blob = response.response;
            if (finished || response.status < 200 || response.status >= 300 || !blob?.size || typeof blob.arrayBuffer !== 'function') return finish(false);
            const bytes = new Uint8Array(await blob.slice(0, 32).arrayBuffer());
            const text = String.fromCharCode(...bytes);
            const type = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg'
              : text.startsWith('\x89PNG\r\n\x1a\n') ? 'image/png'
              : /^GIF8[79]a/.test(text) ? 'image/gif'
              : text.startsWith('RIFF') && text.slice(8, 12) === 'WEBP' ? 'image/webp'
              : text.slice(4, 8) === 'ftyp' && /avif|avis/.test(text.slice(8)) ? 'image/avif' : '';
            if (!type || finished || !image.isConnected) return finish(false);
            const objectUrl = urls.createObjectURL(new view.Blob([blob], { type }));
            image.src = objectUrl;
            const anchor = image.closest('a');
            if (anchor) anchor.href = objectUrl;
            view.addEventListener('pagehide', (event) => {
              if (event.persisted) return;
              // BFCache pages must keep the bytes available when restored.
              if (image.src === objectUrl) image.src = source;
              if (anchor?.href === objectUrl) anchor.href = source;
              urls.revokeObjectURL(objectUrl);
            });
            finish(true);
          } catch { finish(false); }
        },
        onerror: () => finish(false), ontimeout: () => finish(false), onabort: () => finish(false),
      });
    } catch { finish(false); }
  });
}
