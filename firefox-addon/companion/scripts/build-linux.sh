#!/usr/bin/env bash
set -euo pipefail

companion_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${companion_dir}"
cargo fmt --all -- --check
cargo test -p eloquent-companion-core --all-targets
node --check ui/app.js
npm install
npm run build -- --bundles deb,rpm,appimage

