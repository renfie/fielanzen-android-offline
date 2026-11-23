#!/usr/bin/env python3
"""Conservative pre-publication file audit (no network, no uploads).

Use before the FIRST public repository push. Check both working tree and staged files.
This guard only catches risky paths, not secrets pasted into regular source files.
"""
from pathlib import Path
import fnmatch
import subprocess
import sys

root = Path(__file__).resolve().parent.parent
patterns = ('*.backup', '*.backup.gz', '*.sqlite', '*.sqlite3', '*.db', '*.db-wal', '*.db-shm', '*.csv', '*.xlsx',
            'FieLanzen-Offline-*.json', 'FieLanzen-Importprotokoll-*.json', '.env', '.env.*', '*.keystore', '*.jks',
            'private-data/*', 'user-data/*', 'exports/*', 'backups/*', 'sicherungen/*')

def dangerous(path: str) -> bool:
    parts = path.replace('\\', '/').split('/')
    return any(fnmatch.fnmatch(path, pat) or fnmatch.fnmatch(parts[-1], pat) for pat in patterns)

def git_files():
    try:
        result = subprocess.run(['git', '-C', str(root), 'ls-files', '-z'], capture_output=True, check=True)
        return [x.decode('utf-8', errors='replace') for x in result.stdout.split(b'\x00') if x]
    except (FileNotFoundError, subprocess.CalledProcessError):
        return []

tracked = git_files()
unsafe = [path for path in tracked if dangerous(path)]
if unsafe:
    print('STOP: potentially private files already tracked by Git:')
    for path in unsafe: print(' -', path)
    sys.exit(1)
print('Keine typischen Sicherungs-/Datenbankdateien im Git-Index gefunden.')
print('Hinweis: Quelldateien und Git-Historie zusätzlich auf Passwörter, Tokens und echte Finanzdaten prüfen.')
