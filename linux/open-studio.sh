#!/usr/bin/env bash
set -euo pipefail
systemctl --user start shelf-studio.service
exec xdg-open http://localhost:4317
