import { readFile, writeFile } from 'node:fs/promises';

const sourcePath = new URL('../src/hdblog-article.js', import.meta.url);
let source = await readFile(sourcePath, 'utf8');

const start = source.indexOf('@media (min-width: 1100px) {');
const endMarker = '\n}\n`;\n  return true;';
const end = source.indexOf(endMarker, start);
if (start < 0 || end < 0) throw new Error('Could not locate existing responsive layout block');

const responsiveCss = `body.\${ARTICLE_BODY_CLASS} .site-header .wrap,
body.\${ARTICLE_BODY_CLASS} .nav-primary .wrap,
body.\${ARTICLE_BODY_CLASS} .site-inner,
body.\${ARTICLE_BODY_CLASS} .content-sidebar-wrap {
  box-sizing: border-box !important;
  margin-left: auto !important;
  margin-right: auto !important;
}
body.\${ARTICLE_BODY_CLASS} article.entry,
body.\${ARTICLE_BODY_CLASS} article.post,
body.\${ARTICLE_BODY_CLASS} article.entry > .entry-header,
body.\${ARTICLE_BODY_CLASS} article.post > .entry-header,
body.\${ARTICLE_BODY_CLASS} article.entry > .entry-content,
body.\${ARTICLE_BODY_CLASS} article.post > .entry-content {
  width: 100% !important;
  max-width: none !important;
  box-sizing: border-box !important;
  margin-left: auto !important;
  margin-right: auto !important;
}
body.\${ARTICLE_BODY_CLASS} .nav-primary .genesis-nav-menu {
  display: flex !important;
  flex-wrap: wrap !important;
  width: 100% !important;
  max-width: none !important;
}
@media (min-width: 1100px) {
  body.\${ARTICLE_BODY_CLASS} .site-header .wrap,
  body.\${ARTICLE_BODY_CLASS} .nav-primary .wrap,
  body.\${ARTICLE_BODY_CLASS} .site-inner,
  body.\${ARTICLE_BODY_CLASS} .content-sidebar-wrap {
    width: min(
      calc(var(--x1080x-hdblog-article-width) + var(--x1080x-hdblog-sidebar-width) + var(--x1080x-hdblog-column-gap)),
      calc(100vw - 40px)
    ) !important;
    max-width: none !important;
  }
  body.\${ARTICLE_BODY_CLASS} .content-sidebar-wrap {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) var(--x1080x-hdblog-sidebar-width) !important;
    column-gap: var(--x1080x-hdblog-column-gap) !important;
    align-items: start !important;
  }
  body.\${ARTICLE_BODY_CLASS} main#genesis-content,
  body.\${ARTICLE_BODY_CLASS} #genesis-content.content {
    width: 100% !important;
    max-width: var(--x1080x-hdblog-article-width) !important;
    float: none !important;
    margin: 0 !important;
  }
  body.\${ARTICLE_BODY_CLASS} .sidebar-primary,
  body.\${ARTICLE_BODY_CLASS} aside.sidebar-primary {
    width: 100% !important;
    max-width: var(--x1080x-hdblog-sidebar-width) !important;
    float: none !important;
    margin-left: 0 !important;
    margin-right: 0 !important;
  }
}
@media (max-width: 1099px) {
  body.\${ARTICLE_BODY_CLASS} .site-header .wrap,
  body.\${ARTICLE_BODY_CLASS} .nav-primary .wrap,
  body.\${ARTICLE_BODY_CLASS} .site-inner,
  body.\${ARTICLE_BODY_CLASS} .content-sidebar-wrap {
    width: calc(100vw - 24px) !important;
    max-width: none !important;
  }
  body.\${ARTICLE_BODY_CLASS} .content-sidebar-wrap {
    display: block !important;
  }
  body.\${ARTICLE_BODY_CLASS} main#genesis-content,
  body.\${ARTICLE_BODY_CLASS} #genesis-content.content,
  body.\${ARTICLE_BODY_CLASS} .sidebar-primary,
  body.\${ARTICLE_BODY_CLASS} aside.sidebar-primary {
    width: 100% !important;
    max-width: none !important;
    float: none !important;
    margin-left: 0 !important;
    margin-right: 0 !important;
  }
  body.\${ARTICLE_BODY_CLASS} .sidebar-primary,
  body.\${ARTICLE_BODY_CLASS} aside.sidebar-primary {
    margin-top: 28px !important;
  }
}`;

source = source.slice(0, start) + responsiveCss + source.slice(end + 2);
source = source.replaceAll("button.textContent = '⬇ 下载图片';", "button.textContent = '⬇';");
source = source.replace(
  "button.title = '只下载 Preview 区由 Pixhost show 提供的大图，并自动按影片番号重命名';",
  "button.title = '下载 Pixhost Preview 大图，并自动按影片番号重命名';\n  button.setAttribute('aria-label', '下载 Pixhost Preview 大图');"
);
source = source.replace(
  "padding: '5px 10px',",
  "padding: '5px 8px',\n    minWidth: '34px',\n    justifyContent: 'center',"
);
await writeFile(sourcePath, source, 'utf8');

const testPath = new URL('../test/hdblog-article.test.js', import.meta.url);
let test = await readFile(testPath, 'utf8');
test = test.replace(
  '  isHdblogArticlePage,\n  normalizeHdblogArticleWidth,',
  '  isHdblogArticlePage,\n  installHdblogArticleEnhancement,\n  normalizeHdblogArticleWidth,'
);
const needle = "  assert.match(style.textContent, /--x1080x-hdblog-article-width:\\s*1280px/);\n";
if (!test.includes(needle)) throw new Error('Could not locate layout assertion anchor');
test = test.replace(
  needle,
  needle
    + "  assert.match(style.textContent, /\\.site-header \\.wrap/);\n"
    + "  assert.match(style.textContent, /\\.nav-primary \\.wrap/);\n"
    + "  assert.match(style.textContent, /article\\.entry,[\\s\\S]*?width:\\s*100% !important/);\n"
    + "  assert.match(style.textContent, /display:\\s*grid !important/);\n"
);
if (!test.includes("article download button uses an icon-only idle label")) {
  test += `\n\ntest('article download button uses an icon-only idle label', () => {\n  const dom = articleDom({ content: '<p>Preview:</p>' });\n  installHdblogArticleEnhancement(dom.window.document, dom.window.location, () => {});\n  const button = dom.window.document.querySelector('#x1080x-ex-hdblog-image-download');\n  assert.ok(button);\n  assert.equal(button.textContent, '⬇');\n  assert.equal(button.getAttribute('aria-label'), '下载 Pixhost Preview 大图');\n});\n`;
}
await writeFile(testPath, test, 'utf8');
