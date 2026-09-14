#!/usr/bin/env bash
# Roda antes do `tauri build` no Linux (release.yml). O bundler do Tauri só
# baixa o linuxdeploy-plugin-gtk.sh se ele ainda não existir em
# `dirs::cache_dir()/tauri/linuxdeploy-plugin-gtk.sh` — colocando nossa cópia
# lá antes, o download é pulado e o build usa a versão com o bloco de limpeza
# anexado (scripts/appimage/linuxdeploy-plugin-gtk-patched.sh).
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cache_dir="${XDG_CACHE_HOME:-$HOME/.cache}/tauri"

mkdir -p "$cache_dir"
cp "$script_dir/linuxdeploy-plugin-gtk-patched.sh" "$cache_dir/linuxdeploy-plugin-gtk.sh"
chmod +x "$cache_dir/linuxdeploy-plugin-gtk.sh"

echo "linuxdeploy-plugin-gtk.sh (com correção Arch/EGL) pré-carregado em $cache_dir"
