"""One-time move (20/11/2026, Kiệt: "tách các file trong chế độ hướng dẫn 3d thành các file độc lập"):
copy the per-exercise tip and mistake text out of the app's Localizable.xcstrings into the
exercise folders, where the rest of the exercise lives.

    python3 pipeline/migrate_demo_text.py [--dry-run]

Writes ``<exercise>/content/tips.json`` (tip id -> language -> title, body, how[], why, avoid)
and ``<mistake exercise>/content/mistake.json`` (language -> title, body, fix). After this the
exercise folder is the single source; ``export_app_demos.py`` turns it into the app's
``<prefix>_tips.json`` / ``<prefix>_mistakes.json`` and the per-item keys leave the catalogue.
Re-running is safe: an existing content file is left alone.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
XCSTRINGS = ROOT.parent.parent / "apps" / "ios" / "ASCND" / "Resources" / "Localizable.xcstrings"
LANGS = ("en", "es", "vi")


def text(strings: dict, key: str, lang: str) -> str:
    loc = strings[key]["localizations"][lang]
    return loc["stringUnit"]["value"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    strings = json.loads(XCSTRINGS.read_text())["strings"]
    for ex in sorted(p for p in ROOT.iterdir() if (p / "exercise.json").exists()):
        spec = json.loads((ex / "exercise.json").read_text())
        tips = (spec.get("app_demo") or {}).get("tips") or []
        if tips:
            out = {}
            for t in tips:
                k = f"eg.demo3d.tip.{t['id']}"
                out[t["id"]] = {
                    lang: {
                        "title": text(strings, k, lang),
                        "body": text(strings, f"{k}.body", lang),
                        "how": [text(strings, f"{k}.how{n}", lang) for n in (1, 2)],
                        "why": text(strings, f"{k}.why", lang),
                        "avoid": text(strings, f"{k}.avoid", lang),
                    }
                    for lang in LANGS
                }
            write(ex / "content" / "tips.json", out, args.dry_run)
        m = spec.get("mistake_demo")
        if m:
            k = f"eg.demo3d.mistake.{m['id']}"
            out = {
                lang: {"title": text(strings, k, lang), "body": text(strings, f"{k}.body", lang),
                       "fix": text(strings, f"{k}.fix", lang)}
                for lang in LANGS
            }
            write(ex / "content" / "mistake.json", out, args.dry_run)


def write(path: Path, data: dict, dry: bool) -> None:
    if path.exists():
        print(f"[evs] keep {path.relative_to(ROOT)} (already there)")
        return
    print(f"[evs] {'would write' if dry else 'write'} {path.relative_to(ROOT)}")
    if not dry:
        path.parent.mkdir(exist_ok=True)
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
