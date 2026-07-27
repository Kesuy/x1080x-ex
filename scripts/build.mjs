import { build } from 'esbuild';

const metadata = `// ==UserScript==
// @name         【x1080x 增强】下载附件和主楼图片
// @namespace    https://github.com/Kesuy/x1080x-ex
// @version      1.1.0
// @description  一键下载 x1080x/Discuz 主楼附件与大图，支持 FC2 多图及自动重命名
// @author       Kesuy
// @homepageURL  https://github.com/Kesuy/x1080x-ex
// @supportURL   https://github.com/Kesuy/x1080x-ex/issues
// @updateURL    https://raw.githubusercontent.com/Kesuy/x1080x-ex/main/dist/x1080x-ex.user.js
// @downloadURL  https://raw.githubusercontent.com/Kesuy/x1080x-ex/main/dist/x1080x-ex.user.js
// @match        *://*/*
// @connect      *
// @grant        GM_download
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==`;

await build({
  entryPoints: ['src/userscript.js'],
  outfile: 'dist/x1080x-ex.user.js',
  bundle: true,
  format: 'iife',
  target: ['chrome100', 'firefox100'],
  legalComments: 'none',
  banner: { js: metadata },
});
