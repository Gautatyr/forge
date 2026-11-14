"""Card pool for an engine: distinct non-basic cards in a set of .dck files, and which rules features their Forge
scripts use (effect types, trigger modes, static modes, replacement events, keywords) compared with all scripts.

Usage: python3 -I card_pool.py <cardsfolder> <label>=<dir or .dck>[,<more>] [<label>=...]
Each label is a cumulative pool: later labels include the earlier ones.
Precon files named "... [YYYY].dck" can be filtered with a suffix: <dir>@2018 keeps years >= 2018.
"""
import os
import re
import sys
from collections import Counter

BASICS = {"Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes"}


def deck_files(spec):
    files = []
    for part in spec.split(","):
        year = None
        if "@" in part:
            part, year = part.rsplit("@", 1)
            year = int(year)
        if os.path.isdir(part):
            for f in sorted(os.listdir(part)):
                if not f.endswith(".dck"):
                    continue
                m = re.search(r"\[(\d{4})\]\.dck$", f)
                if year and (not m or int(m.group(1)) < year):
                    continue
                files.append(os.path.join(part, f))
        else:
            files.append(part)
    return files


def deck_cards(path):
    cards = set()
    section = None
    for line in open(path, encoding="utf-8", errors="replace"):
        line = line.strip()
        if line.startswith("["):
            section = line.lower()
            continue
        if section in ("[metadata]", None) or not line or line.startswith("#"):
            continue
        m = re.match(r"^\d+\s+(.+?)(\|.*)?$", line)
        if not m:
            continue
        name = m.group(1).strip().rstrip("+").strip()
        if name in BASICS or name.startswith("Snow-Covered "):
            continue
        cards.add(name)
    return cards


def index_scripts(folder):
    by_name = {}
    for root, _, files in os.walk(folder):
        for f in files:
            if f.endswith(".txt"):
                p = os.path.join(root, f)
                for line in open(p, encoding="utf-8", errors="replace"):
                    if line.startswith("Name:"):
                        by_name.setdefault(line[5:].strip(), p)
    return by_name


FEATURES = {
    "effect types": re.compile(r"(?:SP|AB|DB)\$\s*([A-Za-z]+)"),
    "trigger modes": re.compile(r"^T:Mode\$\s*([A-Za-z]+)", re.M),
    "static modes": re.compile(r"^S:Mode\$\s*([A-Za-z]+)", re.M),
    "replacement events": re.compile(r"^R:Event\$\s*([A-Za-z]+)", re.M),
    "keywords": re.compile(r"^K:([A-Za-z' -]+)", re.M),
}


def features(paths):
    used = {k: Counter() for k in FEATURES}
    for p in paths:
        text = open(p, encoding="utf-8", errors="replace").read()
        for k, rx in FEATURES.items():
            for v in set(x.strip() for x in rx.findall(text)):
                used[k][v] += 1
    return used


def main():
    folder = sys.argv[1]
    by_name = index_scripts(folder)
    all_paths = set(by_name.values())
    total = features(all_paths)
    pool, files_seen = set(), 0
    for spec in sys.argv[2:]:
        label, dirs = spec.split("=", 1)
        files = deck_files(dirs)
        files_seen += len(files)
        for f in files:
            pool |= deck_cards(f)
        paths, missing = set(), []
        for name in pool:
            p = by_name.get(name) or by_name.get(name.split(" // ")[0])
            (paths.add(p) if p else missing.append(name))
        used = features(paths)
        print(f"\n== {label}: {len(files)} decks added ({files_seen} total), {len(pool)} distinct non-basic cards, "
              f"{len(paths)} scripts, {len(missing)} names not matched {missing[:5]}")
        for k in FEATURES:
            print(f"   {k:19s} {len(used[k]):4d} of {len(total[k]):4d} used across all {len(all_paths)} scripts")


main()
