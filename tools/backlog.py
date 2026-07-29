#!/usr/bin/env python3
"""Turn a transcribed paper training log into an IronLog import file.

    python3 tools/backlog.py backlog.txt -o ironlog-backlog.json

The input format deliberately mirrors the notebook, so a transcription can be
checked against the page line by line without translating anything in your
head. Correct the text, re-run, re-import.

    # unit: lb                  <- applies to every line until changed
    # bodyweight: 172

    28.7.26
    SQUAT
    WU 10x20, 3x70, 1x110
    WS 5x132.5, 5x132.5, 5x132.5
    PRESS
    WU 10x20, 2x40, 1x60
    WS 5x72.5 x3               <- "x3" repeats the set three times
    DEADLIFT
    WS 5x155

    27.7.26
    CHIN 3x6+22.5              <- sets x reps + added weight, one line
    DIP  3x6+22.5
    LIU  3x6+7.5
    BAG  12x3                  <- rounds x minutes

Every number is REPS x WEIGHT, which is how the notebook is written. Decimal
commas are accepted, so 132,5 and 132.5 both work.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from datetime import date

LB_PER_KG = 0.45359237

# Notebook shorthand -> the app's exercise ids.
EXERCISES = {
    "SQUAT": "squat",
    "PAUSED SQUAT": "squat",
    "PAUSEDSQUAT": "squat",
    "PRESS": "press",
    "BENCH": "bench",
    "DEAD": "deadlift",
    "DEADLIFT": "deadlift",
    "ROM DEAD": "rdl",
    "ROMDEAD": "rdl",
    "RDL": "rdl",
    "CLEAN": "powerclean",
    "POWERCLEAN": "powerclean",
    "CHIN": "chinup",
    "CHINS": "chinup",
    "DIP": "dip",
    "DIPS": "dip",
    "LIU": "liu-raise",
    "BB ROW": "db-row",
    "BBROW": "db-row",
    "BURP": "burpees",
    "BURPEES": "burpees",
    "BAG": "box-bag-int",
    "SHADOW": "box-shadow",
    "RUN": "run-easy",
    "PLANK": "ca-plank",
}

CONDITIONING = {"box-bag-int", "box-shadow", "run-easy"}
BODYWEIGHT_LIFTS = {"chinup", "dip"}
UNKNOWN: set[str] = set()


UNCERTAIN: list[str] = []


def parse_num(tok: str) -> float | None:
    """A single number. Never silently joins two — '6+7.5' is not 67.5."""
    tok = tok.strip().replace(",", ".")
    if not re.fullmatch(r"\d+(\.\d+)?", tok):
        return None
    return float(tok)


def parse_date(tok: str) -> str | None:
    """'28.7.26' -> '2026-07-28'. Two-digit years are 2000s."""
    m = re.fullmatch(r"(\d{1,2})\.(\d{1,2})\.(\d{2,4})", tok.strip().rstrip("."))
    if not m:
        return None
    d, mo, y = (int(x) for x in m.groups())
    if y < 100:
        y += 2000
    try:
        return date(y, mo, d).isoformat()
    except ValueError:
        return None


def parse_sets(text: str, unit: str) -> list[dict]:
    """'5x132.5, 5x132.5' or '5x132.5 x3' -> a list of {weight, reps}.

    Rest-pause clusters — "(2+3)x70" or "1+1x155" — are one work set taken in
    two goes, not two sets. Recorded as a single set carrying the total reps,
    with a note preserving the clusters, so the volume is right and the
    structure is not quietly lost.

    The distinction from "3x6+22.5" (sets x reps + added weight) is the order:
    a "+" BEFORE the "x" is rest-pause; an "x" before the "+" is sets/reps/weight.
    """
    out = []
    for chunk in re.split(r"[,;]", text):
        chunk = chunk.strip()
        if not chunk:
            continue
        # A trailing "x3" repeats the set.
        repeat = 1
        m = re.search(r"\s+[x×]\s*(\d+)\s*$", chunk)
        if m:
            repeat = int(m.group(1))
            chunk = chunk[: m.start()]

        rp = re.fullmatch(r"\(?\s*(\d+(?:\s*\+\s*\d+)+)\s*\)?\s*[x×]\s*([\d.,]+)", chunk.strip())
        if rp:
            clusters = [int(x) for x in re.split(r"\+", rp.group(1))]
            weight = parse_num(rp.group(2))
            if weight is None:
                continue
            if unit == "lb":
                weight = round(weight * LB_PER_KG, 2)
            for _ in range(repeat):
                out.append({
                    "weight": weight,
                    "reps": sum(clusters),
                    "note": f"rest-pause {'+'.join(str(c) for c in clusters)}",
                })
            continue

        parts = re.split(r"[x×]", chunk)
        if len(parts) < 2:
            continue
        reps = parse_num(parts[0])
        weight = parse_num(parts[1])
        if reps is None or weight is None:
            continue
        if unit == "lb":
            weight = round(weight * LB_PER_KG, 2)
        for _ in range(repeat):
            out.append({"weight": weight, "reps": int(reps)})
    return out


def parse(text: str) -> tuple[list[dict], list[str]]:
    unit = "kg"
    sessions: list[dict] = []
    warnings: list[str] = []
    cur: dict | None = None
    entry: dict | None = None

    for lineno, raw in enumerate(text.splitlines(), 1):
        line = raw.strip()
        if not line:
            continue

        if line.startswith("#"):
            m = re.match(r"#\s*unit\s*:\s*(kg|lb)", line, re.I)
            if m:
                unit = m.group(1).lower()
            continue

        # A "?" anywhere on a line means I could not read that cell. The line is
        # reported and dropped — an uncertain number must never become data,
        # because once it is in the log it looks exactly like a certain one.
        if "?" in line:
            UNCERTAIN.append(f"line {lineno}  [{cur['date'] if cur else 'no date'}]  {line}")
            continue

        # A bare date starts a new session.
        iso = parse_date(line.split()[0]) if line.split() else None
        if iso and len(line.split()) == 1:
            cur = {"date": iso, "entries": []}
            sessions.append(cur)
            entry = None
            continue

        if cur is None:
            warnings.append(f"line {lineno}: '{line}' appears before any date — skipped")
            continue

        m_note = re.match(r"NOTE\s+(.*)", line, re.I)
        if m_note:
            cur["note"] = m_note.group(1).strip()
            continue

        # WU / WS lines attach to the exercise above them.
        m = re.match(r"(WU|WS)\s+(.*)", line, re.I)
        if m:
            if entry is None:
                warnings.append(f"line {lineno}: '{line}' has no exercise above it — skipped")
                continue
            sets = parse_sets(m.group(2), unit)
            if not sets:
                warnings.append(f"line {lineno}: could not read any sets from '{line}'")
            entry["warmupSets" if m.group(1).upper() == "WU" else "sets"].extend(sets)
            continue

        # Otherwise: an exercise name, possibly with its sets on the same line.
        name, rest = line, ""
        m = re.match(r"^([A-Za-z][A-Za-z \-]*?)\s+([\d].*)$", line)
        if m:
            name, rest = m.group(1), m.group(2)
        key = re.sub(r"\s+", " ", name.strip().upper())
        ex = EXERCISES.get(key) or EXERCISES.get(key.replace(" ", ""))
        if not ex:
            UNKNOWN.add(key)
            warnings.append(f"line {lineno}: unknown exercise '{name.strip()}' — skipped")
            entry = None
            continue

        if ex in CONDITIONING:
            m2 = re.match(r"(\d+)\s*[x×]\s*(\d+)", rest)
            rounds, minutes = (int(m2.group(1)), int(m2.group(2))) if m2 else (None, None)
            cur["entries"].append({
                "exerciseId": ex, "conditioning": True,
                "rounds": rounds, "minutes": minutes,
            })
            entry = None
            continue

        entry = {"exerciseId": ex, "sets": [], "warmupSets": []}
        cur["entries"].append(entry)

        if ex == "burpees" and re.fullmatch(r"\d+", rest.strip()):
            entry["sets"] = [{"weight": 0, "reps": int(rest.strip())}]
            continue

        if rest:
            # Three numbers means sets x reps x weight — "CHIN 3x6+22.5" is
            # three sets of six at +22.5, and "LIU 3x6+7.5" is the same shape.
            # Two numbers means reps x weight, as in the WU/WS ramps.
            # "+BW" is bodyweight only — a real, meaningful zero on a chin
            # or a dip, not a missing number.
            if ex == "burpees":
                m4 = re.fullmatch(r"(\d+)\s*[x×]\s*(\d+)", rest.strip())
                if m4:
                    entry["sets"] = [{"weight": 0, "reps": int(m4.group(2))}
                                     for _ in range(int(m4.group(1)))]
                    continue

            m3 = re.match(r"(\d+)\s*[x×]\s*(\d+)\s*[+x×]\s*([\d.,]+|BW)\s*$", rest, re.I)
            if m3:
                nsets, reps = int(m3.group(1)), int(m3.group(2))
                raw = m3.group(3)
                added = 0.0 if raw.upper() == "BW" else (parse_num(raw) or 0)
                if unit == "lb" and added:
                    added = round(added * LB_PER_KG, 2)
                entry["sets"] = [{"weight": added, "reps": reps} for _ in range(nsets)]
            else:
                entry["sets"] = parse_sets(rest, unit)
            if not entry["sets"]:
                warnings.append(f"line {lineno}: could not read sets from '{line}'")

    return sessions, warnings


def to_import(sessions: list[dict]) -> dict:
    """Wrap parsed sessions in the shape the app's importer expects."""
    out = []
    for i, s in enumerate(sessions):
        entries = []
        for e in s["entries"]:
            if e.get("conditioning"):
                c = {
                    "id": f"bl-{s['date']}-{i}-c",
                    "type": "conditioning", "date": s["date"],
                    "label": "Heavy Bag Intervals",
                    "sport": "boxing", "conditioningId": e["exerciseId"],
                    "durationMin": (e.get("rounds") or 0) * (e.get("minutes") or 0),
                    "rounds": e.get("rounds"), "rpe": None,
                    "interference": "medium", "notes": "From paper log", "entries": [],
                }
                out.append(c)
                continue
            entries.append({
                "id": f"bl-{s['date']}-{e['exerciseId']}",
                "exerciseId": e["exerciseId"],
                "prescribedSets": len(e["sets"]) or 1,
                "prescribedReps": e["sets"][0]["reps"] if e["sets"] else 0,
                "sets": [{**x, "done": True, "ts": None} for x in e["sets"]],
                "warmupSets": [{**x, "done": True, "ts": None} for x in e["warmupSets"]],
            })
        if entries:
            out.append({
                "id": f"bl-{s['date']}-{i}",
                "type": "lift", "date": s["date"],
                "label": "From paper log",
                "notes": s.get("note") or "Imported from notebook",
                "entries": entries, "durationSec": None,
            })

    return {
        "schema": 3,
        "backlogImport": True,
        "exportedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        # Deliberately absent: program, settings, profile. A backlog is history
        # and must not carry programme state — the app decides that by recency,
        # but sending none at all removes the question entirely.
        "sessions": sorted(out, key=lambda x: x["date"]),
        "metrics": {"defs": [], "entries": []},
        "nutrition": {"targets": None, "log": [], "customFoods": []},
        "lab": {"customTests": [], "results": []},
        "customExercises": [], "customPrograms": [], "prs": {},
    }


