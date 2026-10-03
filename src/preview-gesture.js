export function makePreviewGestureFriendly(image) {
  if (!image) return image;

  image.draggable = false;
  image.setAttribute('draggable', 'false');
  image.style.setProperty('-webkit-user-drag', 'none', 'important');

  const anchor = image.closest?.('a[href]');
  if (anchor) {
    anchor.draggable = false;
    anchor.setAttribute('draggable', 'false');
    anchor.style.setProperty('-webkit-user-drag', 'none', 'important');
  }

  return image;
}
