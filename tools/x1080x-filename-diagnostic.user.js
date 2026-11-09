// ==UserScript==
// @name         x1080x-ex 下载文件名隔离诊断（不请求网站附件）
// @namespace    https://github.com/Kesuy/x1080x-ex
// @version      1.0.0
// @description  仅用本机生成的两个小 TXT 对照测试浏览器 a[download] 与 Tampermonkey GM_download 命名，无任何网站下载请求。
// @match        https://sehuatang.org/*
// @match        https://www.sehuatang.org/*
// @grant        GM_download
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';
  const nativeName = 'x1080x-native-anchor-name-test.txt';
  const gmName = 'x1080x-GM-download-name-test.txt';

  function status(message) {
    const old = document.getElementById('x1080x-filename-test-toast');
    old?.remove();
    const node = document.createElement('div');
    node.id = 'x1080x-filename-test-toast';
    node.style.cssText = 'position:fixed;bottom:18px;right:18px;z-index:2147483647;max-width:420px;padding:12px 16px;border-radius:10px;background:#18263a;color:white;box-shadow:0 6px 30px #0006;font:13px/1.6 system-ui,sans-serif;white-space:pre-wrap;';
    node.textContent = message;
    document.body.append(node);
    setTimeout(() => node.remove(), 16000);
  }

  function run() {
    const info = typeof GM_info === 'object' ? GM_info : {};
    const browserMode = info.downloadMode || '未知';
    const version = info.version || '未知';
    const nativeBlob = new Blob(['x1080x native anchor filename control\n'], { type: 'text/plain;charset=utf-8' });
    const nativeUrl = URL.createObjectURL(nativeBlob);
    const anchor = document.createElement('a');
    anchor.style.display = 'none';
    anchor.href = nativeUrl;
    anchor.download = nativeName;
    document.body.append(anchor);
    try { anchor.click(); } finally {
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(nativeUrl), 15000);
    }

    if (typeof GM_download !== 'function') {
      status('浏览器原生 TXT 已发起。GM_download 不可用。\nTampermonkey: ' + version + ' / 下载模式: ' + browserMode);
      return;
    }
    status('已发起 2 个不联网的小 TXT 测试。\n\n正确文件名应该是：\n1. ' + nativeName + '\n2. ' + gmName + '\n\nTampermonkey: ' + version + ' / 下载模式: ' + browserMode + '\n\n如果只有第 2 个名字不对，则问题不在 98堂附件。');
    try {
      GM_download({
        url: new Blob(['x1080x Tampermonkey GM_download filename control\n'], { type: 'text/plain;charset=utf-8' }),
        name: gmName,
        saveAs: false,
        onload: () => console.info('[x1080x filename diagnostic] GM_download completed; check actual saved filename.'),
        onerror: (error) => status('GM_download 本地 Blob 诊断失败：' + String(error?.error || '未知') + '\n详情：' + String(error?.details || '无') + '\n\n这个测试没有请求任何网站附件。'),
        ontimeout: () => status('GM_download 本地 Blob 诊断超时。\n没有请求任何网站附件。')
      });
    } catch (error) {
      status('GM_download 测试无法启动：' + String(error?.message || error) + '\n\n可能是 Tampermonkey 版本过旧（Blob 参数需 5.4.6226+）。');
    }
  }

  GM_registerMenuCommand('文件名诊断：下载两个本地测试 TXT（不访问网站附件）', run);
  GM_registerMenuCommand('文件名诊断：查看 Tampermonkey 版本与下载模式', () => {
    const info = typeof GM_info === 'object' ? GM_info : {};
    status('Tampermonkey 版本：' + String(info.version || '未知') + '\n下载模式：' + String(info.downloadMode || '未知') + '\n不会触发任何下载。');
  });
})();
