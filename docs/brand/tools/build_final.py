"""Final Shelf Studio brand assets (palette P1 Studio Sage, mark C engraved lota). Writes launch/brand/final/.

- mark SVGs: master (64 units) + hinted 32 and 16 px drawings, in colour variants
- lockups: mark + "Shelf Studio" wordmark converted to outlines (Instrument Serif TTF, GPOS pair kerning)
- motif: the engraved band as a tileable strip
Rasterising and the contact sheet are done by tools/raster_final.sh."""
import re
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

BRAND = Path(__file__).resolve().parent.parent
LOGO, OUT = BRAND / 'logo', BRAND / 'final'
C = dict(paper='#F6F5F1', ink='#1E231F', accent='#385741', onDark='#A9C296', highlight='#B8892E')
MARK = 'C-engraved-lota'

def inner(size, prefix=''):
    s = (LOGO / f'{MARK}-{size}.svg').read_text().strip()
    s = re.sub(r'^<svg[^>]*>|</svg>$', '', s)
    return s.replace('id="band', f'id="{prefix}band').replace('url(#band', f'url(#{prefix}band')

def mark_svg(size, color):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}" fill="{color}">{inner(size)}</svg>\n'

def tile_svg(color_bg, color_mark, radius=14):
    # App-icon tile: master mark at 75% inside a rounded square (64 units)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">'
            f'<rect width="64" height="64" rx="{radius}" fill="{color_bg}"/>'
            f'<g transform="translate(8 7) scale(0.75)" fill="{color_mark}">{inner(64, "t")}</g></svg>\n')

def kerner(font):
    lookups = []
    for lk in font['GPOS'].table.LookupList.Lookup:
        subs = [st.ExtSubTable if lk.LookupType == 9 else st for st in lk.SubTable]
        if lk.LookupType == 2 or (lk.LookupType == 9 and subs and subs[0].LookupType == 2): lookups.append(subs)
    def kern(a, b):
        total = 0
        for subs in lookups:
            for st in subs:
                if a not in st.Coverage.glyphs: continue
                if st.Format == 1:
                    rec = next((r for r in st.PairSet[st.Coverage.glyphs.index(a)].PairValueRecord if r.SecondGlyph == b), None)
                    if rec and rec.Value1 and getattr(rec.Value1, 'XAdvance', 0): total += rec.Value1.XAdvance; break
                else:
                    c1, c2 = st.ClassDef1.classDefs.get(a, 0), st.ClassDef2.classDefs.get(b, 0)
                    v = st.Class1Record[c1].Class2Record[c2].Value1
                    if v is not None and getattr(v, 'XAdvance', 0): total += v.XAdvance
                    break
        return total
    return kern

def wordmark_path(text, cap_height):
    """Outline `text` so its capital height is cap_height units; returns (path d, width, scale)."""
    font = TTFont(BRAND / 'fonts' / 'InstrumentSerif-Regular.ttf')
    cmap, gs, hmtx, kern = font.getBestCmap(), font.getGlyphSet(), font['hmtx'], kerner(font)
    scale = cap_height / font['OS/2'].sCapHeight
    names = [cmap[ord(ch)] for ch in text]
    x, parts = 0, []
    for i, g in enumerate(names):
        pen = SVGPathPen(gs)
        gs[g].draw(TransformPen(pen, (scale, 0, 0, -scale, x * scale, 0)))
        parts.append(pen.getCommands())
        x += hmtx[g][0] + (kern(g, names[i + 1]) if i + 1 < len(names) else 0)
    return ' '.join(p for p in parts if p), x * scale

def lockup_svg(mark_color, text_color, bg=None):
    d, width = wordmark_path('Shelf Studio', 28)
    gap, h, ms = 11, 64, 0.78  # mark scale: ~1.8x the cap height
    w = round(64 * ms + gap + width + 2)
    rect = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w * 3}" height="{h * 3}">{rect}'
            f'<g fill="{mark_color}" transform="translate(0 {(64 - 64 * ms) / 2:.2f}) scale({ms})">{inner(64, "l")}</g>'
            f'<path transform="translate({64 * ms + gap:.2f} 46)" fill="{text_color}" d="{d}"/></svg>\n')

def band_svg(color, width=240, height=24):
    """Tileable engraved-band motif: two rules with leaves between (repeats every 40 units)."""
    leaves = ''.join(f'<path d="M{x} 7Q{x + 4} 12 {x} 17Q{x - 4} 12 {x} 7Z"/><circle cx="{x + 20}" cy="12" r="1.6"/>' for x in range(20, width, 40))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}" fill="{color}">'
            f'<rect y="2" width="{width}" height="1.5"/><rect y="20.5" width="{width}" height="1.5"/>{leaves}</svg>\n')

if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    files = {}
    for size in (64, 32, 16):
        files[f'mark-{size}-green.svg'] = mark_svg(size, C['accent'])
        files[f'mark-{size}-ondark.svg'] = mark_svg(size, C['onDark'])
        files[f'mark-{size}-black.svg'] = mark_svg(size, '#000000')
        files[f'mark-{size}-white.svg'] = mark_svg(size, '#FFFFFF')
    files['tile-green.svg'] = tile_svg(C['accent'], C['paper'])
    files['tile-dark.svg'] = tile_svg(C['ink'], C['onDark'])
    files['lockup-light.svg'] = lockup_svg(C['accent'], C['ink'])
    files['lockup-dark.svg'] = lockup_svg(C['onDark'], C['paper'], C['ink'])
    files['lockup-ondark.svg'] = lockup_svg(C['onDark'], C['paper'])  # transparent, for dark-mode READMEs
    files['band-green.svg'] = band_svg(C['accent'])
    files['band-ondark.svg'] = band_svg(C['onDark'])
    for name, text in files.items(): (OUT / name).write_text(text)
    print(f'wrote {len(files)} SVGs to {OUT}')
