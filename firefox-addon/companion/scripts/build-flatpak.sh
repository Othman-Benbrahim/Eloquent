#!/usr/bin/env bash
set -euo pipefail

companion_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
project_dir="$(cd "${companion_dir}/.." && pwd)"
manifest="${companion_dir}/packaging/flatpak/io.github.othmanbenbrahim.eloquentlocalcompanion.Devel.yml"
app_id="io.github.othmanbenbrahim.eloquentlocalcompanion"
build_dir="${companion_dir}/flatpak-build"
repo_dir="${companion_dir}/flatpak-repo"
output_dir="${companion_dir}/target/bundle/flatpak"
output="${output_dir}/Eloquent_Local_Companion_0.2.0_x86_64.flatpak"

for command in flatpak flatpak-builder; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    printf '%s est requis pour construire le paquet Flatpak.\n' "${command}" >&2
    exit 1
  fi
done

if ! find "${companion_dir}/src-tauri/resources/runtime" -type f -name java -perm -u+x -print -quit | grep -q .; then
  printf 'Le runtime Java Linux est absent. Exécutez Prepare-Resources.ps1 -TargetOS linux.\n' >&2
  exit 1
fi
if ! find "${companion_dir}/src-tauri/resources/languagetool" -type f -name languagetool-server.jar -print -quit | grep -q .; then
  printf 'LanguageTool est absent. Exécutez Prepare-Resources.ps1 -TargetOS linux.\n' >&2
  exit 1
fi

mkdir -p "${output_dir}"
flatpak-builder --user --install-deps-from=flathub --force-clean \
  --repo="${repo_dir}" "${build_dir}" "${manifest}"
flatpak build-bundle "${repo_dir}" "${output}" "${app_id}"
printf 'Flatpak : %s\n' "${output}"
