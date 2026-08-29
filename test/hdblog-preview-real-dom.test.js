import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { expandHdblogPreviewImages } from '../src/hdblog-preview.js';

test('hdblog 直接文本 Preview 后的两张缩略图展开为上下大图', () => {
  const dom = new JSDOM(`
    <main id="genesis-content">
      <article class="entry">
        <div class="entry-content">
          <div>Katfile:<br><a href="/download.rar">download</a></div>
          <br>
          Preview:
          <br>
          <a id="first-link" href="/wp-content/uploads/2026/08/FC2PPV-4967987-a.jpg">
            <img id="first" src="/wp-content/uploads/2026/08/FC2PPV-4967987-a-150x300.jpg"
                 width="85" height="200" class="alignnone size-medium">
          </a>
          <img id="second" src="/wp-content/uploads/2026/08/FC2PPV-4967987-b-300x360.jpg"
               srcset="/wp-content/uploads/2026/08/FC2PPV-4967987-b-300x360.jpg 300w, /wp-content/uploads/2026/08/FC2PPV-4967987-b-768x922.jpg 768w"
               width="168" height="200">
          <hr>
          <div>Filed Under: JAV UnCensored</div>
          <img id="footer-image" src="/wp-content/uploads/footer-100x100.jpg" width="100" height="100">
        </div>
      </article>
    </main>
  `, { url: 'https://hdblog.me/983852/fc2ppv-4967987/' });

  const count = expandHdblogPreviewImages(dom.window.document, dom.window.location);
  assert.equal(count, 2);

  const first = dom.window.document.querySelector('#first');
  assert.equal(first.src, 'https://hdblog.me/wp-content/uploads/2026/08/FC2PPV-4967987-a.jpg');
  assert.equal(first.hasAttribute('width'), false);
  assert.equal(first.hasAttribute('height'), false);
  assert.equal(first.style.getPropertyValue('width'), '100%');
  assert.equal(first.style.getPropertyPriority('width'), 'important');
  assert.equal(first.style.getPropertyValue('display'), 'block');
  assert.equal(dom.window.document.querySelector('#first-link').style.getPropertyValue('display'), 'block');

  const second = dom.window.document.querySelector('#second');
  assert.equal(second.src, 'https://hdblog.me/wp-content/uploads/2026/08/FC2PPV-4967987-b.jpg');
  assert.equal(second.hasAttribute('srcset'), false);
  assert.equal(second.style.getPropertyValue('width'), '100%');
  assert.equal(second.dataset.x1080xPreviewLarge, '1');

  const footer = dom.window.document.querySelector('#footer-image');
  assert.equal(footer.src, 'https://hdblog.me/wp-content/uploads/footer-100x100.jpg');
  assert.equal(footer.getAttribute('width'), '100');
  assert.equal(footer.dataset.x1080xPreviewLarge, undefined);

  dom.window.close();
});

test('Preview 文本位于任意普通标签内也可以定位', () => {
  const dom = new JSDOM(`
    <article class="entry"><div class="entry-content">
      <div><span>Preview:</span></div>
      <p><img id="preview" data-orig-file="/uploads/full.webp" src="/uploads/thumb.webp" width="180"></p>
    </div></article>
  `, { url: 'https://hdblog.me/example/' });

  assert.equal(expandHdblogPreviewImages(dom.window.document, dom.window.location), 1);
  assert.equal(dom.window.document.querySelector('#preview').src, 'https://hdblog.me/uploads/full.webp');
  dom.window.close();
});

test('非 hdblog 页面不处理 Preview 图片', () => {
  const dom = new JSDOM(`
    <article class="entry"><div class="entry-content">
      Preview:<br><img id="preview" src="/uploads/photo-300x200.jpg" width="300">
    </div></article>
  `, { url: 'https://example.com/post/' });

  assert.equal(expandHdblogPreviewImages(dom.window.document, dom.window.location), 0);
  const image = dom.window.document.querySelector('#preview');
  assert.equal(image.getAttribute('width'), '300');
  assert.equal(image.dataset.x1080xPreviewLarge, undefined);
  dom.window.close();
});
