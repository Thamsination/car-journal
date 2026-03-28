#!/usr/bin/env python3
"""Build static/data/platforms/index.json from all platform files.

Reads every .json file in the platforms directory (except index.json itself),
extracts the vehicles array, and flattens it into a searchable index.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

PLATFORMS_DIR = Path(__file__).resolve().parent.parent / "static" / "data" / "platforms"


def build_index() -> list[dict]:
    entries: list[dict] = []
    for path in sorted(PLATFORMS_DIR.glob("*.json")):
        if path.name == "index.json":
            continue
        with open(path) as f:
            data = json.load(f)
        platform_id = data["id"]
        vehicles = data.get("vehicles", [])
        if not vehicles:
            print(f"WARNING: {path.name} has no vehicles array — skipping", file=sys.stderr)
            continue
        for v in vehicles:
            entries.append({
                "platformId": platform_id,
                "make": v["make"],
                "models": v["models"],
                "yearFrom": v["yearFrom"],
                "yearTo": v["yearTo"],
            })
    return entries


def main() -> None:
    index = build_index()
    out = PLATFORMS_DIR / "index.json"
    with open(out, "w") as f:
        json.dump(index, f, indent=2)
        f.write("\n")
    print(f"Wrote {len(index)} entries to {out}")


if __name__ == "__main__":
    main()
