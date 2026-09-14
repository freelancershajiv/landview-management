from pathlib import Path
import re

path = Path('app/admin/accounts/page.tsx')
text = path.read_text()
fixed, count = re.subn(r'let pdf = "%PDF-1\.4\s*";', 'let pdf = "%PDF-1.4\\n";', text, count=1)
if count != 1:
    raise SystemExit('Could not locate malformed PDF header string')
path.write_text(fixed)
print('Repaired PDF header string escape.')
