# RLC Enhancer for RL Career Hub

RLC Enhancer (formerly RLC Mod) is a mod for **RL Career Hub** (Rocket League career game) by Milan. Current version: **v1.2**.

**Collab:** the bots wear their pros' real presets thanks to [RLCareerProPresets](https://github.com/Managone/RLCareerProPresets) by **Matiyo** (MIT license), installed automatically with RLC Enhancer.

## Download and install

1. Download `RLC-Enhancer-v1.2.zip` from the [latest release](../../releases/latest).
2. Right-click the zip > "Extract All...", close RL Career Hub, then double-click `Install RLC Enhancer.bat`.
3. Start the game with the **RL Career Hub MOD** shortcut on your desktop.

Your normal RL Career Hub is not modified: the mod runs in its own copy of the game (`Documents\RL Career Hub Mod`). Updating from an older version: run the new installer, your mod saves are kept. Full guide in the zip (`README (EN).txt`, `LISEZMOI (FR).txt`). What changed in each version: [CHANGELOG.md](CHANGELOG.md).

## Source code

By Milan. **All rights reserved**: this source is published so it can be read and reviewed, not reused. No copy, reuse, adaptation or redistribution (including inside RL Career Hub itself) without Milan's written permission. See `LICENSE.txt`.

Built for **RL Career Hub 0.2.0-beta.33** (Electron 33). The game's own code is not included.

## What the mod adds

- RLCS 1v1 and 2v2: a 2v2 Open and a 1v1 Open in every region after Major 2, plus 1v1/2v2 World Championships during Worlds with 8 entries: every regional winner, then runners-up (EU first) to fill the field. Realistic format (2 GSL groups of 8, then 8-team hybrid playoffs), seeded from club ranking points, simulated with the game's own match engine, day by day.
- The user's 1v1/2v2 matches work like normal matchdays: time stops, match card, live sim screen, event colours. They can also be watched or played in Rocket League through the normal bot launcher (experimental).
- Brackets, groups and scorers in the calendar and on the home page; new board targets in Continental Success.
- Titles: 1v1/2v2 World and Regional Champion, and an automatic "Nx RLCS World Champion" title for multiple 3v3 world champions. Every World Championship title ranks above a Major title (1v1 < 2v2 < 3v3).
- Career: custom team with a starting budget, offers from other clubs, changing club, getting sacked and offers from struggling clubs, the save name follows the current club, and a new Office > My Career tab (every club, dates, reason for leaving, titles, best results, season-by-season rankings).
- Esports World Cup (3v3, like EWC 2026): 15 invitations from the RLCS ranking at the end of Major 2 (holder, then EU 3, NA 3, MENA 3, SAM 2, OCE 1, APAC 1, SSA 1) and 1 place through an EWC LCQ (16 best-ranked clubs without an invitation, single elimination). Main event over 5 days between Major 2 and the RLCS LCQ: 2 GSL groups of 8 (Bo5, elimination matches Bo7), then an 8-team single-elimination bracket in Bo7 with a third place match. Real 1,000,000 dollar prize pool, no RLCS points, the winner becomes next season's holder.
- Office > Club business: a club store (V-Hive style, $250K) and a stream studio ($120K), bought once, bring money every week: each pays itself back in about 60 weeks for a club with the world's median following, a bit faster for a big club and a bit slower for a small one (0.8x to 1.25x); the studio also brings followers to the club and its players, more in weeks with matches.
- Bootcamp facility ($350K, in Club business): the week before each Major, Worlds and Esports World Cup, a team from the user's region (taken from that LAN's field) offers to rent it for the week. The price follows the team's RLCS points: up to $50K for the region's best team, never more. 3 rentals max a season; each offer comes by mail 6 days before the stay, can be accepted or declined right in the mail (or in Club business), and lapses when the stay starts.
- In-game title pick: on the profile of each player of the user's club, choose which of the titles he has won shows above his car in Rocket League (for example 3v3 or 2v2 World Champion), or keep "Auto".
- Archives tab (Liquipedia style): every season of the save, every region and every event (3v3, 1v1, 2v2, EWC) with final standings, prize money and series by stage, the season's RLCS ranking, and a page per team with its results season by season.
- Pro presets, in collab with [RLCareerProPresets](https://github.com/Managone/RLCareerProPresets) by Matiyo: every bot of a career match uses one of its pro player's real presets, read from about 78,000 pro replays. The installer copies Matiyo's files unchanged to `Documents\RL Career Hub Mod\presets` and adds his `RLCareerLiveries` hook to the modded copy's `resources\rlbot\start_match.py` only. Settings in `presets\config.json`.
- New calendar colours; every text goes through the game's language system (English keys, French translations).

## Layout

| File | Added to (inside `resources/app.asar`) |
|---|---|
| `src/titles-patch.js` | end of `engine/titles.js` |
| `src/main-patch.js` | end of `main.js` |
| `src/preload-patch.js` | end of `preload.js` |
| `src/renderer-patch.js` | end of `renderer/app.js` |
| `src/engine-patch.js`, `src/engine-modes.js`, `src/engine-career.js`, `src/engine-business.js`, `src/engine-archive.js` | end of `engine/league.js`, in that order |
| `src/rlc-mod-lang.js` | new file `renderer/lang/rlc-mod.js`, loaded from `renderer/index.html` right after `lang/ar.js` |

One line of the game is changed, in `main.js`: the "watch the match" check that requires 6 bots (3v3) is wrapped so that `__rlcWatchOk()` (in `main-patch.js`) accepts 2 bots for 1v1 and 4 for 2v2, **for the mod's own 1v1/2v2 fixtures only**. 3v3 behaviour is unchanged.

The patches never edit the game's functions in place: they wrap them (keep the original, call it, adjust the result). Putting back `app.asar.original` restores the original game.

## Third-party: RLCareerProPresets

`vendor/RLCareerProPresets` holds Matiyo's files (`liveries.py`, `liveries.json`, `config.json`) as published at the commit in `SOURCE-COMMIT.txt`. They are under the **MIT license**, Copyright (c) 2026 Matiyo (`vendor/RLCareerProPresets/LICENSE`), not under RLC Enhancer's license.

## Installer

- `installer/install.js` runs with the game's own executable in Node mode (`ELECTRON_RUN_AS_NODE=1`, started by `Install RLC Enhancer.bat`), so players don't need Node.js.
- It copies the installed game to `Documents\RL Career Hub Mod\RL Career Hub`, keeps the clean `app.asar` as `app.asar.original`, writes the patched `app.asar` (asar integrity hashes recomputed), copies the player's data to `rl-career-hub (AppData)` if they agree, and creates a shortcut that starts the copy with `--user-data-dir` so the normal game and its saves are never touched.
- It refuses to install if the game version or files don't match.

## Build

```
npm install esbuild
node installer/make-dist.js "out/RLC Enhancer v1.2"
```

This minifies the files from `src/` into `files/payload.bin` and copies the installer, licence and guides next to it.
