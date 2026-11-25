"""Called from the hub's start_match.py (hook added by install.py): gives each
bot one of its player's real cars before the match starts.

dress(spec) edits each car's `livery` object, which the hub's apply_livery then
puts on the RLBot loadout. The club colours (primary/secondary) are kept.

- A player with looks in liveries.json gets one of them, the most used ones
  more often; the hub's own preset for him (if any) stays in the draw.
- A player with no look at all keeps the hub's preset if he has one, else
  (fallback) wears a real pro car picked by his name, always the same one.
- The draw is the same for every game of a series (same six players, same
  day), and different from one opponent to the next.
"""

import datetime
import hashlib
import json
import os
import random
import struct
import sys
import unicodedata
from pathlib import Path

VERSION = "1.0"
HOME = Path(__file__).resolve().parent
LOG = HOME / "liveries.log"


def resources():
    """The hub's resources folder: the one of the Python running us (the hub
    runs start_match.py with its own), else the default install place."""
    mine = Path(sys.executable).resolve().parent.parent
    if (mine / "app.asar").is_file():
        return mine
    return Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "RL Career Hub" / "resources"


def asar_json(name):
    """A JSON file of the hub, read straight from its app.asar (not changed)."""
    with open(resources() / "app.asar", "rb") as f:
        head = f.read(16)
        header_size, json_size = struct.unpack_from("<I", head, 4)[0], struct.unpack_from("<I", head, 12)[0]
        node = json.loads(f.read(json_size).decode("utf-8"))
        for part in name.split("/"):
            node = node["files"][part]
        f.seek(8 + header_size + int(node["offset"]))
        return json.loads(f.read(node["size"]).decode("utf-8"))


_HUB = None


def hub_presets(name):
    """The hub's own presets for this player (data/presets.json)."""
    global _HUB
    if _HUB is None:
        _HUB = asar_json("data/presets.json")["players"]
    return (_HUB.get(fold(name)) or {}).get("presets") or []

ITEM_KEYS = ("carId", "decalId", "wheelsId", "boostId", "trailsId", "goalExplosionId",
             "bodyPaintId", "decalPaintId", "wheelsPaintId", "boostPaintId", "trailsPaintId",
             "goalExplosionPaintId", "paintFinishId", "customFinishId",
             "antennaId", "topperId", "engineAudioId", "antennaPaintId", "topperPaintId",
             "teamColorId", "customColorId")


def patch_apply_livery():
    """The hub's apply_livery paints a car in an RGB colour (its club's) and
    has no field for a swatch of the in-game colour picker. Wrap it: when the
    livery carries the player's own swatches, the club RGB is left out and
    the swatch indices are set on the loadout instead."""
    for name in ("__main__", "start_match"):
        module = sys.modules.get(name)
        original = getattr(module, "apply_livery", None)
        if original is None or getattr(original, "_liveries", False):
            continue

        def apply_livery(config, livery, _original=original):
            own = bool(livery) and livery.get("teamColorId") is not None
            if own:
                livery = {k: v for k, v in livery.items() if k not in ("primary", "secondary")}
            _original(config, livery)
            if not own:
                return
            try:      # runs outside the hook's try: must never stop a match
                variety = getattr(config, "variety", None)
                loadout = getattr(variety, "loadout", None) if variety is not None else None
                if loadout is None:
                    return
                loadout.team_color_id = int(livery["teamColorId"])
                if livery.get("customColorId") is not None:
                    loadout.custom_color_id = int(livery["customColorId"])
                loadout.primary_color_lookup = None
                loadout.secondary_color_lookup = None
            except Exception as exc:
                log(f"player colours not applied ({exc!r})")

        apply_livery._liveries = True
        module.apply_livery = apply_livery


def fold(s):
    return "".join(c for c in unicodedata.normalize("NFKD", str(s)) if c.isalnum()).casefold()


def log(msg):
    try:
        if LOG.is_file() and LOG.stat().st_size > 1_000_000:     # keep the last ~1 MB only
            LOG.replace(LOG.with_name("liveries.old.log"))
        with LOG.open("a", encoding="utf-8") as f:
            f.write(f"{datetime.datetime.now():%Y-%m-%d %H:%M:%S}  {msg}\n")
    except OSError:
        pass