def plausibility(payload: dict, jump_pct: float = 12.0) -> list[str]:
    """Flag session-to-session jumps too large to be real training.

    This is the check that caught a bench weight read across a column break:
    195 lb became 260 lb overnight and back again. A human notices that once;
    over a hundred sessions a human does not. Trained weights move by a few
    percent a session — anything past ~12 % is far more likely to be a
    misreading, a mis-attributed column, or a units boundary in the wrong place.

    Reports, never corrects. Every one of these could legitimately be real.
    """
    by_lift: dict[str, list[tuple[str, float, int]]] = {}
    for sess in payload["sessions"]:
        if sess["type"] != "lift":
            continue
        # A day that is deliberately light, or one I reconstructed rather than
        # read, is supposed to drop. Flagging it is noise, and a noisy check is
        # an ignored one.
        note = (sess.get("notes") or "").upper()
        if "RECONSTRUCTED" in note or "LIGHT" in note:
            continue
        for e in sess.get("entries", []):
            sets = [x for x in e["sets"] if x["weight"] > 0]
            if not sets:
                continue
            top = max(x["weight"] for x in sets)
            reps = max(x["reps"] for x in sets if x["weight"] == top)
            by_lift.setdefault(e["exerciseId"], []).append((sess["date"], top, reps))

    out = []
    for lift, rows in by_lift.items():
        rows.sort()
        for (d0, w0, r0), (d1, w1, r1) in zip(rows, rows[1:]):
            if w0 <= 0:
                continue
            # Comparing a heavy single to a set of seven says nothing about
            # whether either was misread. Only compare like rep ranges.
            if abs(r0 - r1) > 2:
                continue
            pct = (w1 - w0) / w0 * 100
            if abs(pct) > jump_pct:
                out.append(
                    f"{lift:9} {d0} {r0}x{w0:g} kg -> {d1} {r1}x{w1:g} kg  "
                    f"({pct:+.0f} % at the same rep range)")
    return sorted(out)

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input", help="transcribed notebook text")
    ap.add_argument("-o", "--output", default="ironlog-backlog.json")
    args = ap.parse_args()

    text = open(args.input, encoding="utf-8").read()
    sessions, warnings = parse(text)
    payload = to_import(sessions)

    lifts = [s for s in payload["sessions"] if s["type"] == "lift"]
    cond = [s for s in payload["sessions"] if s["type"] == "conditioning"]
    total_sets = sum(len(e["sets"]) for s in lifts for e in s["entries"])

    print(f"{len(lifts)} lifting sessions, {cond and len(cond) or 0} conditioning, {total_sets} work sets")
    if payload["sessions"]:
        print(f"dates {payload['sessions'][0]['date']} .. {payload['sessions'][-1]['date']}")

    for s in lifts:
        line = ", ".join(
            f"{e['exerciseId']} {len(e['sets'])}x{e['sets'][0]['reps']}@{e['sets'][0]['weight']}kg"
            if e["sets"] else f"{e['exerciseId']} (no sets)"
            for e in s["entries"])
        print(f"  {s['date']}  {line}")

    odd = plausibility(payload)
    if odd:
        print(f"\n{len(odd)} SUSPICIOUS JUMPS — probably a misreading, worth a look:",
              file=sys.stderr)
        for o in odd:
            print(f"  {o}", file=sys.stderr)

    if UNCERTAIN:
        print(f"\n{len(UNCERTAIN)} CELLS I COULD NOT READ — fill these in and re-run:", file=sys.stderr)
        for u in UNCERTAIN:
            print(f"  {u}", file=sys.stderr)

    if warnings:
        print("\nCHECK THESE — nothing was invented, these lines were skipped:", file=sys.stderr)
        for w in warnings:
            print(f"  {w}", file=sys.stderr)
    if UNKNOWN:
        print(f"\nUnknown exercise names: {', '.join(sorted(UNKNOWN))}", file=sys.stderr)
        print("Add them to EXERCISES at the top of this script, or define them "
              "in the app under More -> Exercises first.", file=sys.stderr)

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=1)
    print(f"\nwrote {args.output}")


if __name__ == "__main__":
    main()
