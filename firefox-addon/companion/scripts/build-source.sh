#!/usr/bin/env bash
set -euo pipefail

companion_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
project_dir="$(cd "${companion_dir}/.." && pwd)"
version="$(node -p "require('${companion_dir}/src-tauri/tauri.conf.json').version")"
destination="${project_dir}/dist/eloquent-local-companion-${version}-source.zip"
stage_dir="$(mktemp -d)"
trap 'rm -rf "${stage_dir}"' EXIT

cd "${companion_dir}"
node scripts/validate.mjs
cargo fmt --all -- --check
cargo test -p eloquent-companion-core --all-targets

mkdir -p "${project_dir}/dist"
cp -R core src-tauri ui scripts packaging "${stage_dir}/"
cp Cargo.toml Cargo.lock package.json package-lock.json README.md THIRD_PARTY_NOTICES.md "${stage_dir}/"
find "${stage_dir}" -type d \( -name target -o -name node_modules \) -prune -exec rm -rf {} +
find "${stage_dir}/src-tauri/resources" -type f ! -name README.txt -delete

rm -f "${destination}"
(
  cd "${stage_dir}"
  zip -q -r -9 "${destination}" .
)
unzip -tq "${destination}"
printf 'Sources du compagnon : %s\n' "${destination}"

