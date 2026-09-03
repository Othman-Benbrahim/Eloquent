#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
version="$(node -p "require('${project_dir}/companion/src-tauri/tauri.conf.json').version")"
destination="${project_dir}/dist/eloquent-local-suite-${version}-source.zip"
stage_dir="$(mktemp -d)"
trap 'rm -rf "${stage_dir}"' EXIT

cd "${project_dir}"
node scripts/validate.mjs
node companion/scripts/validate.mjs
node --test tests/*.test.cjs

mkdir -p dist
cp -R extension scripts tests docs companion .github "${stage_dir}/"
cp package.json README.md PRIVACY.md CHANGELOG.md AMO-SUBMISSION.md RELEASE_NOTES.md LICENSE amo-metadata.json .gitignore .gitattributes "${stage_dir}/"
find "${stage_dir}" -type d \( -name target -o -name node_modules -o -name dist \) -prune -exec rm -rf {} +
find "${stage_dir}/companion/src-tauri/resources" -type f ! -name README.txt -delete

rm -f "${destination}"
(
  cd "${stage_dir}"
  zip -q -r -9 "${destination}" .
)
unzip -tq "${destination}"
printf 'Sources complètes : %s\n' "${destination}"

