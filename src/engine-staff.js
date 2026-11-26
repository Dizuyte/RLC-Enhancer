
;/* ===== RLC ENHANCER : staff du club (coach, scouts par niveau), entretien des installations, alerte medias ===== */
(function () {
  const MAINT_RATE = 0.015;            // entretien : 1,5 % par mois du prix de l'installation la plus chere achetee
  const COACH_WAGE = 750;              // coach d'entrainement : 750 $ par semaine
  const SCOUT_LEVELS = [               // niveau d'un scout : salaire par semaine et vitesse
    { wage: 0, speed: 0 },
    { wage: 500, speed: 1 },
    { wage: 700, speed: 1.2 },
    { wage: 1000, speed: 1.5 },
  ];
  const COACH_NAMES = ["Sam Okafor", "Lena Brandt", "Hugo Marchetti", "Jonas Vik", "Inès Laurent", "Kai Moreno"];
  function scale(state) { try { return realMoney(state) ? 1 : FACILITY_LEGACY_SCALE; } catch (e) { return 1; } }
  function manager(state) { try { return !!state && !isPlayerCareer(state); } catch (e) { return !!state; } }
  function myTeam(state) { return state ? teamById(state, state.userTeamId) : null; }
  function rec(state) {
    if (!state.rlcStaff || typeof state.rlcStaff !== "object") state.rlcStaff = {};
    return state.rlcStaff;
  }
  // ce que le club a paye depuis le dernier mail du 1er (pour le recap mensuel)
  function spend(state, k, name, amount) {
    if (!amount) return;
    const r = rec(state);
    if (!Array.isArray(r.spent)) r.spent = [];
    const hit = r.spent.find((x) => x.k === k && (x.name || "") === (name || ""));
    if (hit) hit.amount += amount; else r.spent.push({ k, name: name || "", amount });
  }
  function charge(state, amount, kind, label, k, name) {
    const t = myTeam(state);
    if (!t || !amount) return;
    if (k) spend(state, k, name, amount);
    t.budget = Math.round((t.budget || 0) - amount);
    try { ledgerMine(state, t, kind, -amount, label); } catch (e) { try { pushLedger(state, kind, -amount, label); } catch (e2) {} }
  }

  // ---------- scouts par niveau ----------
  function scouts(state) { return staffList(state).filter((s) => s.role === "scout"); }
  function levelOf(s) { return Math.max(0, Math.min(3, (s && s.rlcLevel) | 0)); }
  function scoutWage(state, lvl) { return SCOUT_LEVELS[lvl].wage * scale(state); }
  function migrate(state) {
    if (!state || !manager(state)) return;
    const r = rec(state);
    try { seedStaff(state); } catch (e) {}
    if (!r.scoutsInit) {
      // une carriere qui commence aujourd'hui part sans scout ; une save existante garde ses scouts au niveau 1
      const fresh = state.startDate && state.currentDate === state.startDate;
      for (const s of scouts(state)) if (s.rlcLevel == null) s.rlcLevel = fresh ? 0 : 1;
      r.scoutsInit = state.currentDate || true;
    }
    for (const s of scouts(state)) {
      if (s.rlcLevel == null) s.rlcLevel = 1;
      s.wage = scoutWage(state, levelOf(s));
    }
    const coach = staffList(state).find((s) => s.role === "coach");
    if (coach) coach.wage = COACH_WAGE * scale(state);
  }
  freeScout = function (state) {
    const busy = new Set(((state.scouts && state.scouts.jobs) || []).map((j) => j.scoutId).filter((x) => x != null));
    const free = scouts(state).filter((s) => levelOf(s) >= 1 && !busy.has(s.id)).sort((a, b) => levelOf(b) - levelOf(a));
    return free.length ? free[0].id : null;
  };
  const baseStart = startScouting;
  startScouting = function (state, pid, rand) {
    migrate(state);
    if (manager(state)) {
      const hired = scouts(state).filter((s) => levelOf(s) >= 1);
      if (!hired.length) return { ok: false, error: tl("You have no scout. Hire one in the Scouting window.") };
      if (freeScout(state) == null) return { ok: false, error: tln("Your {n} scout is busy. Recall one first.", "All {n} of your scouts are busy. Recall one first.", hired.length) };
    }
    const res = baseStart.apply(this, arguments);
    try {
      if (res && res.ok && !res.resumed && state.scouts) {
        const job = state.scouts.jobs[state.scouts.jobs.length - 1];
        const s = job && scouts(state).find((x) => x.id === job.scoutId);
        const sp = s ? SCOUT_LEVELS[levelOf(s)].speed || 1 : 1;
        if (job && sp > 1) {
          const days = Math.max(1, Math.round(daysBetween(job.startDate, job.endDate) / sp));
          job.endDate = addDays(job.startDate, days);
          res.days = days;
        }
      }
    } catch (e) { console.error("[rlc-mod] scout speed", e); }
    return res;
  };
  module.exports.startScouting = startScouting;
  const baseRoster = scoutRoster;
  scoutRoster = function (state) {
    migrate(state);
    const lv = new Map(scouts(state).map((s) => [s.id, levelOf(s)]));
    return baseRoster.apply(this, arguments)
      .filter((r) => !manager(state) || (lv.get(r.id) || 0) >= 1)
      .map((r) => Object.assign({}, r, { level: lv.get(r.id) || 0, name: r.name + " · " + tl("Lv. {n}", { n: lv.get(r.id) || 0 }) }));
  };
  module.exports.scoutRoster = scoutRoster;
  function setScoutLevel(state, id, lvl) {
    if (!manager(state)) return { ok: false, error: tl("Only a manager can hire staff.") };
    migrate(state);
    const s = scouts(state).find((x) => x.id === Number(id));
    lvl = Number(lvl);
    if (!s || !(lvl >= 0 && lvl <= 3)) return { ok: false, error: tl("No such scout.") };
    const busy = ((state.scouts && state.scouts.jobs) || []).some((j) => j.scoutId === s.id);
    if (lvl === 0 && busy) return { ok: false, error: tl("{name} is out watching a player. Recall him first.", { name: s.name }) };
    s.rlcLevel = lvl;
    s.wage = scoutWage(state, lvl);
    return { ok: true, level: lvl };
  }

  // ---------- coach d'entrainement ----------
  function coachOf(state) { return staffList(state).find((s) => s.role === "coach") || null; }
  function hireCoach(state, yes) {
    if (!manager(state)) return { ok: false, error: tl("Only a manager can hire staff.") };
    const list = staffList(state);
    const cur = coachOf(state);
    if (!yes) {
      if (cur) state.staff = list.filter((s) => s !== cur);
      return { ok: true, hired: false };
    }
    if (cur) return { ok: false, error: tl("The club already has a training coach.") };
    const t = myTeam(state);
    if (!t) return { ok: false, error: tl("No club.") };
    let seed = 0;
    for (const ch of String(state.userTeamId) + ":" + state.currentDate) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const id = list.reduce((m, s) => Math.max(m, s.id | 0), 0) + 1;
    list.push({ id, role: "coach", name: COACH_NAMES[seed % COACH_NAMES.length], wage: COACH_WAGE * scale(state), since: state.currentDate });
    rec(state).coachPaidTo = state.currentDate;
    return { ok: true, hired: true };
  }
  // les joueurs qui progressent le plus : ceux qui ont le plus de marge avant leur plafond
  function fillSlots(state, rand) {
    const plan = trainingPlan(state);
    const used = new Set(plan.map((s) => s.pid).filter((x) => x != null));
    if (used.size >= plan.length) return 0;
    const held = (() => { try { return trainingHeld(state); } catch (e) { return {}; } })();
    const pool = trainableIds(state).filter((id) => !used.has(id) && !held[id]).map((id) => playerById(state, id)).filter(Boolean)
      .map((p) => ({ p, room: (function () { try { return reachableCeiling(p) - (p.ratingExact == null ? p.rating : p.ratingExact); } catch (e) { return 0; } })() }))
      .filter((x) => x.room > 0)
      .sort((a, b) => b.room - a.room);
    let n = 0;
    for (let i = 0; i < plan.length && pool.length; i++) {
      if (plan[i].pid != null) continue;
      const r = setTrainingSlot(state, i, pool.shift().p.id, rand);
      if (r && r.ok) n++;
    }
    return n;
  }
  function coachTick(state, rand) {
    if (!coachOf(state)) return;
    if (!trainingReady(state)) return;
    const r = rec(state);
    const filled = fillSlots(state, rand);
    const res = runTraining(state, rand);
    if (res && res.ok) r.coachLast = { date: state.currentDate, trained: res.trained, filled };
  }

  // ---------- entretien des installations ----------
  function maintenanceFor(state, price) { return Math.round((price || 0) * MAINT_RATE); }
  function currentMaintenance(state) {
    const f = currentFacility(state);
    return f ? maintenanceFor(state, facilityPrice(state, f)) : 0;
  }
  // une avance peut sauter plusieurs jours d'un coup : on paie des qu'on est dans un nouveau mois
  function maintenanceTick(state) {
    const month = String(state.currentDate).slice(0, 7);
    const r = rec(state);
    if (!r.maintPaid) { r.maintPaid = month; return; }
    if (r.maintPaid >= month) return;
    r.maintPaid = month;
    const f = currentFacility(state);
    const amount = currentMaintenance(state);
    if (f && amount) charge(state, amount, "facility", tl("Rent: {name}", { name: facilityName(f) }), "rent", facilityName(f));
  }
  const baseBoard = facilityBoard;
  facilityBoard = function (state) {
    const b = baseBoard.apply(this, arguments);
    try {
      if (b && Array.isArray(b.list)) {
        for (const it of b.list) it.upkeep = maintenanceFor(state, it.price);
        b.upkeep = currentMaintenance(state);
        b.upkeepRate = MAINT_RATE;
      }
    } catch (e) {}
    return b;
  };
  module.exports.facilityBoard = facilityBoard;

  // ---------- salaires du staff hors mode realisme (le jeu ne paie les salaires qu'en realisme) ----------
  function wagesTick(state) {
    const r = rec(state);
    if (!r.wagePaidTo) r.wagePaidTo = state.currentDate;
    let guard = 0;
    while (cmpDate(addDays(r.wagePaidTo, 7), state.currentDate) <= 0 && guard++ < 60) {
      r.wagePaidTo = addDays(r.wagePaidTo, 7);
      if (realism(state)) continue; // en realisme, le jeu paie deja ces salaires avec les autres
      const coach = coachOf(state);
      const sc = scouts(state).reduce((n, s) => n + (s.wage || 0), 0);
      if (coach && coach.wage) charge(state, coach.wage, "wages", tl("Training coach"), "coach");
      if (sc) charge(state, sc, "wages", tl("Scouts"), "scouts");
    }
  }

  // ---------- alerte : un joueur envoye aux medias manque un tournoi ----------
  function inWindow(day, from, to) { return cmpDate(day, from) >= 0 && cmpDate(day, to) <= 0; }
  function overlapDays(from, to, s, e, weekendsOnly) {
    let d = cmpDate(s, from) > 0 ? s : from;
    const end = cmpDate(e, to) < 0 ? e : to;
    let guard = 0;
    while (cmpDate(d, end) <= 0 && guard++ < 400) {
      if (!weekendsOnly) return d;
      const w = dayOfWeek(d);
      if (w === 0 || w === 6) return d;
      d = addDays(d, 1);
    }
    return null;
  }
  function mediaClashes(state) {
    const out = {};
    if (!state || !manager(state)) return out;
    const team = state.userTeamId;
    const offers = (state.mediaOffers || []).filter((o) => o && !o.accepted && !(o.expires < state.currentDate));
    if (!offers.length) return out;
    const evs = [];
    for (const e of state.events || []) {
      if (!e || e.stage === "done" || !e.startDate) continue;
      const field = Array.isArray(e.field) ? e.field : [];
      const inField = field.some((f) => f === team || (f && (f.teamId === team || f.id === team)));
      const regional = !e.international && e.kind === "open";
      let sure = inField || regional;
      let maybe = !sure && e.international && !field.length;
      if (!sure && !maybe) continue;
      evs.push({ name: e.name, startDate: e.startDate, endDate: e.endDate || e.startDate, maybe: !sure, mode: "3v3" });
    }
    const m = state.rlcModes;
    for (const e of (m && m.events) || []) {
      if (!e || e.stage === "done" || e.stage === "skipped") continue;
      const isMode = e.mode === "1v1" || e.mode === "2v2";
      const picks = (m.picks && (e.mode === "1v1" ? m.picks.solo : m.picks.duo)) || [];
      evs.push({ name: e.name, startDate: e.startDate, endDate: e.endDate || e.startDate, maybe: !isMode && (e.kind === "ewc" || e.kind === "ewclcq"), mode: e.mode, pids: isMode ? picks : null });
    }
    for (const o of offers) {
      const days = o.kind === "campaign" ? (o.weeks || 0) * 7 : (o.days || 0);
      const from = state.currentDate, to = addDays(state.currentDate, Math.max(1, days) - 1);
      const weekendsOnly = o.kind === "campaign";
      const list = [];
      for (const e of evs) {
        if (e.pids && !e.pids.includes(o.pid)) continue;
        const hit = overlapDays(from, to, e.startDate, e.endDate, weekendsOnly);
        if (hit) list.push({ name: e.name, date: hit, startDate: e.startDate, maybe: e.maybe, mode: e.mode });
      }
      for (const f of state.fixtures || []) {
        if (!f || f.played || f.rlcTemp || f.eventId != null) continue;
        if (f.homeId !== team && f.awayId !== team) continue;
        if (!inWindow(f.date, from, to)) continue;
        if (weekendsOnly) { const w = dayOfWeek(f.date); if (w !== 0 && w !== 6) continue; }
        list.push({ name: tl("Match"), date: f.date, startDate: f.date, maybe: false, mode: "3v3" });
      }
      if (list.length) out[o.id] = { until: to, list: list.sort((a, b) => cmpDate(a.date, b.date)) };
    }
    return out;
  }

  function view(state) {
    if (!state || !manager(state)) return null;
    migrate(state);
    const coach = coachOf(state);
    const r = rec(state);
    const jobs = (state.scouts && state.scouts.jobs) || [];
    return {
      coach: coach ? { name: coach.name, since: coach.since || null, wage: coach.wage, last: r.coachLast || null } : null,
      coachWage: COACH_WAGE * scale(state),
      scouts: scouts(state).map((s) => {
        const job = jobs.find((j) => j.scoutId === s.id);
        const p = job ? playerById(state, job.playerId) : null;
        return { id: s.id, name: s.name, level: levelOf(s), wage: s.wage || 0, watching: p ? p.name : null };
      }),
      levels: SCOUT_LEVELS.map((l, i) => ({ level: i, wage: l.wage * scale(state), speed: l.speed })),
      hired: scouts(state).filter((s) => levelOf(s) >= 1).length,
      realism: realism(state),
      budget: (myTeam(state) || {}).budget || 0,
      upkeep: currentMaintenance(state),
    };
  }

  // le 1er du mois : mail qui recapitule ce que le club a paye
  function expensesTick(state) {
    const month = String(state.currentDate).slice(0, 7);
    const r = rec(state);
    if (r.mailMonth && r.mailMonth >= month) return;
    // salaires du jeu de base (mode realisme), payes le 1er de ce mois
    for (const l of state.ledger || []) {
      if (l && String(l.date).slice(0, 7) === month && l.date <= state.currentDate && l.kind === "wages" && l.amount < 0 && l.note !== tl("Training coach") && l.note !== tl("Scouts")) spend(state, "wages", "", -l.amount);
    }
    let from = r.mailFrom;
    if (!from) { const d = new Date(month + "-01T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() - 1); from = d.toISOString().slice(0, 10); }
    const lines = (r.spent || []).filter((x) => x.amount > 0);
    r.mailMonth = month;
    r.mailFrom = addDays(state.currentDate, 1);
    r.spent = [];
    if (!lines.length) return;
    const order = { wages: 0, coach: 1, scouts: 2, rent: 3 };
    lines.sort((a, b) => (order[a.k] ?? 9) - (order[b.k] ?? 9));
    const total = lines.reduce((n, x) => n + x.amount, 0);
    const t = myTeam(state);
    pushInbox(state, {
      type: "board",
      title: tl("Monthly expenses: {money} paid", { money: fmtMoney(total) }),
      body: tl("Here is what the club paid between {from} and {to}.", { from, to: state.currentDate }) + " " + tl("Total: {money}.", { money: fmtMoney(total) }),
      data: { rlcExpenses: { from, to: state.currentDate, lines, total, budget: (t && t.budget) || 0 } },
    });
  }

  const prevAdvance = module.exports.advance;
  module.exports.advance = function (state, rand) {
    const res = prevAdvance.apply(this, arguments);
    try {
      if (state && !state.sacked && manager(state)) {
        migrate(state);
        maintenanceTick(state);
        wagesTick(state);
        coachTick(state, typeof rand === "function" ? rand : Math.random);
        expensesTick(state);
      }
    } catch (e) { console.error("[rlc-mod] staff", e); }
    return res;
  };
  module.exports.rlcStaff = { view, hireCoach, setScoutLevel, mediaClashes, migrate, fillSlots, MAINT_RATE, COACH_WAGE, SCOUT_LEVELS };
})();
