/* RLC Enhancer (c) 2026 Milan. All rights reserved. Source published for reading only:
   no copy, reuse or redistribution without Milan's written permission. See LICENSE.txt. */

;/* ===== RLC ENHANCER (Claude) : batiments qui rapportent (boutique facon V-Hive, studio de stream) =====
   Un seul niveau par batiment : on l'achete une fois, il rapporte chaque semaine.
   Boutique : ventes de maillots et de merch selon les followers du club.
   Studio : argent des streams + followers pour le club et les joueurs (plus fort les semaines avec des matchs). */
(function () {
  // prix en economie "reelle" ; x35 en economie du jeu (comme les installations)
  const BUILDINGS = {
    store: { key: "store", price: 250000 },
    studio: { key: "studio", price: 120000 },
    bootcamp: { key: "bootcamp", price: 350000 },
  };
  // bootcamp a louer : des equipes de ta region le reservent la semaine avant une LAN
  const BOOTCAMP_MAX = 50000, BOOTCAMP_MIN_SHARE = 0.3, BOOTCAMP_PER_SEASON = 3, OFFER_LEAD = 6;
  const LEGACY_SCALE = 35;
  function scale(state) { try { return realMoney(state) ? 1 : LEGACY_SCALE; } catch (e) { return 1; } }
  function bizOf(state) {
    if (!state.rlcBiz || typeof state.rlcBiz !== "object") state.rlcBiz = { store: null, studio: null };
    return state.rlcBiz;
  }
  function myTeam(state) { return teamById(state, state.userTeamId); }
  function nameOf(key) { return key === "store" ? tl("Club store") : key === "bootcamp" ? tl("Bootcamp facility") : tl("Stream studio"); }
  function priceOf(state, key) { return BUILDINGS[key].price * scale(state); }
  function round100(v) { return Math.round(v / 100) * 100; }
  function clubFollowers(state) { const t = myTeam(state); return Math.max(0, (t && t.followers) || 0); }
  // matchs officiels du club joues dans la semaine (3v3, 1v1/2v2 et EWC)
  function matchesIn(state, from, to) {
    let n = 0;
    for (const f of state.fixtures || []) {
      if (!f || !f.played || f.rlcTemp) continue;
      if (f.homeId !== state.userTeamId && f.awayId !== state.userTeamId) continue;
      if (cmpDate(f.date, from) > 0 && cmpDate(f.date, to) <= 0) n++;
    }
    const m = state.rlcModes;
    for (const ev of (m && m.events) || []) {
      for (const k of Object.keys(ev.regions || {})) {
        const reg = ev.regions[k];
        const me = reg.field.findIndex((x) => x.teamId === state.userTeamId);
        if (me < 0) continue;
        for (const ms of reg.rounds || []) for (const mt of ms) {
          if (!mt.played || mt.bye || (mt.a !== me && mt.b !== me)) continue;
          const d = addDays(ev.startDate, mt.day || 0);
          if (cmpDate(d, from) > 0 && cmpDate(d, to) <= 0) n++;
        }
      }
    }
    return n;
  }
  // Boutique et studio se remboursent en ~60 semaines pour un club "moyen" (followers medians du monde) ;
  // un club plus suivi va un peu plus vite, un petit club un peu moins vite (de 0.8x a 1.25x).
  const PAYBACK_WEEKS = 60;
  function medianFollowers(state) {
    const f = (state.teams || []).map((t) => Math.max(0, (t && t.followers) || 0)).filter((x) => x > 0).sort((a, b) => a - b);
    return f.length ? f[f.length >> 1] : 1;
  }
  function fanFactor(state) {
    const F = Math.max(1, clubFollowers(state)), M = Math.max(1, medianFollowers(state));
    return Math.max(0.8, Math.min(1.25, 1 + 0.15 * Math.log10(F / M)));
  }
  // gains d'une semaine (estimation affichee et paiement)
  function weekly(state, key, matches) {
    const F = clubFollowers(state), boost = 1 + 0.1 * Math.min(6, matches || 0);
    const money = round100((priceOf(state, key) / PAYBACK_WEEKS) * fanFactor(state));
    if (key === "store") return { money };
    const club = Math.round(Math.max(150, F * 0.0025) * boost);
    return { money, club, player: 0.004 * boost };
  }
  function pay(state, b, key, from, to) {
    const t = myTeam(state);
    if (!t) return;
    const n = matchesIn(state, from, to);
    const w = weekly(state, key, n);
    if (w.money) {
      t.budget = (t.budget || 0) + w.money;
      try { ledgerMine(state, t, key === "store" ? "sponsor" : "media", w.money, key === "store" ? tl("Club store sales") : tl("Stream studio revenue")); } catch (e) {}
    }
    const rec = b[key];
    rec.earned = (rec.earned || 0) + (w.money || 0);
    if (key === "studio") {
      t.followers = Math.max(0, t.followers || 0) + w.club;
      let pf = 0;
      for (const id of t.playerIds || []) {
        const p = playerById(state, id);
        if (!p || p.retired) continue;
        const add = Math.max(10, Math.round(Math.max(0, p.followers || 0) * w.player));
        p.followers = Math.max(0, p.followers || 0) + add;
        pf += add;
      }
      rec.followers = (rec.followers || 0) + w.club;
      rec.playerFollowers = (rec.playerFollowers || 0) + pf;
    }
    rec.weeks = (rec.weeks || 0) + 1;
    rec.last = { date: to, money: w.money || 0, club: w.club || 0, matches: n };
  }
  function tick(state) {
    if (!state || state.sacked) return;
    try { if (isPlayerCareer(state)) return; } catch (e) {}
    const b = bizOf(state);
    try { bootcampTick(state, b); } catch (e) { console.error("[rlc-mod] bootcamp", e); }
    for (const key of Object.keys(BUILDINGS)) {
      if (key === "bootcamp") continue;
      const rec = b[key];
      if (!rec || !rec.since) continue;
      if (rec.teamId != null && rec.teamId !== state.userTeamId) continue; // batiment d'un ancien club
      let guard = 0;
      while (cmpDate(addDays(rec.paidTo || rec.since, 7), state.currentDate) <= 0 && guard++ < 60) {
        const from = rec.paidTo || rec.since, to = addDays(from, 7);
        pay(state, b, key, from, to);
        rec.paidTo = to;
      }
    }
  }
  // ---------- bootcamp a louer ----------
  function lans(state) {
    const out = [];
    for (const e of state.events || []) if (e && (e.kind === "major" || e.kind === "worlds")) out.push({ key: "g" + e.id, name: e.name, startDate: e.startDate, ref: e });
    const m = state.rlcModes;
    for (const e of (m && m.events) || []) if (e && e.kind === "ewc") out.push({ key: "m" + e.id + "s" + state.season, name: e.name, startDate: e.startDate, ref: e });
    return out.sort((a, b) => cmpDate(a.startDate, b.startDate));
  }
  function pts(state, id) { try { return Math.max(0, rankingPoints(state, id) || 0); } catch (e) { return 0; } }
  // plus l'equipe est haut placee au classement RLCS, plus elle paie (jamais plus de 50k)
  function bootcampPrice(state, teamId) {
    const all = (state.teams || []).filter((t) => t && !t.national).map((t) => pts(state, t.id));
    const top = Math.max(1, ...all);
    const share = BOOTCAMP_MIN_SHARE + (1 - BOOTCAMP_MIN_SHARE) * Math.min(1, pts(state, teamId) / top);
    return Math.round(BOOTCAMP_MAX * share / 500) * 500 * scale(state);
  }
  // equipes de ta region qui joueront la LAN (le plateau si on le connait, sinon les mieux classees)
  function renters(state, lan) {
    const me = myTeam(state);
    if (!me) return [];
    const field = lan.ref && Array.isArray(lan.ref.field) && lan.ref.field.length ? lan.ref.field : null;
    let ids;
    if (field) ids = field.filter((id) => { const t = teamById(state, id); return t && t.region === me.region; });
    else if (lan.ref && lan.ref.mode === "3v3" && state.rlcModes && state.rlcModes.ewc && state.rlcModes.ewc.invites && state.rlcModes.ewc.invites.season === state.season)
      ids = state.rlcModes.ewc.invites.list.map((x) => x.teamId).filter((id) => { const t = teamById(state, id); return t && t.region === me.region; });
    else ids = (state.teams || []).filter((t) => t && !t.national && t.region === me.region).sort((a, b) => pts(state, b.id) - pts(state, a.id)).slice(0, 5).map((t) => t.id);
    return ids.filter((id) => id !== state.userTeamId);
  }
  function seasonRentals(state, rec) { return (rec.rentals || []).filter((r) => r.season === state.season).length; }
  function closeMail(state, id) {
    for (const m of state.inbox || []) if (m && m.data && m.data.rlcBootcamp === id) { m.resolved = true; m.unread = false; }
  }
  function bootcampTick(state, b) {
    const rec = b.bootcamp;
    if (!rec || !rec.since || rec.teamId !== state.userTeamId) return;
    rec.offers = rec.offers || []; rec.rentals = rec.rentals || []; rec.seen = rec.seen || {};
    // offres pas repondues a temps
    for (const o of rec.offers) if (o.status === "open" && cmpDate(state.currentDate, o.from) >= 0) { o.status = "expired"; closeMail(state, o.id); }
    if (seasonRentals(state, rec) >= BOOTCAMP_PER_SEASON) return;
    for (const lan of lans(state)) {
      // le club te contacte OFFER_LEAD jours avant le debut du sejour, pour avoir le temps de repondre
      const from = addDays(lan.startDate, -8), to = addDays(lan.startDate, -2), offerDay = addDays(from, -OFFER_LEAD);
      if (rec.seen[lan.key] || cmpDate(state.currentDate, offerDay) < 0 || cmpDate(state.currentDate, from) >= 0) continue;
      rec.seen[lan.key] = true;
      const ids = renters(state, lan);
      if (!ids.length) continue;
      // une equipe par LAN : souvent une des meilleures, pas toujours
      const rand = makeRand(nameSeed("rlc-bootcamp:" + lan.key + ":" + state.season));
      const weights = ids.map((id) => 1 + pts(state, id));
      let r = rand() * weights.reduce((x, y) => x + y, 0), pick = ids[0];
      for (let i = 0; i < ids.length; i++) { r -= weights[i]; if (r <= 0) { pick = ids[i]; break; } }
      const t = teamById(state, pick);
      const o = { id: (rec.nextId = (rec.nextId || 0) + 1), teamId: pick, team: t ? t.name : "?", lan: lan.name, from, to, price: bootcampPrice(state, pick), season: state.season, status: "open" };
      rec.offers.push(o);
      pushInbox(state, { type: "board", title: tl("{club} wants your bootcamp", { club: o.team }), data: { rlcBootcamp: o.id },
        body: tl("{club} would like to rent your bootcamp facility from {from} to {to} to prepare for {event}. They offer {money}. Answer here or in Office > Club business before {from}.", { club: o.team, from: pressDate(from), to: pressDate(to), event: tl(lan.name), money: fmtMoney(o.price) }) });
      break;
    }
    if (rec.offers.length > 30) rec.offers = rec.offers.slice(-30);
  }
  function answer(state, id, yes) {
    const b = bizOf(state), rec = b.bootcamp, t = myTeam(state);
    if (!rec || !t || rec.teamId !== t.id) return { ok: false, error: tl("The club has no bootcamp facility.") };
    const o = (rec.offers || []).find((x) => x.id === Number(id));
    if (!o || o.status !== "open") return { ok: false, error: tl("This offer is no longer open.") };
    if (!yes) { o.status = "declined"; closeMail(state, o.id); return { ok: true, declined: true }; }
    if (seasonRentals(state, rec) >= BOOTCAMP_PER_SEASON) return { ok: false, error: tl("The bootcamp is already booked {n} times this season.", { n: BOOTCAMP_PER_SEASON }) };
    o.status = "accepted"; closeMail(state, o.id);
    rec.rentals.push({ season: state.season, teamId: o.teamId, team: o.team, lan: o.lan, from: o.from, to: o.to, price: o.price });
    t.budget = (t.budget || 0) + o.price;
    rec.earned = (rec.earned || 0) + o.price;
    try { ledgerMine(state, t, "facility", o.price, tl("Bootcamp rented to {club}", { club: o.team })); } catch (e) {}
    return { ok: true, price: o.price };
  }
  function buy(state, key) {
    if (!state) return { ok: false, error: tl("No career.") };
    try { if (isPlayerCareer(state)) return { ok: false, error: tl("Only a manager can build for the club.") }; } catch (e) {}
    if (!BUILDINGS[key]) return { ok: false, error: tl("There is no such building.") };
    const b = bizOf(state), t = myTeam(state);
    if (!t) return { ok: false, error: tl("No club.") };
    if (b[key] && b[key].teamId === t.id) return { ok: false, error: tl("The club already has it.") };
    const cost = priceOf(state, key);
    if ((t.budget || 0) < cost) return { ok: false, error: tl("Not enough money: this costs {money}.", { money: fmtMoney(cost) }) };
    t.budget -= cost;
    try { ledgerMine(state, t, "facility", -cost, nameOf(key)); } catch (e) {}
    b[key] = { teamId: t.id, since: state.currentDate, paidTo: state.currentDate, paid: cost, earned: 0, weeks: 0 };
    if (key === "bootcamp") Object.assign(b[key], { offers: [], rentals: [] });
    pushInbox(state, { type: "board", title: tl("{name} is open", { name: nameOf(key) }),
      body: key === "bootcamp" ? tl("The bootcamp facility is ready. Teams from your region will ask to rent it the week before a LAN (Majors, Worlds, Esports World Cup), up to {n} a season.", { n: BOOTCAMP_PER_SEASON })
        : key === "store" ? tl("The club store is open. It brings in money every week, more as the club's following grows.")
        : tl("The stream studio is ready. Every week it brings in money and new followers for the club and the players, even more in weeks with matches.") });
    return { ok: true, key, cost };
  }
  // ce qu'affiche le Bureau
  function view(state) {
    if (!state) return null;
    try { if (isPlayerCareer(state)) return null; } catch (e) {}
    const b = bizOf(state), t = myTeam(state);
    if (!t) return null;
    const list = Object.keys(BUILDINGS).map((key) => {
      const rec = b[key] && b[key].teamId === t.id ? b[key] : null;
      if (key === "bootcamp") {
        const top = (state.teams || []).filter((x) => x && !x.national && x.region === t.region && x.id !== t.id).sort((a, c) => pts(state, c.id) - pts(state, a.id));
        const next = rec ? lans(state).find((l) => !(rec.seen || {})[l.key] && cmpDate(addDays(l.startDate, -8 - OFFER_LEAD), state.currentDate) >= 0) : null;
        return { key, name: nameOf(key), price: priceOf(state, key), owned: !!rec, since: rec ? rec.since : null, earned: rec ? rec.earned || 0 : 0,
          affordable: !rec && (t.budget || 0) >= priceOf(state, key), perSeason: BOOTCAMP_PER_SEASON, used: rec ? seasonRentals(state, rec) : 0,
          max: BOOTCAMP_MAX * scale(state), best: top[0] ? { team: top[0].name, price: bootcampPrice(state, top[0].id) } : null,
          low: top.length ? { team: top[top.length - 1].name, price: bootcampPrice(state, top[top.length - 1].id) } : null,
          next: next ? { name: next.name, date: addDays(next.startDate, -8 - OFFER_LEAD) } : null,
          offers: rec ? (rec.offers || []).filter((o) => o.status === "open").map((o) => Object.assign({}, o)) : [],
          rentals: rec ? (rec.rentals || []).slice(-12).reverse() : [], est: { money: 0 } };
      }
      const w = weekly(state, key, 0), wm = weekly(state, key, 2);
      return { key, name: nameOf(key), price: priceOf(state, key), owned: !!rec, since: rec ? rec.since : null, earned: rec ? rec.earned || 0 : 0,
        followers: rec ? rec.followers || 0 : 0, playerFollowers: rec ? rec.playerFollowers || 0 : 0, weeks: rec ? rec.weeks || 0 : 0, last: rec ? rec.last || null : null,
        est: { money: w.money, moneyMatch: wm.money, club: w.club || 0, clubMatch: wm.club || 0, player: w.player || 0 },
        affordable: !rec && (t.budget || 0) >= priceOf(state, key) };
    });
    return { budget: t.budget || 0, followers: t.followers || 0, list };
  }
  const prevAdvance = module.exports.advance;
  module.exports.advance = function (state) {
    const res = prevAdvance.apply(this, arguments);
    try { tick(state); } catch (e) { console.error("[rlc-mod] business", e); }
    return res;
  };
  module.exports.rlcBusiness = { tick, buy, view, weekly, answer, bootcampPrice, BUILDINGS };
})();
