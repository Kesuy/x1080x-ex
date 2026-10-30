export const DOWNLOAD_ICON_PATH = 'M12 3v12m0 0-4-4m4 4 4-4M5 16v5h14v-5';

export function renderDownloadIcon(button) {
  const svg = button.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', width: '19', height: '19', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(key, value);
  svg.style.display = 'block';
  const path = button.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', DOWNLOAD_ICON_PATH);
  svg.append(path);
  button.replaceChildren(svg);
}
