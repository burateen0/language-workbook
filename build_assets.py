"""Пересобирает prompts.js и demo.js из prompts/**/*.md и examples/demo_*.json.

Запускайте после правки промтов или демо:  python build_assets.py
(JS-файлы нужны, чтобы сайт работал и на GitHub Pages, и при открытии index.html двойным кликом.)
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent

prompts = {
    engine: {name: (ROOT / "prompts" / engine / f"{name}.md").read_text(encoding="utf-8") for name in ("generate", "review", "schema")}
    for engine in ("alpha", "zh")
}
(ROOT / "prompts.js").write_text(
    "// Сгенерировано build_assets.py из prompts/*/*.md — правьте .md и пересоберите.\n"
    f"window.PROMPTS = {json.dumps(prompts, ensure_ascii=False, indent=1)};\n",
    encoding="utf-8",
)

demos = {}
for path in sorted((ROOT / "examples").glob("demo_*.json")):
    lang = path.stem.split("_", 1)[1]
    demo = json.loads(path.read_text(encoding="utf-8"))
    demo.setdefault("language", lang)
    demos[lang] = demo
(ROOT / "demo.js").write_text(
    "// Сгенерировано build_assets.py из examples/demo_*.json.\n"
    f"window.DEMO_TESTS = {json.dumps(demos, ensure_ascii=False)};\n",
    encoding="utf-8",
)
print("prompts.js и demo.js обновлены:", ", ".join(demos))
