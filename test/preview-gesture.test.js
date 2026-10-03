import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { makePreviewGestureFriendly } from '../src/preview-gesture.js';

test('Preview image/link disable native drag without swallowing click or contextmenu', () => {
  const dom = new JSDOM(`<!doctype html><body>
    <a id="preview-link" href="https://img.example/full.jpg">
      <img id="preview-image" src="https://img.example/full.jpg">
    </a>
  </body>`);
  const image = dom.window.document.getElementById('preview-image');
  const link = dom.window.document.getElementById('preview-link');

  makePreviewGestureFriendly(image);

  assert.equal(image.draggable, false);
  assert.equal(image.getAttribute('draggable'), 'false');
  assert.equal(link.draggable, false);
  assert.equal(link.getAttribute('draggable'), 'false');
  assert.equal(image.style.getPropertyValue('-webkit-user-drag'), 'none');
  assert.equal(link.style.getPropertyValue('-webkit-user-drag'), 'none');

  let clicked = 0;
  link.addEventListener('click', (event) => {
    event.preventDefault();
    clicked += 1;
  });
  link.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.equal(clicked, 1);

  const menuEvent = new dom.window.MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    button: 2,
  });
  image.dispatchEvent(menuEvent);
  assert.equal(menuEvent.defaultPrevented, false);

  dom.window.close();
});
