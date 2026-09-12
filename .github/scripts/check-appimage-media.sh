#!/usr/bin/env bash
# 解包真实 AppImage，拒绝缺少 appsrc/appsink 或 autoaudiosink 插件的产物；退出清理临时目录。
set -euo pipefail
if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <AppImage>" >&2
  exit 2
fi
appimage=$(realpath "$1")
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
cd "$work"
"$appimage" --appimage-extract >/dev/null
for plugin in libgstapp.so libgstautodetect.so; do
  if [ ! -s "squashfs-root/usr/lib/gstreamer-1.0/$plugin" ]; then
    echo "Missing bundled GStreamer plugin: $plugin" >&2
    exit 1
  fi
done
echo "AppImage contains appsrc/appsink and autoaudiosink plugins"
