"""Пересобирает prompts.js и demo.js из prompts/*.md и examples/demo_test.json.

Запускайте после правки промтов:  python build_assets.py
(JS-файлы нужны, чтобы сайт работал и на GitHub Pages, и при открытии index.html двойным кликом.)
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent

prompts = {name: (ROOT / "prompts" / f"{name}.md").read_text(encoding="utf-8") for name in ("generate", "review", "schema")}
(ROOT / "prompts.js").write_text(
    "// Сгенерировано build_assets.py из prompts/*.md — правьте .md и пересоберите.\n"
    f"window.PROMPTS = {json.dumps(prompts, ensure_ascii=False, indent=1)};\n",
    encoding="utf-8",
)

demo = json.loads((ROOT / "examples" / "demo_test.json").read_text(encoding="utf-8"))
(ROOT / "demo.js").write_text(
    "// Сгенерировано build_assets.py из examples/demo_test.json.\n"
    f"window.DEMO_TEST = {json.dumps(demo, ensure_ascii=False)};\n",
    encoding="utf-8",
)
print("prompts.js и demo.js обновлены")
