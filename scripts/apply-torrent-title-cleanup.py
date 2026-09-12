from pathlib import Path

core = Path('src/core.js')
text = core.read_text(encoding='utf-8')
old_helper = """export function buildTorrentFilename(value) {\n  const normalized = String(value ?? '').replace(/\\([<＜]([^<>＜＞]+)[>＞]\\)/g, '($1)');\n  return `${sanitizeFilename(normalized)}.torrent`;\n}\n"""
new_helper = """export function buildTorrentFilename(value) {\n  const raw = String(value ?? '').replace(/\\s+/g, ' ').trim();\n  const normalized = raw.replace(\n    /^([A-Z0-9]+-\\d+)\\s+\\[BT\\]\\s*(?:\\([^)]*\\)\\s*)*/i,\n    '$1 '\n  );\n  return `${sanitizeFilename(normalized)}.torrent`;\n}\n"""
if old_helper in text:
    text = text.replace(old_helper, new_helper, 1)
elif new_helper not in text:
    raise SystemExit('buildTorrentFilename helper not found')
core.write_text(text, encoding='utf-8')

test_file = Path('test/core.test.js')
tests = test_file.read_text(encoding='utf-8')
old_expected = "'AVSA-428 [BT](AVS collector’s)(avsa00428) 追放失敗 居候無職元カノに射精管理される 逆転同棲性活 月野かすみ.torrent'"
new_expected = "'AVSA-428 追放失敗 居候無職元カノに射精管理される 逆転同棲性活 月野かすみ.torrent'"
tests = tests.replace(old_expected, new_expected)
block = r'''

test('AVSA-428 种子名移除 BT 发布参数但保留正文标题', () => {
  const variants = [
    '&lt;AVS collector’s&gt;',
    '＜AVS collector’s＞',
    'AVS collector’s',
  ];
  for (const group of variants) {
    const dom = new JSDOM(`
      <span id="thread_subject">AVSA-428 [BT](${group})(avsa00428) 追放失敗 居候無職元カノに射精管理される 逆転同棲性活 月野かすみ.</span>
      <div id="postlist"><div id="post_1"><div id="postmessage_1">
        magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567
      </div></div></div>
    `, { url: 'https://agaghhh.cc/forum.php?mod=viewthread&tid=1024015' });

    const torrent = buildDownloadJobs(dom.window.document).find((job) => job.kind === 'torrent');
    assert.equal(
      torrent?.name,
      'AVSA-428 追放失敗 居候無職元カノに射精管理される 逆転同棲性活 月野かすみ.torrent'
    );
  }
});

test('torrent 命名不会误删没有 BT 标记的正文括号', () => {
  const dom = new JSDOM(`
    <span id="thread_subject">DLDSS-504 (完全版) 正文タイトル.</span>
    <div id="postlist"><div id="post_1"><div id="postmessage_1">
      magnet:?xt=urn:btih:fedcba9876543210fedcba9876543210fedcba98
    </div></div></div>
  `, { url: 'https://agaghhh.cc/forum.php?mod=viewthread&tid=1' });

  const torrent = buildDownloadJobs(dom.window.document).find((job) => job.kind === 'torrent');
  assert.equal(torrent?.name, 'DLDSS-504 (完全版) 正文タイトル.torrent');
});
'''
if 'AVSA-428 种子名移除 BT 发布参数但保留正文标题' not in tests:
    tests = tests.rstrip() + block + '\n'
test_file.write_text(tests, encoding='utf-8')
