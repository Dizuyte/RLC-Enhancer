RLC Enhancer v1.2 for RL Career Hub - by Milan
==============================================

Works with: RL Career Hub 0.2.0-beta.33 on Windows.
Your normal RL Career Hub is NOT modified: the mod runs in its own copy of
the game, with its own saves.

NEW IN v1.2
- The mod is now called RLC Enhancer (it was RLC Mod). Same mod, same folder,
  your saves are kept.
- Collab with RLCareerProPresets by Matiyo: every bot of a career match now
  uses one of its pro player's real presets (car, decal, wheels, boost, trail,
  goal explosion, paints), read from about 78,000 pro replays. Installed
  automatically in the mod copy only. Settings: config.json in
  "Documents\RL Career Hub Mod\presets".
- Bootcamp facility (Office > Club business, $350K): the week before each
  Major, the Worlds and the Esports World Cup, teams from your region ask to
  rent it. Up to $50K a week (the higher the team in the RLCS ranking, the
  more it pays), 3 teams max a season. The offer comes by mail 6 days
  before the stay: accept or decline it right in the mail.
- In-game title of your players: open a player of your club and pick which
  of the titles he won shows above his car (for example 3v3 or 2v2 world
  champion). "Auto" keeps the game's choice.
- New Archives tab, Liquipedia style: every season, every region, every
  event, with final standings, series, the RLCS ranking and a page per team.

NEW IN v1.1
- Esports World Cup (3v3) between Major 2 and the LCQ, with its own LCQ,
  invitations from the RLCS ranking and the real 1,000,000 dollar prize pool.
- Club store and stream studio (Office > Club business): money every week,
  and followers for the club and the players.

INSTALL
1. Right-click the zip > "Extract All...". Do not run it from inside the zip.
2. Close RL Career Hub.
3. Double-click "Install RLC Enhancer.bat".
   If Windows shows "Windows protected your PC": click "More info",
   then "Run anyway".
4. The installer finds your game. If it can't, paste the folder that contains
   "RL Career Hub.exe" (usually C:\Program Files\RL Career Hub) and press Enter.
5. Press Y to import your current saves, settings and bots (recommended),
   or N to start fresh. Your normal saves are copied, never changed.
6. Wait a few minutes while the game is copied (you need a few GB free),
   until it says "Done!".
7. Start the mod with the "RL Career Hub MOD" shortcut on your desktop.
   At the bottom of the Setup tab you should see "RLC Enhancer v1.2 by Milan".

WHERE THINGS ARE
- Mod game and saves: Documents\RL Career Hub Mod
- Mod saves: Documents\RL Career Hub Mod\rl-career-hub (AppData)\saves
- Your normal game and saves are untouched.

INDEPENDENT COPY BY HAND (optional, the installer does all this for you)
1. Copy the whole game folder (usually C:\Program Files\RL Career Hub) to
   Documents\RL Career Hub Mod\RL Career Hub
   You can leave out "Uninstall RL Career Hub.exe".
2. Saves: press Win+R, type %APPDATA%\rl-career-hub and press Enter.
   Copy that folder to Documents\RL Career Hub Mod\rl-career-hub (AppData)
   (you can leave out Cache, Code Cache and GPUCache). To start fresh,
   create that folder empty instead.
3. Right-click the copied "RL Career Hub.exe" > Show more options >
   Create shortcut. Right-click the shortcut > Properties, and at the end of
   "Target", after a space, add (with your real path):
   --user-data-dir="C:\Users\YOU\Documents\RL Career Hub Mod\rl-career-hub (AppData)"
4. Always start the copy with that shortcut: without --user-data-dir the copy
   would use your normal saves.
5. To add the mod to this copy, run "Install RLC Enhancer.bat": it reuses the
   folder and keeps your data.
- Never use "Check for updates" in the copy, and don't run the normal game
  and the copy at the same time (they share the BakkesMod plugin).

UPDATING
- New mod version: extract it and run "Install RLC Enhancer.bat" again.
  Your mod saves are kept.
- Do not use "Check for updates" inside the mod: a game update would
  remove the mod. When RL Career Hub gets an update, wait for a mod
  update. The installer tells you if your game version is not supported.

UNINSTALL
- Delete the "RL Career Hub MOD" shortcut on your desktop and the folder
  Documents\RL Career Hub Mod (this also deletes your mod saves, so back
  up the "saves" folder first if you want to keep them).

PROBLEMS
- Send "hub.log" from Documents\RL Career Hub Mod\rl-career-hub (AppData)
  to Milan on the RL Career Hub Discord, with a short description.

Please don't re-upload the mod: share the link to the official post instead.
The source code is public to read, but not free to reuse: see LICENSE.txt.
