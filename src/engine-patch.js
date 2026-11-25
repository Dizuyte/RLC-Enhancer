/* RLC Enhancer (c) 2026 Milan. All rights reserved. Source published for reading only:
   no copy, reuse or redistribution without Milan's written permission. See LICENSE.txt. */

;/* ===== RLC ENHANCER (Claude) : offres de clubs pour le manager ===== */
(function () {
  // Textes du mod dans le systeme de langue du jeu (anglais = cle, traductions dans rlc-mod-lang.js)
  try {
    const RLC_LANG = require("../renderer/lang/rlc-mod.js");
    for (const lang of Object.keys(RLC_LANG.packs)) {
      try { RLC_LANG.install(lang, require("../renderer/lang/" + lang + ".js")); } catch (e) {}
    }
  } catch (e) { console.error("[rlc-mod] i18n", e); }

  const OFFER_DAYS_MIN = 6, OFFER_DAYS_MAX = 10, OFFSEASON_LEN = 28;
  const regionName = (state, id) => ((state.regions || []).find((r) => r.id === id) || {}).name || String(id || "").toUpperCase();
  function jobsOf(state) {
    if (!state.rlcJobs || !Array.isArray(state.rlcJobs.offers)) state.rlcJobs = { offers: [], lastWindow: null, nextId: 1, sackDone: false, plan: null };
    return state.rlcJobs;
  }
  function strengthTable(state) {
    const rows = [];
    for (const t of state.teams || []) {
      if (!t || t.national || !t.region || !Array.isArray(t.playerIds) || t.playerIds.length < 3) continue;
      let s = 0;
      try { s = teamStrength(state, autoLineup(state, t)); } catch (e) { continue; }
      rows.push({ team: t, s });
    }
    rows.sort((a, b) => a.s - b.s);
    rows.forEach((r, i) => (r.pct = rows.length > 1 ? i / (rows.length - 1) : 0.5));
    return rows;
  }
  function regionRank(state, team) {
    const cur = state.ranking || {};
    const useLast = !Object.values(cur).some((v) => Number(v) > 0) && state.lastSeason && state.lastSeason.ranking;
    const ranking = useLast ? state.lastSeason.ranking : cur;
    const pts = (id) => Number(ranking[id]) || 0;
    const mates = (state.teams || []).filter((t) => t.region === team.region && !t.national);
    mates.sort((a, b) => pts(b.id) - pts(a.id));
    return { pos: mates.findIndex((t) => t.id === team.id) + 1, n: mates.length };
  }
  function performance(state) {
    const me = teamById(state, state.userTeamId);
    if (!me) return 0;
    const r = regionRank(state, me);
    let target = Number(state.boardTarget) || 0;
    if (!target) { try { target = boardTargetFor(state); } catch (e) { target = Math.ceil(r.n / 2); } }
    let p = (target - r.pos) / Math.max(2, r.n * 0.25);
    for (const ev of state.events || []) if (ev && ev.championId === me.id) p += ev.kind === "worlds" ? 0.8 : ev.kind === "major" ? 0.5 : 0.25;
    return Math.max(-1, Math.min(1, p));
  }
  // Pas d'offres tant que le manager n'a encore rien joue (ex. mercato d'ouverture de la carriere).
  function tooEarly(state) {
    if ((state.seasonHistory || []).length) return false;
    return !(state.fixtures || []).some((f) => f && f.played && isUserFixture(state, f));
  }
  function label(pct) {
    return pct >= 0.9 ? "World-class club" : pct >= 0.7 ? "Big club" : pct >= 0.4 ? "Mid-table club" : pct >= 0.2 ? "Small club" : "Bottom-of-the-table club";
  }
  function makeOffer(state, row, jobs, why, expires) {
    const t = row.team;
    let lineup = [];
    try { lineup = autoLineup(state, t).map((id) => playerById(state, id)).filter(Boolean).map((p) => p.name); } catch (e) {}
    const rk = regionRank(state, t);
    return {
      id: jobs.nextId++, clubId: t.id, name: t.name, colors: t.colors || null,
      region: t.region, regionName: regionName(state, t.region), label: label(row.pct),
      budget: Math.round(t.budget || 0), wageBudget: Math.round(t.wageBudget || 0),
      budgetText: fmtMoney(t.budget || 0), wageText: fmtMoney(t.wageBudget || 0),
      regionPos: rk.pos, regionN: rk.n, lineup, why, date: state.currentDate, expires: expires || null,
    };
  }
  function pickOne(rand, rows, exclude) {
    const pool = rows.filter((r) => !exclude.has(r.team.id));
    return pool.length ? pool[Math.floor(rand() * pool.length)] : null;
  }
  // --- Licenciement : 3 clubs du bas de tableau, tout de suite (le temps est arrete tant qu'on est vire).
  function sackOffers(state) {
    const jobs = jobsOf(state);
    const me = teamById(state, state.userTeamId);
    if (!me) return [];
    const rand = makeRand(nameSeed("rlc-sack:" + state.currentDate + ":" + me.id));
    const rows = strengthTable(state).filter((r) => r.team.id !== me.id);
    let low = rows.filter((r) => r.pct <= 0.3);
    if (low.length < 3) low = rows.slice(0, Math.max(3, Math.ceil(rows.length * 0.3)));
    const used = new Set(), list = [];
    while (list.length < 3) {
      const regions = new Set(list.map((o) => o.region));
      const r = pickOne(rand, low.filter((x) => !regions.has(x.team.region)), used) || pickOne(rand, low, used);
      if (!r) break;
      used.add(r.team.id);
      list.push(makeOffer(state, r, jobs, "After your sacking, they are ready to give you a chance.", null));
    }
    jobs.offers = list;
    jobs.plan = null;
    if (list.length) {
      pushInbox(state, {
        type: "board",
        title: tl("Clubs want to give you a fresh start"),
        body: tl("You were sacked, but your career is not over.") + " " +
          tln("{n} club near the bottom of the table is ready to hire you.", "{n} clubs near the bottom of the table are ready to hire you.", list.length) + " " +
          tl("Pick your new club on the main screen."),
      });
    }
    return list;
  }
  // --- Mercato : on planifie les offres, puis elles arrivent une par une.
  function planWindow(state, w) {
    const me = teamById(state, state.userTeamId);
    const rand = makeRand(nameSeed("rlc-plan:" + state.currentDate + ":" + (me ? me.id : 0)));
    const perf = performance(state);
    let count = perf >= 0.6 ? 3 : perf >= 0.15 ? 2 : perf >= -0.3 ? 1 : 0;
    if (count > 0 && rand() < 0.2) count -= 1;
    const len = Math.max(4, w.closesOn ? daysBetween(state.currentDate, w.closesOn) : OFFSEASON_LEN);
    const dates = [];
    for (let i = 0; i < count; i++) {
      const slot = len / count;
      const off = Math.max(1, Math.min(len - 2, Math.round(slot * i + 1 + rand() * Math.max(1, slot - 2))));
      dates.push(addDays(state.currentDate, off));
    }
    dates.sort();
    return { dates, released: 0, perf, closesOn: w.closesOn || addDays(state.currentDate, len) };
  }
  function releaseOffer(state, jobs) {
    const plan = jobs.plan;
    const me = teamById(state, state.userTeamId);
    if (!me) return null;
    const rand = makeRand(nameSeed("rlc-offer:" + state.currentDate + ":" + me.id + ":" + plan.released));
    const all = strengthTable(state);
    const mine = all.find((r) => r.team.id === me.id);
    const rows = all.filter((r) => r.team.id !== me.id);
    const target = Math.max(0, Math.min(1, (mine ? mine.pct : 0.5) + 0.35 * plan.perf + 0.05));
    const taken = new Set(jobs.offers.map((o) => o.clubId).concat(plan.offered || []));
    let r = null;
    for (let w = 0.1; w <= 1.01 && !r; w += 0.1) r = pickOne(rand, rows.filter((x) => Math.abs(x.pct - target) <= w), taken);
    if (!r) return null;
    const why = plan.perf >= 0.6 ? "Your season has impressed them: they want you in charge." : plan.perf >= 0.15 ? "Your results have caught their eye." : "They think you can get their project going again.";
    let expires = addDays(state.currentDate, OFFER_DAYS_MIN + Math.floor(rand() * (OFFER_DAYS_MAX - OFFER_DAYS_MIN + 1)));
    if (plan.closesOn && cmpDate(expires, plan.closesOn) > 0) expires = plan.closesOn;
    const offer = makeOffer(state, r, jobs, why, expires);
    jobs.offers.push(offer);
    plan.offered = (plan.offered || []).concat([r.team.id]);
    const days = Math.max(1, daysBetween(state.currentDate, expires));
    pushInbox(state, {
      type: "board",
      title: tl("{club} want you as their manager", { club: offer.name }),
      body: tl("{club} ({region}) are offering you the manager's job.", { club: offer.name, region: offer.regionName }) + " " +
        tl(why) + " " +
        tl("Transfer budget: {budget}. Wage budget: {wage} a week.", { budget: offer.budgetText, wage: offer.wageText }) + " " +
        tln("The offer stands for {n} day.", "The offer stands for {n} days.", days) + " " +
        tl("Open Club offers at the bottom right to accept or decline."),
    });
    return offer;
  }
  function tick(state) {
    if (!state || isPlayerCareer(state)) return;
    const jobs = jobsOf(state);
    if (state.sacked) {
      if (!jobs.sackDone) { jobs.sackDone = true; sackOffers(state); }
      return;
    }
    jobs.sackDone = false;
    let w = null;
    try { w = transferWindow(state); } catch (e) { return; }
    if (!w || !w.open || tooEarly(state)) {
      jobs.offers = [];
      jobs.plan = null;
      if (w && w.open) jobs.lastWindow = state.season + ":" + w.kind;
      return;
    }
    // offres expirees
    jobs.offers = jobs.offers.filter((o) => !o.expires || cmpDate(o.expires, state.currentDate) >= 0);
    const key = state.season + ":" + w.kind;
    if (jobs.lastWindow !== key) {
      jobs.lastWindow = key;
      jobs.offers = [];
      jobs.plan = planWindow(state, w);
    }
    const plan = jobs.plan;
    if (!plan) return;
    while (plan.released < plan.dates.length && cmpDate(plan.dates[plan.released], state.currentDate) <= 0) {
      releaseOffer(state, jobs);
      plan.released++;
    }
  }
  function accept(state, offerId, realData) {
    if (!state) return { ok: false, error: "No career loaded." };
    if (isPlayerCareer(state)) return { ok: false, error: "Only available in a manager career." };
    if (state.pendingMatch != null) return { ok: false, error: "Finish the current match first." };
    const jobs = jobsOf(state);
    const offer = jobs.offers.find((o) => o.id === Number(offerId));
    if (!offer) return { ok: false, error: "This offer no longer exists." };
    const old = teamById(state, state.userTeamId), neu = teamById(state, offer.clubId);
    if (!neu || !old) return { ok: false, error: "Club not found." };
    const me = playerById(state, state.userPlayerId);
    if (me && !me.retired) {
      if ((neu.playerIds || []).length >= ROSTER_MAX) {
        let keep = [];
        try { keep = autoLineup(state, neu); } catch (e) {}
        const out = neu.playerIds.map((id) => playerById(state, id)).filter((p) => p && keep.indexOf(p.id) < 0)
          .sort((a, b) => effRating(a) - effRating(b))[0];
        if (out) completeTransfer(state, out, neu, null, 0, null, null, null);
      }
      completeTransfer(state, me, old, neu, 0, null, null, null);
    }
    const oldRegion = state.userRegion;
    const wasSacked = !!state.sacked;
    state.userTeamId = neu.id;
    state.userRegion = neu.region;
    if (oldRegion !== neu.region) { try { redrawRegionalEvents(state, oldRegion); } catch (e) { console.error("[rlc-mod] redraw", e); } }
    state.strikes = 0;
    state.boardPressure = 0;
    state.sacked = false;
    state.sackedReason = "";
    try { state.trust = TRUST_START; } catch (e) {}
    try { state.boardTarget = boardTargetFor(state); } catch (e) {}
    try { state.boardExpect = computeBoardExpect(state, realData || null); } catch (e) {}
    state.seasonStart = { budget: neu.budget || 0, followers: neu.followers || 0 };
    state.userKit = null;
    state.negotiations = {};
    state.pendingDeals = [];
    for (const o of state.offersOut || []) if (o && ["pending", "countered", "agreed", "awaiting_player", "talks"].indexOf(o.status) >= 0) o.status = "withdrawn";
    for (const o of state.offersIn || []) if (o && ["pending", "countered", "agreed"].indexOf(o.status) >= 0) o.status = "withdrawn";
    if (state.training && Array.isArray(state.training.slots)) state.training.slots = state.training.slots.map(() => ({ pid: 0 }));
    jobs.offers = [];
    jobs.plan = null; // plus d'offres pendant ce mercato
    jobs.sackDone = false;
    jobs.history = (jobs.history || []).concat([{ date: state.currentDate, season: state.season, from: old.name, to: neu.name, fromId: old.id, toId: neu.id, fromRegion: oldRegion, toRegion: neu.region, sacked: wasSacked }]);
    pushInbox(state, {
      type: "board",
      title: tl("Welcome to {club}", { club: neu.name }),
      body: tl("You leave {old} to take charge of {club} ({region}).", { old: old.name, club: neu.name, region: regionName(state, neu.region) }) + " " +
        tl("Transfer budget: {budget}. Wage budget: {wage} a week.", { budget: fmtMoney(neu.budget || 0), wage: fmtMoney(neu.wageBudget || 0) }) + " " +
        tl("The board expect a top {target} finish.", { target: state.boardTarget || "?" }),
    });
    return { ok: true, club: neu.name };
  }
  function decline(state, offerId) {
    const jobs = jobsOf(state);
    if (offerId == null) { jobs.offers = []; if (jobs.plan) jobs.plan.released = jobs.plan.dates.length; }
    else jobs.offers = jobs.offers.filter((o) => o.id !== Number(offerId));
    return { ok: true };
  }

  // --- Changement de region : les Opens deja tires au sort (pas encore commences) de l'ancienne region
  //     sont remis a zero puis retires pour la nouvelle region, pour que ton club les joue.
  function redrawRegionalEvents(state, oldRegion) {
    let redrawn = 0;
    for (const e of state.events || []) {
      if (!e || e.stage === "done" || e.stage === "pending" || !Array.isArray(e.field) || !e.field.length) continue;
      const regs = new Set(e.field.map((id) => (teamById(state, id) || {}).region));
      if (regs.size !== 1 || !regs.has(oldRegion)) continue;
      const fx = (state.fixtures || []).filter((f) => f.eventId === e.id);
      if (fx.some((f) => f.played || (f.games || []).length)) continue; // deja commence : on n'y touche pas
      state.fixtures = state.fixtures.filter((f) => f.eventId !== e.id);
      for (const k of ["groups", "slots", "field", "groupCount", "groupSize", "qualifierCount", "playoffSeeds", "standings", "championId", "skipped", "opened"]) delete e[k];
      e.stage = "pending";
      state.headlines = (state.headlines || []).filter((h) => h.eventId !== e.id);
      redrawn++;
    }
    if (redrawn) drawDueEvents(state);
    return redrawn;
  }
  // --- Reparation d'une save : un Open joue en detail pour l'ancienne region apres un transfert.
  //     On retire le doublon "ombre" de l'ancienne region et on simule l'Open pour la nouvelle region.
  function repairRegionSwap(state, eventId, oldRegion, rand) {
    const e = (state.events || []).find((x) => x.id === eventId);
    if (!e || e.kind !== "open" || e.stage !== "done") return { ok: false, error: "event" };
    const out = { removed: 0, added: 0 };
    const list = (state.regionEvents || {})[oldRegion] || [];
    const dup = list.find((x) => x.kind === "open" && x.name === e.name && x.startDate === e.startDate);
    if (dup) {
      (dup.standings || []).forEach((st, i) => {
        addRankingPoints(state, st.teamId, -ev.pointsFor("open", i + 1));
        const t = teamById(state, st.teamId), prize = prizeOf(state, e, i + 1, oldRegion);
        if (t && prize) t.budget -= prize;
        out.removed++;
      });
      state.regionEvents[oldRegion] = list.filter((x) => x !== dup);
      if (state.regionResults && e.standings) state.regionResults[oldRegion] = { eventId: e.id, name: e.name, order: e.standings.slice(0, 8).map((x) => x.teamId) };
    }
    const region = (state.regions || []).find((r) => r.id === state.userRegion);
    const already = ((state.regionEvents || {})[state.userRegion] || []).some((x) => x.kind === "open" && x.name === e.name && x.startDate === e.startDate);
    if (region && !already) {
      const sh = playShadowEvent(state, e, region, rand);
      const order = (sh.standings || []).map((x) => x.teamId);
      if (order.length) {
        titles.award(state, e, order, playerById, teamById);
        if (!state.regionEvents) state.regionEvents = {};
        state.regionEvents[region.id] = (state.regionEvents[region.id] || []).concat([sh]).slice(-10);
        order.forEach((id, i) => {
          bankPoints(state, e, id, ev.pointsFor(e.kind, i + 1));
          const prize = prizeOf(state, e, i + 1, region.id), t = teamById(state, id);
          if (prize && t) { t.budget += prize; ledgerMine(state, t, "prize", prize, e.name); }
          out.added++;
        });
        if (!state.regionResults) state.regionResults = {};
        state.regionResults[region.id] = { eventId: e.id, name: e.name, order: order.slice(0, 8) };
      }
    }
    rebuildSplitRanking(state);
    return { ok: true, ...out };
  }
  const origAdvance = module.exports.advance;
  module.exports.advance = function (state) {
    const res = origAdvance.apply(this, arguments);
    try { tick(state); } catch (e) { console.error("[rlc-mod] jobs", e); }
    return res;
  };
  module.exports.rlcJobs = { tick, accept, decline, performance, sackOffers, tooEarly, redrawRegionalEvents, repairRegionSwap };
})();
