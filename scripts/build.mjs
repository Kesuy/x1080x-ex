import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const entryPoint = fileURLToPath(new URL('../src/index.js', import.meta.url));
const outfile = fileURLToPath(new URL('../dist/x1080x-ex.user.js', import.meta.url));

const metadata = `// ==UserScript==
// @name         【x1080x 增强】下载附件和主楼图片
// @namespace    https://github.com/Kesuy/x1080x-ex
// @version      1.6.3
// @description  一键下载主楼资源，并增强 hdblog Preview 大图显示及主题批量后台打开
// @author       Kesuy
// @homepageURL  https://github.com/Kesuy/x1080x-ex
// @supportURL   https://github.com/Kesuy/x1080x-ex/issues
// @updateURL    https://raw.githubusercontent.com/Kesuy/x1080x-ex/main/dist/x1080x-ex.user.js
// @downloadURL  https://raw.githubusercontent.com/Kesuy/x1080x-ex/main/dist/x1080x-ex.user.js
// @match        *://*/*
// @connect      *
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_openInTab
// @run-at       document-idle
// ==/UserScript==`;

await build({
  entryPoints: [entryPoint],
  outfile,
  bundle: true,
  format: 'iife',
  target: ['chrome100', 'firefox100'],
  legalComments: 'none',
  banner: { js: metadata },
});
