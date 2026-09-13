from pathlib import Path

path = Path('test/mgs-title.test.js')
text = path.read_text(encoding='utf-8')
old = """    {
      kind: 'image',
      url: 'https://example.com/preview.jpg',
      name: '300MIUM-1407.jpg',
    },
"""
new = """    {
      kind: 'image',
      url: 'https://example.com/cover.jpg',
      name: '300MIUM-1407 A.jpg',
    },
    {
      kind: 'image',
      url: 'https://example.com/preview.jpg',
      name: '300MIUM-1407 B.jpg',
    },
"""
if text.count(old) != 1:
    raise SystemExit(f'expected one legacy MGS image assertion, got {text.count(old)}')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
