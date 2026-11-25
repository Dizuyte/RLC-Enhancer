/* RLC Enhancer (c) 2026 Milan. All rights reserved. Source published for reading only:
   no copy, reuse or redistribution without Milan's written permission. See LICENSE.txt. */

;/* ===== RLC ENHANCER (Claude) : RLCS 1v1 et 2v2 =====
   Comme l'IRL (saison 2026) : apres le Major 2, un Open 2v2 puis un Open 1v1 dans chaque region.
   Les vainqueurs EU, NA, SAM et MENA vont aux Championnats du monde 1v1 / 2v2, joues pendant les Worlds.
   v2 : vrais matchs avec le moteur du jeu (simModel), tableau complet, tours etales sur les jours de l'event,
   objectifs du board affiches dans "Succes continental". */
(function () {
  const ev_ = ev; // module des tableaux du jeu (groupes GSL, playoffs hybrides)
  // Worlds 1v1/2v2 : 8 places. Chaque region envoie son vainqueur, puis les finalistes completent dans cet ordre.
  const WORLDS_SIZE = 8;
  const RUNNER_UP_ORDER = ["eu", "na", "mena", "sam", "apac", "oce", "ssa"];
  const OPEN_FIELD = 32;
  const PRIZES = {
    open: { "1v1": [10000, 6000, 3500, 3500, 2000, 2000, 2000, 2000], "2v2": [14000, 9000, 5500, 5500, 3000, 3000, 3000, 3000] },
    worlds: { "1v1": [50000, 25000, 12500, 12500, 6000, 6000, 6000, 6000], "2v2": [60000, 30000, 15000, 15000, 7500, 7500, 7500, 7500] },
  };
  const POINTS = { open: [100, 70, 50, 50, 30, 30, 30, 30, 15, 15, 15, 15, 15, 15, 15, 15], worlds: [300, 200, 120, 120, 60, 60, 60, 60], ewc: [], ewclcq: [] };
  // ---------- Esports World Cup (3v3, comme l'EWC 2026) ----------
  // 15 invitations au classement RLCS a la fin du Major 2 (tenant du titre + places par region), 1 place via un LCQ.
  const EWC_SLOTS = { eu: 3, na: 3, mena: 3, sam: 2, oce: 1, apac: 1, ssa: 1 };
  const EWC_INVITES = 15, EWC_LCQ_FIELD = 16;
  // dotation reelle 2026 : 1 000 000 $ (MVP non compte) ; LCQ : 100 000 $ repartis (approximation de la repartition)
  PRIZES.ewc = { "3v3": [400000, 180000, 100000, 60000, 35000, 35000, 35000, 35000, 20000, 20000, 20000, 20000, 10000, 10000, 10000, 10000] };
  PRIZES.ewclcq = { "3v3": [15000, 10000, 7500, 7500, 5000, 5000, 5000, 5000, 2500, 2500, 2500, 2500, 2500, 2500, 2500, 2500] };
  const EWC_FAME = 3000; // followers gagnes par le champion (comme un Major dans le jeu)
  // objectif du board pour les Opens 1v1/2v2, d'apres l'exigence "Opens" du club (OPEN_TARGET du jeu : 12/8/4/2)
  const TARGET_FROM_OPEN = { 12: 16, 8: 8, 4: 4, 2: 2 };
  const regionName = (state, id) => ((state.regions || []).find((r) => r.id === id) || {}).name || String(id || "").toUpperCase();

  function modesOf(state) {
    if (!state.rlcModes || typeof state.rlcModes !== "object") state.rlcModes = { season: null, events: [], picks: { solo: [], duo: [] }, ranking: { "1v1": {}, "2v2": {} }, titles: [], nextId: 1 };
    const m = state.rlcModes;
    if (!m.picks) m.picks = { solo: [], duo: [] };
    if (!m.ranking) m.ranking = { "1v1": {}, "2v2": {} };
    if (!Array.isArray(m.titles)) m.titles = [];
    if (!m.ewc || typeof m.ewc !== "object") m.ewc = { champion: null, season: null, invites: null };
    return m;
  }
  // EWC : 5 jours, termine une semaine avant le LCQ RLCS (IRL : 12-16 aout) ; son LCQ quelques jours avant
  function ewcEvents(state, m) {
    const lcq = (state.events || []).find((e) => e.kind === "lcq");
    const major2 = (state.events || []).filter((e) => e.kind === "major").sort((a, b) => cmpDate(b.startDate, a.startDate))[0];
    if (!lcq || !major2) return [];
    const start = addDays(lcq.startDate, -10);
    if (cmpDate(addDays(start, -5), addDays(major2.endDate, 1)) < 0) return [];
    const mk = (kind, name, st, days) => ({ id: m.nextId++, mode: "3v3", kind, name, startDate: st, endDate: addDays(st, days - 1), stage: "pending", results: {}, reminded: false });
    return [mk("ewclcq", "EWC Last Chance Qualifier", addDays(start, -5), 3), mk("ewc", "Esports World Cup", start, 5)];
  }
  function plan(state) {
    const m = modesOf(state);
    if (m.season === state.season && m.events.length) {
      // saves de l'ancienne version : Worlds a 4 sur 2 jours -> 8 sur 3 jours (quarts, demies, finale)
      for (const ev of m.events) if (ev.kind === "worlds" && ev.stage === "pending" && eventDays(ev) < 3) ev.endDate = addDays(ev.startDate, 2);
      // saves d'avant l'EWC : on l'ajoute a la saison en cours si elle n'est pas encore passee
      if (!m.events.some((e) => e.kind === "ewc")) {
        const add = ewcEvents(state, m);
        for (const e of add) if (cmpDate(e.startDate, state.currentDate) >= 0) m.events.push(e);
        m.events.sort((a, b) => cmpDate(a.startDate, b.startDate) || a.id - b.id);
      }
      return m;
    }
    // archive des events 1v1/2v2/EWC de la saison qui se termine (onglet Archives)
    if (m.events.length && m.season != null && m.season !== state.season) {
      m.archive = m.archive || {};
      m.archive[m.season] = m.events.filter((e) => e.stage === "done").map((e) => ({ id: e.id, mode: e.mode, kind: e.kind, name: e.name, startDate: e.startDate, endDate: e.endDate,
        results: Object.keys(e.results || {}).reduce((o, k) => { const r = e.results[k]; o[k] = { finalScore: r.finalScore || "", order: (r.order || []).map((x) => ({ teamId: x.teamId, names: x.names, placement: x.placement, prize: x.prize })) }; return o; }, {}) }));
    }
    const major2 = (state.events || []).filter((e) => e.kind === "major").sort((a, b) => cmpDate(b.startDate, a.startDate))[0];
    const worlds = (state.events || []).find((e) => e.kind === "worlds");
    if (!major2 || !worlds) { m.season = state.season; m.events = []; return m; }
    if (m.season != null && m.season !== state.season) m.ranking = { "1v1": {}, "2v2": {} };
    m.season = state.season;
    const mk = (mode, kind, name, start, days) => ({ id: m.nextId++, mode, kind, name, startDate: start, endDate: addDays(start, days - 1), stage: "pending", results: {}, reminded: false });
    m.events = [
      mk("2v2", "open", "RLCS 2v2 Open", addDays(major2.endDate, 6), 3),
      mk("1v1", "open", "RLCS 1v1 Open", addDays(major2.endDate, 20), 3),
      mk("2v2", "worlds", "2v2 World Championship", addDays(worlds.startDate, 1), 3),
      mk("1v1", "worlds", "1v1 World Championship", addDays(worlds.startDate, 2), 3),
    ].concat(ewcEvents(state, m));
    m.events.sort((a, b) => cmpDate(a.startDate, b.startDate) || a.id - b.id);
    m.ewc.invites = null;
    // Mod installe en cours de saison : les evenements deja passes ne sont pas joues d'un coup.
    for (const ev of m.events) if (cmpDate(ev.endDate, state.currentDate) < 0) ev.stage = "skipped";
    return m;
  }
  // --- choix du joueur (solo) et du duo dans l'effectif du club
  function rosterPlayers(state) {
    const me = teamById(state, state.userTeamId);
    if (!me) return [];
    return (me.playerIds || []).map((id) => playerById(state, id)).filter((p) => p && !p.retired);
  }
  function validPicks(state) {
    const m = modesOf(state);
    const ids = new Set(rosterPlayers(state).map((p) => p.id));
    const best = rosterPlayers(state).sort((a, b) => effRating(b) - effRating(a)).map((p) => p.id);
    let solo = (m.picks.solo || []).filter((id) => ids.has(id)).slice(0, 1);
    let duo = Array.from(new Set((m.picks.duo || []).filter((id) => ids.has(id)))).slice(0, 2);
    const auto = { solo: !solo.length, duo: duo.length < 2 };
    if (!solo.length && best.length) solo = [best[0]];
    for (const id of best) { if (duo.length >= 2) break; if (duo.indexOf(id) < 0) duo.push(id); }
    return { solo, duo, auto };
  }
  function setPicks(state, picks) {
    const m = modesOf(state);
    const ids = new Set(rosterPlayers(state).map((p) => p.id));
    const solo = ((picks && picks.solo) || []).map(Number).filter((id) => ids.has(id)).slice(0, 1);
    const duo = Array.from(new Set(((picks && picks.duo) || []).map(Number).filter((id) => ids.has(id)))).slice(0, 2);
    if (picks && picks.duo && duo.length === 1) return { ok: false, error: "Pick two different players for the 2v2." };
    m.picks = { solo, duo };
    return { ok: true };
  }
  // --- inscrits : 1 joueur / 1 duo par club de la region (le meilleur), ton club envoie tes choix
  function entries(state, mode, region) {
    const out = [];
    const userPick = validPicks(state);
    for (const t of state.teams || []) {
      if (!t || t.national || t.region !== region) continue;
      const players = (t.playerIds || []).map((id) => playerById(state, id)).filter((p) => p && !p.retired);
      if (players.length < (mode === "1v1" ? 1 : 2)) continue;
      let ids;
      if (t.id === state.userTeamId) ids = mode === "1v1" ? userPick.solo : userPick.duo;
      else ids = players.sort((a, b) => effRating(b) - effRating(a)).slice(0, mode === "1v1" ? 1 : 2).map((p) => p.id);
      const ps = ids.map((id) => playerById(state, id)).filter(Boolean);
      if (ps.length !== (mode === "1v1" ? 1 : 2)) continue;
      out.push({ teamId: t.id, ids: ps.map((p) => p.id), names: ps.map((p) => p.name), rating: ps.reduce((s, p) => s + effRating(p), 0) / ps.length });
    }
    // seeding comme pour leur equipe 3v3 : points au classement, puis niveau
    out.sort((a, b) => (rankPts(state, b.teamId) - rankPts(state, a.teamId)) || (b.rating - a.rating) || (a.teamId - b.teamId));
    return out.slice(0, EVENT_FIELD || 16);
  }
  function rankPts(state, id) { try { return Number(rankingPoints(state, id)) || 0; } catch (e) { return 0; } }

  // ---------- objectif du board ----------
  function targetFor(state, fieldSize) {
    let open = 8;
    try { open = OPEN_TARGET[boardExpect(state).domestic] || 8; } catch (e) {}
    let t = TARGET_FROM_OPEN[open] || 8;
    // petit tableau : on ne demande pas "top 16" sur 12 inscrits
    const n = fieldSize || OPEN_FIELD;
    while (t > 2 && t >= n) t = t / 2;
    return t;
  }

  // ---------- moteur de match (celui du jeu) ----------
  function carsOf(state, ids) {
    try { return simCars(state, ids, null); } catch (e) { return []; }
  }
  function weightOf(state, id) {
    const p = playerById(state, id);
    return p ? Math.max(0.3, 1 + (effRating(p) - 60) / 20) : 1;
  }
  function pickWeighted(rand, ids, weights) {
    const tot = weights.reduce((s, w) => s + w, 0);
    let r = rand() * tot;
    for (let i = 0; i < ids.length; i++) { r -= weights[i]; if (r <= 0) return ids[i]; }
    return ids[ids.length - 1];
  }
  function binom(rand, n, p) { let k = 0; for (let i = 0; i < n; i++) if (rand() < p) k++; return k; }
  function addStat(stats, id, k, v) {
    const s = stats[id] || (stats[id] = { gp: 0, g: 0, a: 0, sv: 0, sh: 0 });
    s[k] += v;
  }
  // un match (une manche) : buts selon le modele du jeu, prolongation si egalite, stats par joueur
  function playGame(state, A, B, carsA, carsB, rand, stats) {
    const rt = simModel.rates(carsA, carsB);
    let ga = poisson(rt.home, rand), gb = poisson(rt.away, rand), ot = false;
    if (ga === gb) { ot = true; if (rand() < rt.share) ga++; else gb++; }
    const st = (simModel.model && simModel.model.stats) || { goals: 1.824, missed: 6.22, saved: 0.746, assisted: 0.612 };
    const perGoalMiss = st.missed / st.goals;
    const side = (S, O, goals, rate) => {
      const w = S.ids.map((id) => weightOf(state, id));
      const scorers = [];
      for (const id of S.ids) addStat(stats, id, "gp", 1);
      for (let i = 0; i < goals; i++) {
        const id = pickWeighted(rand, S.ids, w);
        scorers.push(id);
        addStat(stats, id, "g", 1); addStat(stats, id, "sh", 1);
        if (S.ids.length > 1 && rand() < st.assisted) addStat(stats, S.ids.find((x) => x !== id), "a", 1);
      }
      const missed = poisson(Math.max(0.2, rate * perGoalMiss), rand);
      for (let i = 0; i < missed; i++) addStat(stats, pickWeighted(rand, S.ids, w), "sh", 1);
      const saves = binom(rand, missed, st.saved);
      for (let i = 0; i < saves; i++) addStat(stats, O.ids[Math.floor(rand() * O.ids.length)], "sv", 1);
      return scorers;
    };
    const sa = side(A, B, ga, rt.home), sb = side(B, A, gb, rt.away);
    return { a: ga, b: gb, ot, sa, sb };
  }
  function playSeries(state, reg, mt, rand) {
    refreshIds(state, reg, mt.a); refreshIds(state, reg, mt.b);
    const A = reg.field[mt.a], B = reg.field[mt.b];
    const ca = carsOf(state, A.ids), cb = carsOf(state, B.ids);
    const need = Math.ceil(mt.bo / 2);
    mt.wa = 0; mt.wb = 0; mt.games = [];
    let guard = 0;
    while (mt.wa < need && mt.wb < need && guard++ < 15) {
      const g = playGame(state, A, B, ca, cb, rand, reg.stats);
      mt.games.push(g);
      if (g.a > g.b) mt.wa++; else mt.wb++;
    }
    mt.w = mt.wa > mt.wb ? mt.a : mt.b;
    mt.played = true;
  }

  // ---------- tableau ----------
  function seedOrder(size) {
    let order = [0, 1];
    while (order.length < size) { const n = order.length * 2; const next = []; for (const s of order) next.push(s, n - 1 - s); order = next; }
    return order;
  }
  function roundCount(n) { let r = 0, s = 1; while (s < n) { s *= 2; r++; } return r; }
  function eventDays(ev) { return daysBetween(ev.startDate, ev.endDate) + 1; }
  // jour (0..D-1) ou se joue le tour r : la finale le dernier jour, le reste reparti avant
  function dayOfRound(r, R, D) {
    if (D <= 1 || R <= 1) return Math.max(0, D - 1);
    if (r === R - 1) return D - 1;
    return Math.min(D - 2, Math.floor((r * (D - 1)) / (R - 1)));
  }
  function roundName(r, R) {
    const left = Math.pow(2, R - r);
    if (left === 2) return "Final";
    if (left === 4) return "Semi-finals";
    if (left === 8) return "Quarter-finals";
    return left >= 32 ? "Round of 32" : "Round of 16";
  }
  function makeRound(reg, slots, r, R, ev) {
    const D = eventDays(ev);
    const ms = [];
    for (let i = 0; i < slots.length; i += 2) {
      const a = slots[i], b = slots[i + 1];
      const mt = { a, b, bo: r === R - 1 ? 7 : (ev.kind === "worlds" ? 7 : 5), day: dayOfRound(r, R, D), played: false };
      if (a == null || b == null) { mt.w = a == null ? b : a; mt.bye = true; mt.played = true; }
      ms.push(mt);
    }
    reg.rounds.push(ms);
  }
  function startBracket(state, ev, field, key) {
    const R = roundCount(field.length);
    const size = Math.pow(2, R);
    const reg = { field: field.map((x, i) => Object.assign({}, x, { seed: i + 1 })), rounds: [], stats: {}, R, done: false };
    const order = seedOrder(size).map((i) => (i < field.length ? i : null));
    makeRound(reg, order, 0, R, ev);
    if (key === state.userRegion) reg.target = targetFor(state, field.length);
    ev.regions = ev.regions || {};
    ev.regions[key] = reg;
    return reg;
  }
  // ---------- format realiste des Opens : groupes GSL puis playoffs hybrides (meme structure que les Opens 3v3 du jeu) ----------
  const GROUP_BO = 5, PLAYOFF_BO = 5, FINAL_BO = 7;
  function startHybrid(state, ev, field, key) {
    const pid = "rlc" + ev.id + key;
    const N = field.length;
    const big = N >= 16;
    const size = big ? 8 : 4;
    const count = big ? 2 : Math.max(1, Math.min(4, Math.floor(N / 4)));
    const letters = ["A", "B", "C", "D"];
    const reg = { format: "hybrid", pid, field: field.map((x, i) => Object.assign({}, x, { seed: i + 1 })), groups: [], slots: [], phases: [], rounds: [], stats: {}, done: false };
    const ids = reg.field.map((x) => x.teamId);
    for (let g = 0; g < count; g++) {
      const seeds = [];
      for (let j = 0; j < size; j++) {
        const k = j * count + (j % 2 === 0 ? g : count - 1 - g); // serpentin, comme le jeu
        if (ids[k] != null) seeds.push(ids[k]);
      }
      const prefix = "E" + pid + letters[g];
      reg.groups.push({ prefix, seeds });
      reg.slots = reg.slots.concat(size >= 8 ? ev_.buildGsl8(prefix, GROUP_BO) : ev_.buildGsl(prefix, GROUP_BO));
    }
    reg.qualifierCount = count * (size >= 8 ? 4 : 2);
    reg.slots = reg.slots.concat(ev_.buildPlayoff("E" + pid + "P", PLAYOFF_BO, reg.qualifierCount));
    for (const sl of reg.slots) if (sl.stage === "final") sl.bestOf = FINAL_BO;
    // tours = profondeur dans les groupes, puis dans les playoffs
    const isP = (sl) => sl.id.indexOf("E" + pid + "P-") === 0;
    const depth = {};
    const gs = reg.slots.filter((x) => !isP(x)), ps = reg.slots.filter(isP);
    for (const sl of gs) depth[sl.id] = ev_.slotDepth(gs, sl.id);
    for (const sl of ps) depth[sl.id] = ev_.slotDepth(ps, sl.id);
    const gMax = Math.max(0, ...gs.map((x) => depth[x.id])), pMax = Math.max(0, ...ps.map((x) => depth[x.id]));
    for (let d = 0; d <= gMax; d++) reg.phases.push({ ids: gs.filter((x) => depth[x.id] === d).map((x) => x.id), name: "Group stage, round {n}", n: d + 1, day: 0, group: true });
    const half = Math.ceil((pMax + 1) / 2);
    for (let d = 0; d <= pMax; d++) {
      const its = ps.filter((x) => depth[x.id] === d);
      const st = its[0] && its[0].stage;
      const name = st === "final" ? "Final" : st === "semi" ? "Semi-finals" : st === "quarter" ? "Quarter-finals" : "Playoffs, round 1";
      reg.phases.push({ ids: its.map((x) => x.id), name, n: d + 1, day: d < half ? 1 : 2 });
    }
    reg.R = reg.phases.length;
    if (key === state.userRegion) reg.target = targetFor(state, N);
    ev.regions = ev.regions || {};
    ev.regions[key] = reg;
    createPhase(state, reg, 0);
    return reg;
  }
  function slotOf(reg, id) { return reg.slots.find((x) => x.id === id) || null; }
  function entryIdx(reg, teamId) { return reg.field.findIndex((x) => x.teamId === teamId); }
  function playoffSeeds(state, reg) {
    if (reg.playoffSeeds) return reg.playoffSeeds;
    const rows = [];
    for (const g of reg.groups) {
      let q = ev_.groupQualifiers(reg.slots, g.prefix);
      try { q = tableQualifiers(state, { slots: reg.slots }, g, q); } catch (e) {}
      q.forEach((t, i) => (rows[i] || (rows[i] = [])).push(t));
    }
    reg.playoffSeeds = [].concat.apply([], rows.filter(Boolean));
    return reg.playoffSeeds;
  }
  function createPhase(state, reg, p) {
    const ph = reg.phases[p];
    if (!ph) return false;
    const ms = [];
    for (const id of ph.ids) {
      const sl = slotOf(reg, id);
      const g = reg.groups.find((x) => id.indexOf(x.prefix + "-") === 0);
      const seeds = g ? g.seeds : playoffSeeds(state, reg);
      if (sl.teamA == null) sl.teamA = ev_.resolveRef(reg.slots, sl.a, seeds);
      if (sl.teamB == null) sl.teamB = ev_.resolveRef(reg.slots, sl.b, seeds);
      const a = sl.teamA == null ? null : entryIdx(reg, sl.teamA), b = sl.teamB == null ? null : entryIdx(reg, sl.teamB);
      const mt = { a, b, slot: id, bo: sl.bestOf || PLAYOFF_BO, day: ph.day, played: false, elim: !!sl.eliminates };
      if (a == null || b == null || a < 0 || b < 0) { mt.w = a == null || a < 0 ? b : a; mt.bye = true; mt.played = true; settle(reg, mt); }
      ms.push(mt);
    }
    reg.rounds.push(ms);
    return true;
  }
  // resultat d'une serie reporte dans le slot du tableau (lu par les visuels du jeu)
  function settle(reg, mt) {
    if (!mt.slot || !reg.slots) return;
    const sl = slotOf(reg, mt.slot);
    if (!sl || mt.w == null || mt.w < 0) return;
    sl.winner = reg.field[mt.w].teamId;
    if (!mt.bye) { sl.winsW = Math.max(mt.wa || 0, mt.wb || 0); sl.winsL = Math.min(mt.wa || 0, mt.wb || 0); }
    if (reg.groups) reg.tables = groupTablesOf(reg);
  }
  function groupTablesOf(reg) {
    const out = {};
    for (const g of reg.groups || []) {
      try { out[g.prefix] = groupTable({ fixtures: [] }, { slots: reg.slots }, g, new Map()); } catch (e) {}
    }
    return out;
  }
  // tour suivant (false = tableau termine)
  function nextRound(state, ev, reg) {
    const r = reg.rounds.length - 1, cur = reg.rounds[r];
    if (reg.format === "hybrid") return createPhase(state, reg, r + 1);
    const winners = cur.map((mt) => mt.w);
    if (winners.length === 1) return false;
    makeRound(reg, winners, r + 1, reg.R, ev);
    return true;
  }
  // places deja decidees (elimines) : index d'inscrit -> place
  function placements(reg) {
    const out = {};
    let alive = reg.field.length;
    for (const ms of reg.rounds) {
      const el = ms.filter((mt) => mt.played && !mt.bye && (reg.format === "hybrid" ? mt.elim : true));
      for (const mt of el) out[mt.w === mt.a ? mt.b : mt.a] = alive - el.length + 1;
      alive -= el.length;
    }
    return out;
  }
  function roundLabel(reg, r) {
    if (reg.phases && reg.phases[r]) return reg.phases[r].name.replace("{n}", reg.phases[r].n);
    return roundName(r, reg.R);
  }
  // joue tous les tours prevus jusqu'au jour "day" ; renvoie les matchs joues
  function playUpTo(state, ev, reg, day, rand, me) {
    const played = [];
    while (!reg.done) {
      const r = reg.rounds.length - 1, cur = reg.rounds[r];
      const todo = cur.filter((mt) => !mt.played);
      if (todo.length) {
        if (cur[0].day > day) break;
        for (const mt of todo) {
          if (me != null && (mt.a === me || mt.b === me)) continue; // le match de ton joueur/duo : le temps s'arrete
          playSeries(state, reg, mt, rand); settle(reg, mt); played.push({ r, mt });
        }
        const mine = cur.findIndex((mt) => !mt.played);
        if (mine >= 0) { reg.pending = { r, i: mine }; break; }
      }
      if (!nextRound(state, ev, reg)) { reg.done = true; break; }
    }
    return played;
  }
  function placementOfLoss(r, R) { return Math.pow(2, R - 1 - r) + 1; }
  // classement final : champion, finaliste, puis par tour d'elimination (meilleur niveau d'abord)
  function finalOrder(reg) {
    const last = reg.rounds[reg.rounds.length - 1][0];
    const pl = placements(reg);
    pl[last.w] = 1;
    if (reg.ewc) {
      pl[last.w === last.a ? last.b : last.a] = 2;
      const third = reg.rounds[reg.rounds.length - 2] && reg.rounds[reg.rounds.length - 2][0];
      if (third && third.played && third.w != null) { pl[third.w] = 3; pl[third.w === third.a ? third.b : third.a] = 4; }
    }
    return reg.field.map((e, i) => Object.assign(e, { placement: pl[i] || reg.field.length }))
      .sort((x, y) => (x.placement - y.placement) || (x.seed - y.seed));
  }
  function award(state, m, ev, order, region) {
    const prizes = PRIZES[ev.kind][ev.mode], pts = POINTS[ev.kind] || [];
    const isEwc = ev.kind === "ewc" || ev.kind === "ewclcq";
    order.forEach((en, i) => {
      const prize = isEwc ? ewcMoney(state, prizes[i] || 0) : (prizes[i] || 0), t = teamById(state, en.teamId);
      if (prize && t) {
        t.budget = (t.budget || 0) + prize;
        if (t.id === state.userTeamId) { try { ledgerMine(state, t, "prize", prize, ev.name); } catch (e) {} }
      }
      const key = en.ids.slice().sort((a, b) => a - b).join("-");
      if (pts[i] && m.ranking[ev.mode]) m.ranking[ev.mode][key] = (m.ranking[ev.mode][key] || 0) + pts[i];
      en.prize = prize;
    });
    if (order[0] && ev.kind !== "ewclcq") m.titles.push({ season: state.season, mode: ev.mode, kind: ev.kind, name: ev.name, region: region || null, teamId: order[0].teamId, names: order[0].names });
    // titre affiche dans Rocket League (1v1/2v2, champion regional ou du monde)
    if (order[0] && !isEwc && titles && titles.giveRlc) {
      for (const id of order[0].ids) { try { titles.giveRlc(state, playerById(state, id), "rlc" + ev.mode + "_" + (ev.kind === "worlds" ? "worlds" : "open")); } catch (e) {} }
    }
  }
  function scoreOf(mt, forA) { return forA ? mt.wa + "-" + mt.wb : mt.wb + "-" + mt.wa; }

  // ---------- board ----------
  function judgeOpen(state, ev, mine, target) {
    const place = mine ? mine.placement : 99;
    const label = ev.mode === "1v1" ? tl("your 1v1 player") : tl("your 2v2 duo");
    ev.judged = { target, place, met: place <= target };
    if (place <= target) {
      state.boardPressure = Math.max(0, (Number(state.boardPressure) || 0) - 0.5);
      pushInbox(state, { type: "board", title: tl("The board liked {event}", { event: ev.name }),
        body: tl("Top {target} was the target for {pick} at {event}, and they delivered.", { target, pick: label, event: ev.name }) });
    } else {
      state.boardPressure = (Number(state.boardPressure) || 0) + 0.5;
      pushInbox(state, { type: "board", title: tl("The board expected more from {event}", { event: ev.name }),
        body: tl("Top {target} was the target for {pick} at {event}. The pressure on you has gone up.", { target, pick: label, event: ev.name }) });
    }
  }
  function judgeWorlds(state, ev, mine) {
    if (!mine) return;
    ev.judged = { target: 1, place: mine.placement, met: mine.placement === 1, bonus: true };
    if (mine.placement === 1) {
      state.boardPressure = Math.max(0, (Number(state.boardPressure) || 0) - 1);
      pushInbox(state, { type: "board", title: tl("The board liked {event}", { event: ev.name }),
        body: tl("World champions! The board is delighted and the pressure on you has eased.") });
    }
  }

  // ---------- deroulement jour par jour ----------
  function entryOf(reg, teamId) { const i = reg.field.findIndex((x) => x.teamId === teamId); return i < 0 ? null : i; }
  function mailUserDay(state, ev, reg, played, dayIdx) {
    const me = entryOf(reg, state.userTeamId);
    if (me == null) return;
    const mine = played.filter((x) => x.mt.a === me || x.mt.b === me);
    if (!mine.length) return;
    const duo = ev.mode === "2v2";
    const pick = reg.field[me].names.join(" & ");
    const lines = mine.map(({ r, mt }) => {
      const forA = mt.a === me, opp = reg.field[forA ? mt.b : mt.a];
      const won = mt.w === me;
      const vars = { pick, opp: opp.names.join(" & "), score: scoreOf(mt, forA), round: tl(roundName(r, reg.R)) };
      return won ? tl("{pick} beat {opp} {score} ({round}).", vars) : tl("{pick} lost to {opp} {score} ({round}).", vars);
    });
    const last = mine[mine.length - 1];
    const out = last.mt.w !== me;
    const champ = reg.done && !out;
    let end = "";
    if (champ) end = duo ? tl("Your duo won the tournament!") : tl("Your player won the tournament!");
    else if (out) end = tl("Out of the tournament.");
    else end = tl("Through to the next day.");
    pushInbox(state, { type: "board", title: tl("{event}, day {n}", { event: ev.name, n: dayIdx + 1 }), body: lines.join(" ") + " " + end });
  }
  function finishOpen(state, m, ev) {
    let myEntry = null, myTarget = 8;
    for (const rid of Object.keys(ev.regions || {})) {
      const reg = ev.regions[rid];
      const order = finalOrder(reg);
      award(state, m, ev, order, rid);
      const last = reg.rounds[reg.rounds.length - 1][0];
      ev.results[rid] = { order: order.map((x) => ({ teamId: x.teamId, ids: x.ids, names: x.names, placement: x.placement, prize: x.prize })), finalScore: last.bye ? "" : scoreOf(last, last.w === last.a) };
      if (rid === state.userRegion) { myEntry = ev.results[rid].order.find((x) => x.teamId === state.userTeamId) || null; myTarget = reg.target || targetFor(state, reg.field.length); }
    }
    ev.stage = "done";
    const res = ev.results[state.userRegion];
    const champ = res && res.order[0];
    const duo = ev.mode === "2v2";
    if (champ) {
      const vars = { names: champ.names.join(" & "), club: (teamById(state, champ.teamId) || {}).name, event: ev.name, region: regionName(state, state.userRegion), score: res.finalScore || "" };
      let body = duo ? tl("The duo {names} ({club}) won the {event} in {region}, {score} in the final.", vars) : tl("{names} ({club}) won the {event} in {region}, {score} in the final.", vars);
      const e = myEntry;
      if (e) body += " " + (duo ? tl("Your duo {names} finished {place}.", { names: e.names.join(" & "), place: ordinal(e.placement) }) : tl("Your player {names} finished {place}.", { names: e.names.join(" & "), place: ordinal(e.placement) })) + (e.prize ? " " + tl("Prize money for the club: {prize}.", { prize: fmtMoney(e.prize) }) : "");
      const myQ = worldsQualifiers(state, ev).find((x) => x.teamId === state.userTeamId);
      if (myQ) body += " " + (myQ.qual === "winner" ? tl("They are going to the World Championship!") : tl("As finalists, they also qualify for the World Championship!"));
      pushInbox(state, { type: "board", title: tl("{event}: the results", { event: ev.name }), body });
    }
    if (myEntry) judgeOpen(state, ev, myEntry, myTarget);
  }
  function finishWorlds(state, m, ev) {
    const reg = ev.regions.world;
    const order = finalOrder(reg);
    award(state, m, ev, order, null);
    const last = reg.rounds[reg.rounds.length - 1][0];
    ev.results.world = { order: order.map((x) => ({ teamId: x.teamId, ids: x.ids, names: x.names, region: x.region, placement: x.placement, prize: x.prize })), finalScore: last.bye ? "" : scoreOf(last, last.w === last.a) };
    ev.stage = "done";
    const champ = ev.results.world.order[0], mine = ev.results.world.order.find((x) => x.teamId === state.userTeamId);
    const duo = ev.mode === "2v2";
    const vars = { names: champ.names.join(" & "), club: (teamById(state, champ.teamId) || {}).name, event: ev.name, score: ev.results.world.finalScore || "" };
    let body = duo ? tl("The duo {names} ({club}) won the {event}, {score} in the final.", vars) : tl("{names} ({club}) won the {event}, {score} in the final.", vars);
    if (mine) body += " " + (duo ? tl("Your duo {names} finished {place}.", { names: mine.names.join(" & "), place: ordinal(mine.placement) }) : tl("Your player {names} finished {place}.", { names: mine.names.join(" & "), place: ordinal(mine.placement) })) + (mine.prize ? " " + tl("Prize money for the club: {prize}.", { prize: fmtMoney(mine.prize) }) : "");
    pushInbox(state, { type: "board", title: tl("{event}: the results", { event: ev.name }), body });
    judgeWorlds(state, ev, mine);
  }
  // qualifies pour les Worlds : le vainqueur de chaque region (toutes ont un representant),
  // puis les finalistes (EU, NA, MENA, SAM...) jusqu'a 8, puis les 3e si besoin
  function worldsQualifiers(state, open) {
    const res = (open && open.results) || {};
    const rids = (state.regions || []).map((r) => r.id).filter((rid) => res[rid] && res[rid].order && res[rid].order.length);
    const out = [], seen = new Set();
    const add = (rid, idx, qual) => {
      const e = res[rid].order[idx];
      if (!e || seen.has(e.teamId)) return;
      const ps = e.ids.map((id) => playerById(state, id)).filter(Boolean);
      if (ps.length !== e.ids.length) return;
      seen.add(e.teamId);
      out.push({ teamId: e.teamId, ids: e.ids, names: ps.map((p) => p.name), region: rid, qual, rating: ps.reduce((s, p) => s + effRating(p), 0) / ps.length });
    };
    for (const rid of rids) add(rid, 0, "winner");
    const extra = RUNNER_UP_ORDER.filter((r) => rids.indexOf(r) >= 0).concat(rids.filter((r) => RUNNER_UP_ORDER.indexOf(r) < 0));
    for (let idx = 1; idx < 4 && out.length < WORLDS_SIZE; idx++) {
      for (const rid of extra) { if (out.length >= WORLDS_SIZE) break; add(rid, idx, idx === 1 ? "finalist" : "extra"); }
    }
    return out;
  }
  // pas deux joueurs/duos de la meme region l'un contre l'autre au premier tour
  function avoidSameRegion(field) {
    const size = Math.pow(2, roundCount(field.length)), order = seedOrder(size), opp = {};
    for (let k = 0; k < order.length; k += 2) { opp[order[k]] = order[k + 1]; opp[order[k + 1]] = order[k]; }
    const bad = (f, i) => { const j = opp[i]; return j != null && j < f.length && f[i] && f[j] && f[i].region === f[j].region; };
    for (let guard = 0; guard < 16; guard++) {
      const i = field.map((_, x) => x).reverse().find((x) => bad(field, x));
      if (i == null) break;
      let fixed = false;
      for (let d = 1; d < field.length && !fixed; d++) {
        for (const k of [i + d, i - d]) {
          if (k < 0 || k >= field.length || k === opp[i]) continue;
          const f = field.slice(); const t = f[i]; f[i] = f[k]; f[k] = t;
          if (!bad(f, i) && !bad(f, k)) { field.splice(0, field.length, ...f); fixed = true; break; }
        }
      }
      if (!fixed) break;
    }
    return field;
  }
  function worldsField(state, m, ev) {
    const open = m.events.find((x) => x.kind === "open" && x.mode === ev.mode && x.stage === "done");
    if (!open) return null;
    const field = worldsQualifiers(state, open);
    field.sort((a, b) => (rankPts(state, b.teamId) - rankPts(state, a.teamId)) || (b.rating - a.rating));
    return avoidSameRegion(field);
  }
  // ---------- Esports World Cup ----------
  function lineupIds(state, t) {
    let ids = [];
    try { ids = (t.id === state.userTeamId ? userLineup(state) : autoLineup(state, t)) || []; } catch (e) { ids = []; }
    ids = ids.map((x) => (x && typeof x === "object" ? x.id : x)).filter((x) => x != null && playerById(state, x));
    if (ids.length < 3) {
      const ps = (t.playerIds || []).map((id) => playerById(state, id)).filter((p) => p && !p.retired).sort((a, b) => effRating(b) - effRating(a));
      for (const p of ps) { if (ids.length >= 3) break; if (ids.indexOf(p.id) < 0) ids.push(p.id); }
    }
    return ids.slice(0, 3);
  }
  function clubEntry(state, t) {
    if (!t) return null;
    const ids = lineupIds(state, t);
    const ps = ids.map((id) => playerById(state, id)).filter(Boolean);
    if (ps.length < 3) return null;
    return { teamId: t.id, ids: ps.map((p) => p.id), names: [t.name], region: t.region, club: true, rating: ps.reduce((x, p) => x + effRating(p), 0) / ps.length };
  }
  // l'equipe 3v3 du jour (alignement actuel du club) avant chaque serie
  function refreshIds(state, reg, idx) {
    const e = reg && reg.field[idx];
    if (!e || !e.club) return;
    const ids = lineupIds(state, teamById(state, e.teamId));
    if (ids.length === 3) e.ids = ids;
  }
  function ewcClubs(state) {
    return (state.teams || []).filter((t) => t && !t.national && t.region && (t.playerIds || []).length >= 3)
      .sort((a, b) => (rankPts(state, b.id) - rankPts(state, a.id)) || (a.id - b.id));
  }
  // invitations : tenant du titre, puis les meilleurs de chaque region au classement RLCS ; complete avec les mieux classes
  function ewcInvites(state, m) {
    if (m.ewc.invites && m.ewc.invites.season === state.season) return m.ewc.invites;
    const clubs = ewcClubs(state), taken = new Set(), list = [];
    const push = (t, why) => { if (t && !taken.has(t.id) && list.length < EWC_INVITES) { taken.add(t.id); list.push({ teamId: t.id, why }); } };
    const holder = m.ewc.champion != null ? clubs.find((t) => t.id === m.ewc.champion) : null;
    if (holder) push(holder, "holder");
    for (const r of state.regions || []) {
      const n = EWC_SLOTS[r.id] != null ? EWC_SLOTS[r.id] : 1;
      clubs.filter((t) => t.region === r.id && !taken.has(t.id)).slice(0, n).forEach((t) => push(t, "region"));
    }
    for (const t of clubs) { if (list.length >= EWC_INVITES) break; push(t, "ranking"); }
    const lcq = clubs.filter((t) => !taken.has(t.id)).slice(0, EWC_LCQ_FIELD).map((t) => t.id);
    m.ewc.invites = { season: state.season, list, lcq, holder: holder ? holder.id : null };
    return m.ewc.invites;
  }
  function ewcLcqField(state, m) {
    return ewcInvites(state, m).lcq.map((id) => clubEntry(state, teamById(state, id))).filter(Boolean);
  }
  function ewcField(state, m) {
    const inv = ewcInvites(state, m);
    const field = inv.list.map((x) => { const e = clubEntry(state, teamById(state, x.teamId)); if (e) e.qual = x.why; return e; }).filter(Boolean);
    const lcqEv = m.events.find((x) => x.kind === "ewclcq");
    const w = lcqEv && lcqEv.results && lcqEv.results.world && lcqEv.results.world.order[0];
    let extra = w ? clubEntry(state, teamById(state, w.teamId)) : null;
    if (!extra) { // LCQ pas joue (mod installe tard) : le suivant au classement
      const id = inv.lcq.find((x) => !field.some((e) => e.teamId === x));
      extra = id != null ? clubEntry(state, teamById(state, id)) : null;
    }
    if (extra && !field.some((e) => e.teamId === extra.teamId)) { extra.qual = "lcq"; field.push(extra); }
    field.sort((a, b) => (rankPts(state, b.teamId) - rankPts(state, a.teamId)) || (b.rating - a.rating));
    return field;
  }
  // EWC : 2 groupes GSL de 8 (haut de tableau en Bo5, matchs a elimination en Bo7), puis 8 en elimination directe (Bo7) + petite finale
  function ewcPlayoffSlots(prefix) {
    const id = (x) => prefix + "-" + x, S = (n) => ({ seed: n }), W = (x) => ({ from: id(x), take: "winner" }), L = (x) => ({ from: id(x), take: "loser" });
    const mk = (x, stage, a, b, extra) => Object.assign({ id: id(x), stage, bestOf: 7, a, b }, extra || {});
    // graines : [A1, B1, A2, B2, A3, B3, A4, B4]
    return [
      mk("qf1", "quarter", S(0), S(7), { eliminates: true }), mk("qf2", "quarter", S(3), S(4), { eliminates: true }),
      mk("qf3", "quarter", S(1), S(6), { eliminates: true }), mk("qf4", "quarter", S(2), S(5), { eliminates: true }),
      mk("sf1", "semi", W("qf1"), W("qf2")), mk("sf2", "semi", W("qf3"), W("qf4")),
      mk("third", "third", L("sf1"), L("sf2"), { eliminates: true }),
      mk("final", "final", W("sf1"), W("sf2"), { eliminates: true, decides: true }),
    ];
  }
  function startEwc(state, ev, field) {
    const pid = "rlc" + ev.id + "world";
    const letters = ["A", "B"];
    const reg = { format: "hybrid", ewc: true, mode: "3v3", pid, field: field.map((x, i) => Object.assign({}, x, { seed: i + 1 })), groups: [], slots: [], phases: [], rounds: [], stats: {}, done: false };
    const ids = reg.field.map((x) => x.teamId);
    for (let g = 0; g < 2; g++) {
      const seeds = [];
      for (let j = 0; j < 8; j++) { const k = j * 2 + (j % 2 === 0 ? g : 1 - g); if (ids[k] != null) seeds.push(ids[k]); }
      const prefix = "E" + pid + letters[g];
      reg.groups.push({ prefix, seeds });
      reg.slots = reg.slots.concat(ev_.buildGsl8(prefix, 5).map((sl) => Object.assign(sl, { bestOf: sl.eliminates ? 7 : 5 })));
    }
    reg.qualifierCount = 8;
    const P = "E" + pid + "P";
    reg.slots = reg.slots.concat(ewcPlayoffSlots(P));
    const gs = reg.slots.filter((x) => x.id.indexOf(P + "-") !== 0);
    const depth = {};
    for (const sl of gs) depth[sl.id] = ev_.slotDepth(gs, sl.id);
    const gMax = Math.max(0, ...gs.map((x) => depth[x.id]));
    for (let d = 0; d <= gMax; d++) reg.phases.push({ ids: gs.filter((x) => depth[x.id] === d).map((x) => x.id), name: "Group stage, round {n}", n: d + 1, day: Math.min(2, d), group: true });
    reg.phases.push({ ids: [P + "-qf1", P + "-qf2", P + "-qf3", P + "-qf4"], name: "Quarter-finals", n: 1, day: 3 });
    reg.phases.push({ ids: [P + "-sf1", P + "-sf2"], name: "Semi-finals", n: 1, day: 4 });
    reg.phases.push({ ids: [P + "-third"], name: "Third place match", n: 1, day: 4 });
    reg.phases.push({ ids: [P + "-final"], name: "Final", n: 1, day: 4 });
    reg.R = reg.phases.length;
    ev.regions = ev.regions || {};
    ev.regions.world = reg;
    createPhase(state, reg, 0);
    return reg;
  }
  function ewcMoney(state, v) { try { return realMoney(state) ? v : v * 100; } catch (e) { return v; } }
  function bumpFame(state, teamId, fame) {
    const t = teamById(state, teamId);
    if (!t || !fame) return;
    const f = Math.max(0, t.followers || 0);
    t.followers = f + Math.round(fame * (1 + Math.sqrt(f / 10000)));
    for (const id of t.playerIds || []) {
      const p = playerById(state, id);
      if (!p || p.retired) continue;
      const pf = Math.max(0, p.followers || 0);
      p.followers = pf + Math.round(fame * 0.5 * (1 + Math.sqrt(pf / 10000)));
    }
  }
  function ewcInviteMail(state, m) {
    const inv = ewcInvites(state, m);
    const mine = inv.list.find((x) => x.teamId === state.userTeamId);
    const inLcq = inv.lcq.indexOf(state.userTeamId) >= 0;
    const ewc = m.events.find((e) => e.kind === "ewc"), lcq = m.events.find((e) => e.kind === "ewclcq");
    let body;
    if (mine) body = (mine.why === "holder" ? tl("As the holders, the club is invited to the Esports World Cup.") : tl("The club is invited to the Esports World Cup thanks to its RLCS ranking.")) + " " + tl("{n} teams, a 1,000,000 dollar prize pool, from {date}.", { n: 16, date: ewc ? pressDate(ewc.startDate) : "" });
    else if (inLcq) body = tl("The club missed a direct invitation, but it plays the EWC Last Chance Qualifier from {date}. Only the winner goes to the Esports World Cup.", { date: lcq ? pressDate(lcq.startDate) : "" });
    else body = tl("The club is not among the 16 teams of the Esports World Cup this season.");
    pushInbox(state, { type: "board", title: tl("Esports World Cup: the invitations"), body });
  }
  function finishEwcLcq(state, m, ev) {
    const reg = ev.regions.world;
    const order = finalOrder(reg);
    award(state, m, ev, order, null);
    const last = reg.rounds[reg.rounds.length - 1][0];
    ev.results.world = { order: order.map((x) => ({ teamId: x.teamId, ids: x.ids, names: x.names, region: x.region, placement: x.placement, prize: x.prize })), finalScore: last.bye ? "" : scoreOf(last, last.w === last.a) };
    ev.stage = "done";
    const champ = ev.results.world.order[0], mine = ev.results.world.order.find((x) => x.teamId === state.userTeamId);
    if (!mine) return;
    let body = tl("{club} won the {event}, {score} in the final, and takes the last place at the Esports World Cup.", { club: champ.names[0], event: tl(ev.name), score: ev.results.world.finalScore || "" });
    if (mine.placement === 1) body = tl("The club won the {event} and goes to the Esports World Cup!", { event: tl(ev.name) });
    else body += " " + tl("The club finished {place}.", { place: ordinal(mine.placement) });
    if (mine.prize) body += " " + tl("Prize money for the club: {prize}.", { prize: fmtMoney(mine.prize) });
    pushInbox(state, { type: "board", title: tl("{event}: the results", { event: tl(ev.name) }), body });
  }
  function finishEwc(state, m, ev) {
    const reg = ev.regions.world;
    const order = finalOrder(reg);
    award(state, m, ev, order, null);
    const fin = reg.rounds[reg.rounds.length - 1][0];
    ev.results.world = { order: order.map((x) => ({ teamId: x.teamId, ids: x.ids, names: x.names, region: x.region, placement: x.placement, prize: x.prize })), finalScore: fin.bye ? "" : scoreOf(fin, fin.w === fin.a) };
    ev.stage = "done";
    const champ = ev.results.world.order[0];
    m.ewc.champion = champ ? champ.teamId : null;
    m.ewc.season = state.season;
    if (champ) bumpFame(state, champ.teamId, EWC_FAME);
    const mine = ev.results.world.order.find((x) => x.teamId === state.userTeamId);
    let body = tl("{club} won the Esports World Cup, {score} in the final.", { club: champ ? champ.names[0] : "", score: ev.results.world.finalScore || "" });
    if (mine) {
      body = mine.placement === 1 ? tl("The club won the Esports World Cup, {score} in the final!", { score: ev.results.world.finalScore || "" }) : body + " " + tl("The club finished {place}.", { place: ordinal(mine.placement) });
      if (mine.prize) body += " " + tl("Prize money for the club: {prize}.", { prize: fmtMoney(mine.prize) });
    }
    pushInbox(state, { type: "board", title: tl("{event}: the results", { event: tl(ev.name) }), body });
    if (mine) {
      ev.judged = { target: 1, place: mine.placement, met: mine.placement === 1, bonus: true };
      if (mine.placement === 1) {
        state.boardPressure = Math.max(0, (Number(state.boardPressure) || 0) - 1);
        pushInbox(state, { type: "board", title: tl("The board liked {event}", { event: tl(ev.name) }), body: tl("Esports World Cup champions! The board is delighted and the pressure on you has eased.") });
      }
    }
  }
  function runEvent(state, m, ev, rand) {
    const dayIdx = Math.min(eventDays(ev) - 1, daysBetween(ev.startDate, state.currentDate));
    if (dayIdx < 0) return;
    if (ev.stage === "pending") {
      // ouverture : on fige les inscrits et le tableau
      if (ev.kind === "open") {
        for (const r of state.regions || []) {
          const field = entries(state, ev.mode, r.id);
          if (field.length >= 4) startHybrid(state, ev, field, r.id);
          else if (field.length >= 2) startBracket(state, ev, field, r.id);
        }
      } else if (ev.kind === "ewclcq") {
        ewcInviteMail(state, m);
        const field = ewcLcqField(state, m);
        if (field.length < 2) { ev.stage = "skipped"; return; }
        const reg = startBracket(state, ev, field, "world");
        reg.mode = "3v3";
      } else if (ev.kind === "ewc") {
        if (!m.events.some((e) => e.kind === "ewclcq" && e.stage === "done")) { try { if (!m.ewc.invites || m.ewc.invites.season !== state.season) ewcInviteMail(state, m); } catch (e) {} }
        const field = ewcField(state, m);
        if (field.length < 8) { ev.stage = "skipped"; return; }
        startEwc(state, ev, field.slice(0, 16));
      } else {
        const field = worldsField(state, m, ev);
        if (!field) { ev.stage = "skipped"; return; }
        if (field.length < 2) { ev.stage = "done"; return; }
        startBracket(state, ev, field, "world");
      }
      ev.stage = "live";
      ev.dayDone = -1;
    }
    if (ev.stage !== "live") return;
    // reprise apres ton match : on rejoue la journee en cours pour ta region
    for (const key of Object.keys(ev.regions || {})) {
      const reg = ev.regions[key];
      if (reg.pending || reg.done || ev.dayDone == null || ev.dayDone < 0) continue;
      const mine = key === state.userRegion || key === "world" ? entryOf(reg, state.userTeamId) : null;
      if (mine == null) continue;
      playUpTo(state, ev, reg, Math.min(ev.dayDone, dayIdx), rand, mine);
      if (reg.pending) { m.pending = { evId: ev.id, key }; return; }
    }
    const from = (ev.dayDone == null ? -1 : ev.dayDone) + 1;
    for (let d = from; d <= dayIdx; d++) {
      for (const key of Object.keys(ev.regions || {})) {
        const reg = ev.regions[key];
        if (reg.pending) continue;
        const mine = key === state.userRegion || key === "world" ? entryOf(reg, state.userTeamId) : null;
        playUpTo(state, ev, reg, d, rand, mine);
        if (reg.pending) m.pending = { evId: ev.id, key };
      }
      ev.dayDone = Math.max(ev.dayDone == null ? -1 : ev.dayDone, d);
    }
    const allDone = Object.keys(ev.regions || {}).every((k) => ev.regions[k].done && !ev.regions[k].pending);
    if (allDone && dayIdx >= eventDays(ev) - 1) {
      if (ev.kind === "open") finishOpen(state, m, ev);
      else if (ev.kind === "ewclcq") finishEwcLcq(state, m, ev);
      else if (ev.kind === "ewc") finishEwc(state, m, ev);
      else finishWorlds(state, m, ev);
    }
  }
  function pendingOf(state) {
    const m = state && state.rlcModes;
    if (!m) return null;
    if (!m.pending) {
      // filet de securite : un match en attente oublie
      for (const e of m.events || []) for (const k of Object.keys(e.regions || {})) if (e.regions[k].pending && e.stage === "live") { m.pending = { evId: e.id, key: k }; break; }
      if (!m.pending) return null;
    }
    const ev = (m.events || []).find((e) => e.id === m.pending.evId);
    const reg = ev && ev.regions && ev.regions[m.pending.key];
    const p = reg && reg.pending;
    const mt = p && reg.rounds[p.r] && reg.rounds[p.r][p.i];
    if (!mt || mt.played) { m.pending = null; if (reg) reg.pending = null; return null; }
    return { m, ev, reg, mt, r: p.r, i: p.i, me: entryOf(reg, state.userTeamId) };
  }
  // une manche (ou toute la serie) du match de ton joueur/duo, puis la journee reprend
  function simGame(state, all) {
    const P = pendingOf(state);
    if (!P) return { ok: false, error: "There is no 1v1/2v2 match to play." };
    const tmp = tempFixture(state, false);
    if (tmp && state.pendingMatch === tmp.id) return { ok: false, error: "Finish the match you are in first." };
    if (tmp) state.fixtures = state.fixtures.filter((f) => f !== tmp); // il sera recree depuis les manches deja jouees
    const { m, ev, reg, mt } = P;
    refreshIds(state, reg, mt.a); refreshIds(state, reg, mt.b);
    const A = reg.field[mt.a], B = reg.field[mt.b];
    const rand = makeRand(nameSeed("rlc-live:" + ev.id + ":" + P.r + ":" + P.i + ":" + (mt.games ? mt.games.length : 0) + ":" + state.currentDate));
    const ca = carsOf(state, A.ids), cb = carsOf(state, B.ids);
    const need = Math.ceil(mt.bo / 2);
    if (!mt.games) { mt.games = []; mt.wa = 0; mt.wb = 0; }
    let game = null, guard = 0;
    do {
      game = playGame(state, A, B, ca, cb, rand, reg.stats);
      mt.games.push(game);
      if (game.a > game.b) mt.wa++; else mt.wb++;
    } while (all && mt.wa < need && mt.wb < need && guard++ < 15);
    if (mt.wa >= need || mt.wb >= need) {
      const fin = finishSeries(state, P);
      return { ok: true, game, done: true, won: fin.won, next: fin.next };
    }
    return { ok: true, game, done: false };
  }
  function finishSeries(state, P) {
    const { m, ev, reg, mt } = P;
    mt.w = mt.wa > mt.wb ? mt.a : mt.b;
    mt.played = true;
    settle(reg, mt);
    reg.pending = null; m.pending = null;
    const won = mt.w === P.me;
    // la journee reprend (autres tours du jour, nouveau match a toi, ou fin de l'event)
    runEvent(state, m, ev, makeRand(nameSeed("rlc-resume:" + ev.id + ":" + state.currentDate + ":" + P.r)));
    if (!pendingOf(state)) tick(state); // les autres events du jour reprennent aussi
    return { won, next: !!pendingOf(state) };
  }

  // ---------- jouer / regarder dans Rocket League (match temporaire lu par le lanceur du jeu) ----------
  function lookupRef(state, ref) {
    const m = state && state.rlcModes;
    const ev = m && (m.events || []).find((e) => e.id === ref.evId);
    const reg = ev && ev.regions && ev.regions[ref.key];
    const mt = reg && reg.rounds[ref.r] && reg.rounds[ref.r][ref.i];
    if (!mt) return null;
    return { m, ev, reg, mt, r: ref.r, i: ref.i, me: entryOf(reg, state.userTeamId) };
  }
  function findTemp(state, ref) {
    return (state.fixtures || []).find((f) => f && f.rlcTemp && f.rlcTemp.evId === ref.evId && f.rlcTemp.key === ref.key && f.rlcTemp.r === ref.r && f.rlcTemp.i === ref.i) || null;
  }
  function tempFixture(state, create) {
    const P = pendingOf(state);
    if (!P) return null;
    const ref = { evId: P.ev.id, key: P.m.pending.key, r: P.r, i: P.i };
    let fx = findTemp(state, ref);
    if (fx || !create) return fx;
    refreshIds(state, P.reg, P.mt.a); refreshIds(state, P.reg, P.mt.b);
    const meA = P.mt.a === P.me, mine = P.reg.field[P.me], opp = P.reg.field[meA ? P.mt.b : P.mt.a];
    const id = (state.fixtures || []).reduce((mx, f) => Math.max(mx, Number(f && f.id) || 0), 0) + 1;
    const ph = P.reg.phases && P.reg.phases[P.r];
    fx = { id, date: state.currentDate, homeId: state.userTeamId, awayId: opp.teamId, bestOf: P.mt.bo, games: [], homeWins: 0, awayWins: 0, played: false,
      rlcTemp: ref, rlcNames: { home: mine.names.join(" & "), away: opp.names.join(" & "), comp: P.ev.name, round: ph ? ph.name : roundName(P.r, P.reg.R), n: ph ? ph.n : null, mode: P.ev.mode } };
    for (const g of P.mt.games || []) {
      const us = meA ? g.a : g.b, them = meA ? g.b : g.a;
      fx.games.push({ homeGoals: us, awayGoals: them, overtime: !!g.ot, homeScorers: (meA ? g.sa : g.sb) || [], awayScorers: (meA ? g.sb : g.sa) || [] });
      if (us > them) fx.homeWins++; else fx.awayWins++;
    }
    state.fixtures.push(fx);
    return fx;
  }
  function dropTemp(state, keepId) {
    if (!Array.isArray(state.fixtures)) return;
    const P = pendingOf(state);
    state.fixtures = state.fixtures.filter((f) => {
      if (!f || !f.rlcTemp) return true;
      if (f.id === keepId || state.pendingMatch === f.id) return true;
      if (f.played) return false;
      return !!(P && f.rlcTemp.evId === P.ev.id && f.rlcTemp.r === P.r && f.rlcTemp.i === P.i);
    });
  }
  // une manche jouee/regardee dans Rocket League -> tableau 1v1/2v2
  function applyRlcResult(state, fx, result) {
    if (fx.played) return { seriesOver: true, alreadyPlayed: true };
    const L = lookupRef(state, fx.rlcTemp);
    if (!L || L.mt.played) return { error: tl("This 1v1/2v2 match is already over.") };
    const r = cleanResult(result || {});
    const us = r.teamGoals, them = r.oppGoals;
    if (!(us >= 0) || !(them >= 0) || us === them) return { error: tl("The result could not be read. This game has not been recorded.") };
    const meA = L.mt.a === L.me, mine = L.reg.field[L.me], opp = L.reg.field[meA ? L.mt.b : L.mt.a];
    let sides = null;
    try { sides = measuredSides(state, r.players, mine.ids, opp.ids); } catch (e) { sides = null; }
    const stats = L.reg.stats || (L.reg.stats = {});
    const take = (ids, map, goals) => {
      const sc = [];
      for (const id of ids) {
        const x = (map && map.get(id)) || {};
        addStat(stats, id, "gp", 1);
        if (map && map.size) { addStat(stats, id, "a", x.assists | 0); addStat(stats, id, "sv", x.saves | 0); addStat(stats, id, "sh", Math.max(x.shots | 0, x.goals | 0)); for (let k = 0; k < (x.goals | 0); k++) sc.push(id); }
      }
      while (sc.length < goals) sc.push(ids[sc.length % ids.length]);
      const out = sc.slice(0, goals);
      for (const id of out) addStat(stats, id, "g", 1);
      return out;
    };
    const sMine = take(mine.ids, sides && sides.ours, us), sOpp = take(opp.ids, sides && sides.theirs, them);
    const game = meA ? { a: us, b: them, ot: !!r.overtime, sa: sMine, sb: sOpp, live: true } : { a: them, b: us, ot: !!r.overtime, sa: sOpp, sb: sMine, live: true };
    if (!L.mt.games) { L.mt.games = []; L.mt.wa = 0; L.mt.wb = 0; }
    L.mt.games.push(game);
    if (game.a > game.b) L.mt.wa++; else L.mt.wb++;
    fx.games.push({ homeGoals: us, awayGoals: them, overtime: !!r.overtime, homeScorers: sMine, awayScorers: sOpp });
    if (us > them) fx.homeWins++; else fx.awayWins++;
    const need = Math.ceil(L.mt.bo / 2);
    const over = L.mt.wa >= need || L.mt.wb >= need;
    const out = { seriesOver: over, bestOf: fx.bestOf, homeWins: fx.homeWins, awayWins: fx.awayWins, gameNo: fx.games.length };
    if (over) {
      fx.played = true;
      fx.rlcDone = true;
      L.m.pending = L.m.pending || { evId: L.ev.id, key: fx.rlcTemp.key };
      finishSeries(state, L);
    }
    return out;
  }
  function tick(state, rand) {
    if (!state || isPlayerCareer(state) || state.sacked) return;
    const m = plan(state);
    if (pendingOf(state)) return;
    for (const ev of m.events) {
      if (ev.stage !== "pending" && ev.stage !== "live") continue;
      // rappel une semaine avant les Opens, avec l'objectif du board
      if (ev.kind === "open" && ev.stage === "pending" && !ev.reminded && cmpDate(addDays(state.currentDate, 7), ev.startDate) >= 0) {
        ev.reminded = true;
        const p = validPicks(state);
        const names = (ev.mode === "1v1" ? p.solo : p.duo).map((id) => (playerById(state, id) || {}).name).filter(Boolean).join(" & ");
        const n = entries(state, ev.mode, state.userRegion).length;
        pushInbox(state, { type: "board", title: tl("{event} starts on {date}", { event: ev.name, date: pressDate(ev.startDate) }),
          body: (ev.mode === "2v2" ? tl("The duo {names} will play it for the club.", { names }) : tl("{names} will play it for the club.", { names })) + " " +
            tl("The board expects a top {n} finish.", { n: targetFor(state, n) }) + " " + tl("You can change your pick in the Squad tab, under 1v1 / 2v2.") });
      }
      if (cmpDate(state.currentDate, ev.startDate) < 0) continue;
      const r = rand || makeRand(nameSeed("rlc-modes:" + ev.id + ":" + state.currentDate));
      runEvent(state, m, ev, r);
      if (pendingOf(state)) return; // un seul match a la fois : le temps s'arrete
    }
  }

  // ---------- vue (calendrier) et board ----------
  function view(state) {
    plan(state);
    const p = validPicks(state);
    return { picks: p, roster: rosterPlayers(state).map((x) => ({ id: x.id, name: x.name, rating: Math.round(effRating(x)) })) };
  }
  function boardRows(state) {
    const m = plan(state);
    const rows = [];
    for (const ev of m.events) {
      if (ev.stage === "skipped" || ev.kind === "ewclcq") continue;
      const row = { id: ev.id, mode: ev.mode, kind: ev.kind, name: ev.name, done: ev.stage === "done", live: ev.stage === "live" };
      if (ev.kind === "ewc") {
        row.target = 1; row.bonus = true;
        const inv = m.ewc.invites && m.ewc.invites.season === state.season ? m.ewc.invites : null;
        const lcqEv = m.events.find((x) => x.kind === "ewclcq");
        const reg = ev.regions && ev.regions.world;
        let q = null;
        if (reg) q = reg.field.some((x) => x.teamId === state.userTeamId);
        else if (inv) {
          if (inv.list.some((x) => x.teamId === state.userTeamId)) q = true;
          else if (inv.lcq.indexOf(state.userTeamId) < 0) q = false;
          else if (lcqEv && lcqEv.stage === "done") q = !!(lcqEv.results.world && lcqEv.results.world.order[0] && lcqEv.results.world.order[0].teamId === state.userTeamId);
        }
        row.qualified = q;
        if (row.done) {
          const mine = ev.results.world && ev.results.world.order.find((x) => x.teamId === state.userTeamId);
          row.place = mine ? mine.placement : null;
          row.status = row.place === 1 ? "met" : "none";
        } else row.status = q === false ? "none" : q ? "on" : "later";
        rows.push(row);
        continue;
      }
      if (ev.kind === "open") {
        const reg = ev.regions && ev.regions[state.userRegion];
        row.target = (ev.judged && ev.judged.target) || (reg && reg.target) || targetFor(state, reg ? reg.field.length : entries(state, ev.mode, state.userRegion).length);
        if (row.done) {
          const mine = ev.results[state.userRegion] && ev.results[state.userRegion].order.find((x) => x.teamId === state.userTeamId);
          row.place = mine ? mine.placement : null;
          row.status = !mine ? "none" : row.place <= row.target ? "met" : "missed";
        } else if (row.live && reg) {
          const me = entryOf(reg, state.userTeamId);
          const pl = me != null ? placements(reg) : {};
          const best = me != null && pl[me] ? pl[me] : null;
          const alive = me != null && !best;
          row.place = best;
          row.status = alive ? "on" : best && best <= row.target ? "met" : "missed";
        } else row.status = "later";
      } else {
        row.target = 1; row.bonus = true;
        const open = m.events.find((x) => x.kind === "open" && x.mode === ev.mode);
        const qualified = open && open.stage === "done" ? worldsQualifiers(state, open).some((x) => x.teamId === state.userTeamId) : null;
        row.qualified = qualified;
        if (row.done) {
          const mine = ev.results.world && ev.results.world.order.find((x) => x.teamId === state.userTeamId);
          row.place = mine ? mine.placement : null;
          row.status = row.place === 1 ? "met" : "none";
        } else row.status = qualified === false ? "none" : qualified ? "on" : "later";
      }
      rows.push(row);
    }
    return rows;
  }
  const prevAdvance = module.exports.advance;
  module.exports.advance = function (state, rand, mode) {
    try { if (state) dropTemp(state); } catch (e) {}
    if (state && pendingOf(state)) return { stopped: "day", rlcMatch: true };
    if (mode === "next") {
      let res = { stopped: "day" };
      for (let k = 0; k < 200; k++) {
        res = prevAdvance.call(this, state, rand, "day");
        try { tick(state); } catch (e) { console.error("[rlc-mod] modes", e); }
        if (pendingOf(state)) return { stopped: "day", rlcMatch: true };
        if (!res || res.stopped !== "day") return res;
      }
      return res;
    }
    const res = prevAdvance.apply(this, arguments);
    try { tick(state); } catch (e) { console.error("[rlc-mod] modes", e); }
    if (res && pendingOf(state)) res.rlcMatch = true;
    return res;
  };
  // objectifs 1v1/2v2 dans "Succes continental" du board
  const prevBoardDetail = module.exports.boardDetail;
  if (typeof prevBoardDetail === "function") {
    module.exports.boardDetail = function (state) {
      const d = prevBoardDetail.apply(this, arguments);
      try {
        if (d && d.continental && state && !isPlayerCareer(state)) {
          const rows = boardRows(state);
          d.continental.rlc = rows;
          if (d.continental.status === "none" && rows.length) {
            const judged = rows.filter((r) => !r.bonus);
            const cur = judged.find((r) => !r.done) || judged[judged.length - 1];
            if (cur) d.continental.status = cur.status === "later" ? "on" : cur.status;
          }
        }
      } catch (e) { console.error("[rlc-mod] board", e); }
      return d;
    };
  }
  const prevSide = module.exports.sideLineup;
  module.exports.sideLineup = function (state, fx) {
    if (fx && fx.rlcTemp) { const L = lookupRef(state, fx.rlcTemp); if (L && L.me >= 0) return L.reg.field[L.me].ids.slice(); }
    return prevSide.apply(this, arguments);
  };
  const prevLineup = module.exports.lineupFor;
  module.exports.lineupFor = function (state, team, fx) {
    if (fx && fx.rlcTemp) {
      const L = lookupRef(state, fx.rlcTemp);
      if (L && L.me >= 0) { const meA = L.mt.a === L.me; const e = team && team.id === state.userTeamId ? L.reg.field[L.me] : L.reg.field[meA ? L.mt.b : L.mt.a]; return e.ids.slice(); }
    }
    return prevLineup.apply(this, arguments);
  };
  const prevApply = module.exports.applyUserResult;
  module.exports.applyUserResult = function (state, fx, result, rand) {
    if (fx && fx.rlcTemp) { try { return applyRlcResult(state, fx, result); } catch (e) { console.error("[rlc-mod] result", e); return { error: String(e && e.message || e) }; } }
    return prevApply.apply(this, arguments);
  };
  module.exports.rlcModes = { tick, plan, simGame, pendingOf, tempFixture, dropTemp, applyRlcResult, placements, roundLabel, setPicks, validPicks, view, entries, boardRows, targetFor, roundName, worldsQualifiers, WORLDS_SIZE, ewcInvites, ewcClubs };
})();
