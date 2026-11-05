"""Logo concepts for Shelf Studio. Writes launch/brand/logo/<concept>-<size>.svg (fill=currentColor).

Each concept has a 64-unit master plus separately hinted 32 px and 16 px drawings on integer grids
(playbook §5: draw small sizes, don't just downscale the master)."""
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'logo'

def svg(size, body, defs=''):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}" '
            f'fill="currentColor">{defs}{body}</svg>\n')

def band_mask(mid, size, lines, leaves):
    """Engraved band: a mask that cuts thin lines (and small leaves) out of the vessel."""
    cuts = ''.join(f'<rect x="0" y="{y}" width="{size}" height="{h}" fill="black"/>' for y, h in lines)
    cuts += ''.join(leaves)
    return f'<defs><mask id="{mid}" maskUnits="userSpaceOnUse"><rect width="{size}" height="{size}" fill="white"/>{cuts}</mask></defs>'

MARKS = {
    # A. Sweep: a studio cyclorama that doubles as a shelf, with a lota on the floor
    'A-sweep': {
        64: svg(64, '<path d="M8 6H15V34A17 17 0 0 0 32 51H58V58H32A24 24 0 0 1 8 34Z"/>'
                    '<path d="M37 24H51V28H48V31C52.5 32 56 35.5 56 40C56 44.5 53 47.5 50 48V51H38V48C35 47.5 32 44.5 32 40C32 35.5 35.5 32 40 31V28H37Z"/>'),
        32: svg(32, '<path d="M4 3H7V17A8 8 0 0 0 15 25H29V29H15A11 11 0 0 1 4 17Z"/>'
                    '<path d="M18 12H25V14H24V15C26 15.5 28 17 28 19.5C28 22 26.5 23.5 25 24V25H18V24C16.5 23.5 15 22 15 19.5C15 17 17 15.5 19 15V14H18Z"/>'),
        16: svg(16, '<path d="M1 1H3V9H4V10H5V11H7V12H15V14H6V13H4V12H3V11H2V10H1Z"/>'
                    '<path d="M9 4H13V5H12V6H13V7H14V11H13V12H9V11H8V7H9V6H10V5H9Z"/>', ),
    },
    # B. Shelf-S: an S whose middle stroke is a shelf carrying a small lota
    'B-shelf-s': {
        64: svg(64, '<path d="M55 13H26A10.5 10.5 0 0 0 26 34H38A10.5 10.5 0 0 1 38 55H9" fill="none" stroke="currentColor" stroke-width="6"/>'
                    '<path d="M42 19.5H50V21.5H48.5V23C50.5 23.5 52 25 52 27C52 29 51 30.5 49.5 31H43C41.5 30.5 40.5 29 40.5 27C40.5 25 42 23.5 44 23V21.5H42Z"/>'),
        32: svg(32, '<path d="M28 6H13A5 5 0 0 0 13 16H19A5 5 0 0 1 19 26H4" fill="none" stroke="currentColor" stroke-width="4"/>'
                    '<path d="M21 9H25V10H24V11H26V13H25V14H21V13H20V11H22V10H21Z"/>'),
        16: svg(16, '<path d="M14 3H6A2.5 2.5 0 0 0 6 8H10A2.5 2.5 0 0 1 10 13H2" fill="none" stroke="currentColor" stroke-width="2"/>'),
    },
    # C. Engraved lota: a vessel with an engraved band, standing on a shelf
    'C-engraved-lota': {
        64: svg(64, '<g mask="url(#bandC64)"><path d="M20 5H44V10H39V15C50 17 55 25 55 33C55 42 49 47 42 48V53H22V48C15 47 9 42 9 33C9 25 14 17 25 15V10H20Z"/></g>'
                    '<rect x="4" y="53" width="56" height="5" rx="1.5"/>',
                band_mask('bandC64', 64, [(27, 2), (39, 2)],
                          [f'<path d="M{x} 30.5Q{x + 3.5} 33 {x} 37.5Q{x - 3.5} 33 {x} 30.5Z" fill="black"/>' for x in (21, 32, 43)])),
        32: svg(32, '<g mask="url(#bandC32)"><path d="M10 2H22V5H20V7C25 8 28 12 28 16.5C28 21 25 23.5 21 24V26H11V24C7 23.5 4 21 4 16.5C4 12 7 8 12 7V5H10Z"/></g>'
                    '<rect x="2" y="26" width="28" height="3" rx="1"/>',
                band_mask('bandC32', 32, [(13, 1), (19, 1)],
                          [f'<rect x="{x}" y="15" width="2" height="3" fill="black"/>' for x in (10, 15, 20)])),
        16: svg(16, '<path d="M5 1H11V2H10V4H12V5H13V8H3V5H4V4H6V2H5Z"/>'
                    '<path d="M3 9H13V11H12V12H10V13H6V12H4V11H3Z"/>'
                    '<rect x="1" y="13" width="14" height="2"/>'),
    },
}

if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    for name, sizes in MARKS.items():
        for size, text in sizes.items():
            (OUT / f'{name}-{size}.svg').write_text(text)
    print('wrote', sum(len(s) for s in MARKS.values()), 'SVGs to', OUT)
