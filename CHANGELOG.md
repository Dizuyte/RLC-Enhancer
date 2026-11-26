# Changelog

RLC Enhancer was called RLC Mod up to v1.1.

## v1.3

### 🏢 Club management
- **Facility rent.** Your club now pays **1.5% a month** of the price of its most expensive base-game facility, on the 1st of each month (only your biggest facility counts). Each facility card shows its rent in **Office > Facilities**.
- **Monthly expenses mail.** On the 1st of each month, a mail sums up what the club paid: wages, coach, scouts and rent.
- **Training coach ($750/week).** Hire him on the **Training** page. He starts training on his own as soon as it's ready, so you don't have to stop time anymore, and fills empty slots with the players who have the most room to grow.
- **Scout levels.** Each of your 3 scouts has his own level, set in the **Scouting** window:

  | Level | Wage | Speed |
  |---|---|---|
  | 0 | none | no scout |
  | 1 | $500/week | normal |
  | 2 | $700/week | +20% |
  | 3 | $1,000/week | +50% |

  Existing saves start with level 1 scouts, new careers with no scout.

### 🏆 Titles
- **Choose your own player's title**, from every title you won during your career, even the ones won from the bench.
- **New title selector** in the style of RL Career+: a live scoreboard preview with the real in-game glow (blue for RLCS, gold for the big events).

### 🎮 In Rocket League (BakkesMod needed)
- **Pro camera for the bots.** When you watch a match from a bot's view, you get a pro-style camera instead of the default one: FOV 110, distance 270, height 100, angle -4, stiffness 0.45, swivel 4.7, transition 1.2. Your own camera is never touched. To turn it off, type `rlc_botcam 0` in the BakkesMod console.
- The plugin loads when Rocket League starts, so **start the mod before Rocket League** (or restart Rocket League).

### 📺 Media offers
- A **big red warning** now tells you when a player you send to the media would miss an Open, a Major, the Worlds, a 1v1/2v2 event or a league match. Majors and the Worlds show "if you qualify".
- Accepting an offer with a conflict needs a **second click**, so you can't miss it by accident.

### Fixes
- Archives: the RLCS ranking now has the same solid background as the other tabs, so it's readable everywhere.

### 🤝 Credits
- **Jinxy – [RL Career+](https://github.com/jinxy6/RL-Career-Plus)** (MIT): the look of the title selector.
- **Matiyo – [RLCareerProPresets](https://github.com/Managone/RLCareerProPresets)** (MIT): pro car presets, still included since v1.2.

## v1.2

### 🤝 RLC Enhancer × RLCareerProPresets

RLC Enhancer now ships with **[RLCareerProPresets](https://github.com/Managone/RLCareerProPresets) by Matiyo**. Every bot in your career matches drives with one of its pro player's **real presets**: car, decal, wheels, boost, trail, goal explosion and paints, read from about 78,000 pro replays (677 players).

- Installed automatically with RLC Enhancer, in the modded copy only. Your normal RL Career Hub is not touched.
- Each pro has several presets; their usual one comes up most often, and they keep the same preset for a whole series.
- Works for every career match launched in Rocket League, including RLC Enhancer's 1v1, 2v2 and Esports World Cup matches.
- Settings (turn it off, player or club colours, force a preset): `config.json` in `Documents\RL Career Hub Mod\presets`. Reinstalling keeps your settings.
- Already using RLCareerProPresets on your normal RL Career Hub? Nothing to do, both keep working side by side.

Huge thanks to Matiyo. RLCareerProPresets is under the MIT license, credited in the game (Setup tab), in the README and in the license.

### New
- **New name: RLC Enhancer** (formerly RLC Mod). Same mod, same install folder, your saves are kept.
- **Bootcamp facility** (Office > Club business, $350K). The week before each Major, the Worlds and the Esports World Cup, a team from your region asks to rent it for the week.
  - The higher the team is in the RLCS ranking, the more it pays, up to $50K a week.
  - Up to 3 bookings a season.
  - The offer arrives by mail 6 days before the stay: accept or decline it right in the mail, or in Club business. It lapses when the stay starts.
- **In-game titles for your players.** Open the profile of a player of your club and choose which of the titles he has won shows above his car in Rocket League (for example 3v3 or 2v2 World Champion). "Auto" keeps the game's choice.
- **Archives tab** (Liquipedia style), between Socials and Office:
  - every season of your save, every region, every event (3v3, 1v1, 2v2, Esports World Cup);
  - final standings with prize money, and every series by stage (groups, playoffs, final);
  - the season's RLCS ranking, filterable by region;
  - a page for each team with its results season by season, its titles and its RLCS rank.

### Changed
- "Store & stream" is now **Club business** and holds the store, the stream studio and the bootcamp.
- Club store now costs $250K and stream studio $120K. Each one pays itself back in about 60 weeks; a club with more followers than the world's median earns a bit more each week, a smaller one a bit less (0.8x to 1.25x). The stream studio still brings more followers in weeks with matches.

Works with RL Career Hub 0.2.0-beta.33. Existing saves keep working. In the Archives, older 3v3 seasons come from the save's history; 1v1, 2v2 and EWC events are archived from the season you are playing now.

## v1.1

- Esports World Cup (3v3) between Major 2 and the LCQ: 15 invitations from the RLCS ranking plus an EWC LCQ, GSL groups then a Bo7 bracket with a third place match, the real $1,000,000 prize pool.
- Club store and stream studio: money every week, and followers for the club and the players.

## v1.0

- RLCS 1v1 and 2v2: Opens in every region and World Championships with 8 entries (every region represented), with their own titles.
- Career: custom team and starting budget, offers from other clubs, changing club, getting sacked, Office > My Career.
- Separate installer: the mod runs in its own copy of the game.