def load():
    """config, and per player the looks to draw from. Looks kept by hand in
    the vitrine (corrections.json) come first and are favoured; with "seul"
    they are the only ones."""
    try:
        config = json.loads((HOME / "config.json").read_text(encoding="utf-8-sig"))
    except (OSError, ValueError) as exc:     # a typo in config.json: default settings
        log(f"config.json unreadable, default settings used ({exc})")
        config = {}
    players = json.loads((HOME / "liveries.json").read_text(encoding="utf-8"))["players"]
    try:
        manual = json.loads((HOME / "corrections.json").read_text(encoding="utf-8-sig"))["players"]
    except (OSError, ValueError, KeyError):
        manual = {}
    for key, entry in manual.items():
        mine = [dict(p, manual=True) for p in entry.get("presets", [])]
        if not mine:
            continue
        base = players.get(key) or {"name": entry.get("name", key), "presets": []}
        players[key] = dict(base, presets=mine if entry.get("seul") else mine + base.get("presets", []))
    return config, players


COLORS = "player"


def fix_hub_finishes(look):
    """The hub's presets put the body finish in paintFinishId, but RLBot shows
    the body finish from custom_finish_id (checked in game: Anodized Pearl
    4127 as paint/custom 4127/270 did not show, 270/4127 did). Swap them."""
    if look and ("paintFinishId" in look or "customFinishId" in look):
        look["paintFinishId"], look["customFinishId"] = look.get("customFinishId"), look.get("paintFinishId")
        for k in ("paintFinishId", "customFinishId"):
            if look[k] is None:
                del look[k]
    return look


def own_colors(look, presets, side):
    """The hub's presets carry no colour, so the hub paints them in club RGB,
    which shows pink. Give them the player's own swatches from his replays:
    those of the same car + decal if he drove it, else same car, else his
    most used. {} when he has no replay."""
    seen = [p for p in presets if not p.get("manual") and (p.get(side) or {}).get("teamColorId") is not None]
    for same in (("carId", "decalId"), ("carId",), ()):
        match = [p for p in seen if all(p[side].get(k) == look.get(k) for k in same)]
        if match:
            best = max(match, key=lambda p: p.get("replays", 0))[side]
            return {k: best[k] for k in ("teamColorId", "customColorId") if best.get(k) is not None}
    return {}


def hub_look(look, presets, side):
    """A hub preset (one side) made right: finishes swapped, player's colours."""
    look = fix_hub_finishes(dict(look))
    if COLORS == "player" and look.get("teamColorId") is None:
        look.update(own_colors(look, presets, side))
    return look


def wear(livery, look):
    """Put a look on a livery. With colors = "club" the player's own colours
    are left out and the club's stay, as the hub does."""
    for k in ITEM_KEYS:
        livery.pop(k, None)
    livery.update({k: v for k, v in look.items() if k in ITEM_KEYS
                   and not (COLORS == "club" and k in ("teamColorId", "customColorId"))})


def force(livery, name, side, want, players):
    """config "forcer": {"AtomiK": "h4"} puts that car on him every match
    (ids as listed by the vitrine's j command: r1.., h1.., m1..).
    For tests and screenshots; remove the line to go back to the draw."""
    if want.lower().startswith("h"):
        hub = hub_presets(name)
        n = int(want[1:]) if want[1:].isdigit() else 0
        if not 1 <= n <= len(hub):
            log(f"{name}: force {want} not found (hub presets: {len(hub)})")
            return False
        wear(livery, hub_look(hub[n - 1][side], (players.get(fold(name)) or {}).get("presets") or [], side))
    else:
        mine = (players.get(fold(name)) or {}).get("presets") or []
        pick = next((p for p in mine if str(p.get("id")) == want), None)
        if pick is None:
            log(f"{name}: force {want} not found")
            return False
        wear(livery, pick[side])
    livery["livery"] = f"forcer:{want}"
    log(f"{name}: forced car {want} (body finish {livery.get('customFinishId')}, accent {livery.get('paintFinishId')}, "
        f"colours {livery.get('teamColorId')}/{livery.get('customColorId')})")
    return True


