/* RLC Enhancer (c) 2026 Milan. All rights reserved. Source published for reading only:
   no copy, reuse or redistribution without Milan's written permission. See LICENSE.txt. */

;/* ===== RLC ENHANCER (Claude) : titres 1v1/2v2 + titre cumule de champion du monde ===== */
(function () {
  const MULTI = "multi_worlds";
  // les titres 1v1/2v2 s'appuient sur les vrais titres de Rocket League (couleur et style du jeu)
  // tout titre de champion du monde passe devant un Major (13) ; entre eux : 1v1 < 2v2 < 3v3 (14)
  TIER.rlc1v1_worlds = 13.3;
  TIER.rlc2v2_worlds = 13.6;
  TIER.solo_champion = 13.3;
  TIER.rlc1v1_open = TIER.regional_champion || 4;
  TIER.rlc2v2_open = TIER.regional_champion || 4;
  TIER[MULTI] = 15; // au-dessus d'un simple titre de champion du monde
  KINDS.rlc1v1_worlds = { id: () => "RLCS_2026_1v1_World_Champion", text: tm("RLCS {year} 1v1 World Champion") };
  KINDS.rlc2v2_worlds = { id: () => "RLCS_2026_2v2_World_Champion", text: tm("RLCS {year} 2v2 World Champion") };
  KINDS.rlc1v1_open = { id: () => "RLCS_2026_Regional_Champion", text: tm("RLCS {year} 1v1 Regional Champion") };
  KINDS.rlc2v2_open = { id: () => "RLCS_2026_Regional_Champion", text: tm("RLCS {year} 2v2 Regional Champion") };
  // nombre de titres de champion du monde 3v3 (vrais titres de la carriere des pros compris)
  function worldTitles(p) {
    const seen = new Map();
    for (const t of (p && p.titles) || []) {
      if (!t || t.k !== "worlds_champion") continue;
      const key = t.id ? "id:" + t.id : "y:" + t.y;
      if (!seen.has(key)) seen.set(key, t);
    }
    return Array.from(seen.values());
  }
  function multiOf(p) {
    const w = worldTitles(p);
    if (w.length < 2) return null;
    const last = w.slice().sort((a, b) => (b.y || 0) - (a.y || 0))[0];
    const d = describe(last);
    const n = w.length;
    return { key: "k:" + MULTI + ":" + n, id: (d && d.id) || "RLCS_2026_World_Champion", text: n + "x RLCS World Champion",
      display: tl("{n}x RLCS World Champion", { n }), kind: MULTI, year: last && last.y, n };
  }
  // les vrais titres 1v1/2v2 (RLCS 2025/2026) sont tous rangés "solo" par le jeu : on separe 1v1 et 2v2
  function norm(p) {
    const ts = (p && p.titles) || [];
    if (!ts.some((t) => t && t.id && /_(1v1|2v2)_World_Champion$/.test(t.id))) return p;
    return Object.assign({}, p, { titles: ts.map((t) => {
      if (!t || !t.id) return t;
      if (/_2v2_World_Champion$/.test(t.id)) return Object.assign({}, t, { k: "rlc2v2_worlds" });
      if (/_1v1_World_Champion$/.test(t.id)) return Object.assign({}, t, { k: "rlc1v1_worlds" });
      return t;
    }) });
  }
  const prevBest = best;
  best = function (p) { return multiOf(p) || prevBest.call(this, norm(p)); };
  const prevChoices = choices;
  choices = function (p) { const out = prevChoices.call(this, norm(p)); const m = multiOf(p); return m ? [m].concat(out) : out; };
  const prevChosen = chosen;
  // choisi automatiquement ; seul un titre choisi a la main par toi pour ton joueur passe avant
  chosen = function (p, sel) {
    const m = multiOf(p);
    if (m && (!sel || String(sel).indexOf("k:" + MULTI) === 0)) return m;
    return prevChosen.call(this, norm(p), sel);
  };
  // titre choisi a la main pour un joueur de ton club (Effectif > fiche du joueur)
  const prevChosen2 = chosen;
  chosen = function (p, sel) {
    if (!sel && p && p.__rlcPick) sel = p.__rlcPick;
    return prevChosen2.call(this, p, sel);
  };
  const prevMatchLines = matchLines;
  matchLines = function (state, list, look) {
    const picks = (state && state.rlcTitlePicks) || null;
    if (!picks || typeof look !== "function") return prevMatchLines.apply(this, arguments);
    const look2 = function (st, x) {
      const p = look(st, x);
      if (p && !p.isUser && p.id != null && picks[p.id] && p.teamId === state.userTeamId) return Object.assign({}, p, { __rlcPick: picks[p.id] });
      return p;
    };
    return prevMatchLines.call(this, state, list, look2);
  };
  module.exports.matchLines = matchLines;
  module.exports.best = best;
  module.exports.choices = choices;
  module.exports.chosen = chosen;
  // titre 1v1/2v2 pour les vainqueurs du mod
  module.exports.giveRlc = function (state, player, kind) {
    if (!player || player.retired || !KINDS[kind]) return false;
    const y = seasonYear(state);
    if (!y) return false;
    return give(player, { k: kind, y });
  };
})();
