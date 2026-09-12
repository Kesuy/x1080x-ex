from pathlib import Path

core = Path('src/core.js')
text = core.read_text(encoding='utf-8')
old_helper = """export function buildTorrentFilename(value) {\n  const normalized = String(value ?? '').replace(/\\(<([^<>]+)>\\)/g, '($1)');\n  return `${sanitizeFilename(normalized)}.torrent`;\n}\n"""
new_helper = """export function buildTorrentFilename(value) {\n  const normalized = String(value ?? '').replace(/\\([<＜]([^<>＜＞]+)[>＞]\\)/g, '($1)');\n  return `${sanitizeFilename(normalized)}.torrent`;\n}\n"""
if old_helper in text:
    text = text.replace(old_helper, new_helper, 1)
elif new_helper not in text:
    raise SystemExit('buildTorrentFilename helper not found')
core.write_text(text, encoding='utf-8')

test_file = Path('test/core.test.js')
tests = test_file.read_text(encoding='utf-8')
block = r'''

test('AVSA-428 种子名同时去掉半角和全角发布组尖括号', () => {
  for (const group of ['&lt;AVS collector’s&gt;', '＜AVS collector’s＞']) {
    const dom = new JSDOM(`
      <span id="thread_subject">AVSA-428 [BT](${group})(avsa00428) 追放失敗 居候無職元カノに射精管理される 逆転同棲性活 月野かすみ.</span>
      <div id="postlist"><div id="post_1"><div id="postmessage_1">
        magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567
      </div></div></div>
    `, { url: 'https://agaghhh.cc/forum.php?mod=viewthread&tid=1024015' });

    const torrent = buildDownloadJobs(dom.window.document).find((job) => job.kind === 'torrent');
    assert.equal(
      torrent?.name,
      'AVSA-428 [BT](AVS collector’s)(avsa00428) 追放失敗 居候無職元カノに射精管理される 逆転同棲性活 月野かすみ.torrent'
    );
  }
});
'''
if 'AVSA-428 种子名同时去掉半角和全角发布组尖括号' not in tests:
    test_file.write_text(tests.rstrip() + block + '\n', encoding='utf-8')
