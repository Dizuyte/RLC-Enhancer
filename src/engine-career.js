/* RLC Enhancer (c) 2026 Milan. All rights reserved. Source published for reading only:
   no copy, reuse or redistribution without Milan's written permission. See LICENSE.txt. */

;/* ===== RLC ENHANCER (Claude) : resume de carriere (clubs, dates, depart, titres, classement par saison) ===== */
(function () {
  const KINDS = ["open", "major", "lcq", "worlds"];
  function nameOf(state, id) { const t = teamById(state, id); return t ? t.name : null; }
  function resolveId(state, name, id) {
    if (id != null && teamById(state, id)) return id;
    const t = (state.teams || []).find((x) => x && x.name === name);
    return t ? t.id : null;
  }
  // tous les evenements termines (saisons passees + saison en cours), toutes regions
  function allEvents(state) {
    const out = [];
    const push = (season, list) => {
      for (const e of list || []) {
        if (!e || KINDS.indexOf(e.kind) < 0 || !Array.isArray(e.standings) || !e.standings.length) continue;
        out.push({ season, name: e.name, kind: e.kind, endDate: e.endDate, standings: e.standings });
      }
    };
    for (const h of state.seasonHistory || []) {
      push(h.season, h.events);
      for (const k of Object.keys(h.regionEvents || {})) push(h.season, h.regionEvents[k]);
    }
    const cur = (state.events || []).filter((e) => e && e.stage === "done");
    push(state.season, cur);
    for (const k of Object.keys(state.regionEvents || {})) push(state.season, (state.regionEvents[k] || []).filter((e) => e && e.stage === "done"));
    return out;
  }
  function rankIn(ids, pts, id) {
    if (!ids.some((x) => pts(x) > 0)) return null;
    const sorted = ids.slice().sort((a, b) => (pts(b) - pts(a)) || (a - b));
    const i = sorted.indexOf(id);
    return i < 0 ? null : i + 1;
  }
  // classement de fin de saison du club, pour chaque saison passee (meme partie) dans ce club
  function stintSeasons(state, s) {
    const out = [];
    const from = s.startSeason || 1, to = s.endSeason || state.season;
    for (const h of state.seasonHistory || []) {
      if (h.season < from || h.season > to) continue;
      const teams = (h.teams || []).filter((t) => t && !t.national);
      const me = teams.find((t) => t.id === s.teamId);
      if (!me) continue;
      const pts = (id) => Number((h.ranking || {})[id]) || 0;
      out.push({ season: h.season, world: rankIn(teams.map((t) => t.id), pts, me.id), regional: rankIn(teams.filter((t) => t.region === me.region).map((t) => t.id), pts, me.id),
        points: pts(me.id), done: true, left: !!(s.end && h.endDate && cmpDate(s.end, h.endDate) < 0) });
    }
    if (to >= state.season && !out.some((r) => r.season === state.season) && (!s.end || seasonAt(state, s.end) === state.season)) {
      try {
        const teams = (state.teams || []).filter((t) => t && !t.national);
        const me = teamById(state, s.teamId);
        const pts = (id) => Number(rankingPoints(state, id)) || 0;
        if (me) out.push({ season: state.season, world: rankIn(teams.map((t) => t.id), pts, me.id), regional: rankIn(teams.filter((t) => t.region === me.region).map((t) => t.id), pts, me.id),
          points: pts(me.id), done: false, left: !!s.end });
      } catch (e) {}
    }
    return out;
  }
  function seasonRows(state) {
    const rows = [];
    for (const h of state.seasonHistory || []) {
      const teams = (h.teams || []).filter((t) => t && !t.national);
      const pts = (id) => Number((h.ranking || {})[id]) || 0;
      const me = teams.find((t) => t.id === h.userTeamId);
      if (!me) continue;
      rows.push({
        season: h.season, teamId: me.id, club: me.name, region: me.region,
        world: rankIn(teams.map((t) => t.id), pts, me.id),
        regional: rankIn(teams.filter((t) => t.region === me.region).map((t) => t.id), pts, me.id),
        points: pts(me.id), endDate: h.endDate, done: true,
      });
    }
    // saison en cours
    try {
      const teams = (state.teams || []).filter((t) => t && !t.national);
      const pts = (id) => Number(rankingPoints(state, id)) || 0;
      const me = teamById(state, state.userTeamId);
      if (me && !rows.some((r) => r.season === state.season)) {
        rows.push({
          season: state.season, teamId: me.id, club: me.name, region: me.region,
          world: rankIn(teams.map((t) => t.id), pts, me.id),
          regional: rankIn(teams.filter((t) => t.region === me.region).map((t) => t.id), pts, me.id),
          points: pts(me.id), done: false,
        });
      }
    } catch (e) {}
    return rows;
  }
  function seasonAt(state, date) {
    const hs = (state.seasonHistory || []).slice().sort((x, y) => x.season - y.season);
    for (const h of hs) if (h.endDate && cmpDate(date, h.endDate) <= 0) return h.season;
    return state.season;
  }
  function summary(state) {
    const hist = ((state.rlcJobs && state.rlcJobs.history) || []).slice().sort((a, b) => cmpDate(a.date, b.date));
    const cur = teamById(state, state.userTeamId);
    const stints = [];
    let start = state.startDate || ((state.seasonHistory || [])[0] || {}).startDate || null;
    let clubId = hist.length ? resolveId(state, hist[0].from, hist[0].fromId) : state.userTeamId;
    let clubName = hist.length ? hist[0].from : cur && cur.name;
    let startSeason = 1;
    for (const h of hist) {
      const hs = h.season || seasonAt(state, h.date);
      stints.push({ teamId: clubId, name: clubName, start, end: h.date, startSeason, endSeason: hs, reason: h.sacked ? "sacked" : "left", to: h.to });
      clubId = resolveId(state, h.to, h.toId); clubName = h.to; start = h.date; startSeason = hs;
    }
    stints.push({ teamId: state.userTeamId, name: cur ? cur.name : clubName, start, end: null, startSeason, endSeason: state.season, reason: state.sacked ? "sacked" : "current", to: null });

    const events = allEvents(state);
    const seasons = seasonRows(state);
    const m = state.rlcModes || {};
    for (const s of stints) {
      const t = teamById(state, s.teamId);
      s.region = t ? t.region : null;
      s.logo = t ? t.logo : null;
      s.name = t ? t.name : s.name;
      const inStint = (d) => d && (!s.start || cmpDate(d, s.start) >= 0) && (!s.end || cmpDate(d, s.end) <= 0);
      const titles = [], best = {};
      for (const e of events) {
        if (!inStint(e.endDate)) continue;
        const st = e.standings.find((x) => x.teamId === s.teamId);
        if (!st || !st.placement) continue;
        if (st.placement === 1) titles.push({ season: e.season, name: e.name, kind: e.kind });
        const b = best[e.kind] || (best[e.kind] = { place: 99, n: 0, played: 0 });
        b.played++;
        if (st.placement < b.place) { b.place = st.placement; b.n = 1; } else if (st.placement === b.place) b.n++;
      }
      // 1v1 / 2v2
      for (const x of m.titles || []) {
        if (x.teamId !== s.teamId) continue;
        if (x.season < (s.startSeason || 1) || (s.endSeason && x.season > s.endSeason)) continue;
        titles.push({ season: x.season, name: x.name, kind: "rlc" + x.mode, region: x.region });
      }
      titles.sort((a, b) => a.season - b.season);
      s.titles = titles;
      s.best = best;
      s.seasons = stintSeasons(state, s);
    }
    return { stints: stints.reverse(), seasons, start: state.startDate || null, current: state.userTeamId, season: state.season };
  }
  module.exports.rlcCareer = { summary };
})();
