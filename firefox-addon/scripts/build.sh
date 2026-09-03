#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
version="$(node -p "require('${project_dir}/extension/manifest.json').version")"
dist_dir="${project_dir}/dist"
stage_dir="$(mktemp -d)"
trap 'rm -rf "${stage_dir}"' EXIT

cd "${project_dir}"
node --test tests/*.test.cjs
node scripts/validate.mjs

mkdir -p "${dist_dir}"
find "${dist_dir}" -maxdepth 1 -type f \( -name 'eloquent-local-assistant-*.xpi' -o -name 'eloquent-local-assistant-*-source.zip' \) -delete

cp -R "${project_dir}/extension/." "${stage_dir}/extension"
(
  cd "${stage_dir}/extension"
  zip -q -r -9 "${dist_dir}/eloquent-local-assistant-${version}-unsigned.xpi" .
)

(
  cd "${project_dir}"
  zip -q -r -9 "${dist_dir}/eloquent-local-assistant-${version}-source.zip" \
    extension scripts tests docs package.json README.md PRIVACY.md CHANGELOG.md AMO-SUBMISSION.md RELEASE_NOTES.md LICENSE amo-metadata.json .gitignore .gitattributes \
    -x 'dist/*' 'node_modules/*' '*.log' '.git/*'
)

unzip -tq "${dist_dir}/eloquent-local-assistant-${version}-unsigned.xpi"
unzip -tq "${dist_dir}/eloquent-local-assistant-${version}-source.zip"
printf 'Artifacts created in %s\n' "${dist_dir}"
