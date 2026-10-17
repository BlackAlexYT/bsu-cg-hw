# База тестовых изображений. Нужны numpy и opencv-python.
# Запуск из папки segment-lab: python scripts/generate-images.py
# Для бинаризации рядом с картинкой сохраняется эталон *-truth.png (текст — 0, фон — 255).
import json
from pathlib import Path

import cv2
import numpy as np

rng = np.random.default_rng(14)
out = Path(__file__).resolve().parent.parent / "images"
out.mkdir(exist_ok=True)

LINES = [
    "Lab 2. Local thresholding",
    "Niblack: T = m + k * s",
    "Sauvola: T = m (1 + k (s/R - 1))",
    "The quick brown fox jumps over",
    "the lazy dog 0123456789",
    "Belarusian State University",
    "Computer graphics, variant 14",
]


def text_mask(w, h, lines=LINES, scale=0.62, step=34, top=34):
    """Маска текста: 1 — буква."""
    m = np.zeros((h, w), np.uint8)
    for i, line in enumerate(lines):
        y = top + i * step
        if y > h - 10:
            break
        cv2.putText(m, line, (16, y), cv2.FONT_HERSHEY_SIMPLEX, scale, 1, 2, cv2.LINE_AA)
    return m > 0


def save(name, img, truth=None):
    cv2.imwrite(str(out / f"{name}.png"), np.clip(np.round(img), 0, 255).astype(np.uint8))
    if truth is not None:
        cv2.imwrite(str(out / f"{name}-truth.png"), np.where(truth, 0, 255).astype(np.uint8))


w, h = 480, 260
yy, xx = np.mgrid[0:h, 0:w].astype(np.float64)
text = text_mask(w, h)

# 1. Документ с тенью: свет падает из левого верхнего угла, справа внизу тень.
light = 235 - 150 * np.clip(((xx / w) ** 2 + (yy / h) ** 2) / 1.6, 0, 1)
img = light - text * 0.45 * light + rng.normal(0, 3, (h, w))
save("doc-shadow", img, text)

# 2. Выцветший документ: светлый фон, текст темнее всего на 22, строки плотные.
dense = text_mask(w, h, LINES + LINES[:4], scale=0.55, step=23, top=20)
img = 228 - 70 * xx / w - dense * 22 + rng.normal(0, 2, (h, w))
save("doc-faded", img, dense)

# 3. Ровный фон с шумом и широкими полями без текста.
sparse = text_mask(w, h, LINES[:3], top=60, step=60)
img = 190 - sparse * 110 + rng.normal(0, 9, (h, w))
save("doc-noisy-margins", img, sparse)

# 4. Пятна-«клетки» на неравномерном фоне (не текст).
cells = np.zeros((h, w), bool)
for _ in range(45):
    cx, cy, r = rng.uniform(15, w - 15), rng.uniform(15, h - 15), rng.uniform(6, 14)
    cells |= (xx - cx) ** 2 + (yy - cy) ** 2 <= r * r
bg = 200 - 120 * (xx / w) * (yy / h) + 25 * np.sin(xx / 60)
img = np.where(cells, bg - 55, bg) + rng.normal(0, 4, (h, w))
save("blobs-uneven", img, cells)

# 5. Точки: 10 светлых (+100) и 6 тёмных (−70) пикселей на плавном фоне и две фигуры.
# Координаты точек сохраняются в points.json для проверки.
s = 256
y2, x2 = np.mgrid[0:s, 0:s].astype(np.float64)
img = 70 + 50 * x2 / s + 20 * np.sin(y2 / 40)
cv2.circle(img, (70, 180), 30, 150, -1)
cv2.rectangle(img, (150, 40), (220, 100), 50, -1)
spots = []
while len(spots) < 16:
    x, y = (int(v) for v in rng.integers(8, s - 8, 2))
    if not 75 < img[y, x] < 145 or abs(img[y, x] - img[y - 3 : y + 4, x - 3 : x + 4]).max() > 1 or any(
        abs(x - a) + abs(y - b) < 20 for a, b in spots
    ):
        continue  # точка только на гладком фоне вне фигур и не рядом с другой
    spots.append((x, y))
for i, (x, y) in enumerate(spots):
    img[y, x] += 100 if i < 10 else -70
(out / "points.json").write_text(json.dumps(spots))
save("points", img)

# 6. То же с шумом: лапласиан находит и шум, нужен порог повыше или сглаживание.
save("points-noisy", img + rng.normal(0, 6, img.shape))

# 7. Линии толщиной 1 пиксель в четырёх направлениях и одна толстая полоса.
img = np.full((s, s), 70.0)
cv2.line(img, (10, 40), (245, 40), 190, 1)
cv2.line(img, (40, 60), (40, 245), 190, 1)
cv2.line(img, (60, 245), (245, 60), 190, 1)
cv2.line(img, (60, 70), (230, 240), 190, 1)
cv2.line(img, (110, 20), (250, 20), 120, 1)
cv2.rectangle(img, (150, 200), (250, 214), 190, -1)
save("lines", img)

# 8. Тонкая «проводка» на плате: тёмные линии на светлом фоне.
img = np.full((s, s), 200.0) + rng.normal(0, 3, (s, s))
for i in range(6):
    cv2.line(img, (20, 30 + 35 * i), (236, 30 + 35 * i), 90, 1)
for i in range(5):
    cv2.line(img, (30 + 45 * i, 10), (30 + 45 * i + 60, 246), 90, 1)
save("wires-dark", img)


def shapes():
    a = np.full((s, s), 60.0)
    cv2.rectangle(a, (25, 25), (110, 110), 200, -1)
    cv2.circle(a, (180, 75), 45, 150, -1)
    pts = np.array([[60, 230], [125, 140], [180, 235]], np.int32)
    cv2.fillPoly(a, [pts], 230)
    cv2.ellipse(a, (200, 190), (40, 22), 30, 0, 360, 110, -1)
    return a


# 9–11. Фигуры для поиска границ: чистые, зашумлённые, размытые.
save("shapes", shapes())
save("shapes-noisy", shapes() + rng.normal(0, 18, (s, s)))
save("shapes-blurred", cv2.GaussianBlur(shapes(), (0, 0), 3))

# 12. Плавная засветка и ступени разной высоты: видно, что порог от максимума
# теряет слабые перепады.
img = 40 + 160 * x2 / s
img[:, 64:] += 40
img[:, 128:] -= 10
img[100:160, :] += 25
save("steps-gradient", img)

print("\n".join(sorted(p.name for p in out.iterdir())))
