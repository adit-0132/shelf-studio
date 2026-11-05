#!/usr/bin/env bash
# Rasterise the final brand SVGs. Small sizes come from their own hinted SVGs at the native pixel grid
# (playbook §12.2); larger sizes come from the 64-unit master. Then build the playbook §5 contact sheet.
set -euo pipefail
F="$(cd "$(dirname "${BASH_SOURCE[0]}")/../final" && pwd)"; cd "$F"; mkdir -p png
for c in green ondark black white; do
  magick -background none "mark-16-$c.svg" "PNG32:png/mark-16-$c.png"
  magick -background none "mark-32-$c.svg" "PNG32:png/mark-32-$c.png"
  for s in 48 64 128 256 512; do magick -background none -density $((72 * s / 64)) "mark-64-$c.svg" -resize "${s}x${s}" "PNG32:png/mark-$s-$c.png"; done
done
for t in green dark; do for s in 180 192 512; do magick -background none -density $((72 * s / 64)) "tile-$t.svg" -resize "${s}x${s}" "PNG32:png/tile-$s-$t.png"; done; done
magick png/mark-16-green.png png/mark-32-green.png png/mark-48-green.png favicon.ico
for l in light dark; do magick -background none -density 144 "lockup-$l.svg" "PNG32:png/lockup-$l.png"; done
# Contact sheet: each size on white, light grey and two dark grounds, plus x8 zoom of 16 and 32 px
row() { local bg="$1" col="$2" out="$3"; magick -size 760x150 "xc:$bg" \
  "png/mark-16-$col.png" -geometry +30+67 -composite "png/mark-32-$col.png" -geometry +80+59 -composite \
  "png/mark-64-$col.png" -geometry +150+43 -composite "png/mark-128-$col.png" -geometry +250+11 -composite \
  \( "png/mark-16-$col.png" -background "$bg" -flatten -scale 800% \) -geometry +420+11 -composite \
  \( "png/mark-32-$col.png" -background "$bg" -flatten -scale 400% \) -geometry +580+11 -composite "$out"; }
row '#FFFFFF' green /tmp/cs1.png; row '#E9E9E6' green /tmp/cs2.png; row '#1E231F' ondark /tmp/cs3.png; row '#000000' white /tmp/cs4.png
magick /tmp/cs1.png /tmp/cs2.png /tmp/cs3.png /tmp/cs4.png \
  \( png/lockup-light.png -resize 660x -background '#FFFFFF' -gravity center -extent 760x190 \) \
  \( png/lockup-dark.png -resize 660x -background '#1E231F' -gravity center -extent 760x190 \) -append contact-sheet.png
rm -f /tmp/cs1.png /tmp/cs2.png /tmp/cs3.png /tmp/cs4.png
magick identify -format '%f %wx%h %[channels]\n' png/mark-16-green.png png/mark-32-green.png png/mark-512-green.png png/tile-180-green.png favicon.ico contact-sheet.png
