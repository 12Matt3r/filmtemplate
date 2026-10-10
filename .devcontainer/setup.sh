#!/usr/bin/env bash
set -euo pipefail
studio_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$studio_root/showrunner-studio/backend"
uv sync --locked
cd "$studio_root/showrunner-studio/frontend"
npm ci
printf '\nTexel Studio dependencies are ready. The app opens on port 3001.\n'
