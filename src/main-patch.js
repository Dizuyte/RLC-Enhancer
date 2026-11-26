/* RLC Enhancer (c) 2026 Milan. All rights reserved. Source published for reading only:
   no copy, reuse or redistribution without Milan's written permission. See LICENSE.txt. */

;/* ===== RLC ENHANCER (Claude) : budget transferts choisi au depart ===== */
(function () {
  let rlcPendingBudget = null;
  console.log("[rlc-mod] mod charge : budget de depart + remplacants auto (World editor)");
  try {
    ipcMain.handle("rlc-set-start-budget", (_e, v) => {
      const n = Number(v);
      rlcPendingBudget = v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : Math.max(0, Math.min(1e9, Math.round(n)));
      return { ok: true, budget: rlcPendingBudget };
    });
    const rlcOrigGenerate = engine.generateLeague;
    engine.generateLeague = function () {
      const st = rlcOrigGenerate.apply(this, arguments);
      try {
        if (rlcPendingBudget != null && st && Array.isArray(st.teams)) {
          const t = st.teams.find((x) => x.id === st.userTeamId);
          if (t) {
            const before = t.budget;
            t.budget = rlcPendingBudget;
            try {
              const a = engine.fmtMoney(before), b = engine.fmtMoney(rlcPendingBudget);
              for (const m of st.inbox || []) {
                if (m && m.type === "board" && typeof m.body === "string" && m.body.indexOf(a) >= 0) { m.body = m.body.replace(a, b); break; }
              }
            } catch (_x) {}
            console.log("[rlc-mod] start transfer budget", t.name, before, "->", rlcPendingBudget);
          }
        }
      } catch (err) { console.error("[rlc-mod] budget", err); }
      rlcPendingBudget = null;
      return st;
    };
  } catch (err) { console.error("[rlc-mod] main", err); }
})();

;/* ===== RLC ENHANCER (Claude) : offres de clubs (IPC) ===== */
(function () {
  try {
    console.log("[rlc-mod] offres de clubs actives");
    ipcMain.handle("rlc-job-accept", (_e, id) => {
      if (!state) return snapshot();
      let real = null;
      try { real = realOf(state); } catch (_x) {}
      const r = engine.rlcJobs.accept(state, id, real);
      if (r && r.ok) saveState();
      return { ...snapshot(), rlc: r };
    });
    ipcMain.handle("rlc-job-decline", (_e, id) => {
      if (!state) return snapshot();
      const r = engine.rlcJobs.decline(state, id == null ? null : id);
      saveState();
      return { ...snapshot(), rlc: r };
    });
    ipcMain.handle("rlc-jobs-ensure", () => {
      if (!state) return snapshot();
      engine.rlcJobs.tick(state);
      saveState();
      return snapshot();
    });
  } catch (err) { console.error("[rlc-mod] jobs ipc", err); }
})();

;/* ===== RLC ENHANCER (Claude) : RLCS 1v1 / 2v2 (IPC) ===== */
(function () {
  try {
    ipcMain.handle("rlc-modes-picks", (_e, picks) => {
      if (!state) return snapshot();
      const r = engine.rlcModes.setPicks(state, picks || {});
      if (r && r.ok) saveState();
      return { ...snapshot(), rlc: r };
    });
  } catch (err) { console.error("[rlc-mod] modes ipc", err); }
})();

/* ===== RLC ENHANCER : nom de la save = club actuel (sauf nom perso) + resume de carriere dans le snapshot ===== */
(function () {
  function syncSaveName() {
    if (!state || (engine.isPlayerCareer && engine.isPlayerCareer(state))) return;
    const hist = (state.rlcJobs && state.rlcJobs.history) || [];
    if (!hist.length) return;
    const cur = (state.teams || []).find((t) => t.id === state.userTeamId);
    if (!cur || saveName === cur.name) return;
    // nom par defaut = le nom d'un club par lequel on est passe ; sinon c'est un nom perso, on n'y touche pas
    const clubs = new Set();
    for (const h of hist) { clubs.add(h.from); clubs.add(h.to); }
    if (!saveName || clubs.has(saveName)) {
      saveName = String(cur.name).slice(0, 40);
      console.log("[rlc-mod] save renommee :", saveName);
    }
  }
  try {
    const prevSave = saveState;
    saveState = function () {
      try { syncSaveName(); } catch (e) { console.error("[rlc-mod] save name", e); }
      return prevSave.apply(this, arguments);
    };
  } catch (err) { console.error("[rlc-mod] saveState wrap", err); }
  try {
    const prevSnap = snapshot;
    snapshot = function () {
      const s = prevSnap.apply(this, arguments);
      try {
        if (s && state && engine.rlcCareer && !(engine.isPlayerCareer && engine.isPlayerCareer(state))) s.rlcCareer = engine.rlcCareer.summary(state);
      } catch (e) { console.error("[rlc-mod] career", e); }
      try {
        if (s && state && engine.rlcBusiness) s.rlcBiz = engine.rlcBusiness.view(state);
      } catch (e) { console.error("[rlc-mod] business view", e); }
      try { if (s && state) s.rlcTitles = rlcTitleView(); } catch (e) { console.error("[rlc-mod] titles view", e); }
      try {
        if (s && state && engine.rlcStaff) {
          s.rlcStaff = engine.rlcStaff.view(state);
          s.rlcMediaClash = engine.rlcStaff.mediaClashes(state);
          if (s.rlcStaff && s.scouting && typeof s.scouting === "object") s.scouting.slots = s.rlcStaff.hired;
        }
      } catch (e) { console.error("[rlc-mod] staff view", e); }
      return s;
    };
  } catch (err) { console.error("[rlc-mod] snapshot wrap", err); }
})();