def dress(spec):
    global COLORS
    config, players = load()
    if not config.get("enabled", True):
        return spec
    COLORS = config.get("colors", "player")
    log(f"--- match ({HOME.name} {VERSION}) ---")
    patch_apply_livery()
    cars = [c for c in spec.get("cars", []) if c.get("type") == "rlbot" and c.get("livery") is not None]
    for car in cars:      # the hub's own preset on this car (kept or replaced below)
        lv = car["livery"]
        if lv.get("preset") is None:
            continue
        if config.get("fix_hub_finishes", True):
            fix_hub_finishes(lv)
        if COLORS == "player" and lv.get("teamColorId") is None:
            side = "blue" if int(car.get("team", 0)) == 0 else "orange"
            lv.update(own_colors(lv, (players.get(fold(car.get("name", ""))) or {}).get("presets") or [], side))
    table = sorted(fold(c.get("name", "")) for c in spec.get("cars", []))
    series = f"{datetime.date.today()}|{'|'.join(table)}"
    # Borrowed cars (players with no replay) come from the most striking ones.
    pool = [p for entry in players.values() for p in entry.get("presets", [])[:2] if p.get("flair", 0) >= 3]
    forced = {fold(k): str(v) for k, v in (config.get("force") or config.get("forcer") or {}).items()}
    for car in cars:
        name = car.get("name") or ""
        side = "blue" if int(car.get("team", 0)) == 0 else "orange"
        livery = car["livery"]
        if fold(name) in forced and force(livery, name, side, forced[fold(name)], players):
            continue
        rng = random.Random(hashlib.sha256(f"{series}|{fold(name)}".encode()).digest())
        mine = (players.get(fold(name)) or {}).get("presets") or []
        # Looks kept by hand always; of the replay looks, the best few.
        limit = int(config.get("looks_per_player", 4))
        mine = [p for p in mine if p.get("manual")] + [p for p in mine if not p.get("manual")][:limit]
        hub_has_preset = livery.get("preset") is not None
        if mine:
            # His usual car first (weight grows with the replays it was seen
            # in, a car seen once is a one-off), standing out a bit: a plain
            # ranked Fennec looks like the hub's generic car in club colours.
            weights = [max(0.05, p.get("recent", p.get("replays", 1))) * (1 + 0.5 * p.get("flair", 0))
                       * (0.5 if p.get("replays", 1) <= 1 else 1) for p in mine]
            if max(p.get("flair", 0) for p in mine) >= 2:
                weights = [w if p.get("flair", 0) >= 2 else w * 0.15 for w, p in zip(weights, mine)]
            top = max(weights)
            weights = [2 * top if p.get("manual") else w for w, p in zip(weights, mine)]
            options = list(mine)
            if hub_has_preset and not any(p.get("manual") for p in mine):   # the hub's RLCS designs, a bit less than his usual car
                options.append(None)
                weights.append(0.75 * max(weights))
            pick = rng.choices(options, weights=weights)[0]
            if pick is None:
                any_hub_preset(livery, name, side, mine, rng)
                log_hub(name, livery)
                continue
            wear(livery, pick[side])
            # One of the explosions he used with this car, as often as he did.
            booms = (pick.get("explosions") or {}).get(side) or []
            if booms:
                gid, gpaint, _ = rng.choices(booms, weights=[b[2] for b in booms])[0]
                livery["goalExplosionId"], livery["goalExplosionPaintId"] = gid, gpaint
            livery["livery"] = f"replays:{pick['id']}"
            log(f"{name}: {pick['id']} {pick['look']}")
        elif not hub_has_preset and config.get("fallback", True) and pool:
            # Same car for this player every match: chosen by his name only.
            pick = pool[int(hashlib.sha256(fold(name).encode()).hexdigest(), 16) % len(pool)]
            wear(livery, pick[side])
            livery["livery"] = f"emprunt:{pick['look']}"
            log(f"{name}: (no replay) borrowed car {pick['look']}")
        elif hub_has_preset:
            any_hub_preset(livery, name, side, [], rng)
            log_hub(name, livery)
        else:
            log(f"{name}: hub's default car")
    return spec


def any_hub_preset(livery, name, side, presets, rng):
    """The hub always hands a player the first of his presets (seen in every
    match of liveries.log): zen always got the same one of his 12. Draw one
    of them all instead. On any problem the hub's own choice stays."""
    try:
        hub = hub_presets(name)
        if len(hub) < 2:
            return
        p = rng.choice(hub)
        wear(livery, hub_look(p[side], presets, side))
        livery["preset"] = p.get("id", livery.get("preset"))
    except Exception as exc:
        log(f"{name}: could not draw among the hub presets ({exc!r})")


def log_hub(name, lv):
    log(f"{name}: hub preset {lv.get('preset')} (body finish {lv.get('customFinishId')}, "
        f"accent {lv.get('paintFinishId')}, colours {lv.get('teamColorId', 'club')}/{lv.get('customColorId', 'club')})")
