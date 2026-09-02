#!/usr/bin/env bash
# Downloads the exact CDN library versions index.html loads, so the headless
# tests can serve them locally (some sandboxes block cdnjs). Files land in
# tests/vendor/ which is git-ignored. Requires curl + tar.
set -euo pipefail
cd "$(dirname "$0")/vendor"
fetch() { # name version path-in-tarball out-file
  local tgz="$1-$2.tgz"
  [ -f "$4" ] && { echo "have $4"; return; }
  curl -sSfL -o "$tgz" "https://registry.npmjs.org/$1/-/$tgz"
  tar -xzf "$tgz" --strip-components=1 "package/$3"
  [ "$3" != "$4" ] && mv "$3" "$4"
  rm -f "$tgz"; rmdir --ignore-fail-on-non-empty "$(dirname "$3")" 2>/dev/null || true
  echo "fetched $4"
}
fetch papaparse   5.4.1 papaparse.min.js        papaparse.min.js
fetch chart.js    4.4.1 dist/chart.umd.js       chart.umd.min.js
fetch html2canvas 1.4.1 dist/html2canvas.min.js html2canvas.min.js
