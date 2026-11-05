#!/usr/bin/env bash
set -euo pipefail
systemctl --user start product-studio.service
exec xdg-open http://localhost:4317
