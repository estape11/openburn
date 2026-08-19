#!/usr/bin/env bash
# scripts/bump-version.sh X.Y.Z — the ONLY way to change the project version.
#
# Rewrites, in one step: the VERSION file, the README badge, and the `version`
# of the root package.json and every workspace package.json. Doing any of these
# by hand is how badges end up two releases behind (it happened in the parent
# project — twice).
#
# release.yml refuses to publish if the git tag and VERSION diverge, so this
# script + that check close the loop.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

NEW="${1:-}"
if ! [[ "$NEW" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-.][0-9A-Za-z.]+)?$ ]]; then
  echo "Usage: $0 X.Y.Z (SemVer, no leading 'v')" >&2
  exit 2
fi

OLD="$(tr -d '[:space:]' < VERSION)"

printf '%s\n' "$NEW" > VERSION

# README badge: version-X.Y.Z-blue
sed -i.bak -E "s|(badge/version-)[0-9A-Za-z.-]+(-blue)|\1${NEW}\2|" README.md && rm -f README.md.bak

# Root + workspace package.json versions (node keeps the JSON formatting stable).
for PKG in package.json packages/*/package.json; do
  node -e "
    const fs = require('fs');
    const p = JSON.parse(fs.readFileSync('$PKG', 'utf8'));
    p.version = '$NEW';
    fs.writeFileSync('$PKG', JSON.stringify(p, null, 2) + '\n');
  "
done

echo "Version: $OLD -> $NEW"
echo "Touched: VERSION, README.md badge, package.json (root + workspaces)"
echo "Next: node scripts/changelog.js release $NEW \$(date +%F) \"<title>\""
