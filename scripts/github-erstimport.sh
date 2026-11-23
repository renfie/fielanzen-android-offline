#!/usr/bin/env bash
# Safe initial import into renfie/fielanzen-android-offline, even if README exists.
set -euo pipefail
SOURCE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPO_URL="https://github.com/renfie/fielanzen-android-offline.git"
command -v git >/dev/null || { echo "git is required" >&2; exit 1; }
command -v python3 >/dev/null || { echo "python3 is required" >&2; exit 1; }
if ! git config user.name >/dev/null || ! git config user.email >/dev/null; then
  echo 'Configure Git author first: git config --global user.name "Your Name"; git config --global user.email "you@example.org"' >&2
  exit 1
fi
python3 "$SOURCE_DIR/scripts/check-publication.py"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT
printf 'Cloning %s (existing files will not be deleted) ...\n' "$REPO_URL"
git clone "$REPO_URL" "$WORK_DIR/repo"
# Copy source files; do not overwrite repository git history.
python3 - "$SOURCE_DIR" "$WORK_DIR/repo" <<'PY_COPY'
import sys, pathlib, shutil, subprocess
src,dst=map(pathlib.Path,sys.argv[1:])
for path in src.rglob('*'):
    if not path.is_file(): continue
    rel=path.relative_to(src)
    if any(x in {'.git','node_modules','dist','android','release','.build-tools','private-data','backups','user-data','exports'} for x in rel.parts): continue
    if any(path.match(p) for p in ['*.backup','*.csv','*.xlsx','*.db','*.sqlite*','*.jks','*.keystore','*.p12','*.pfx','.env*']): continue
    target=dst/rel;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(path,target)
PY_COPY
cd "$WORK_DIR/repo"
git add .
python3 scripts/check-publication.py
printf '\nFiles staged for commit:\n'
git diff --cached --stat
if git diff --cached --quiet; then echo 'Nothing to commit.'; exit 0; fi
read -r -p 'Review the file list above. Commit and push source now? [ja/NEIN] ' answer
[[ "$answer" == ja || "$answer" == JA ]] || exit 0
git commit -m 'Import FieLanzen Offline Android 0.1.0-alpha.28 source and bilingual docs'
git push origin HEAD:main
printf 'Source published: https://github.com/renfie/fielanzen-android-offline\n'
