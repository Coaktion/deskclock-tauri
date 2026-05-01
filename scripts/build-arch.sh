#!/usr/bin/env bash
# Gera o instalador .pkg.tar.zst para Arch Linux via container Docker.
# Uso: ./scripts/build-arch.sh
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> DeskClock — build para Arch Linux"
echo "    Projeto: $PROJECT_DIR"
echo ""

docker run --rm \
  -v "$PROJECT_DIR":/app \
  -v "${HOME}/.cargo/registry":/root/.cargo/registry \
  -v "${HOME}/.cargo/git":/root/.cargo/git \
  -e CARGO_TARGET_DIR=/app/src-tauri/target-arch \
  -e APPIMAGE_EXTRACT_AND_RUN=1 \
  -w /app \
  archlinux/archlinux:base-devel \
  bash -c "
    set -euo pipefail

    echo '==> Atualizando sistema e instalando dependências...'
    pacman -Syu --noconfirm
    pacman -S --noconfirm \
      webkit2gtk-4.1 \
      gtk3 \
      libappindicator-gtk3 \
      librsvg \
      xdotool \
      patchelf \
      nodejs \
      npm \
      curl \
      squashfs-tools \
      xdg-utils

    echo '==> Instalando pnpm...'
    npm install -g pnpm@9 --quiet

    echo '==> Instalando Rust...'
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable --quiet
    source /root/.cargo/env

    echo '==> Instalando dependências JS...'
    pnpm install --frozen-lockfile

    echo '==> Buildando AppImage (Arch Linux)...'
    pnpm tauri build --bundles appimage
  "

echo ""
echo "==> AppImage gerado:"
ls -lh "$PROJECT_DIR/src-tauri/target-arch/release/bundle/appimage/"*.AppImage
