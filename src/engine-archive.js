/* RLC Enhancer (c) 2026 Milan. All rights reserved. Source published for reading only:
   no copy, reuse or redistribution without Milan's written permission. See LICENSE.txt. */

;/* ===== RLC ENHANCER (Claude) : Archives, un "Liquipedia" de la carriere =====
   Chaque saison, chaque region, chaque event (Opens, Majors, LCQ, Worlds, 1v1/2v2, EWC) avec classement final et series,
   le classement RLCS de chaque region et l'historique de chaque equipe. Tout vient de seasonHistory + la saison en cours. */
(function () {
  function yearOf(d) { return Number(String(d || "").slice(0, 4)) || null; }
  function labelOf(start, end) {
    const a = yearOf(start), b = yearOf(end);
    return a && b && b !== a ? a + "-" + String(b).slice(2) : String(a || "");
  }
  function curStart(state) {
    const ds = (state.events || []).map((e) => e.startDate).filter(Boolean).sort();
    return ds[0] || state.currentDate;
  }
  function seasons(state) {
    const out = (state.seasonHistory || []).map((h) => ({ season: h.season, label: labelOf(h.startDate, h.endDate), startDate: h.startDate, endDate: h.endDate }));
    const ends = (state.events || []).map((e) => e.endDate).filter(Boolean).sort();
    out.push({ season: state.season, label: labelOf(curStart(state), ends[ends.length - 1]), current: true });
    return out.sort((a, b) => b.season - a.season);
  }
  function source(state, n) {
    if (n === state.season || n == null)
      return { season: state.season, current: true, regions: state.regions || [], teams: state.teams || [], events: state.events || [], regionEvents: state.regionEvents || {},
        fixtures: state.fixtures || [], ranking: null, userRegion: state.userRegion, startDate: curStart(state) };
    const h = (state.seasonHistory || []).find((x) => x.season === n);
    return h ? Object.assign({ current: false }, h) : null;
  }
  // places partagees comme sur Liquipedia : 1, 2, 3-4, 5-6, 7-8, 9-12, 13-16...
  function bucket(i) {
    if (i < 2) return [i, i];
    if (i < 4) return [2, 3];
    if (i < 8) return i < 6 ? [4, 5] : [6, 7];
    let lo = 8, size = 4;
    while (i >= lo + size) { lo += size; size *= 2; }
    return [lo, lo + size - 1];
  }
  function placeOf(i) { return bucket(i)[0] + 1; }
  function labelAt(i, n) { const b = bucket(i), hi = Math.min(Math.max(n, b[0] + 1), b[1] + 1); return hi > b[0] + 1 ? (b[0] + 1) + "-" + hi : String(b[0] + 1); }
  function stageLabel(slotId) {
    const m = /^E\d+([A-Z]?)-(.*)$/.exec(slotId || "");
    if (!m) return "";
    const grp = m[1], rest = m[2];
    if (grp === "P") return /final$/.test(rest) && !/^lb/.test(rest) ? "final" : /^sf/.test(rest) ? "semis" : /^qf/.test(rest) ? "quarters" : /^lb/.test(rest) ? "lower" : "playoffs";
    return "group:" + grp;
  }
  function seriesOf(src, ev) {
    const fx = new Map();
    for (const f of src.fixtures || []) if (f && f.eventId === ev.id) fx.set(f.id, f);
    const out = [];
    for (const sl of ev.slots || []) {
      if (sl.teamA == null || sl.teamB == null || sl.winner == null) continue;
      let wa = null, wb = null;
      if (sl.winsW != null) { wa = sl.winner === sl.teamA ? sl.winsW : sl.winsL; wb = sl.winner === sl.teamA ? sl.winsL : sl.winsW; }
      else if (sl.fixtureId != null && fx.has(sl.fixtureId)) {
        const f = fx.get(sl.fixtureId);
        let h = 0, a = 0;
        for (const g of f.games || []) { if (g.homeGoals > g.awayGoals) h++; else if (g.awayGoals > g.homeGoals) a++; }
        const aHome = f.homeId === sl.teamA;
        wa = aHome ? h : a; wb = aHome ? a : h;
      }
      out.push({ id: sl.id, stage: stageLabel(sl.id), a: sl.teamA, b: sl.teamB, wa, wb, w: sl.winner, bo: sl.bestOf || null });
    }
    return out;
  }
  function gameEvent(src, ev, region) {
    let order = [];
    try { order = ev.stage === "done" || ev.championId != null ? eventPlacings(ev) : []; } catch (e) { order = []; }
    const n = (ev.field || []).length || order.length;
    return { key: "g" + ev.id, src: "game", kind: ev.kind, name: ev.name, region: ev.international ? null : region || ev.regionId || src.userRegion,
      startDate: ev.startDate, endDate: ev.endDate, stage: ev.stage, international: !!ev.international, size: n,
      champion: ev.championId != null ? ev.championId : order[0] != null && ev.stage === "done" ? order[0] : null,
      placings: ev.stage === "done" ? order.map((id, i) => ({ teamId: id, place: placeOf(i), label: labelAt(i, n) })) : [],
      series: seriesOf(src, ev) };
  }
  function modEvents(state, n) {
    const m = state.rlcModes;
    if (!m) return [];
    const list = n === state.season ? (m.events || []).filter((e) => e.stage === "done" || e.stage === "live") : ((m.archive && m.archive[n]) || []);
    const out = [];
    for (const e of list) {
      for (const k of Object.keys(e.results || {})) {
        const r = e.results[k];
        const order = (r.order || []).slice().sort((a, b) => (a.placement || 99) - (b.placement || 99));
        out.push({ key: "m" + e.id + ":" + k, src: "mod", mode: e.mode, kind: e.kind, name: e.name, region: k === "world" ? null : k,
          startDate: e.startDate, endDate: e.endDate, stage: "done", international: k === "world", size: order.length,
          champion: order[0] ? order[0].teamId : null, championNames: order[0] ? order[0].names : null, finalScore: r.finalScore || "",
          placings: order.map((x) => ({ teamId: x.teamId, names: x.names, place: x.placement, label: String(x.placement), prize: x.prize })), series: [] });
      }
    }
    return out;
  }
  function teamsOf(src) {
    return (src.teams || []).filter((t) => t && !t.national).map((t) => ({ id: t.id, name: t.name, abbrev: t.abbrev, logo: t.logo, colors: t.colors, region: t.region }));
  }
  function rankingOf(state, src) {
    const pts = {};
    for (const t of src.teams || []) {
      if (!t || t.national) continue;
      let v = 0;
      if (src.current) { try { v = rankingPoints(state, t.id) || 0; } catch (e) { v = 0; } }
      else v = (src.ranking && src.ranking[t.id]) || 0;
      pts[t.id] = v;
    }
    return pts;
  }
  function season(state, n) {
    const src = source(state, n == null ? state.season : Number(n));
    if (!src) return null;
    const events = [];
    for (const ev of src.events || []) if (ev && ev.kind) events.push(gameEvent(src, ev, ev.international ? null : src.userRegion));
    for (const r of Object.keys(src.regionEvents || {})) for (const ev of src.regionEvents[r] || []) {
      if (src.current && ev.startDate && cmpDate(ev.startDate, src.startDate) < 0) continue; // restes de la saison passee
      events.push(gameEvent(src, ev, r));
    }
    for (const ev of modEvents(state, src.season)) events.push(ev);
    events.sort((a, b) => cmpDate(a.startDate, b.startDate) || (a.international ? -1 : 1));
    return { season: src.season, current: !!src.current, regions: (src.regions || []).map((r) => ({ id: r.id, name: r.name, short: r.short })),
      userRegion: src.userRegion, userTeamId: src.userTeamId != null ? src.userTeamId : state.userTeamId, teams: teamsOf(src), ranking: rankingOf(state, src), events };
  }
  // tout le parcours d'une equipe, saison par saison
  function team(state, teamId) {
    const id = Number(teamId), rows = [];
    for (const s of seasons(state).slice().reverse()) {
      const d = season(state, s.season);
      if (!d) continue;
      const t = d.teams.find((x) => x.id === id);
      if (!t) continue;
      const same = d.teams.filter((x) => x.region === t.region).sort((a, b) => (d.ranking[b.id] || 0) - (d.ranking[a.id] || 0));
      const world = d.teams.slice().sort((a, b) => (d.ranking[b.id] || 0) - (d.ranking[a.id] || 0));
      const res = [];
      for (const ev of d.events) {
        const p = ev.placings.find((x) => x.teamId === id);
        if (p) res.push({ key: ev.key, kind: ev.kind, mode: ev.mode || "3v3", name: ev.name, region: ev.region, startDate: ev.startDate, place: p.place, label: p.label, size: ev.size, names: p.names || null });
      }
      rows.push({ season: s.season, label: s.label, current: !!s.current, name: t.name, abbrev: t.abbrev, logo: t.logo, colors: t.colors, region: t.region,
        points: d.ranking[id] || 0, regionRank: same.findIndex((x) => x.id === id) + 1, worldRank: world.findIndex((x) => x.id === id) + 1, results: res,
        titles: res.filter((r) => r.place === 1).length });
    }
    return { teamId: id, seasons: rows.reverse() };
  }
  module.exports.rlcArchive = { seasons, season, team };
})();
