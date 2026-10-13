// Pixhost can return an HTTP 200 image containing its "Picture removed" card.
// Checking only the image URL or the /show/ page cannot detect that case.
const PIXHOST_IMAGE_HOST = /^(?:img\d+|t\d+)\.(?:pixhost\.(?:to|cc|org)|pixho\.st)$/i;
const IMAGE_CHECK_TIMEOUT = 8000;

export function isPixhostAssetUrl(value) {
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol)
      && PIXHOST_IMAGE_HOST.test(url.hostname)
      && /^\/(?:images|thumbs)\//i.test(url.pathname);
  } catch {
    return false;
  }
}

export function isPixhostRemovedPlaceholder(value, width, height) {
  if (!isPixhostAssetUrl(value)) return false;
  // Pixhost's small, wide removal card is rendered as a *successful* image.
  // Limit this heuristic to Pixhost assets to avoid excluding other previews.
  return width >= 240 && width <= 285
    && height >= 110 && height <= 155
    && width / height >= 1.7 && width / height <= 2.35;
}

export function checkPixhostPreviewImage(value, document, timeout = IMAGE_CHECK_TIMEOUT) {
  if (!isPixhostAssetUrl(value)) return Promise.resolve(true);
  const ImageConstructor = document?.defaultView?.Image;
  if (typeof ImageConstructor !== 'function') return Promise.resolve(true);

  return new Promise((resolve) => {
    const image = new ImageConstructor();
    let settled = false;
    let timer;
    const finish = (valid) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      resolve(valid);
    };
    image.onload = () => finish(
      image.naturalWidth > 0 && image.naturalHeight > 0
      && !isPixhostRemovedPlaceholder(value, image.naturalWidth, image.naturalHeight)
    );
    image.onerror = () => finish(false);
    timer = setTimeout(() => finish(false), timeout);
    image.src = value;
    if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
      image.onload();
    }
  });
}

export async function filterPixhostUnavailableImageUrls(result, document) {
  if (!result?.imageUrls?.length) return result;
  const valid = await Promise.all(result.imageUrls.map(
    (url) => checkPixhostPreviewImage(url, document)
  ));
  if (valid.every(Boolean)) return result;
  const imageUrls = result.imageUrls.filter((_url, index) => valid[index]);
  console.warn('[x1080x-ex] Pixhost unavailable Preview skipped', {
    code: result.code,
    skipped: result.imageUrls.length - imageUrls.length,
  });
  return { ...result, imageUrls };
}
