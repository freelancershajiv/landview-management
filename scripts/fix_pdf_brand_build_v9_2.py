from pathlib import Path

path = Path('app/admin/accounts/page.tsx')
text = path.read_text()
bad = 'let pdf = "%PDF-1.4\n";'
good = 'let pdf = "%PDF-1.4\\n";'
if bad not in text:
    raise SystemExit('Malformed PDF header string was not found')
path.write_text(text.replace(bad, good, 1))
print('Repaired PDF header with a literal backslash-n escape.')
