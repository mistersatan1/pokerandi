#!/usr/bin/env python3
"""digitfont.py — 숫자용 도트 폰트 "PorandiDigits" 를 만들어 css/main.css 의 표시 사이에 base64(woff2)로 넣는다(세션 92).

왜 직접 그리나: 바깥 폰트 파일은 라이선스 · 파일 크기(한글 포함 수 MB)가 따라온다. HUD 숫자에 필요한 건 0~9 와 기호 몇 개뿐이라
5×7 칸 그림을 여기 적고 fontTools 로 글꼴을 만든다. 웹폰트 파일을 따로 두지 않으니 더블클릭(file://) · 테스트판 · 앱 모두 같다.

다시 만들기: pip install fonttools brotli && python3 tools/digitfont.py
그림을 고치면 이 스크립트를 다시 돌리고 main.css 를 커밋한다(검사 uicheck "숫자 도트 폰트" 가 표시 · unicode-range 를 본다).
"""
import base64, io, os, re
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

PX = 100          # 한 칸 = 100 단위(1em = 1000) → 숫자 높이 0.7em
ROWS = 7
GLYPHS = {
    # 이름: (문자, 칸 그림 — 위에서 아래로 7줄, '#' 칠함)
    'zero':  ('0', ['.###.', '##.##', '##.##', '##.##', '##.##', '##.##', '.###.']),
    'one':   ('1', ['..##.', '.###.', '..##.', '..##.', '..##.', '..##.', '.####']),
    'two':   ('2', ['.###.', '##.##', '...##', '..##.', '.##..', '##...', '#####']),
    'three': ('3', ['####.', '...##', '...##', '.###.', '...##', '...##', '####.']),
    'four':  ('4', ['...##', '..###', '.#.##', '#..##', '#####', '...##', '...##']),
    'five':  ('5', ['#####', '##...', '####.', '...##', '...##', '##.##', '.###.']),
    'six':   ('6', ['.###.', '##...', '##...', '####.', '##.##', '##.##', '.###.']),
    'seven': ('7', ['#####', '...##', '..##.', '..##.', '.##..', '.##..', '.##..']),
    'eight': ('8', ['.###.', '##.##', '##.##', '.###.', '##.##', '##.##', '.###.']),
    'nine':  ('9', ['.###.', '##.##', '##.##', '.####', '...##', '...##', '.###.']),
    'percent': ('%', ['##...', '##..#', '...#.', '..#..', '.#...', '#..##', '...##']),
    'slash': ('/', ['....#', '...##', '...#.', '..##.', '.#...', '##...', '#....']),
    'plus':  ('+', ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....']),
    'hyphen': ('-', ['.....', '.....', '.....', '####.', '.....', '.....', '.....']),
    'period': ('.', ['..', '..', '..', '..', '..', '##', '##']),
    'comma': (',', ['..', '..', '..', '..', '##', '.#', '#.']),
    'colon': (':', ['..', '##', '##', '..', '##', '##', '..']),
    'K':     ('K', ['##..#', '##.##', '####.', '###..', '####.', '##.##', '##..#']),
    'M':     ('M', ['##.##', '#####', '#####', '##.##', '##.##', '##.##', '##.##']),
}


def draw(rows):
    """칸 그림 → 글리프. 줄마다 이어진 칸을 한 직사각형으로, 위아래 줄은 2단위 겹쳐 이음매가 안 보이게."""
    pen = TTGlyphPen(None)
    for r, line in enumerate(rows):
        y1 = (ROWS - r) * PX + (2 if r > 0 else 0)
        y0 = (ROWS - r - 1) * PX
        c = 0
        while c < len(line):
            if line[c] != '#':
                c += 1
                continue
            s = c
            while c < len(line) and line[c] == '#':
                c += 1
            x0, x1 = s * PX + PX // 2, c * PX + PX // 2   # 왼쪽 여백 반 칸
            # TrueType 바깥 윤곽은 시계 방향
            pen.moveTo((x0, y0)); pen.lineTo((x0, y1)); pen.lineTo((x1, y1)); pen.lineTo((x1, y0)); pen.closePath()
    return pen.glyph()


def build():
    order = ['.notdef', 'space'] + list(GLYPHS)
    fb = FontBuilder(1000, isTTF=True)
    fb.setupGlyphOrder(order)
    cmap = {32: 'space'}
    glyphs = {'.notdef': TTGlyphPen(None).glyph(), 'space': TTGlyphPen(None).glyph()}
    metrics = {'.notdef': (600, 0), 'space': (300, 0)}
    for name, (ch, rows) in GLYPHS.items():
        cmap[ord(ch)] = name
        glyphs[name] = draw(rows)
        w = len(rows[0])
        metrics[name] = ((w + 1) * PX, PX // 2)     # 숫자는 모두 600 — 자리 폭이 같아 숫자가 바뀌어도 안 흔들린다
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=850, descent=-150)
    fb.setupOS2(sTypoAscender=850, sTypoDescender=-150, usWinAscent=850, usWinDescent=150, sCapHeight=700, sxHeight=500)
    fb.setupNameTable({'familyName': 'PorandiDigits', 'styleName': 'Regular'})
    fb.setupPost()
    fb.font.flavor = 'woff2'
    buf = io.BytesIO()
    fb.save(buf)
    return buf.getvalue(), sorted(cmap)


def main():
    data, cps = build()
    b64 = base64.b64encode(data).decode()
    ranges = ', '.join('U+%04X' % c for c in cps if c != 32)
    block = ('/* @digits-font:start — tools/digitfont.py 가 만든다(손으로 고치지 말 것) */\n'
             '@font-face {\n'
             '  font-family: "PorandiDigits";\n'
             '  src: url(data:font/woff2;base64,' + b64 + ') format("woff2");\n'
             '  font-display: block;\n'
             '  unicode-range: ' + ranges + ';\n'
             '}\n'
             '/* @digits-font:end */')
    path = os.path.join(os.path.dirname(__file__), '..', 'css', 'main.css')
    css = open(path, encoding='utf-8').read()
    pat = re.compile(r'/\* @digits-font:start.*?/\* @digits-font:end \*/', re.S)
    if not pat.search(css):
        raise SystemExit('css/main.css 에 @digits-font 표시가 없다')
    css = pat.sub(lambda m: block, css)
    open(path, 'w', encoding='utf-8').write(css)
    print('PorandiDigits — 글리프 %d · woff2 %d 바이트 · base64 %d 자' % (len(GLYPHS), len(data), len(b64)))


if __name__ == '__main__':
    main()
