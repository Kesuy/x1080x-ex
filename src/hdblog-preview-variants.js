const FOUR_K_PREVIEW_TOKEN_PATTERN = /(?:^|[^a-z0-9])(?:4k(?:\d{2,3}fps)?|2160p|uhd)(?=$|[^a-z0-9])/i;

function searchablePreviewValue(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw, 'https://example.invalid/');
    return decodeURIComponent(url.pathname);
  } catch {
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
}

export function isFourKPreviewValue(value) {
  return FOUR_K_PREVIEW_TOKEN_PATTERN.test(searchablePreviewValue(value));
}

export function isFourKPreviewCandidate(candidate) {
  if (typeof candidate === 'string') return isFourKPreviewValue(candidate);
  if (!candidate || typeof candidate !== 'object') return false;
  const values = [
    candidate.href,
    candidate.pixhostShowUrl,
    candidate.directUrl,
    candidate.thumbUrl,
    ...(Array.isArray(candidate.values) ? candidate.values : []),
  ];
  return values.some(isFourKPreviewValue);
}

export function partitionPreviewCandidates(candidates = []) {
  const standard = [];
  const fourK = [];
  for (const candidate of candidates) {
    (isFourKPreviewCandidate(candidate) ? fourK : standard).push(candidate);
  }
  return { standard, fourK };
}