/* ===== RLC ENHANCER : jouer le match 1v1/2v2 de ton joueur/duo (manche par manche) ===== */
ipcMain.handle("rlc-sim-game", (_e, arg) => {
  if (!state) return snapshot();
  let res = { ok: false };
  try { res = engine.rlcModes.simGame(state, !!(arg && arg.all)); } catch (err) { console.error("[rlc-mod] sim game", err); res = { ok: false, error: String(err && err.message || err) }; }
  if (res.ok) saveState();
  return Object.assign({}, snapshot(), { rlc: res, ok: res.ok, error: res.error });
});

/* ===== RLC ENHANCER : jouer / regarder le match 1v1/2v2 dans Rocket League (lanceur du jeu) ===== */
ipcMain.handle("rlc-play-match", async () => {
  if (!state) return { ok: false };
  if (state.pendingMatch != null) return { ok: false, error: tl("Finish the match you are in first.") };
  let fx = null;
  try { fx = engine.rlcModes.tempFixture(state, true); } catch (err) { console.error("[rlc-mod] play", err); }
  if (!fx) return { ok: false, error: tl("There is no 1v1/2v2 match to play.") };
  saveState();
  console.log("[rlc-mod] match " + (fx.rlcNames && fx.rlcNames.mode) + " lance dans Rocket League, fixture " + fx.id);
  playMatch(fx.id, false);
  return { ok: true, fixtureId: fx.id, botsInstalled: botsInstalled() };
});

/* ===== RLC ENHANCER : en mode "regarder", un 1v1 (2 bots) ou un 2v2 (4 bots) compte comme un match valide ===== */
function __rlcWatchOk(st) {
  try {
    const f = engine.fixtureById(state, state.pendingMatch);
    if (f && f.rlcTemp) {
      if (f.rlcNames && f.rlcNames.mode === "3v3") return null; // EWC : 6 bots, controle normal du jeu
      const n = f.rlcNames && f.rlcNames.mode === "1v1" ? 2 : 4;
      return st.bots === n && st.cars === n && st.blueCars === n / 2 && st.orangeCars === n / 2;
    }
  } catch (e) {}
  return null;
}

/* ===== RLC ENHANCER : batiments qui rapportent (boutique, studio de stream) ===== */
ipcMain.handle("rlc-biz-buy", (_e, key) => {
  if (!state) return snapshot();
  let r = { ok: false };
  try { r = engine.rlcBusiness.buy(state, String(key || "")); } catch (err) { console.error("[rlc-mod] buy", err); r = { ok: false, error: String(err && err.message || err) }; }
  if (r.ok) saveState();
  return Object.assign({}, snapshot(), { rlc: r });
});
ipcMain.handle("rlc-bootcamp-answer", (_e, id, yes) => {
  if (!state) return snapshot();
  let r = { ok: false };
  try { r = engine.rlcBusiness.answer(state, id, !!yes); } catch (err) { console.error("[rlc-mod] bootcamp", err); r = { ok: false, error: String(err && err.message || err) }; }
  if (r.ok) saveState();
  return Object.assign({}, snapshot(), { rlc: r });
});
/* ===== RLC ENHANCER : titre in-game choisi pour chaque joueur du club ===== */
function rlcTitleView() {
  const team = engine.teamById(state, state.userTeamId) || { playerIds: [] };
  const picks = state.rlcTitlePicks || {};
  const out = {};
  const ids = (team.playerIds || []).slice();
  if (state.userPlayerId != null && !ids.includes(state.userPlayerId)) ids.push(state.userPlayerId);
  for (const id of ids) {
    const p = engine.playerById(state, id);
    if (!p) continue;
    const list = titles.choices(p) || [];
    if (!list.length) continue;
    const auto = titles.chosen(Object.assign({}, p, { __rlcPick: null }));
    out[id] = { pick: picks[id] || null, auto: auto ? auto.display || auto.text : null, autoId: auto ? auto.id || "" : "",
      choices: list.map((x) => ({ key: x.key, display: x.display || x.text, year: x.year, id: x.id || "" })) };
  }
  return out;
}
ipcMain.handle("rlc-title-pick", (_e, pid, key) => {
  if (!state) return snapshot();
  const p = engine.playerById(state, Number(pid));
  if (p && (p.teamId === state.userTeamId || p.isUser || p.id === state.userPlayerId)) {
    state.rlcTitlePicks = state.rlcTitlePicks || {};
    const ok = key && (titles.choices(p) || []).some((x) => x.key === key);
    if (ok) state.rlcTitlePicks[p.id] = key; else delete state.rlcTitlePicks[p.id];
    saveState();
    try { if (typeof exportTitles === "function") exportTitles(); } catch (e) {}
  }
  return snapshot();
});
/* ===== RLC ENHANCER : Archives (onglet facon Liquipedia) ===== */
ipcMain.handle("rlc-archive", (_e, q) => {
  if (!state || !engine.rlcArchive) return null;
  q = q || {};
  try {
    if (q.team != null) return { team: engine.rlcArchive.team(state, q.team), seasons: engine.rlcArchive.seasons(state) };
    return { seasons: engine.rlcArchive.seasons(state), season: engine.rlcArchive.season(state, q.season == null ? state.season : Number(q.season)) };
  } catch (err) { console.error("[rlc-mod] archive", err); return { error: String(err && err.message || err) }; }
});

