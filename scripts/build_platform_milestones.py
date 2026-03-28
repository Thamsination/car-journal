#!/usr/bin/env python3
"""Build milestones from serviceIntervals: if a task has any mfr row, only mfr km
cadences are used for that task in milestones; otherwise rec cadences are used.
Tasks that are time-only (months set, km null) are excluded from km milestones."""
from __future__ import annotations

import json
import sys
from collections import defaultdict

MAX_KM = 300_000


def build_milestones(intervals: list[dict]) -> list[dict]:
    by_task: dict[str, list[dict]] = defaultdict(list)
    for item in intervals:
        by_task[item["task"]].append(item)

    km_to_tasks: dict[int, set[str]] = defaultdict(set)

    for task, items in by_task.items():
        mfr_kms = sorted({x["km"] for x in items if x["kind"] == "mfr" and x.get("km")})
        rec_kms = sorted({x["km"] for x in items if x["kind"] == "rec" and x.get("km")})
        use_kms = mfr_kms if mfr_kms else rec_kms
        for k in use_kms:
            n = k
            while n <= MAX_KM:
                km_to_tasks[n].add(task)
                n += k

    return [
        {"km": km, "tasks": sorted(km_to_tasks[km])}
        for km in sorted(km_to_tasks.keys())
    ]


def main() -> None:
    data = json.load(sys.stdin)
    data["milestones"] = build_milestones(data["serviceIntervals"])
    json.dump(data, sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
