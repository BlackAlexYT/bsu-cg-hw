# Эталоны для тестов: OpenCV и scikit-image на маленьких случайных изображениях.
# Нужны numpy, opencv-python, scikit-image. Запуск: python tests/generate-reference.py
import json
from pathlib import Path

import cv2
import numpy as np
from skimage.filters import threshold_niblack, threshold_sauvola

rng = np.random.default_rng(14)
cases = []


def flat(a):
    return np.round(a, 8).ravel().tolist()


for h, w in [(9, 13), (17, 20), (24, 31)]:
    img = rng.integers(0, 256, size=(h, w)).astype(np.uint8)
    f = img.astype(np.float64)
    border = cv2.BORDER_REFLECT_101
    case = {"width": w, "height": h, "data": img.ravel().tolist()}
    case["niblack"] = {
        size: flat(threshold_niblack(img, window_size=size, k=0.2))
        for size in (3, 7)
    }
    case["sauvola"] = {
        size: flat(threshold_sauvola(img, window_size=size, k=0.3, r=128))
        for size in (3, 7)
    }
    case["gauss"] = {
        str(s): flat(cv2.GaussianBlur(f, (2 * int(np.ceil(3 * s)) + 1,) * 2, s, borderType=border))
        for s in (0.8, 1.5)
    }
    kernels = {
        "point": [[-1, -1, -1], [-1, 8, -1], [-1, -1, -1]],
        "lineP45": [[-1, -1, 2], [-1, 2, -1], [2, -1, -1]],
        "log5": [
            [0, 0, -1, 0, 0],
            [0, -1, -2, -1, 0],
            [-1, -2, 16, -2, -1],
            [0, -1, -2, -1, 0],
            [0, 0, -1, 0, 0],
        ],
    }
    case["filter2D"] = {
        name: flat(cv2.filter2D(f, -1, np.array(k, np.float64), borderType=border))
        for name, k in kernels.items()
    }
    # Градиент по разностям вперёд, |Gx| + |Gy|; за краем — зеркально (reflect = REFLECT_101).
    p = np.pad(f, ((0, 1), (0, 1)), mode="reflect")
    gx = p[:-1, 1:] - p[:-1, :-1]
    gy = p[1:, :-1] - p[:-1, :-1]
    case["gradient"] = flat(np.abs(gx) + np.abs(gy))
    cases.append(case)

out = Path(__file__).with_name("reference.json")
out.write_text(json.dumps(cases))
print(out)