/* ===== RLC ENHANCER : staff du club (coach d'entrainement, niveaux des scouts) ===== */
ipcMain.handle("rlc-staff", (_e, act) => {
  if (!state || !engine.rlcStaff) return snapshot();
  act = act || {};
  let r = { ok: false };
  try {
    if (act.kind === "coach") r = engine.rlcStaff.hireCoach(state, !!act.yes);
    else if (act.kind === "scout") r = engine.rlcStaff.setScoutLevel(state, act.id, act.level);
  } catch (err) { console.error("[rlc-mod] staff", err); r = { ok: false, error: String(err && err.message || err) }; }
  if (r.ok) saveState();
  return Object.assign({}, snapshot(), { rlc: r });
});

/* ===== RLC ENHANCER : plugin BakkesMod du mod =====
   rlcbotcam : camera de pro pour les bots. La DLL est copiee dans BakkesMod et chargee
   au lancement de Rocket League (cfg/plugins.cfg). */
const __rlcPlugins = (function () {
  function bmRoot() {
    try { const d = typeof bmDir === "function" ? bmDir() : null; if (d && fs.existsSync(d)) return d; } catch (e) {}
    return path.join(process.env.APPDATA || "", "bakkesmod", "bakkesmod");
  }
  function dll(name) {
    const list = [];
    try { list.push(path.join(process.resourcesPath, "rlc", name + ".dll")); } catch (e) {}
    try { list.push(path.join(__dirname, "..", "rlc", name + ".dll")); } catch (e) {}
    return list.find((f) => { try { return fs.existsSync(f); } catch (e) { return false; } }) || null;
  }
  function deploy(name) {
    try {
      const bm = bmRoot();
      const src = dll(name);
      if (!src || !fs.existsSync(bm)) return false;
      const dst = path.join(bm, "plugins", name + ".dll");
      let copy = true;
      try { copy = !(fs.existsSync(dst) && fs.readFileSync(dst).equals(fs.readFileSync(src))); } catch (e) {}
      if (copy) { try { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); } catch (e) { console.log("[rlc-mod] " + name + " not copied (Rocket League has it loaded): " + e.message); } }
      if (!fs.existsSync(dst)) return false;
      const cfg = path.join(bm, "cfg", "plugins.cfg");
      if (fs.existsSync(cfg)) {
        const txt = fs.readFileSync(cfg, "utf8");
        if (!new RegExp("^\\s*plugin\\s+load\\s+" + name + "\\b", "im").test(txt)) {
          fs.appendFileSync(cfg, (txt.endsWith("\n") || !txt ? "" : "\n") + "plugin load " + name + "\n", "utf8");
        }
      }
      return true;
    } catch (e) { console.log("[rlc-mod] " + name + ": " + e.message); return false; }
  }
  // la 1.3-dev chargeait aussi le plugin de nom de RL Career+ : on retire la ligne qu'elle avait ajoutee
  function cleanupOld() {
    try {
      const cfg = path.join(bmRoot(), "cfg", "plugins.cfg");
      if (!fs.existsSync(cfg)) return;
      const txt = fs.readFileSync(cfg, "utf8");
      const out = txt.replace(/^[ \t]*plugin[ \t]+load[ \t]+rlcareerplus[ \t]*\r?\n?/gim, "");
      if (out !== txt) fs.writeFileSync(cfg, out, "utf8");
    } catch (e) {}
  }
  try {
    if (rcon && typeof rcon.send === "function" && !rcon.__rlcPlugins) {
      rcon.__rlcPlugins = true;
      const base = rcon.send.bind(rcon);
      rcon.send = function (cmds, opts) {
        try {
          const arr = Array.isArray(cmds) ? cmds : [];
          if (arr.some((c) => typeof c === "string" && c.indexOf("rlcareer_arm") === 0)) deploy("rlcbotcam");
        } catch (e) { console.error("[rlc-mod] plugins", e); }
        return base(cmds, opts);
      };
    }
  } catch (e) { console.error("[rlc-mod] plugins hook", e); }
  // au demarrage : le plugin est en place avant que Rocket League se lance
  try { cleanupOld(); deploy("rlcbotcam"); } catch (e) {}
  return { deploy };
})();
