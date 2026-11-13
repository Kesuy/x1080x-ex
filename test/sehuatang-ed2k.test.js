import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { extractEd2kLinks, collectSehuatangEd2kBlocks, installSehuatangEd2kExport, installSehuatangToolbar, SHT_ED2K_EXPORT_ENABLED_KEY } from '../src/sehuatang.js';

const a = 'ed2k://|file|example one.txt|123|0123456789abcdef0123456789abcdef|/';
const b = 'ed2k://|file|example-two.txt|456|fedcba9876543210fedcba9876543210|/';
function fixture() {
  return new JSDOM('<body><span id="thread_subject">【ED2K】授权样例</span><div id="postlist"><div id="post_1"><a id="postnum1">楼主</a><div id="postmessage_1"><div class="blockcode"><ol><li>'+a+'</li><li>'+b+'</li><li>'+a+'</li></ol><em>复制代码</em></div><blockquote><pre>'+b+'</pre></blockquote><div hidden><pre>'+b+'</pre></div></div></div><div id="post_2"><pre>'+b+'</pre></div></div></body>', {url:'https://www.sehuatang.org/forum.php?mod=viewthread&tid=1'});
}
test('ED2K extracts complete links, removes duplicates and ignores incomplete data', () => {
  assert.deepEqual(extractEd2kLinks(a+'\n'+b+'\n'+a+'\ned2k://|file|broken'), [a,b]);
});
test('ED2K code blocks are limited to visible original-post resources', () => {
  const dom=fixture();
  const blocks=collectSehuatangEd2kBlocks(dom.window.document);
  assert.equal(blocks.length,1);
  assert.deepEqual(blocks[0].links,[a,b]);
  dom.window.document.getElementById('thread_subject').textContent='【原档泄密】测试';
  assert.deepEqual(collectSehuatangEd2kBlocks(dom.window.document).map(({ links }) => links), [[a,b]]);
  dom.window.close();
});
test('ED2K control is independent, idempotent and saves one named UTF-8 TXT', async () => {
  const dom=fixture(), d=dom.window.document;
  const oldGet=globalThis.GM_getValue, oldDownload=globalThis.GM_download, oldInfo=globalThis.GM_info;
  let enabled=true, saved;
  globalThis.GM_getValue=(key,fallback)=>key===SHT_ED2K_EXPORT_ENABLED_KEY?enabled:fallback;
  globalThis.GM_info={scriptHandler:'Tampermonkey',version:'5.4.6226'};
  globalThis.GM_download=()=>{throw new Error('ED2K must use native browser download');};
  let blob;
  dom.window.URL.createObjectURL=value=>{blob=value;return 'blob:ed2k-test';};
  dom.window.URL.revokeObjectURL=()=>{};
  dom.window.HTMLAnchorElement.prototype.click=function(){saved={name:this.download,url:blob};};
  try {
    installSehuatangEd2kExport(d); installSehuatangEd2kExport(d);
    const buttons=d.querySelectorAll('[data-x1080x-ed2k-export]');
    assert.equal(buttons.length,1);
    assert.equal(buttons[0].previousElementSibling.textContent,'复制代码');
    buttons[0].click();
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(saved.name,'授权样例.txt');
    const text=await new Promise((resolve,reject)=>{const reader=new dom.window.FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsText(saved.url);});
    assert.equal(text,a+'\r\n'+b+'\r\n');
    assert.equal(buttons[0].dataset.downloadState,'started');
    installSehuatangEd2kExport(d);
    assert.equal(buttons[0].dataset.downloadState,'started');
    enabled=false;installSehuatangEd2kExport(d);
    assert.equal(d.querySelector('[data-x1080x-ed2k-export]'),null);
    enabled=true;installSehuatangEd2kExport(d);
    assert.equal(d.querySelector('[data-x1080x-ed2k-export]').dataset.downloadState,'started');
  } finally {
    globalThis.GM_getValue=oldGet;globalThis.GM_download=oldDownload;globalThis.GM_info=oldInfo;dom.window.close();
  }
});

test('Discuz real-layout code list exposes both export controls and shares completion status', async () => {
  const dom=fixture(), d=dom.window.document;
  const body=d.getElementById('postmessage_1');
  body.innerHTML='<font>【资源链接】：</font><br><div class="blockcode" data-mtt-processed=""><div id="code_rUZ"><ol>'+Array.from({length:6},(_,i)=>'<li>ed2k://|file|example-'+i+'.txt|'+(100+i)+'|0123456789abcdef0123456789abcde'+i+'|/<br></li>').join('')+'</ol></div><em>复制代码</em></div>';
  const oldDownload=globalThis.GM_download, oldInfo=globalThis.GM_info;
  let saved, calls=0;
  globalThis.GM_info={scriptHandler:'Tampermonkey',version:'5.4.6226'};
  globalThis.GM_download=()=>{throw new Error('ED2K must use native browser download');};
  dom.window.URL.createObjectURL=()=> 'blob:ed2k-test';
  dom.window.URL.revokeObjectURL=()=>{};
  dom.window.HTMLAnchorElement.prototype.click=function(){saved={name:this.download};calls++;};
  try {
    const root=installSehuatangToolbar(d).shadowRoot;
    const inline=d.querySelector('[data-x1080x-ed2k-export]');
    const floating=root.querySelector('[data-action="download-ed2k"]');
    assert.ok(inline);
    assert.match(floating.textContent,/6 条/);
    assert.equal(root.querySelector('.status').textContent,'');
    floating.click();
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(calls,1);
    assert.equal(saved.name,'授权样例.txt');
    assert.equal(inline.dataset.downloadState,'started');
    assert.equal(floating.dataset.downloadState,'started');
    assert.equal(d.querySelectorAll('[data-x1080x-ed2k-export]').length,1);
  } finally {
    globalThis.GM_download=oldDownload;globalThis.GM_info=oldInfo;dom.window.close();
  }
});
