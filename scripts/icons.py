# Génère les icônes PWA de BudgetAnalyze (portefeuille blanc + pièce corail sur bleu cocarde #2350D8) : python3 scripts/icons.py public/icons
from PIL import Image, ImageDraw
import sys, os
out = sys.argv[1] if len(sys.argv) > 1 else 'public/icons'
BLUE = (35, 80, 216, 255)
CORAL = (255, 138, 101, 255)
def draw(size, pad_ratio, radius_ratio, path):
    S = size * 4
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * radius_ratio), fill=BLUE)
    pad = S * pad_ratio
    k = (S - 2 * pad) / 24
    w = max(2, int(2.2 * k))
    P = lambda x, y: (pad + x * k, pad + y * k)
    # corps du portefeuille
    d.rounded_rectangle([*P(3, 6), *P(21, 20)], radius=int(2.2 * k), outline='white', width=w)
    # rabat
    d.line([P(4, 6), P(16, 3.2)], fill='white', width=w)
    d.line([P(16, 3.2), P(17.5, 6)], fill='white', width=w)
    # poche et pièce corail
    d.rounded_rectangle([*P(14, 10.5), *P(21, 15.5)], radius=int(1.6 * k), outline='white', width=w, fill=BLUE)
    r = 1.6 * k
    c = P(17.2, 13)
    d.ellipse([c[0] - r, c[1] - r, c[0] + r, c[1] + r], fill=CORAL)
    img = img.resize((size, size), Image.LANCZOS)
    img.save(os.path.join(out, path))
os.makedirs(out, exist_ok=True)
draw(512, 0.24, 0.0, 'icon-maskable-512.png')
draw(192, 0.24, 0.0, 'icon-maskable-192.png')
draw(512, 0.18, 0.22, 'icon-512.png')
draw(192, 0.18, 0.22, 'icon-192.png')
draw(180, 0.2, 0.0, 'apple-touch-icon.png')
draw(32, 0.12, 0.22, 'favicon-32.png')
print('ok')
