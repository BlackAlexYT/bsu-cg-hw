import colorsys
import json
import random
from pathlib import Path
rng = random.Random(20261008)
rgb_samples = [[51, 102, 102], [255, 128, 0], [0, 0, 0], [255, 255, 255]]
rgb_samples += [[rng.random() * 255 for _ in range(3)] for _ in range(256)]
hsv_samples = [[h, 100, 100] for h in range(0, 361, 30)]
hsv_samples += [[rng.random() * 360, rng.random() * 100, rng.random() * 100] for _ in range(256)]
data = {'source': 'Python standard library colorsys; https://docs.python.org/3/library/colorsys.html', 'rgb_to_hsv': [{'input': rgb, 'expected': [h * 360, s * 100, v * 100]} for rgb in rgb_samples for (h, s, v) in [colorsys.rgb_to_hsv(*(x / 255 for x in rgb))]], 'hsv_to_rgb': [{'input': hsv, 'expected': [x * 255 for x in colorsys.hsv_to_rgb(hsv[0] / 360, hsv[1] / 100, hsv[2] / 100)]} for hsv in hsv_samples]}
Path(__file__).with_name('reference.json').write_text(json.dumps(data, indent=2) + '\n')
