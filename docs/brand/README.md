# Shelf Studio brand

The mark is a lota (a traditional Indian vessel) on a shelf, with an engraved band across its belly. The band stands
for the fine handwork Shelf Studio is built to keep when it re-photographs a product.

<p>
  <img src="final/lockup-light.svg" alt="Shelf Studio lockup on light" height="56">&nbsp;&nbsp;
  <img src="final/tile-green.svg" alt="Shelf Studio app tile" height="56">
  <img src="final/tile-dark.svg" alt="Shelf Studio app tile, dark" height="56">
</p>

## Colours

| Token | Hex | Role | Contrast |
|---|---|---|---|
| paper | `#F6F5F1` | Backgrounds, same as the app UI | ink on paper 14.63:1 |
| ink | `#1E231F` | Text, dark grounds | paper on ink 14.63:1 |
| green | `#385741` | Primary: mark, tiles, links; text-safe on paper | 7.38:1 on paper. Don't use it as text on ink (1.98:1) |
| sage | `#A9C296` | Mark and accents on dark grounds | 8.24:1 on ink |
| brass | `#B8892E` | Small highlights only | Decorative on paper (2.89:1); 5.06:1 on ink |

## Type

**Instrument Serif** for the wordmark and display headlines, with italic for one accent phrase. **Inter** for text.
Both are under the [SIL Open Font License](fonts/OFL.txt). The lockups use outlined text, so they need no font
installed.

## Files

| Asset | Path | Use |
|---|---|---|
| Mark, 64-unit master | `final/mark-64-{green,ondark,black,white}.svg` | 48 px and up |
| Mark, hinted 32 px | `final/mark-32-*.svg` | 24–40 px. Drawn separately, not scaled down |
| Mark, hinted 16 px | `final/mark-16-*.svg` | 16–20 px and favicons |
| Lockups | `final/lockup-light.svg`, `final/lockup-dark.svg` | Headers, cards |
| App tiles | `final/tile-{green,dark}.svg`, `final/png/tile-{180,192,512}-*.png` | Avatars, touch icons |
| Favicon | `final/favicon.ico` (16, 32, 48) | Web pages |
| Engraved-band motif | `final/band-{green,ondark}.svg` | Tileable divider. Use one per layout |
| Contact sheet | `final/contact-sheet.png` | Every size on light and dark grounds |

## Usage

- Keep at least a quarter of the mark's height clear on every side.
- The minimum size is 16 px, and only with the hinted 16 px drawing.
- Don't recolour the mark outside this palette, add effects, outline it or rotate it.
- On dark grounds use the sage mark, never the green one.
- The Shelf Studio name and mark identify this project. Please don't use them in a way that implies endorsement.

## Rebuilding

The marks are hand-authored SVG in `tools/marks.py`. `tools/build_final.py` writes the colour variants, lockups and
motif (the wordmark is outlined from `fonts/InstrumentSerif-Regular.ttf`, using its GPOS kerning).
`tools/raster_final.sh` exports the PNGs and favicon, rasterising each small size from its own hinted SVG.

```sh
cd docs/brand && python3 tools/marks.py && python3 tools/build_final.py && bash tools/raster_final.sh
```

This needs Python 3 with `fontTools` and ImageMagick 7.
