/* RLC Enhancer (c) 2026 Milan. All rights reserved. Source published for reading only:
   no copy, reuse or redistribution without Milan's written permission. See LICENSE.txt. */

;/* ===== RLC ENHANCER (Claude) : equipe sur mesure + budget de depart ===== */
(function () {
  "use strict";
  // ---------- 1. Budget transferts au depart de la carriere ----------
  var RLC_BUDGETS = [
    { id: "club", k: "Club's own", v: "Usual budget", vt: true },
    { id: "small", k: "Small", v: "$250K", value: 250000 },
    { id: "mid", k: "Mid", v: "$1M", value: 1000000 },
    { id: "big", k: "Big", v: "$3M", value: 3000000 },
    { id: "free", k: "Custom", v: "Any amount", vt: true },
  ];
  var rlcBudget = { mode: "club", free: "" };
  function rlcEsc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function rlcParseMoney(txt) {
    var s = String(txt || "").trim().toLowerCase().replace(/[$€\s]/g, "").replace(",", ".");
    if (!s) return null;
    var m = s.match(/^(\d+(?:\.\d+)?)(k|m|md|b)?$/);
    if (!m) return null;
    var n = parseFloat(m[1]);
    var mult = { k: 1e3, m: 1e6, md: 1e9, b: 1e9 }[m[2]] || 1;
    n = Math.round(n * mult);
    if (!isFinite(n) || n < 0) return null;
    return Math.min(n, 1e9);
  }
  function rlcFmt(n) {
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(n >= 1e7 || n % 1e6 === 0 ? 0 : 1) + "M";
    if (n >= 1e3) return "$" + Math.round(n / 1e3) + "K";
    return "$" + n;
  }
  function rlcBudgetValue() {
    if (rlcBudget.mode === "free") return rlcParseMoney(rlcBudget.free);
    var b = RLC_BUDGETS.find(function (x) { return x.id === rlcBudget.mode; });
    return b && b.value != null ? b.value : null;
  }
  function rlcBudgetNote() {
    if (rlcBudget.mode === "club") return tl("The club keeps its usual transfer budget.");
    var v = rlcBudgetValue();
    if (v == null) return tl("Type an amount, for example 1500000, 750K or 2.5M.");
    return tl("Transfer budget at the start: {amount}.", { amount: rlcFmt(v) });
  }
  function rlcBudgetHtml() {
    return (
      '<div class="pre-field rlc-budget">' +
      '<span id="rlc-budget-label">' + rlcEsc(tl("Starting transfer budget")) + "</span>" +
      '<div class="pre-series" role="group" aria-labelledby="rlc-budget-label">' +
      RLC_BUDGETS.map(function (b) {
        var on = b.id === rlcBudget.mode;
        return (
          '<button class="pre-diff' + (on ? " on" : "") + '" data-action="rlc-budget" data-id="' + b.id +
          '" aria-pressed="' + on + '"><span class="pre-diff-k">' + rlcEsc(tl(b.k)) +
          '</span><span class="pre-diff-v">' + rlcEsc(b.vt ? tl(b.v) : b.v) + "</span></button>"
        );
      }).join("") +
      "</div>" +
      (rlcBudget.mode === "free"
        ? '<input id="rlc-budget-free" type="text" inputmode="decimal" maxlength="16" placeholder="' + rlcEsc(tl("e.g. 1.5M")) + '" value="' +
          rlcEsc(rlcBudget.free) + '" style="margin-top:8px">'
        : "") +
      '<div class="pre-note" id="rlc-budget-note" aria-live="polite">' + rlcEsc(rlcBudgetNote()) + "</div>" +
      "</div>"
    );
  }
  try {
    var rlcOrigStart = preStartHtml;
    preStartHtml = function () {
      var html = rlcOrigStart.apply(this, arguments);
      var anchor = '<button class="btn primary pre-go"';
      return html.indexOf(anchor) >= 0 ? html.replace(anchor, rlcBudgetHtml() + anchor) : html;
    };
  } catch (e) { console.error("[rlc-mod] budget UI", e); }

  document.addEventListener("click", function (ev) {
    var el = ev.target && ev.target.closest ? ev.target.closest('[data-action="rlc-budget"]') : null;
    if (el) {
      ev.preventDefault(); ev.stopPropagation();
      rlcBudget.mode = el.dataset.id || "club";
      render();
      if (rlcBudget.mode === "free") setTimeout(function () { var i = document.getElementById("rlc-budget-free"); if (i) i.focus(); }, 0);
      return;
    }
    var go = ev.target && ev.target.closest ? ev.target.closest('[data-action="pre-start"]') : null;
    if (go && window.rlcMod) {
      if (rlcBudget.mode === "free" && rlcBudgetValue() == null) {
        ev.preventDefault(); ev.stopPropagation();
        showToast(tl("Invalid budget amount. Examples: 1500000, 750K, 2.5M"), "error");
        return;
      }
      try { window.rlcMod.setStartBudget(rlcBudgetValue()); } catch (e) { console.error("[rlc-mod]", e); }
    }
  }, true);
  document.addEventListener("input", function (ev) {
    if (ev.target && ev.target.id === "rlc-budget-free") {
      rlcBudget.free = ev.target.value;
      var n = document.getElementById("rlc-budget-note");
      if (n) n.textContent = rlcBudgetNote();
    }
  }, true);

  // ---------- 2. World editor : joueur "vole" => l'IA bouche le trou ----------
  function rlcRating(ref) {
    try { var v = wPlayerView(ref); return v && v.rating != null ? Number(v.rating) : null; } catch (e) { return null; }
  }
  function rlcPickSub(stolenRef, place, avoid) {
    var placed = wPlacement();
    var target = rlcRating(stolenRef);
    var pool = [];
    (wEd.freeAgents || []).forEach(function (f) { if (f && f.ref) pool.push({ ref: f.ref, rating: f.rating, fa: true }); });
    (wEd.base || []).forEach(function (reg) {
      (reg.teams || []).forEach(function (t) {
        (t.players || []).forEach(function (p) { if (p && p.ref) pool.push({ ref: p.ref, rating: p.rating, fa: false }); });
      });
    });
    var best = null, bestScore = Infinity;
    pool.forEach(function (c) {
      if (placed.has(c.ref) || c.ref === stolenRef || avoid.indexOf(c.ref) >= 0) return;
      var r = c.rating == null ? null : Number(c.rating);
      var score = target == null || r == null ? 50 : Math.abs(r - target) + (r > target ? 0.25 : 0);
      if (!c.fa) score += 0.5; // on prefere un agent libre a un pro sans club
      if (score < bestScore) { bestScore = score; best = c; }
    });
    return best ? best.ref : null;
  }
  try {
    wAssign = function (team, slot, ref) {
      var roster = wRoster(team), current = roster[slot];
      if (current === ref) return;
      var place = wPlacement().get(ref);
      if (place && place.team === team) {
        roster[place.slot] = current; roster[slot] = ref; wSetRoster(team, roster);
        return;
      }
      if (place) {
        var other = wRoster(place.team);
        var sub = rlcPickSub(ref, place, [current]);
        other[place.slot] = sub || current;
        wSetRoster(place.team, other);
        if (sub) {
          try {
            var a = wPlayerView(ref), b = wPlayerView(sub);
            if (a && b) showToast(tl("{player} joins {club}. {sub} replaces him at {other}.", { player: a.name, club: wTeamName(team), sub: b.name, other: wTeamName(place.team) }));
          } catch (e) {}
        }
      }
      roster[slot] = ref;
      wSetRoster(team, roster);
    };
  } catch (e) { console.error("[rlc-mod] world editor", e); }
})();

;/* ===== RLC ENHANCER (Claude) : offres de clubs (UI) ===== */
(function () {
  "use strict";
  var ui = { open: false, confirm: null, busy: false, ensured: false };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function career() { return S && S.career ? S.career : null; }
  function offers() { var c = career(); return c && c.rlcJobs && Array.isArray(c.rlcJobs.offers) ? c.rlcJobs.offers : []; }
  function date(d) { try { return fmtDateShort(d); } catch (e) { return d; } }
  function offerCard(o, sacked) {
    var c1 = (o.colors && o.colors[0]) || "#444", c2 = (o.colors && o.colors[1]) || "#fff";
    var confirming = ui.confirm === o.id;
    var meta = [esc(tl(o.regionName)), esc(tl(o.label))];
    if (o.regionPos) meta.push(esc(tl("{pos} of {n} in their region", { pos: ordinal(o.regionPos), n: o.regionN })));
    return (
      '<div class="rlc-offer" style="border:1px solid var(--line,#5c3878);border-radius:var(--r-lg,10px);padding:12px 14px;margin:10px 0;text-align:left;background:var(--panel-2,#4b2764);color:var(--text,#fff)">' +
      '<div style="display:flex;align-items:center;gap:10px">' +
      '<span aria-hidden="true" style="width:28px;height:28px;border-radius:6px;flex:none;background:linear-gradient(135deg,' + esc(c1) + " 50%," + esc(c2) + ' 50%)"></span>' +
      '<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:16px">' + esc(o.name) + "</div>" +
      '<div style="opacity:.7;font-size:12px">' + meta.join(" · ") + "</div></div></div>" +
      '<div style="display:flex;gap:18px;margin:10px 0 6px;font-size:13px;flex-wrap:wrap">' +
      '<div><div style="opacity:.6">' + esc(tl("Transfer budget")) + "</div><b>" + esc(o.budgetText) + "</b></div>" +
      '<div><div style="opacity:.6">' + esc(tl("Wage budget")) + "</div><b>" + esc(tl("{amount} a week", { amount: o.wageText })) + "</b></div>" +
      (o.expires && !sacked ? '<div><div style="opacity:.6">&nbsp;</div><span>' + esc(tl("Expires {date}", { date: date(o.expires) })) + "</span></div>" : "") +
      "</div>" +
      (o.lineup && o.lineup.length ? '<div style="font-size:12px;opacity:.75">' + esc(tl("Starters: {names}", { names: o.lineup.join(", ") })) + "</div>" : "") +
      (o.why ? '<div style="font-size:12px;opacity:.6;margin-top:4px">' + esc(tl(o.why)) + "</div>" : "") +
      '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">' +
      '<button class="btn primary" data-rlc-accept="' + o.id + '"' + (ui.busy ? " disabled" : "") + ">" +
      esc(confirming ? tl("Confirm: sign for {club}", { club: o.name }) : tl("Accept")) + "</button>" +
      (sacked ? "" : '<button class="btn" data-rlc-decline="' + o.id + '"' + (ui.busy ? " disabled" : "") + ">" + esc(tl("Decline")) + "</button>") +
      "</div></div>"
    );
  }
  function modalHtml() {
    var c = career(), list = offers(), me = c ? (c.teams || []).find(function (t) { return t.id === c.userTeamId; }) : null;
    return (
      '<div style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99998;display:flex;align-items:center;justify-content:center" data-rlc-close="1">' +
      '<div class="card" role="dialog" aria-modal="true" aria-labelledby="rlc-jobs-title" style="width:min(560px,92vw);max-height:86vh;overflow:auto;padding:18px 20px;background:var(--panel,#3f2054);color:var(--text,#fff);border-radius:var(--r-sm,4px)">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><h2 id="rlc-jobs-title" style="margin:0;font-size:20px">' + esc(tl("Club offers")) + "</h2>" +
      '<button class="btn" data-rlc-close="1" aria-label="' + esc(tl("Close")) + '">✕</button></div>' +
      '<div style="opacity:.7;font-size:13px;margin-top:4px">' + esc(tl("Clubs want you as their manager. If you move, your player comes with you.")) + "</div>" +
      list.map(function (o) { return offerCard(o, false); }).join("") +
      '<button class="btn" style="width:100%;margin-top:6px" data-rlc-decline-all="1">' + esc(tl("Stay at {club}", { club: me ? me.name : "" })) + "</button>" +
      "</div></div>"
    );
  }
  function syncUi() {
    var c = career();
    var show = !!(c && !c.sacked && c.pendingMatch == null && offers().length);
    var fab = document.getElementById("rlc-jobs-fab");
    if (!fab) {
      fab = document.createElement("button");
      fab.id = "rlc-jobs-fab";
      fab.className = "btn primary";
      fab.setAttribute("data-rlc-open", "1");
      fab.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:99990;box-shadow:0 6px 20px rgba(0,0,0,.4)";
      document.body.appendChild(fab);
    }
    fab.style.display = show ? "" : "none";
    fab.textContent = "📨 " + tl("Club offers ({n})", { n: offers().length });
    var m = document.getElementById("rlc-jobs-modal");
    if (!m) { m = document.createElement("div"); m.id = "rlc-jobs-modal"; document.body.appendChild(m); }
    if (!show) ui.open = false;
    m.innerHTML = show && ui.open ? modalHtml() : "";
  }
  try {
    var origRender = render;
    render = function () {
      var r = origRender.apply(this, arguments);
      try { syncUi(); } catch (e) { console.error("[rlc-mod] jobs ui", e); }
      return r;
    };
  } catch (e) { console.error("[rlc-mod] render hook", e); }
  try {
    var origSacked = sackedHtml;
    sackedHtml = function () {
      var html = origSacked.apply(this, arguments);
      var list = offers();
      if (!list.length && !ui.ensured && window.rlcMod) {
        ui.ensured = true;
        window.rlcMod.ensureJobs().then(function (s) { if (s) { S = s; render(); } }).catch(function () {});
      }
      if (!list.length) return html;
      // Le bloc va DANS la carte "Career over", au-dessus de "Start a new career" (sinon il flotte sur le fond).
      var block =
        '<div class="rlc-sacked-offers" style="text-align:left;margin:4px 0 18px;padding-top:16px;border-top:1px solid var(--line)">' +
        '<div style="font-size:var(--f-sub,16px);font-weight:800;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">' + esc(tl("Bounce back elsewhere")) + "</div>" +
        '<div style="color:var(--text-dim);font-size:var(--f-small,12px);line-height:1.45">' + esc(tl("These clubs near the bottom of the table are ready to give you a fresh start. Your player comes with you.")) + "</div>" +
        list.map(function (o) { return offerCard(o, true); }).join("") + "</div>";
      var anchor = '<button class="btn primary" data-action="reset-career-confirm"';
      return html.indexOf(anchor) >= 0 ? html.replace(anchor, block + anchor) : html + block;
    };
  } catch (e) { console.error("[rlc-mod] sacked hook", e); }
  async function act(fn) {
    if (ui.busy) return;
    ui.busy = true; syncUi();
    try {
      var res = await fn();
      if (res) {
        S = res;
        if (res.rlc && res.rlc.ok && res.rlc.club) showToast(tl("Welcome to {club}!", { club: res.rlc.club }));
        else if (res.rlc && res.rlc.ok === false) showToast(res.rlc.error ? tl(res.rlc.error) : tl("That did not work."), "error");
      }
    } catch (e) { showToast(tl("Error: {message}", { message: e.message }), "error"); }
    ui.busy = false; ui.confirm = null;
    render();
  }
  document.addEventListener("click", function (ev) {
    var t = ev.target;
    if (!t || !t.closest) return;
    var el;
    if ((el = t.closest("[data-rlc-open]"))) { ev.preventDefault(); ev.stopPropagation(); ui.open = true; ui.confirm = null; syncUi(); return; }
    if ((el = t.closest("[data-rlc-accept]"))) {
      ev.preventDefault(); ev.stopPropagation();
      var id = Number(el.getAttribute("data-rlc-accept"));
      if (ui.confirm !== id) { ui.confirm = id; render(); return; }
      ui.open = false;
      act(function () { return window.rlcMod.acceptJob(id); });
      return;
    }
    if ((el = t.closest("[data-rlc-decline]"))) {
      ev.preventDefault(); ev.stopPropagation();
      var did = Number(el.getAttribute("data-rlc-decline"));
      act(function () { return window.rlcMod.declineJob(did); });
      return;
    }
    if ((el = t.closest("[data-rlc-decline-all]"))) {
      ev.preventDefault(); ev.stopPropagation(); ui.open = false;
      act(function () { return window.rlcMod.declineJob(null); });
      return;
    }
    if ((el = t.closest("[data-rlc-close]")) && (el.tagName === "BUTTON" || t === el)) { ev.preventDefault(); ev.stopPropagation(); ui.open = false; syncUi(); return; }
  }, true);
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && ui.open) { ui.open = false; syncUi(); }
  }, true);
})();

;/* ===== RLC ENHANCER (Claude) : RLCS 1v1 / 2v2 (UI, onglet Effectif) ===== */
(function () {
  "use strict";
  var VIEW = "rlc-modes";
  var ui = { busy: false, draft: null };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function C2() { return S && S.career ? S.career : null; }
  function modes() { var c = C2(); return c && c.rlcModes && Array.isArray(c.rlcModes.events) && c.rlcModes.events.length ? c.rlcModes : null; }
  function pl(id) { var c = C2(); return c ? (c.players || []).find(function (p) { return p.id === id; }) : null; }
  function team(id) { var c = C2(); return c ? (c.teams || []).find(function (t) { return t.id === id; }) : null; }
  function rating(p) { return Math.max(40, Math.min(99, Math.round((p.rating || 0) + (p.form || 0)))); }
  function roster() {
    var c = C2(), me = c ? team(c.userTeamId) : null;
    return me ? (me.playerIds || []).map(pl).filter(function (p) { return p && !p.retired; }).sort(function (a, b) { return rating(b) - rating(a); }) : [];
  }
  function currentPicks() {
    var m = modes(), ids = roster().map(function (p) { return p.id; });
    var raw = (m && m.picks) || {};
    var solo = (raw.solo || []).filter(function (id) { return ids.indexOf(id) >= 0; }).slice(0, 1);
    var duo = (raw.duo || []).filter(function (id, i, a) { return ids.indexOf(id) >= 0 && a.indexOf(id) === i; }).slice(0, 2);
    if (!solo.length && ids.length) solo = [ids[0]];
    for (var i = 0; i < ids.length && duo.length < 2; i++) if (duo.indexOf(ids[i]) < 0) duo.push(ids[i]);
    return { solo: solo, duo: duo };
  }
  function date(d) { try { return fmtDateShort(d); } catch (e) { return d; } }
  function select(name, value) {
    return '<select data-rlc-pick="' + name + '" style="width:100%;margin-top:4px;padding:8px 10px;border-radius:var(--r-sm,4px);border:1px solid var(--line);background:var(--panel-2);color:var(--text)">' +
      roster().map(function (p) { return '<option value="' + p.id + '"' + (p.id === value ? " selected" : "") + ">" + esc(p.name) + " · " + rating(p) + "</option>"; }).join("") + "</select>";
  }
  function eventRow(ev) {
    var c = C2(), line = "";
    if (ev.stage === "done") {
      var res = ev.kind === "worlds" ? ev.results.world : ev.results[c.userRegion];
      if (res && res.order && res.order.length) {
        var champ = res.order[0], mine = res.order.find(function (x) { return x.teamId === c.userTeamId; });
        line = tl("Winner: {names} ({club})", { names: champ.names.join(" & "), club: (team(champ.teamId) || {}).name || "" });
        if (mine) line += " · " + tl("{who}: {place}", { who: mine.names.join(" & "), place: ordinal(mine.placement) });
      } else line = tl("Not played in your region");
    } else if (ev.stage === "skipped") line = tl("Not played this season");
    else line = ev.kind === "worlds" ? tl("8 qualified: every regional winner, then runners-up (EU, NA...) to fill the field") : tl("Coming up");
    return '<div style="display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-top:1px solid var(--line)">' +
      '<div><div style="font-weight:700">' + esc(tl(ev.name)) + '</div><div style="color:var(--text-dim);font-size:12px">' + esc(line) + "</div></div>" +
      '<div style="white-space:nowrap;color:var(--text-dim);font-size:12px">' + esc(date(ev.startDate)) + "</div></div>";
  }
  function rankingHtml(mode) {
    var m = modes(), rows = Object.keys((m.ranking || {})[mode] || {}).map(function (k) { return { key: k, pts: m.ranking[mode][k] }; })
      .sort(function (a, b) { return b.pts - a.pts; }).slice(0, 5);
    if (!rows.length) return '<div style="color:var(--text-dim);font-size:12px">' + esc(tl("No results yet this season.")) + "</div>";
    return rows.map(function (r, i) {
      var names = r.key.split("-").map(Number).map(pl).filter(Boolean).map(function (p) { return p.name; }).join(" & ");
      return '<div style="display:flex;justify-content:space-between;font-size:13px;padding:3px 0"><span>' + (i + 1) + ". " + esc(names) + "</span><b>" + r.pts + "</b></div>";
    }).join("");
  }
  var H = 'font-weight:800;text-transform:uppercase;letter-spacing:.08em;';
  function panelHtml() {
    var m = modes(), p = ui.draft || currentPicks();
    return (
      '<div class="rlc-modes-panel" style="padding:14px 2px 4px">' +
      '<div style="color:var(--text-dim);font-size:13px;line-height:1.45">' + esc(tl("After Major 2, every region plays a 2v2 Open and a 1v1 Open. Every regional winner goes to the World Championships, played during Worlds, and runners-up fill the field up to 8.")) + "</div>" +
      '<div style="' + H + 'margin:16px 0 8px">' + esc(tl("Your picks")) + "</div>" +
      '<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px">' +
      '<label style="font-size:12px;color:var(--text-dim)">' + esc(tl("1v1 player")) + select("solo", p.solo[0]) + "</label>" +
      '<label style="font-size:12px;color:var(--text-dim)">' + esc(tl("2v2 player 1")) + select("duo0", p.duo[0]) + "</label>" +
      '<label style="font-size:12px;color:var(--text-dim)">' + esc(tl("2v2 player 2")) + select("duo1", p.duo[1]) + "</label></div>" +
      '<button class="btn primary" style="margin-top:10px" data-rlc-msave="1"' + (ui.busy ? " disabled" : "") + ">" + esc(tl("Save my picks")) + "</button>" +
      '<div style="' + H + 'margin:20px 0 4px">' + esc(tl("This season")) + "</div>" +
      m.events.filter(function (e) { return e.mode !== "3v3"; }).map(eventRow).join("") +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">' +
      '<div><div style="font-weight:800;margin-bottom:4px">' + esc(tl("1v1 ranking")) + "</div>" + rankingHtml("1v1") + "</div>" +
      '<div><div style="font-weight:800;margin-bottom:4px">' + esc(tl("2v2 ranking")) + "</div>" + rankingHtml("2v2") + "</div></div>" +
      "</div>"
    );
  }
  function available() {
    var c = C2();
    try { if (isPlayerMode()) return false; } catch (e) {}
    return !!(c && !c.sacked && modes() && squadSide !== "nation");
  }
  try {
    var origSquad = squadHtml;
    squadHtml = function () {
      var mine = squadView === VIEW;
      if (mine && !available()) { squadView = "pitch"; mine = false; }
      if (mine) squadView = "pitch";
      var html = origSquad.apply(this, arguments);
      if (mine) squadView = VIEW;
      if (!available()) return html;
      // onglet en plus, a cote de "Composition" et "Liste de l'effectif"
      html = html.replace(/(data-action="squad-view"\s+data-view="list">[\s\S]*?<\/button>)/, function (m0) {
        return m0 + '<button class="ptab' + (mine ? " active" : "") + '" data-action="squad-view" data-view="' + VIEW + '">' + esc(tl("1v1 / 2v2")) + "</button>";
      });
      if (!mine) return html;
      html = html.replace(/(<button class="ptab) active("\s+data-action="squad-view"\s+data-view="pitch">)/, "$1$2");
      var a = html.indexOf('class="ptabs"');
      var start = a >= 0 ? html.indexOf("</div>", a) : -1;
      var end = start >= 0 ? html.indexOf('<div class="panel-note">', start) : -1;
      if (start < 0 || end < 0) return html;
      start += "</div>".length;
      // on enleve aussi la note "titulaires" qui ne concerne pas le 1v1 / 2v2
      var noteEnd = html.indexOf("</div>", end);
      return html.slice(0, start) + panelHtml() + (noteEnd >= 0 ? html.slice(noteEnd + "</div>".length) : html.slice(end));
    };
  } catch (e) { console.error("[rlc-mod] squad tab", e); }
  function readDraft() {
    var g = function (n) { var el = document.querySelector('[data-rlc-pick="' + n + '"]'); return el ? Number(el.value) : null; };
    return { solo: [g("solo")], duo: [g("duo0"), g("duo1")] };
  }
  document.addEventListener("change", function (ev) {
    if (ev.target && ev.target.getAttribute && ev.target.getAttribute("data-rlc-pick")) ui.draft = readDraft();
  }, true);
  document.addEventListener("click", function (ev) {
    var t = ev.target, el;
    if (!t || !t.closest) return;
    if ((el = t.closest("[data-rlc-msave]"))) {
      ev.preventDefault(); ev.stopPropagation();
      var d = readDraft();
      if (d.duo[0] === d.duo[1]) { showToast(tl("Pick two different players for the 2v2."), "error"); return; }
      ui.busy = true; render();
      window.rlcMod.setModePicks(d).then(function (res) {
        ui.busy = false;
        if (res) {
          S = res;
          if (res.rlc && res.rlc.ok) { ui.draft = null; showToast(tl("Picks saved.")); }
          else if (res.rlc) showToast(tl(res.rlc.error || "That did not work."), "error");
        }
        render();
      }).catch(function (e) { ui.busy = false; showToast(tl("Error: {message}", { message: e.message }), "error"); render(); });
    }
  }, true);
  // l'ancien bouton flottant n'existe plus
  try { var old = document.getElementById("rlc-modes-fab"); if (old) old.remove(); } catch (e) {}
})();

;/* ===== RLC ENHANCER (Claude) : RLCS 1v1 / 2v2 dans le calendrier ===== */
(function () {
  "use strict";
  var COLORS = { open2v2: "#0f9e9e", open1v1: "#ef7d1a", worlds2v2: "#0a6f6f", worlds1v1: "#b9530c", ewc3v3: "#1c8f4e", ewclcq3v3: "#5fb57f" };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // couleurs des cases (petit calendrier de l'accueil + bandeau "Avancer")
  try {
    var st = document.createElement("style");
    st.textContent =
      ".cal-cell.in-event.ev-rlc2v2{background:rgba(15,158,158,.16)}.cal-cell.ev-rlc2v2 .cal-ev{color:#0b7a7a;font-weight:800}" +
      ".cal-cell.in-event.ev-rlc1v1{background:rgba(239,125,26,.16)}.cal-cell.ev-rlc1v1 .cal-ev{color:#b9530c;font-weight:800}" +
      ".adv-ev.ev-rlc2v2{background:rgba(15,158,158,.18);color:#0b7a7a}.adv-ev.ev-rlc1v1{background:rgba(239,125,26,.2);color:#b9530c}" +
      ".cal-cell.in-event.ev-rlcewc{background:rgba(28,143,78,.18)}.cal-cell.ev-rlcewc .cal-ev{color:#16703d;font-weight:800}.adv-ev.ev-rlcewc{background:rgba(28,143,78,.2);color:#16703d}" +
      ".rlc-bk-round{display:flex;justify-content:space-between;margin:14px 0 6px;font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}.rlc-bk-round em{font-style:normal;opacity:.6;font-weight:600}" +
      ".rlc-bk-match{background:rgba(255,255,255,.06);border-radius:6px;padding:6px 8px;margin-bottom:6px}.rlc-bk-match.mine{box-shadow:inset 3px 0 0 #0fb5b5;background:rgba(15,181,181,.14)}" +
      ".rlc-bk-side{display:flex;align-items:center;gap:8px;font-size:13px;line-height:1.3;padding:2px 0}.rlc-bk-side.lost{opacity:.55}.rlc-bk-side.won .rlc-bk-name{font-weight:800}" +
      ".rlc-bk-seed{width:18px;font-size:10px;opacity:.6;text-align:right}.rlc-bk-name{flex:1;min-width:0}.rlc-bk-name small{display:block;font-size:10px;opacity:.6}.rlc-bk-side b{min-width:14px;text-align:right;font-size:15px}" +
      ".rlc-bk-games{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0 0 26px}.rlc-bk-games span{font-size:10px;padding:1px 5px;border-radius:3px;background:rgba(255,255,255,.08)}" +
      ".rlc-regs{display:flex;flex-wrap:wrap;gap:4px;margin:6px 0 10px}.rlc-reg{font:inherit;font-size:11px;font-weight:700;padding:3px 8px;border-radius:4px;border:1px solid rgba(255,255,255,.25);background:transparent;color:inherit;cursor:pointer}.rlc-reg.on{background:#fff;color:#1d2530}" +
      ".rlc-live{display:inline-block;margin:4px 0 8px;padding:2px 8px;border-radius:4px;background:#e2364a;color:#fff;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase}" +
      ".rlc-my{margin:4px 0 6px;font-size:13px;line-height:1.45}.rlc-sc td,.rlc-sc th{font-size:12px}" +
      ".rlc-cal-pill{display:inline-block;margin-left:3px;padding:0 4px;border-radius:3px;font-size:9px;font-weight:800;line-height:14px;color:#fff;vertical-align:middle}";
    document.head.appendChild(st);
  } catch (e) {}
  function C3() { return S && S.career ? S.career : null; }
  function colourOf(ev) { return COLORS[(ev.kind === "worlds" || ev.kind === "ewc" || ev.kind === "ewclcq" ? ev.kind : "open") + ev.mode] || "var(--line)"; }
  function intl(ev) { return ev.kind !== "open"; }
  function shortOf(ev) { return ev.kind === "ewc" ? "EWC" : ev.kind === "ewclcq" ? "LCQ" : ev.mode; }
  function pseudo(ev) {
    return {
      id: "rlc-" + ev.id, kind: ev.mode === "3v3" ? "rlcewc" : ev.mode === "2v2" ? "rlc2v2" : "rlc1v1", rlcMode: shortOf(ev), rlcKind: ev.kind,
      name: tl(ev.name), startDate: ev.startDate, endDate: ev.endDate, stage: "rlc-" + ev.stage, rlc: ev, rlcColour: colourOf(ev),
    };
  }
  function mine() {
    var c = C3();
    try { if (isPlayerMode()) return []; } catch (e) {}
    var m = c && c.rlcModes;
    return m && Array.isArray(m.events) ? m.events.map(pseudo) : [];
  }
  function isMine(id) { return typeof id === "string" && id.indexOf("rlc-") === 0; }
  function byId(id) { return mine().find(function (e) { return e.id === id; }) || null; }
  // (pas d'eval : la CSP du jeu l'interdit) chaque fonction du jeu est remplacee explicitement
  var TARGETS = {
    eventDayMap: function (f) { if (f) eventDayMap = f; return eventDayMap; },
    calEventList: function (f) { if (f) calEventList = f; return calEventList; },
    calEventById: function (f) { if (f) calEventById = f; return calEventById; },
    calEventNow: function (f) { if (f) calEventNow = f; return calEventNow; },
    calColour: function (f) { if (f) calColour = f; return calColour; },
    eventColour: function (f) { if (f) eventColour = f; return eventColour; },
    shortEventName: function (f) { if (f) shortEventName = f; return shortEventName; },
    eventMeaningHtml: function (f) { if (f) eventMeaningHtml = f; return eventMeaningHtml; },
    dayMarksHtml: function (f) { if (f) dayMarksHtml = f; return dayMarksHtml; },
    calendarBigHtml: function (f) { if (f) calendarBigHtml = f; return calendarBigHtml; },
  };
  function wrap(name, fn) {
    try { var orig = TARGETS[name](); if (typeof orig !== "function") return; TARGETS[name](fn(orig)); } catch (e) { console.error("[rlc-mod] cal " + name, e); }
  }
  wrap("eventDayMap", function (orig) {
    return function () {
      var map = orig.apply(this, arguments);
      mine().forEach(function (e) {
        var d = e.startDate;
        for (var i = 0; i < 10 && d <= e.endDate; i++) { if (!map[d]) map[d] = e; d = addDaysIso(d, 1); }
      });
      return map;
    };
  });
  wrap("calEventList", function (orig) {
    return function () {
      var list = orig.apply(this, arguments).slice();
      mine().forEach(function (e) {
        var i = list.findIndex(function (x) { return x.startDate > e.startDate; });
        list.splice(i < 0 ? list.length : i, 0, e);
      });
      return list;
    };
  });
  wrap("calEventById", function (orig) { return function (id) { return isMine(id) ? byId(id) : orig.apply(this, arguments); }; });
  wrap("calEventNow", function (orig) {
    return function () {
      if (isMine(calEvent) && byId(calEvent)) return calEvent;
      var o = orig.apply(this, arguments);
      if (calEvent != null) return o;
      // par defaut, le prochain evenement a venir, 1v1/2v2 compris
      var c = C3(), oe = o != null ? calEventById(o) : null;
      var next = mine().filter(function (e) { return (e.rlc.stage === "pending" || e.rlc.stage === "live") && e.endDate >= c.currentDate; })
        .sort(function (a, b) { return a.startDate < b.startDate ? -1 : 1; })[0];
      if (next && (!oe || oe.stage === "done" || next.startDate < oe.startDate)) return next.id;
      return o;
    };
  });
  wrap("calColour", function (orig) { return function (e) { return e && e.rlcColour ? e.rlcColour : orig.apply(this, arguments); }; });
  wrap("eventColour", function (orig) { return function (e) { return e && e.rlcColour ? e.rlcColour : orig.apply(this, arguments); }; });
  wrap("shortEventName", function (orig) { return function (e) { return e && e.rlcMode ? e.rlcMode : orig.apply(this, arguments); }; });
  wrap("eventMeaningHtml", function (orig) { return function (e) { return e && e.rlcMode ? "" : orig.apply(this, arguments); }; });
  // pastille 1v1 / 2v2 dans les cases (utile pendant les Worlds, ou la case garde la couleur des Worlds 3v3)
  wrap("dayMarksHtml", function (orig) {
    return function (day) {
      var html = orig.apply(this, arguments);
      mine().forEach(function (e) {
        if (e.rlc.mode === "3v3") return; // l'EWC a ses propres cases
        if (day >= e.startDate && day <= e.endDate) html += '<span class="rlc-cal-pill" style="background:' + e.rlcColour + '">' + esc(e.rlcMode) + "</span>";
      });
      return html;
    };
  });
  var rlcRegion = null;
  function roundName(r, R, reg) {
    if (reg && reg.phases && reg.phases[r]) return tl(reg.phases[r].name, { n: reg.phases[r].n });
    var left = Math.pow(2, R - r);
    return left === 2 ? tl("Final") : left === 4 ? tl("Semi-finals") : left === 8 ? tl("Quarter-finals") : left >= 32 ? tl("Round of 32") : tl("Round of 16");
  }
  function teamName(c, id) { var t = (c.teams || []).find(function (tt) { return tt.id === id; }); return t ? t.name : ""; }
  function playerName(c, id) { var p = (c.players || []).find(function (pp) { return pp.id === id; }); return p ? p.name : ""; }
  function bracketHtml(c, ev, reg) {
    var me = reg.field.findIndex(function (x) { return x.teamId === c.userTeamId; });
    var h = "";
    for (var r = reg.rounds.length - 1; r >= 0; r--) {
      var ms = reg.rounds[r].filter(function (mt) { return !mt.bye; });
      if (!ms.length) continue;
      var played = ms.every(function (mt) { return mt.played; });
      h += '<div class="rlc-bk-round"><span>' + esc(roundName(r, reg.R, reg)) + "</span><em>" + esc(tl("Day {n}", { n: ms[0].day + 1 })) + (played ? "" : " &middot; " + esc(tl("To come"))) + "</em></div>";
      // ton match en premier
      ms.sort(function (x, y) { return (y.a === me || y.b === me) - (x.a === me || x.b === me); });
      h += ms.map(function (mt) {
        var A = reg.field[mt.a], B = reg.field[mt.b], mine = mt.a === me || mt.b === me;
        var side = function (E, idx, wins) {
          var won = mt.played && mt.w === idx;
          return '<div class="rlc-bk-side' + (won ? " won" : mt.played ? " lost" : "") + '"><span class="rlc-bk-seed">' + E.seed + "</span>" +
            '<span class="rlc-bk-name">' + esc(E.names.join(" & ")) + (E.club ? "" : '<small>' + esc(teamName(c, E.teamId)) + "</small>") + "</span>" +
            '<b>' + (mt.played ? wins : "") + "</b></div>";
        };
        var games = mt.played && mt.games ? '<div class="rlc-bk-games">' + mt.games.map(function (g) {
          var aw = g.a > g.b;
          return '<span class="' + (aw ? "a" : "b") + '">' + g.a + "-" + g.b + (g.ot ? " " + esc(tl("OT")) : "") + "</span>";
        }).join("") + "</div>" : "";
        return '<div class="rlc-bk-match' + (mine ? " mine" : "") + '">' + side(A, mt.a, mt.wa) + side(B, mt.b, mt.wb) + games + "</div>";
      }).join("");
    }
    return h;
  }
  function scorersHtml(c, reg) {
    var rows = Object.keys(reg.stats || {}).map(function (id) { return { id: +id, s: reg.stats[id] }; })
      .sort(function (x, y) { return y.s.g - x.s.g || y.s.a - x.s.a || y.s.sv - x.s.sv; }).slice(0, 6);
    if (!rows.length) return "";
    var mineIds = {};
    reg.field.forEach(function (x) { if (x.teamId === c.userTeamId) x.ids.forEach(function (i) { mineIds[i] = 1; }); });
    return '<div class="tb-sechead">' + esc(tl("Top scorers")) + '</div><table class="std rlc-sc" style="width:100%"><thead><tr><th class="l"></th><th>' + esc(tl("Goals")) + "</th><th>" + esc(tl("Assists")) + "</th><th>" + esc(tl("Saves")) + "</th></tr></thead><tbody>" +
      rows.map(function (x) {
        return "<tr" + (mineIds[x.id] ? ' style="font-weight:800"' : "") + '><td class="l">' + esc(playerName(c, x.id)) + "</td><td>" + x.s.g + "</td><td>" + x.s.a + "</td><td>" + x.s.sv + "</td></tr>";
      }).join("") + "</tbody></table>";
  }
  function myLineHtml(c, ev, reg) {
    var me = reg.field.findIndex(function (x) { return x.teamId === c.userTeamId; });
    if (me < 0) return "";
    var out = null, champ = false;
    reg.rounds.forEach(function (ms, r) { ms.forEach(function (mt) { if ((mt.a === me || mt.b === me) && mt.played && !mt.bye && mt.w !== me && (reg.format !== "hybrid" || mt.elim)) out = r; }); });
    if (reg.done && out == null) champ = true;
    var who = reg.field[me].names.join(" & ");
    var st = champ ? tl("Won the tournament") : out != null ? tl("Out in the {round}", { round: roundName(out, reg.R, reg).toLowerCase() }) : tl("Still in");
    var fin = ev.stage === "done" && ev.results && ev.results.world && ev.results.world.order.find(function (x) { return x.teamId === c.userTeamId; });
    if (fin) st = fin.placement === 1 ? tl("Won the tournament") : tl("Finished {place}", { place: ordinal(fin.placement) });
    var tgt = ev.kind === "worlds" || ev.kind === "ewc" ? " &middot; " + esc(tl("A board bonus if you win it")) : ev.kind === "ewclcq" ? " &middot; " + esc(tl("Only the winner goes to the Esports World Cup")) : reg.target ? " &middot; " + esc(tl("Board target: top {n}", { n: reg.target })) : "";
    return '<div class="rlc-my"><b>' + esc(ev.mode === "3v3" ? tl("Your club:") : ev.mode === "2v2" ? tl("Your duo:") : tl("Your player:")) + "</b> " + esc(who) + " &mdash; " + esc(st) + tgt + "</div>";
  }
  function panelHtml(e) {
    var c = C3(), ev = e.rlc, day = calEventDay && calEventDay >= e.startDate && calEventDay <= e.endDate ? calEventDay : e.endDate;
    var h = '<div class="tb-head"><span class="tb-swatch" style="background:' + e.rlcColour + '"></span>' + esc(e.name) + "</div>" +
      '<div class="cb-when">' + fmtDateShort(e.startDate) + (e.endDate !== e.startDate ? " &ndash; " + fmtDateShort(e.endDate) : "") + "</div>";
    if (ev.stage === "pending" || ev.stage === "live") {
      var simDay = ev.stage === "live" && c.currentDate >= day ? e.endDate : day;
      if (simDay > c.currentDate) { try { h += simToButtonHtml(simDay, tl("Sim to {date}", { date: fmtDateShort(simDay) })); } catch (x) {} }
    }
    h += '<p style="margin:12px 0 4px;opacity:.8;font-size:13px;line-height:1.5">' + esc(ev.kind === "ewc" ? tl("16 teams: 15 invited from the RLCS ranking at the end of Major 2 (the holder, then EU 3, NA 3, MENA 3, SAM 2, OCE 1, APAC 1, SSA 1) and the LCQ winner. Two GSL groups of 8, then an 8-team bracket with a third place match. 1,000,000 dollar prize pool.") : ev.kind === "ewclcq" ? tl("The 16 best-ranked clubs without an invitation. Single elimination: only the winner goes to the Esports World Cup.") : ev.kind === "worlds" ? tl("8 qualified: every regional winner, then runners-up (EU, NA...) to fill the field") : tl("After Major 2, every region plays a 2v2 Open and a 1v1 Open. Every regional winner goes to the World Championships, played during Worlds, and runners-up fill the field up to 8.")) + "</p>";
    if (ev.stage === "skipped") return h + '<p style="opacity:.8">' + esc(tl("Not played this season")) + "</p>";
    var key = intl(ev) ? "world" : (rlcRegion && ev.regions && ev.regions[rlcRegion] ? rlcRegion : c.userRegion);
    var reg = ev.regions && ev.regions[key];
    if (!intl(ev) && ev.regions) {
      h += '<div class="rlc-regs">' + (c.regions || []).filter(function (r) { return ev.regions[r.id]; }).map(function (r) {
        return '<button class="rlc-reg' + (r.id === key ? " on" : "") + '" data-action="rlc-reg" data-reg="' + esc(r.id) + '">' + esc(r.name) + "</button>";
      }).join("") + "</div>";
    }
    if (ev.stage === "live") h += '<div class="rlc-live">' + esc(tl("In progress")) + " &middot; " + esc(tl("Day {n} of {m}", { n: Math.min((ev.dayDone || 0) + 1, 99), m: Math.round((new Date(e.endDate) - new Date(e.startDate)) / 864e5) + 1 })) + "</div>";
    if (reg) h += myLineHtml(c, ev, reg);
    var res = intl(ev) ? ev.results && ev.results.world : ev.results && ev.results[key];
    if (res && res.order && res.order.length) {
      h += '<div class="tb-sechead">' + esc(tl("Results")) + "</div><table class=\"std\" style=\"width:100%\"><tbody>" +
        res.order.slice(0, ev.kind === "ewc" ? 8 : reg ? 4 : 8).map(function (x, i) {
          var me = x.teamId === c.userTeamId;
          var club = teamName(c, x.teamId), nm = x.names.join(" & ");
          return "<tr" + (me ? ' style="font-weight:800"' : "") + '><td class="l">' + ordinal(x.placement || i + 1) + '</td><td class="l">' + esc(nm) + '</td><td class="l">' + (nm === club ? "" : esc(club)) + "</td><td>" + (x.prize ? fmtMoney(x.prize) : "") + "</td></tr>";
        }).join("") + "</tbody></table>";
    }
    if (reg) h += '<div class="tb-sechead">' + esc(tl("Bracket")) + "</div>" + bracketHtml(c, ev, reg) + scorersHtml(c, reg);
    else if (!(res && res.order && res.order.length)) h += '<p style="opacity:.8">' + esc(tl("Coming up")) + "</p>";
    return h;
  }
  wrap("calendarBigHtml", function (orig) {
    return function () {
      var html = orig.apply(this, arguments);
      try {
        var id = calEventNow();
        if (!isMine(id) || simTo || calDay) return html;
        var e = byId(id);
        var a = html.indexOf('class="tb-scroll">');
        var end = html.lastIndexOf("</div></div></div>");
        if (!e || a < 0 || end < a) return html;
        a += 'class="tb-scroll">'.length;
        return html.slice(0, a) + panelHtml(e) + html.slice(end);
      } catch (x) { return html; }
    };
  });
  document.addEventListener("click", function (ev) {
    var el = ev.target && ev.target.closest ? ev.target.closest('[data-action="rlc-reg"]') : null;
    if (!el) return;
    ev.preventDefault(); ev.stopPropagation();
    rlcRegion = el.dataset.reg || null;
    render();
  }, true);
  // clic sur une case / un evenement 1v1-2v2 (le jeu ne gere que des id numeriques)
  document.addEventListener("click", function (ev) {
    var el = ev.target && ev.target.closest ? ev.target.closest('[data-action="cal-event"]') : null;
    if (!el || !isMine(el.dataset.eid)) return;
    ev.preventDefault(); ev.stopPropagation();
    calDay = null; calEvent = el.dataset.eid; calEventDay = el.dataset.day || null; calBigOffset = null;
    render();
  }, true);
})();

/* ===== RLC ENHANCER : objectifs 1v1/2v2 dans le board (Succes continental) ===== */
(function () {
  if (typeof boardDetailHtml !== "function") return;
  var orig = boardDetailHtml;
  function esc2(x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  boardDetailHtml = function (d, pick) {
    var html = orig.apply(this, arguments);
    try {
      if (pick !== "continental" || !d || !d.continental || !d.continental.rlc || !d.continental.rlc.length) return html;
      var line = function (r) {
        var name = tl(r.name);
        var label = r.bonus ? tl("{event}: a bonus if you win it", { event: name }) : tl("{event}: top {n}", { event: name, n: r.target });
        var val;
        if (r.done) val = r.place ? tl("Finished {place}", { place: bdPlace(r.place) }) : esc2(r.bonus ? tl("Did not qualify") : tl("Did not take part"));
        else if (r.live) val = r.place ? tl("Finished {place}", { place: bdPlace(r.place) }) : esc2(tl("In progress"));
        else if (r.bonus && r.qualified === false) val = esc2(tl("Did not qualify"));
        else if (r.bonus && r.qualified) val = esc2(tl("Qualified"));
        else val = esc2(tl("To come"));
        return bdRow(r.status, '<span class="bd-sub">' + esc2(label) + "</span>", val);
      };
      var duo = d.continental.rlc.filter(function (r) { return r.mode !== "3v3"; }), ewc = d.continental.rlc.filter(function (r) { return r.mode === "3v3"; });
      var rows = (ewc.length ? bdRow("none", "<b>" + esc2(tl("Esports World Cup")) + "</b>", null) + ewc.map(line).join("") : "") +
        (duo.length ? bdRow("none", "<b>" + esc2(tl("RLCS 1v1 and 2v2")) + "</b>", null) + duo.map(line).join("") + bdRow("none", esc2(tl("Each 1v1/2v2 Open target met eases the pressure on you; missing it adds to it.")), null) : "");
      var i = html.lastIndexOf("</div>");
      return i < 0 ? html + rows : html.slice(0, i) + rows + html.slice(i);
    } catch (e) { console.error("[rlc-mod] board", e); return html; }
  };
})();

/* ===== RLC ENHANCER : Bureau > Ma carriere (clubs, dates, depart, titres, classement par saison) ===== */
(function () {
  var pick = "overview";
  function esc3(x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function car() { return (S && S.rlcCareer) || null; }
  function regName(id) { var r = ((C() || {}).regions || []).find(function (x) { return x.id === id; }); return r ? r.name : String(id || "").toUpperCase(); }
  function rank(n) { return n ? ordinal(n) : "&mdash;"; }
  function kindName(k) {
    return { open: tl("Opens"), major: tl("Majors"), lcq: tl("Last Chance Qualifier"), worlds: tl("World Championship"), rlc1v1: "1v1", rlc2v2: "2v2" }[k] || k;
  }
  function stintKey(s, i) { return "s" + i; }
  function dates(s) { return fmtDateShort(s.start) + " " + esc3(String(s.start || "").slice(0, 4)) + " &ndash; " + (s.end ? fmtDateShort(s.end) + " " + esc3(String(s.end).slice(0, 4)) : esc3(tl("Today"))); }
  function reasonText(s) {
    if (s.reason === "current") return tl("Current club");
    if (s.reason === "sacked") return s.to ? tl("Sacked, then signed for {club}", { club: s.to }) : tl("Sacked");
    return tl("Left to sign for {club}", { club: s.to || "" });
  }
  function statusCls(s) { return s.reason === "current" ? "on" : s.reason === "sacked" ? "missed" : "none"; }
  function cardsHtml(d) {
    var titlesAll = d.stints.reduce(function (n, s) { return n + s.titles.length; }, 0);
    var cards = [{ key: "overview", name: tl("Season by season"), desc: tl("Since {date}", { date: d.start ? fmtDateShort(d.start) + " " + String(d.start).slice(0, 4) : "" }), st: null, sum: countText(d) }]
      .concat(d.stints.map(function (s, i) {
        return { key: stintKey(s, i), name: s.name, desc: dates(s), st: s, crest: teamById(s.teamId) };
      }));
    return cards.map(function (c) {
      var nT = c.st ? c.st.titles.length : 0;
      var foot = c.st ? '<span class="fac-card-price">' + esc3(nT === 0 ? tl("No title") : nT === 1 ? tl("1 title") : tl("{n} titles", { n: nT })) + "</span>" : "";
      var status = c.st ? '<div class="bd-status bd-' + statusCls(c.st) + '"><i></i>' + esc3(c.st.reason === "current" ? tl("Current club") : c.st.reason === "sacked" ? tl("Sacked") : tl("Left")) + "</div>" : '<div class="bd-status"></div>';
      return '<div class="fac-card bd-card' + (c.key === pick ? " on" : "") + '" data-action="rlc-career-pick" data-key="' + c.key + '" role="button" tabindex="0">' +
        '<div class="fac-card-name">' + (c.crest ? '<span class="rlc-car-crest">' + crest(c.crest, "small") + "</span>" : "") + esc3(c.name) + "</div>" +
        '<div class="fac-card-desc">' + (c.st ? c.desc : esc3(c.desc)) + "</div>" + (c.sum ? '<div class="fac-card-desc" style="margin-top:6px;font-weight:700">' + c.sum + "</div>" : "") + status + '<div class="fac-card-foot">' + foot + "</div></div>";
    }).join("");
  }
  function seasonTable(rows, withClub) {
    if (!rows.length) return '<div class="bd-note">' + esc3(tl("No finished season yet.")) + "</div>";
    return '<table class="std rlc-car-t" style="width:100%"><thead><tr><th class="l">' + esc3(tl("Season")) + "</th>" + (withClub ? '<th class="l">' + esc3(tl("Club")) + "</th>" : "") +
      "<th>" + esc3(tl("World")) + "</th><th>" + esc3(tl("Region")) + "</th><th>" + esc3(tl("Points")) + "</th></tr></thead><tbody>" +
      rows.slice().reverse().map(function (r) {
        var note = !r.done ? " <small>(" + esc3(tl("in progress")) + ")</small>" : r.left ? " <small>(" + esc3(tl("left during the season")) + ")</small>" : "";
        return '<tr><td class="l">' + esc3(tl("Season {n}", { n: r.season })) + note + "</td>" + (withClub ? '<td class="l">' + esc3(r.club) + "</td>" : "") +
          "<td>" + rank(r.world) + "</td><td>" + rank(r.regional) + "</td><td>" + (r.points || 0) + "</td></tr>";
      }).join("") + "</tbody></table>";
  }
  function detailHtml(d) {
    if (pick === "overview") {
      return '<div class="fac-d-head"><div class="fac-d-name">' + esc3(tl("Season by season")) + "</div></div>" +
        '<div class="fac-d-sub">' + esc3(tl("Your club at the end of each season, with its place in the world ranking and in its region.")) + "</div>" +
        seasonTable(d.seasons, true) +
        '<div class="tb-sechead" style="margin-top:18px">' + esc3(tl("Clubs")) + '</div><div class="bd-list">' +
        d.stints.map(function (s) { return bdRow(statusCls(s), "<b>" + esc3(s.name) + "</b> &middot; " + esc3(regName(s.region)), dates(s)); }).join("") + "</div>";
    }
    var i = Number(pick.slice(1)), s = d.stints[i];
    if (!s) { pick = "overview"; return detailHtml(d); }
    var t = teamById(s.teamId);
    var h = '<div class="fac-d-head"><div class="fac-d-name">' + (t ? '<span class="rlc-car-crest big">' + crest(t, "small") + "</span>" : "") + esc3(s.name) + "</div></div>" +
      '<div class="fac-d-sub">' + esc3(regName(s.region)) + " &middot; " + dates(s) + "</div>" +
      '<div class="bd-list">' + bdRow(statusCls(s), esc3(reasonText(s)), null) + "</div>";
    h += '<div class="tb-sechead" style="margin-top:16px">' + esc3(tl("Titles")) + "</div>";
    h += s.titles.length ? '<div class="bd-list">' + s.titles.map(function (x) {
      var nm = x.kind === "rlc1v1" || x.kind === "rlc2v2" ? tl(x.name) : x.name;
      return bdRow("met", "<b>" + esc3(nm) + "</b>" + (x.region ? " &middot; " + esc3(regName(x.region)) : ""), esc3(tl("Season {n}", { n: x.season })));
    }).join("") + "</div>" : '<div class="bd-note">' + esc3(tl("No title with this club.")) + "</div>";
    var kinds = ["worlds", "major", "lcq", "open"].filter(function (k) { return s.best[k]; });
    h += '<div class="tb-sechead" style="margin-top:16px">' + esc3(tl("Best results")) + "</div>";
    h += kinds.length ? '<div class="bd-list">' + kinds.map(function (k) {
      var b = s.best[k];
      return bdRow(b.place === 1 ? "met" : "none", esc3(kindName(k)) + ' <span class="bd-sub">' + esc3(tl("{n} played", { n: b.played })) + "</span>",
        "<b>" + ordinal(b.place) + "</b>" + (b.n > 1 ? " &times;" + b.n : ""));
    }).join("") + "</div>" : '<div class="bd-note">' + esc3(tl("No tournament finished with this club yet.")) + "</div>";
    h += '<div class="tb-sechead" style="margin-top:16px">' + esc3(tl("Season by season")) + "</div>" + seasonTable(s.seasons, false);
    return h;
  }
  function windowHtml() {
    var d = car();
    if (!d || !d.stints || !d.stints.length) return '<div class="ow-empty">' + esc3(tl("No career to show yet.")) + "</div>";
    var cur = teamById(C().userTeamId);
    return '<div class="two-blocks fac-screen board-screen rlc-career">' +
      '<button class="ow-close tb-close" data-action="big-close" aria-label="' + esc3(tl("Close")) + '">&times;</button>' +
      '<div class="tb-light"><div class="tb-col"><div class="tb-title">' + esc3(tl("My career")) + "</div>" +
      '<div class="fac-sub">' + esc3(tl("Every club you have managed, how it ended and what you won.")) + "</div></div>" +
      '<div class="fac-cards">' + cardsHtml(d) + "</div></div>" +
      '<div class="tb-dark"><div class="tb-scroll">' + detailHtml(d) + "</div></div></div>";
  }
  try {
    BIG_LISTS["rlc-career"] = { title: "My career", bare: true, render: windowHtml };
  } catch (e) { console.error("[rlc-mod] career list", e); }
  try {
    var st = document.createElement("style");
    st.textContent = ".rlc-car-crest{display:inline-flex;vertical-align:middle;margin-right:8px}.rlc-car-crest .crest{width:22px;height:22px}.rlc-car-crest.big .crest{width:30px;height:30px}" +
      ".rlc-low-col{display:flex;flex-direction:column;gap:10px;min-width:0}.rlc-low-col>.tile{flex:1 1 auto;margin:0}.rlc-career .fac-card-desc{white-space:normal}.rlc-car-t td small{opacity:.6;font-size:10px}.rlc-car-tile{font-size:13px;line-height:1.5;opacity:.85}";
    document.head.appendChild(st);
  } catch (e) {}
  // theme neutre comme le board
  try {
    var prevTheme = currentTheme;
    currentTheme = function () { return bigList === "rlc-career" ? BASE_THEME : prevTheme.apply(this, arguments); };
  } catch (e) {}
  function countText(d) {
    var titles = d.stints.reduce(function (n, s) { return n + s.titles.length; }, 0);
    return (d.stints.length === 1 ? tl("1 club") : tl("{n} clubs", { n: d.stints.length })) + " &middot; " + (titles === 1 ? tl("1 title") : tl("{n} titles", { n: titles }));
  }
  function tileHtml2() {
    var d = car();
    if (!d || isPlayerMode()) return "";
    var cur = d.stints[0];
    return contentTileHtml({
      title: tl("My career"), cls: "clickable rlc-car-tile-w",
      attrs: ' data-action="see-all" data-key="rlc-career" role="button" tabindex="0"',
      body: '<div class="rlc-car-tile">' + countText(d) + (cur && cur.start ? "<br>" + esc3(tl("At {club} since {date}", { club: cur.name, date: fmtDateShort(cur.start) + " " + String(cur.start).slice(0, 4) })) : "") + "</div>",
    });
  }
  // tuile dans le Bureau : en bas, entre les notifications et les installations (ou apres les paris)
  try {
    var prevFac = facilitiesTileHtml;
    facilitiesTileHtml = function () {
      var html = prevFac.apply(this, arguments);
      try {
        var t = tileHtml2(), b = window.__rlcBizTile ? window.__rlcBizTile() : "";
        return t || b ? '<div class="rlc-low-col">' + t + b + html + "</div>" : html;
      } catch (e) { return html; }
    };
    var prevBets = betsTileHtml;
    betsTileHtml = function () {
      var html = prevBets.apply(this, arguments);
      try { return S.facilities ? html : html + tileHtml2() + (window.__rlcBizTile ? window.__rlcBizTile() : ""); } catch (e) { return html; }
    };
  } catch (e) {}
  document.addEventListener("click", function (ev) {
    var el = ev.target && ev.target.closest ? ev.target.closest('[data-action="rlc-career-pick"]') : null;
    if (!el) return;
    ev.preventDefault(); ev.stopPropagation();
    pick = el.dataset.key || "overview";
    render();
  }, true);
})();

/* ===== RLC ENHANCER : tableau 1v1/2v2 sur l'accueil (a la place des news, comme les tournois du jeu) ===== */
(function () {
  function esc4(x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function evs() { var c = C(); var m = c && c.rlcModes; return m && Array.isArray(m.events) ? m.events : []; }
  function keyOf(ev) { return ev.kind !== "open" ? "world" : C().userRegion; }
  function nextDay(d) { var x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); }
  // un event 1v1/2v2 s'affiche pendant qu'il se joue, et encore le lendemain de la finale
  function showing() {
    var c = C(); if (!c) return [];
    try { if (isPlayerMode()) return []; } catch (e) {}
    return evs().filter(function (ev) {
      if (!ev.regions || !ev.regions[keyOf(ev)]) return false;
      if (ev.stage === "live") return true;
      return ev.stage === "done" && c.currentDate <= nextDay(ev.endDate);
    });
  }
  function viewOf(ev) { return "rlc-" + ev.id; }
  function evOfView(v) { return showing().find(function (e) { return viewOf(e) === v; }) || null; }
  function roundName(r, R, reg) {
    if (reg && reg.phases && reg.phases[r]) return tl(reg.phases[r].name, { n: reg.phases[r].n });
    var left = Math.pow(2, R - r);
    return left === 2 ? tl("Final") : left === 4 ? tl("Semi-finals") : left === 8 ? tl("Quarter-finals") : left >= 32 ? tl("Round of 32") : tl("Round of 16");
  }
  // evenement "fantome" lu par les visuels du jeu (groupes GSL, tableau hybride), avec les noms des joueurs
  function pseudoEvent(ev, reg) {
    var c = C();
    var rn = ev.kind !== "open" ? "" : " \u00b7 " + (((c.regions || []).find(function (x) { return x.id === c.userRegion; }) || {}).name || "");
    S.groupTables = S.groupTables || {};
    S.groupTables[reg.pid] = reg.tables || {};
    return { id: reg.pid, name: tl(ev.name) + rn, kind: "open", groups: reg.groups, groupSize: (reg.groups[0] && reg.groups[0].seeds.length) || 8,
      field: reg.field.map(function (e) { return e.teamId; }), slots: reg.slots, stage: "playoffs" };
  }
  function withNames(html, reg) {
    var map = {};
    reg.field.forEach(function (e) { var t = teamById(e.teamId); if (t) map[esc4(t.name)] = esc4(e.names.join(" & ")); });
    return html.replace(/(<span class="(?:gfx-name|brk-name)[^"]*">)([^<]*)(<\/span>)/g, function (all, a, txt, b) {
      var k = txt.trim(); return map[k] ? a + map[k] + b : all;
    });
  }
  function hybridArt(ev, reg, full) {
    var pe = pseudoEvent(ev, reg);
    var gCount = reg.phases.filter(function (p) { return p.group; }).length;
    var inGroups = reg.rounds.length <= gCount && reg.rounds.some(function (ms) { return ms.some(function (mt) { return !mt.played; }); });
    var h = "";
    if (full || inGroups) h += withNames(groupsArtHtml(pe), reg);
    if (full || !inGroups) h += reg.ewc ? ewcBracketArt(ev, reg, gCount) : withNames(bracketArtHtml(pe), reg);
    return h;
  }
  // EWC : quarts, demies, finale + petite finale (elimination directe)
  function ewcBracketArt(ev, reg, gCount) {
    var c = C(), me = reg.field.findIndex(function (x) { return x.teamId === c.userTeamId; });
    var bySlot = {};
    reg.rounds.forEach(function (ms) { ms.forEach(function (mt) { if (mt.slot) bySlot[mt.slot.split("-").pop()] = mt; }); });
    var sl = {};
    (reg.slots || []).forEach(function (x) { sl[x.id.split("-").pop()] = x; });
    var idxOf = function (tid) { return tid == null ? null : reg.field.findIndex(function (e) { return e.teamId === tid; }); };
    var box = function (key, col, i, label) {
      var mt = bySlot[key] || null, s0 = sl[key] || {};
      var a = mt ? mt.a : idxOf(s0.teamA), b = mt ? mt.b : idxOf(s0.teamB);
      var side = function (idx, wins, cls) {
        var E = idx == null || idx < 0 ? null : reg.field[idx], t = E ? teamById(E.teamId) : null;
        var won = mt && mt.played && mt.w === idx;
        return '<div class="brk-side ' + cls + (won ? " won" : "") + (idx != null && idx === me ? " mine" : "") + (E ? "" : " tbd") + '">' +
          '<span class="brk-crest">' + (t ? crest(t, "small") : "") + "</span>" +
          '<span class="brk-name" title="' + esc4(E ? E.names.join(" & ") : "") + '">' + esc4(E ? E.names.join(" & ") : "") + "</span>" +
          '<span class="brk-score">' + (mt && mt.played ? wins : "&ndash;") + "</span></div>";
      };
      return '<div class="brk-match' + (col != null ? " rlc-m" : "") + '"' + (col != null ? ' data-c="' + col + '" data-i="' + i + '"' : "") + '>' +
        '<div class="brk-letter">' + esc4(label || "") + "</div>" +
        '<div class="brk-sides">' + side(a, mt ? mt.wa : 0, "one") + side(b, mt ? mt.wb : 0, "two") + "</div></div>";
    };
    var day = function (k) { var mt = bySlot[k]; return mt ? tl("Day {n}", { n: mt.day + 1 }) : ""; };
    var col = function (n, head, keys, extra) {
      return '<div class="brk-col brk-col-' + n + '"><div class="brk-grouphead">' + esc4(head) + '</div><div class="brk-group">' +
        keys.map(function (k, i) { return box(k, n, i, day(k)); }).join("") + (extra || "") + "</div></div>";
    };
    var third = '<div class="rlc-third"><div class="brk-grouphead rlc-third-h">' + esc4(tl("Third place match")) + "</div>" + box("third", null, 0, day("third")) + "</div>";
    var status = ev.stage === "live" ? tl("Day {n} of {m}", { n: (ev.dayDone || 0) + 1, m: Math.round((new Date(ev.endDate) - new Date(ev.startDate)) / 864e5) + 1 }) : tl("Final result");
    return '<div class="gfx gfx-bracket rlc-gfx">' +
      '<div class="gfx-title">' + esc4(tl("Playoff bracket")) + '</div><div class="gfx-event">' + esc4(tl(ev.name)) + " &middot; " + esc4(status) + "</div>" +
      '<div class="brk-board rlc-brk rlc-ewc"><svg class="brk-links" aria-hidden="true"></svg>' +
      col(0, tl("Quarter-finals"), ["qf1", "qf2", "qf3", "qf4"]) + col(1, tl("Semi-finals"), ["sf1", "sf2"]) + col(2, tl("Final"), ["final"], third) +
      "</div></div>";
  }
  function artHtml(ev, full) {
    var c = C(), reg = ev.regions[keyOf(ev)], R = reg.R;
    if (reg.format === "hybrid") return hybridArt(ev, reg, full);
    // le tour en cours reste visible (ex. huitiemes pendant que ton duo les joue)
    var cur = reg.rounds.findIndex(function (ms) { return ms.some(function (mt) { return !mt.played; }); });
    if (cur < 0) cur = R - 1;
    var first = full ? 0 : Math.max(0, R - 4, Math.min(R - 3, cur));
    var cols4 = R - first >= 4;
    var me = reg.field.findIndex(function (x) { return x.teamId === c.userTeamId; });
    var cols = "";
    for (var r = first; r < R; r++) {
      var n = Math.pow(2, R - 1 - r), ms = reg.rounds[r] || [];
      var day = ms[0] ? ms[0].day + 1 : null;
      var boxes = "";
      for (var i = 0; i < n; i++) {
        var mt = ms[i] || null;
        var side = function (idx, wins, cls) {
          var E = idx == null ? null : reg.field[idx];
          var won = mt && mt.played && !mt.bye && mt.w === idx;
          var t = E ? teamById(E.teamId) : null;
          return '<div class="brk-side ' + cls + (won ? " won" : "") + (idx != null && idx === me ? " mine" : "") + (E ? "" : " tbd") + '">' +
            '<span class="brk-crest">' + (t ? crest(t, "small") : "") + "</span>" +
            '<span class="brk-name" title="' + esc4(E ? E.names.join(" & ") + " (" + (t ? t.name : "") + ")" : "") + '">' + esc4(E ? E.names.join(" & ") : mt && mt.bye ? tl("Bye") : "") + "</span>" +
            '<span class="brk-score">' + (mt && mt.played && !mt.bye ? wins : "&ndash;") + "</span></div>";
        };
        boxes += '<div class="brk-match rlc-m" data-c="' + (r - first) + '" data-i="' + i + '">' +
          '<div class="brk-letter">' + esc4(day ? tl("Day {n}", { n: day }) : "") + "</div>" +
          '<div class="brk-sides">' + side(mt ? mt.a : null, mt ? mt.wa : 0, "one") + side(mt ? mt.b : null, mt ? mt.wb : 0, "two") + "</div></div>";
      }
      cols += '<div class="brk-col brk-col-' + (r - first) + '"><div class="brk-grouphead">' + esc4(roundName(r, R, reg)) + '</div><div class="brk-group">' + boxes + "</div></div>";
    }
    var sub = tl(ev.name) + (ev.kind !== "open" ? "" : " &middot; " + esc4(((c.regions || []).find(function (x) { return x.id === c.userRegion; }) || {}).name || ""));
    var title = ev.mode === "3v3" ? tl("Bracket") : ev.mode === "2v2" ? tl("2v2 bracket") : tl("1v1 bracket");
    var status = ev.stage === "live" ? tl("Day {n} of {m}", { n: (ev.dayDone || 0) + 1, m: Math.round((new Date(ev.endDate) - new Date(ev.startDate)) / 864e5) + 1 }) : tl("Final result");
    return '<div class="gfx gfx-bracket rlc-gfx">' +
      '<div class="gfx-title">' + esc4(title) + '</div><div class="gfx-event">' + sub + " &middot; " + esc4(status) + "</div>" +
      '<div class="brk-board rlc-brk' + (full ? " rlc-full" : "") + (cols4 && !full ? " rlc-4" : "") + '"><svg class="brk-links" aria-hidden="true"></svg>' + cols + "</div></div>";
  }
  // traits entre les tours, mesures sur les boites reellement placees
  function drawLinks() {
    var boards = document.querySelectorAll(".rlc-brk");
    for (var b = 0; b < boards.length; b++) {
      var board = boards[b], svg = board.querySelector(".brk-links");
      var box = board.getBoundingClientRect();
      if (!svg || !box.width || !box.height) continue;
      var pos = {};
      var els = board.querySelectorAll(".rlc-m");
      for (var k = 0; k < els.length; k++) {
        var r = els[k].getBoundingClientRect();
        pos[els[k].dataset.c + "-" + els[k].dataset.i] = { x1: r.left - box.left, x2: r.right - box.left, y: r.top - box.top + r.height / 2 };
      }
      var d = [];
      Object.keys(pos).forEach(function (key) {
        var p = key.split("-"), c = +p[0], i = +p[1];
        if (c === 0) return;
        var t = pos[key], a = pos[(c - 1) + "-" + 2 * i], s2 = pos[(c - 1) + "-" + (2 * i + 1)];
        [a, s2].forEach(function (s) {
          if (!s) return;
          var mx = Math.round((s.x2 + t.x1) / 2);
          d.push("M " + Math.round(s.x2) + " " + Math.round(s.y) + " H " + mx + " V " + Math.round(t.y) + " H " + Math.round(t.x1));
        });
      });
      svg.setAttribute("viewBox", "0 0 " + Math.round(box.width) + " " + Math.round(box.height));
      svg.innerHTML = '<g fill="none" stroke="currentColor" stroke-width="2">' + (d.length ? '<path d="' + d.join(" ") + '"></path>' : "") + "</g>";
    }
  }
  try {
    var st = document.createElement("style");
    st.textContent =
      ".rlc-brk{gap:28px}.rlc-brk .brk-col{justify-content:stretch;gap:0;padding-top:16px}.rlc-brk .brk-grouphead{position:absolute;top:0;left:0;white-space:nowrap}" +
      ".rlc-brk .brk-group{flex:1 1 auto;display:flex;flex-direction:column;justify-content:space-around;gap:6px}" +
      ".rlc-brk .brk-side{text-transform:none;font-size:11px}.rlc-brk .brk-name{padding:3px 6px}.rlc-brk .brk-crest{width:20px;height:20px}" +
      ".rlc-brk .brk-side.tbd .brk-name{opacity:.55}.rlc-brk .brk-side:not(.won) .brk-score{opacity:.85}" +
      ".rlc-4 .brk-side{font-size:9px;height:15px;min-height:0;line-height:15px}.rlc-4 .brk-sides{gap:1px}.rlc-4 .brk-name{padding:0 5px;height:15px;line-height:15px}.rlc-4 .brk-crest,.rlc-4 .brk-crest *{width:14px!important;height:14px!important;min-width:0}.rlc-4 .brk-score{height:15px!important;line-height:15px!important;padding:0 4px!important;font-size:9px!important;margin:0!important;display:flex;align-items:center;justify-content:center}.rlc-4 .brk-col{padding-top:14px}.rlc-4 .brk-score{min-width:16px;font-size:10px}.rlc-4 .brk-group{gap:2px}.rlc-4.rlc-brk{gap:20px}.rlc-4 .brk-letter{display:none}" +
      ".rlc-ewc .brk-col-2 .brk-group{justify-content:center;gap:26px}.rlc-third{position:relative;padding-top:14px}.rlc-third-h{position:absolute;top:0;left:0;white-space:nowrap}" +
      ".rlc-gfx .brk-letter{font-size:7px}.sb-bracket .rlc-gfx .brk-grouphead{color:rgba(27,34,48,.62)}.rlc-full .brk-group{gap:4px}";
    document.head.appendChild(st);
  } catch (e) {}
  try {
    var prevViews = standViewsNow;
    standViewsNow = function () {
      var v = prevViews.apply(this, arguments);
      try {
        var mine = showing().map(function (e) { return [viewOf(e), tl(e.name)]; });
        if (mine.length) v = liveEvent() ? [v[0]].concat(mine, v.slice(1)) : mine.concat(v);
      } catch (e) {}
      return v;
    };
    var prevBody = standBodyHtml;
    standBodyHtml = function () {
      try {
        var ev = evOfView(standViewNow());
        if (ev) return '<div class="stand-event">' + artHtml(ev, false) + "</div>";
      } catch (e) { console.error("[rlc-mod] home bracket", e); }
      return prevBody.apply(this, arguments);
    };
    var prevLeft = standLeftHtml;
    standLeftHtml = function () {
      try {
        var ev = evOfView(standViewNow());
        if (ev) return '<div class="sb-bracket">' + artHtml(ev, true) + "</div>";
      } catch (e) { console.error("[rlc-mod] stand window", e); }
      return prevLeft.apply(this, arguments);
    };
    // bascule auto sur le tableau quand l'event commence (sauf si un tournoi du jeu est deja affiche)
    var autoFor = null;
    var prevSync = syncStandView;
    syncStandView = function () {
      prevSync.apply(this, arguments);
      try {
        var sh = showing();
        if (sh.length && !liveEvent()) {
          var ev = sh[sh.length - 1];
          if (autoFor !== ev.id) { autoFor = ev.id; standView = viewOf(ev); }
        } else if (!sh.length) {
          autoFor = null;
          if (String(standView).indexOf("rlc-") === 0) standView = "table";
        }
      } catch (e) {}
    };
    // accueil : pendant un event 1v1/2v2, le classement (avec le tableau) prend la grande place des news
    var prevHome = homeHtml;
    homeHtml = function () {
      try {
        if (!liveEvent() && showing().length) {
          syncStandView();
          return '<div class="grid-home event-on"><div class="home-left">' + nextMatchCardHtml() + (matchToday() ? "" : advanceCardHtml()) +
            '<div class="home-pair">' + notificationsCardHtml() + newsPanelHtml() + "</div></div>" +
            '<div class="home-right">' + standingsCardHtml() + trainingTileHtml() + "</div></div>";
        }
      } catch (e) { console.error("[rlc-mod] home", e); }
      return prevHome.apply(this, arguments);
    };
    var prevDraw = drawBracketLinks;
    drawBracketLinks = function () {
      var r = prevDraw.apply(this, arguments);
      try { drawLinks(); } catch (e) {}
      return r;
    };
  } catch (e) { console.error("[rlc-mod] home bracket wrap", e); }
})();

/* ===== RLC ENHANCER : match 1v1/2v2 de ton joueur/duo comme un vrai jour de match (arret du temps, carte, ecran live) ===== */
(function () {
  var REF = null; // match ouvert dans l'ecran live
  var THEMES = {
    open2v2: { ground: "#0b3436", panel2: "#0f4d50", line: "#14b8b8", accent: "#3fe0d0" },
    open1v1: { ground: "#3a1d08", panel2: "#5a2e0e", line: "#ef7d1a", accent: "#ffb25a" },
    worlds2v2: { ground: "#061f20", panel2: "#0a3a3c", line: "#0fb5b5", accent: "#7ff0e6" },
    worlds1v1: { ground: "#2a1204", panel2: "#47220a", line: "#d9661a", accent: "#ffc27a" },
    ewc3v3: { ground: "#07170f", panel2: "#0d2a1b", line: "#1fbf68", accent: "#6dfca9" },
    ewclcq3v3: { ground: "#0b1f15", panel2: "#123526", line: "#3fae73", accent: "#9be8bd" },
  };
  function modes() { var c = C(); return c && c.rlcModes; }
  function roundName(r, R, reg) {
    if (reg && reg.phases && reg.phases[r]) return tl(reg.phases[r].name, { n: reg.phases[r].n });
    var left = Math.pow(2, R - r);
    return left === 2 ? tl("Final") : left === 4 ? tl("Semi-finals") : left === 8 ? tl("Quarter-finals") : left >= 32 ? tl("Round of 32") : tl("Round of 16");
  }
  function lookup(ref) {
    var m = modes(); if (!m || !ref) return null;
    var ev = (m.events || []).find(function (e) { return e.id === ref.evId; });
    var reg = ev && ev.regions && ev.regions[ref.key];
    var mt = reg && reg.rounds[ref.r] && reg.rounds[ref.r][ref.i];
    if (!mt) return null;
    var me = reg.field.findIndex(function (x) { return x.teamId === C().userTeamId; });
    return { ev: ev, reg: reg, mt: mt, me: me, ref: ref };
  }
  function pendingRef() {
    var m = modes(); if (!m || !m.pending) return null;
    var ev = (m.events || []).find(function (e) { return e.id === m.pending.evId; });
    var reg = ev && ev.regions && ev.regions[m.pending.key];
    if (!reg || !reg.pending) return null;
    var ref = { evId: ev.id, key: m.pending.key, r: reg.pending.r, i: reg.pending.i };
    var L = lookup(ref);
    return L && !L.mt.played ? ref : null;
  }
  function pendingNow() { try { return !!pendingRef(); } catch (e) { return false; } }
  function real3v3Due() {
    var c = C(); if (!c) return false;
    return (c.fixtures || []).some(function (f) { return !f.played && !f.rlcTemp && f.date <= c.currentDate && (f.homeId === sideOf(f) || f.awayId === sideOf(f)); });
  }
  function liveTemp() {
    var c = C(); if (!c || c.pendingMatch == null) return null;
    return (c.fixtures || []).find(function (f) { return f.id === c.pendingMatch && f.rlcTemp; }) || null;
  }
  window.rlcPendingNow = pendingNow;
  function pseudoFx() {
    var L = lookup(REF); if (!L) return null;
    var meA = L.mt.a === L.me, opp = L.reg.field[meA ? L.mt.b : L.mt.a];
    var games = (L.mt.games || []).map(function (g) {
      return { homeGoals: meA ? g.a : g.b, awayGoals: meA ? g.b : g.a, homeScorers: (meA ? g.sa : g.sb) || [], awayScorers: (meA ? g.sb : g.sa) || [], overtime: !!g.ot };
    });
    return {
      id: 900000 + L.ev.id * 1000 + L.ref.r * 50 + L.ref.i, rlc: true, homeId: C().userTeamId, awayId: opp.teamId, bestOf: L.mt.bo, games: games,
      played: !!L.mt.played, homeWins: (meA ? L.mt.wa : L.mt.wb) || 0, awayWins: (meA ? L.mt.wb : L.mt.wa) || 0, date: C().currentDate,
      rlcMe: L.reg.field[L.me].names.join(" & "), rlcOpp: opp.names.join(" & "), rlcComp: tl(L.ev.name) + " · " + roundName(L.ref.r, L.reg.R, L.reg),
    };
  }
  function themeFor(ev) {
    var col = THEMES[(ev.kind === "worlds" || ev.kind === "ewc" || ev.kind === "ewclcq" ? ev.kind : "open") + ev.mode];
    return col ? { name: tl(ev.name), colors: col } : null;
  }
  function liveRlc() {
    var m = modes(); if (!m) return null;
    var p = pendingRef();
    if (p) return lookup(p).ev;
    return (m.events || []).find(function (e) { return e.stage === "live" && e.regions; }) || null;
  }
  try {
    // le jeu sait qu'un match t'attend : le bouton Avancer disparait comme un jour de match 3v3
    var prevToday = matchToday;
    matchToday = function () { return prevToday.apply(this, arguments) || pendingNow(); };
    // carte "Simuler le match" sur l'accueil
    var prevCard = nextMatchCardHtml;
    nextMatchCardHtml = function () {
      try {
        if (!real3v3Due() && pendingNow()) {
          var L = lookup(pendingRef());
          var live = liveTemp();
          if (live) {
            return '<div class="card"><div class="card-h">' + esc(tl(L.ev.name)) + " &middot; " + esc(roundName(L.ref.r, L.reg.R, L.reg)) + "</div>" +
              '<div class="card-b" style="text-align:center;"><div class="matchmeta">' + tl("Match\x20in\x20progress\x20&mdash;\x20result\x20records\x20automatically") + "</div>" +
              '<div class="btnrow"><button class="btn danger sm" data-action="cancel-play">' + tl("Cancel match") + "</button></div></div></div>";
          }
          var meA = L.mt.a === L.me, opp = L.reg.field[meA ? L.mt.b : L.mt.a], mine = L.reg.field[L.me];
          var t = teamById(opp.teamId);
          var started = (L.mt.games || []).length > 0;
          var us = (meA ? L.mt.wa : L.mt.wb) || 0, them = (meA ? L.mt.wb : L.mt.wa) || 0;
          var inPick = mine.ids.indexOf(C().userPlayerId) >= 0;
          var vsTxt = esc(mine.names.join(" & ")) + " " + esc(tl("vs")) + " " + esc(opp.names.join(" & "));
          var comp = esc(tl(L.ev.name)) + " &middot; " + esc(roundName(L.ref.r, L.reg.R, L.reg)) + " &middot; " + esc(tl("best of {n}", { n: L.mt.bo }));
          return '<div class="match-choice"><button class="mc mc-play rlc-mc" data-action="rlc-play">' +
            '<span class="mc-title">' + esc(inPick ? tl("Play match") : tl("Watch match")) + "</span>" +
            '<span class="mc-when">' + (started ? tl("Series {a}&ndash;{b}", { a: us, b: them }) + " &middot; " + tl("Game {n}", { n: L.mt.games.length + 1 }) : esc(fmtDate(C().currentDate))) + "</span>" +
            '<span class="mc-sub">' + vsTxt + "</span>" +
            (inPick ? "" : '<span class="mc-benched">' + (L.ev.mode === "3v3" ? tl("Your team plays it with bots &mdash; watch it in Rocket League") : L.ev.mode === "2v2" ? tl("Your duo plays it with bots &mdash; watch it in Rocket League") : tl("Your player plays it as a bot &mdash; watch it in Rocket League")) + "</span>") +
            '<span class="mc-comp">' + comp + "</span>" +
            '<span class="mc-crest">' + (t ? crest(t, "big") : "") + "</span></button>" +
            '<button class="mc mc-sim rlc-mc-sim" data-action="rlc-sim-open">' +
            '<span class="mc-title">' + esc(started ? tl("Continue sim") : tl("Sim match")) + "</span>" +
            '<span class="mc-when">' + (started ? tl("Series {a}&ndash;{b}", { a: us, b: them }) + " &middot; " + tl("Game {n}", { n: L.mt.games.length + 1 }) : esc(fmtDate(C().currentDate))) + "</span>" +
            '<span class="mc-sub">' + vsTxt + "</span>" +
            '<span class="mc-comp">' + comp + "</span>" +
            '<span class="mc-arrow">&#9654;&#9654;</span></button></div>';
        }
      } catch (e) { console.error("[rlc-mod] match card", e); }
      return prevCard.apply(this, arguments);
    };
    // couleurs de l'event
    var prevTheme2 = currentTheme;
    currentTheme = function () {
      try {
        var c = C();
        if (c && bigList !== "rlc-career" && bigList !== "rlc-biz" && bigList !== "board" && bigList !== "facilities" && !(c.events || []).find(evLive)) {
          var ev = liveRlc();
          var th = ev && themeFor(ev);
          if (th) return th;
        }
      } catch (e) {}
      return prevTheme2.apply(this, arguments);
    };
    // ecran live du jeu, branche sur le match 1v1/2v2
    var prevFx = seriesSimFixture;
    seriesSimFixture = function () {
      if (seriesSim && seriesSim.fxId === "rlc") return pseudoFx();
      return prevFx.apply(this, arguments);
    };
    var prevComp = compOf;
    compOf = function (fx) {
      if (fx && fx.rlc) return { name: fx.rlcComp };
      if (fx && fx.rlcTemp && fx.rlcNames) return { name: tl(fx.rlcNames.comp) + " \u00b7 " + tl(fx.rlcNames.round, { n: fx.rlcNames.n }) };
      return prevComp.apply(this, arguments);
    };
    var prevSS = seriesSimHtml;
    seriesSimHtml = function () {
      var html = prevSS.apply(this, arguments);
      try {
        if (seriesSim && seriesSim.fxId === "rlc") {
          var fx = pseudoFx();
          if (fx) {
            var swap = function (h, side, names, club) {
              var re = new RegExp('(<div class="ft-club ft-club-' + side + '">[\\s\\S]*?<div class="ft-club-name">)[^<]*(</div>)');
              return h.replace(re, "$1" + esc(names) + (names === club ? "" : '<small class="rlc-ft-club">' + esc(club) + "</small>") + "$2");
            };
            var mineT = teamById(fx.homeId), oppT = teamById(fx.awayId);
            html = swap(html, "l", fx.rlcMe, mineT ? mineT.name : "");
            html = swap(html, "r", fx.rlcOpp, oppT ? oppT.name : "");
          }
        }
      } catch (e) {}
      return html;
    };
    var prevFT = fullTimeHtml;
    fullTimeHtml = function () {
      var html = prevFT.apply(this, arguments);
      try {
        var fx = (C().fixtures || []).find(function (f) { return f.id === ftFx; });
        if (fx && fx.rlcTemp && fx.rlcNames) {
          var swap = function (h, side, names, club) {
            var re = new RegExp('(<div class="ft-club ft-club-' + side + '">[\\s\\S]*?<div class="ft-club-name">)[^<]*(</div>)');
            return h.replace(re, "$1" + esc(names) + (names === club ? "" : '<small class="rlc-ft-club">' + esc(club) + "</small>") + "$2");
          };
          var a = teamById(fx.homeId), b = teamById(fx.awayId);
          html = swap(html, "l", fx.rlcNames.home, a ? a.name : "");
          html = swap(html, "r", fx.rlcNames.away, b ? b.name : "");
        }
      } catch (e) {}
      return html;
    };
    // ecran de chargement / match en cours : noms des joueurs
    var prevMS = matchScreenHtml;
    matchScreenHtml = function () {
      var html = prevMS.apply(this, arguments);
      try {
        var fx = liveTemp();
        if (fx && fx.rlcNames) {
          var a = teamById(fx.homeId), b = teamById(fx.awayId);
          var map = {};
          if (a) map[esc(a.name)] = fx.rlcNames.home + "|" + a.name;
          if (b) map[esc(b.name)] = fx.rlcNames.away + "|" + b.name;
          html = html.replace(/(<div class="ml-name">)([^<]*)(<\/div>)/g, function (all, x, txt, y) {
            var k = map[txt.trim()]; if (!k) return all;
            var parts = k.split("|");
            return x + esc(parts[0]) + (parts[0] === parts[1] ? "" : '<small class="rlc-ft-club">' + esc(parts[1]) + "</small>") + y;
          });
        }
      } catch (e) {}
      return html;
    };
    // Avancer en continu : s'arrete sur ton match 1v1/2v2
    var prevAdvStep = advanceStep;
    advanceStep = async function () {
      var r = await prevAdvStep.apply(this, arguments);
      try { if (pendingNow() && stopAutoAdvance()) render(); } catch (e) {}
      return r;
    };
    // "Simuler jusqu'au" : simule ton match 1v1/2v2 d'un coup, comme les matchs 3v3
    var prevSimStep = simStep;
    simStep = async function () {
      if (simToRunning() && pendingNow()) {
        simTimer = null;
        try { var res = await window.rlcMod.simRlcGame(true); if (res) S = res; }
        catch (e) { stopSimTo("error"); render(); return; }
        render();
        if (simToRunning()) simTimer = setTimeout(simStep, SIM_MATCH_MS);
        return;
      }
      return prevSimStep.apply(this, arguments);
    };
  } catch (e) { console.error("[rlc-mod] live wrap", e); }
  try {
    var st = document.createElement("style");
    st.textContent = ".rlc-ft-club{display:block;font-size:11px;font-weight:600;opacity:.65;letter-spacing:.04em;margin-top:2px}";
    document.head.appendChild(st);
  } catch (e) {}
  document.addEventListener("click", function (ev) {
    var el = ev.target && ev.target.closest ? ev.target.closest("[data-action]") : null;
    if (!el) return;
    var act = el.dataset.action;
    if (act === "rlc-play") {
      ev.preventDefault(); ev.stopPropagation();
      (async function () {
        try {
          bigList = null; try { closeModal(); } catch (e) {}
          var res = await window.rlcMod.playRlcMatch();
          if (res && res.ok === false) { showToast(res.error || tl("Could not start the match."), "error"); }
          else setStatus("launching", tl("Getting your match ready..."));
          S = await window.hub.getState(); render();
        } catch (e) { console.error("[rlc-mod] play", e); }
      })();
      return;
    }
    if (act === "rlc-sim-open") {
      ev.preventDefault(); ev.stopPropagation();
      REF = pendingRef();
      if (!REF) { render(); return; }
      try { closeModal(); } catch (e) {}
      openSeriesSim("rlc");
      return;
    }
    if (!(seriesSim && seriesSim.fxId === "rlc")) return;
    if (act === "ss-sim") {
      ev.preventDefault(); ev.stopPropagation();
      if (seriesSim.busy || ssRunLive()) return;
      seriesSim.busy = true; renderWindows();
      window.rlcMod.simRlcGame(false).then(function (res) {
        if (!seriesSim || seriesSim.fxId !== "rlc") return;
        seriesSim.busy = false;
        if (!res || res.ok === false) { if (res) S = res; showToast(tl("The game could not be simulated."), "error"); render(); return; }
        S = res;
        var fx = pseudoFx();
        if (fx && fx.games.length) startSeriesSimRun(fx, fx.games.length - 1);
        render();
      }, function () { if (seriesSim) seriesSim.busy = false; showToast(tl("The game could not be simulated."), "error"); render(); });
      return;
    }
    if (act === "ss-fulltime" || act === "big-close") {
      if (act === "ss-fulltime") { ev.preventDefault(); ev.stopPropagation(); }
      stopSeriesSimFrame(); seriesSim = null; REF = null;
      if (act === "ss-fulltime") { bigList = null; render(); }
    }
  }, true);
})();

/* ===== RLC ENHANCER : Bureau > Boutique & stream (batiments qui rapportent chaque semaine) ===== */
(function () {
  var pick = "store";
  function e5(x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function biz() { return (S && S.rlcBiz) || null; }
  function fmtN(n) { try { return fmtFollowers(n); } catch (e) { return String(Math.round(n)); } }
  function blurb(key) {
    if (key === "bootcamp") return tl("A bootcamp facility in your region. The week before a Major, the Worlds or the Esports World Cup, teams from your region ask to rent it: the higher they are in the RLCS ranking, the more they pay. You can host up to 3 teams a season.");
    return key === "store" ? tl("A V-Hive style flagship store: jerseys, merch and fan events. It sells more as the club's following grows.")
      : tl("A content house with streaming setups. Every week it brings in stream revenue and new followers for the club and the players, more in weeks with matches.");
  }
  function short(key) { return key === "store" ? tl("Jerseys, merch and fan events") : key === "bootcamp" ? tl("Rented to rivals before LANs") : tl("Streams, videos and new followers"); }
  function cardsHtml(b) {
    return b.list.map(function (it) {
      return '<div class="fac-card' + (it.key === pick ? " on" : "") + (it.owned ? " owned" : "") + (!it.owned && !it.affordable ? " dear" : "") + '" data-action="rlc-biz-pick" data-key="' + it.key + '" role="button" tabindex="0">' +
        '<div class="fac-card-name">' + e5(it.name) + '</div><div class="fac-card-desc">' + e5(short(it.key)) + "</div>" +
        '<div class="fac-card-foot"><span class="fac-badge">' + (it.key === "store" ? "&#9733;" : it.key === "bootcamp" ? "&#8962;" : "&#9654;") + '</span><span class="fac-card-price">' + e5(it.owned ? tl("Yours") : fmtMoney(it.price)) + "</span></div></div>";
    }).join("");
  }
  function row(k, v) { return '<div class="fac-row"><div class="fac-row-top"><span class="fac-row-k">' + e5(k) + '</span><span class="fac-row-v"><b>' + v + "</b></span></div></div>"; }
  function bootcampHtml(it) {
    var h = '<div class="fac-d-head"><div class="fac-d-name">' + e5(it.name) + '</div><div class="fac-d-tag' + (it.owned ? " yours" : "") + '">' + e5(it.owned ? tl("Yours") : fmtMoney(it.price)) + "</div></div>" +
      '<div class="fac-d-sub">' + e5(it.owned ? tl("Open since {date}", { date: fmtDateShort(it.since) + " " + String(it.since).slice(0, 4) }) : tl("Built once, rented out before LANs.")) + "</div>" +
      '<div class="rlc-biz-pic rlc-biz-bootcamp"><span>Bootcamp</span></div>' +
      '<div class="rlc-bc-blurb">' + e5(blurb("bootcamp")) + '</div><div class="fac-rows">';
    h += row(tl("A week of bootcamp"), e5(tl("up to {money}", { money: fmtMoney(it.max) })));
    if (it.best) h += row(tl("Top team of your region today"), e5(it.best.team) + " &middot; " + e5(fmtMoney(it.best.price)));
    if (it.low) h += row(tl("Lowest team of your region"), e5(it.low.team) + " &middot; " + e5(fmtMoney(it.low.price)));
    if (it.owned) {
      h += row(tl("Bookings this season"), e5(it.used + " / " + it.perSeason));
      h += row(tl("Earned so far"), e5(fmtMoney(it.earned)));
      if (it.next && it.used < it.perSeason) h += row(tl("Next offers"), e5(tl("before {event}, around {date}", { event: tl(it.next.name), date: fmtDateShort(it.next.date) })));
    }
    h += "</div>";
    if (it.owned && it.offers.length) {
      h += '<div class="rlc-bc-offers"><div class="rlc-bc-h">' + e5(tl("Offers")) + "</div>" + it.offers.map(function (o) {
        return '<div class="rlc-bc-offer"><div><b>' + e5(o.team) + "</b> &middot; " + e5(tl(o.lan)) + '<div class="rlc-bc-sub">' + e5(fmtDateShort(o.from) + " &rarr; " + fmtDateShort(o.to)).replace("&amp;rarr;", "&rarr;") + " &middot; " + e5(fmtMoney(o.price)) + "</div></div>" +
          '<div class="rlc-bc-btns"><button class="fac-buy rlc-bc-yes" data-action="rlc-bc-answer" data-id="' + o.id + '" data-yes="1">' + e5(tl("Accept")) + '</button>' +
          '<button class="fac-buy rlc-bc-no" data-action="rlc-bc-answer" data-id="' + o.id + '" data-yes="0">' + e5(tl("Decline")) + "</button></div></div>";
      }).join("") + "</div>";
    }
    if (it.owned && it.rentals.length) {
      h += '<div class="rlc-bc-offers"><div class="rlc-bc-h">' + e5(tl("Past bookings")) + "</div>" + it.rentals.map(function (r) {
        return '<div class="rlc-bc-line">' + e5(tl("Season {n}", { n: r.season })) + " &middot; <b>" + e5(r.team) + "</b> &middot; " + e5(tl(r.lan)) + '<span style="float:right">' + e5(fmtMoney(r.price)) + "</span></div>";
      }).join("") + "</div>";
    }
    h += '<div class="fac-act">';
    if (it.owned) h += '<div class="fac-done">' + e5(it.offers.length ? tl("Answer before the dates of the stay, or the offer is lost.") : tl("Offers arrive by mail the week before each LAN.")) + "</div>";
    else h += '<button class="fac-buy" data-action="rlc-biz-buy" data-key="bootcamp"' + (it.affordable ? "" : " disabled") + ">" +
      e5(it.affordable ? tl("Build for {money}", { money: fmtMoney(it.price) }) : tl("Not enough money ({money})", { money: fmtMoney(it.price) })) + "</button>";
    return h + "</div>";
  }
  function detailHtml(b) {
    var it = b.list.find(function (x) { return x.key === pick; }) || b.list[0];
    if (!it) return "";
    if (it.key === "bootcamp") return bootcampHtml(it);
    var h = '<div class="fac-d-head"><div class="fac-d-name">' + e5(it.name) + '</div><div class="fac-d-tag' + (it.owned ? " yours" : "") + '">' + e5(it.owned ? tl("Yours") : fmtMoney(it.price)) + "</div></div>" +
      '<div class="fac-d-sub">' + e5(it.owned ? tl("Open since {date}", { date: fmtDateShort(it.since) + " " + String(it.since).slice(0, 4) }) : tl("Built once, it earns every week.")) + "</div>" +
      '<div class="rlc-biz-pic rlc-biz-' + it.key + '"><span>' + e5(it.key === "store" ? tl("Club store") : "LIVE") + "</span></div>" +
      '<div class="fac-d-sub" style="margin:10px 0 4px">' + e5(blurb(it.key)) + "</div><div class=\"fac-rows\">";
    h += row(tl("Revenue a week"), e5(fmtMoney(it.est.money)));
    if (it.key === "studio") {
      h += row(tl("Club followers a week"), "+" + e5(fmtN(it.est.club)) + ' <i style="opacity:.7;font-style:normal">' + e5(tl("(+{n} with two matches)", { n: fmtN(it.est.clubMatch) })) + "</i>");
      h += row(tl("Player followers a week"), "+" + e5((it.est.player * 100).toFixed(1)) + "%");
    }
    if (it.owned) {
      h += row(tl("Earned so far"), e5(fmtMoney(it.earned)) + ' <i style="opacity:.7;font-style:normal">' + e5(tl("({n} weeks)", { n: it.weeks })) + "</i>");
      if (it.key === "studio") h += row(tl("Followers gained"), e5(tl("Club +{a} · players +{b}", { a: fmtN(it.followers), b: fmtN(it.playerFollowers) })));
    }
    h += "</div><div class=\"fac-act\">";
    if (it.owned) h += '<div class="fac-done">' + e5(tl("The club runs it. The money comes in every week.")) + "</div>";
    else h += '<button class="fac-buy" data-action="rlc-biz-buy" data-key="' + it.key + '"' + (it.affordable ? "" : " disabled") + ">" +
      e5(it.affordable ? tl("Build for {money}", { money: fmtMoney(it.price) }) : tl("Not enough money ({money})", { money: fmtMoney(it.price) })) + "</button>";
    return h + "</div>";
  }
  function windowHtml() {
    var b = biz();
    if (!b) return '<div class="ow-empty">' + e5(tl("Not available.")) + "</div>";
    return '<div class="two-blocks fac-screen rlc-biz">' +
      '<button class="ow-close tb-close" data-action="big-close" aria-label="' + e5(tl("Close")) + '">&times;</button>' +
      '<div class="tb-light"><div class="tb-col"><div class="tb-title">' + e5(tl("Club business")) + "</div>" +
      '<div class="fac-sub">' + e5(tl("Buildings that bring money in for the club.")) + " &middot; " + tl("{money} in the bank", { money: fmtMoney(b.budget) }) + "</div></div>" +
      '<div class="fac-cards">' + cardsHtml(b) + "</div></div>" +
      '<div class="tb-dark"><div class="tb-scroll">' + detailHtml(b) + "</div></div></div>";
  }
  try { BIG_LISTS["rlc-biz"] = { title: "Club business", bare: true, render: windowHtml }; } catch (e) { console.error("[rlc-mod] biz list", e); }
  // offres de bootcamp : repondre directement depuis le mail
  function mailOffer(m) {
    var id = m && m.data && m.data.rlcBootcamp;
    if (id == null || m.resolved) return null;
    var b = biz(), bc = b && b.list.find(function (x) { return x.key === "bootcamp"; });
    return (bc && bc.offers || []).find(function (o) { return o.id === id; }) || null;
  }
  try {
    var prevNeeds = msgNeedsYou;
    msgNeedsYou = function (m) { return mailOffer(m) ? true : prevNeeds.apply(this, arguments); };
    var prevActs = msgActionsHtml;
    msgActionsHtml = function (m) {
      var o = mailOffer(m);
      if (!o) return prevActs.apply(this, arguments);
      return '<div class="rlc-bc-mail"><div class="rlc-bc-mail-sum"><b>' + e5(o.team) + "</b> &middot; " + e5(tl(o.lan)) + " &middot; " + e5(fmtDateShort(o.from)) + " &rarr; " + e5(fmtDateShort(o.to)) + " &middot; <b>" + e5(fmtMoney(o.price)) + "</b></div>" +
        '<div class="btnrow" style="justify-content:flex-start;margin-top:8px;"><button class="btn primary sm" data-action="rlc-bc-answer" data-id="' + o.id + '" data-yes="1">' + e5(tl("Accept")) + "</button>" +
        '<button class="btn sm rlc-bc-mail-no" data-action="rlc-bc-answer" data-id="' + o.id + '" data-yes="0">' + e5(tl("Decline")) + "</button></div>" +
        '<div class="rlc-bc-mail-note">' + e5(tl("Answer before {date}, or the offer is lost.", { date: fmtDateShort(o.from) })) + "</div></div>";
    };
  } catch (e) { console.error("[rlc-mod] bootcamp mail", e); }
  window.__rlcBizTile = function () {
    var b = biz();
    try { if (!b || isPlayerMode()) return ""; } catch (e) { return ""; }
    var own = b.list.filter(function (x) { return x.owned; });
    var week = own.reduce(function (n, x) { return n + (x.est.money || 0); }, 0);
    var bc = b.list.find(function (x) { return x.key === "bootcamp"; });
    var offers = bc && bc.offers ? bc.offers.length : 0;
    var body = offers ? '<b>' + e5(tl("{n} bootcamp offer to answer", { n: offers })) + "</b>" : own.length ? tl("{n} of {m} open", { n: own.length, m: b.list.length }) + (week ? " &middot; " + tl("+{money} a week", { money: fmtMoney(week) }) : "") : e5(tl("A store, a stream studio and a bootcamp to rent"));
    return contentTileHtml({ title: tl("Club business"), cls: "clickable rlc-biz-tile-w", attrs: ' data-action="see-all" data-key="rlc-biz" role="button" tabindex="0"', body: '<div class="rlc-car-tile">' + body + "</div>" });
  };
  try {
    var st = document.createElement("style");
    st.textContent = ".rlc-biz .fac-card-desc{white-space:normal}.rlc-biz-pic{height:110px;border-radius:8px;display:flex;align-items:flex-end;padding:10px 12px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:#fff;margin-top:10px}" +
      ".rlc-biz .tb-dark{overflow-y:auto;max-height:100%}.rlc-bc-blurb{margin:12px 0 8px;font-size:13px;line-height:1.45;opacity:.85}.rlc-biz-bootcamp{background:linear-gradient(135deg,#1e6fd9 0%,#0c3d7a 55%,#1d1d1d 100%)}.rlc-bc-offers{margin-top:12px}.rlc-bc-mail{margin-top:10px;padding:10px 12px;border:1px solid var(--rule);border-radius:8px;background:var(--panel-2)}.rlc-bc-mail-sum{font-size:var(--f-small)}.rlc-bc-mail-note{margin-top:6px;font-size:var(--f-tiny);color:var(--text-dim)}" +
      ".rlc-bc-mail-no{background:#3a4150!important;color:#fff!important;border:none!important}.rlc-bc-mail-no:hover{background:#262b36!important}" +
      ".rlc-bc-h{font-weight:800;font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.7;margin-bottom:6px}" +
      ".rlc-bc-offer{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 10px;border:1px solid rgba(255,255,255,.15);border-radius:8px;margin-bottom:6px}.rlc-bc-sub{opacity:.75;font-size:12px;margin-top:2px}" +
      ".rlc-bc-btns{display:flex;gap:6px}.rlc-bc-btns .fac-buy{width:auto;margin:0;padding:6px 12px}.rlc-bc-no{background:#f1f2f5!important;color:#1d2330!important;border:none!important}.rlc-bc-no:hover{background:#fff!important}.rlc-bc-line{font-size:12.5px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.08)}" +
      ".rlc-biz-store{background:linear-gradient(135deg,#f4d03f 0%,#e2a400 45%,#1d1d1d 46%,#1d1d1d 100%)}.rlc-biz-studio{background:linear-gradient(135deg,#7b2ff7 0%,#e2364a 60%,#1d1d1d 100%)}.rlc-biz-pic span{background:rgba(0,0,0,.45);padding:2px 8px;border-radius:4px}";
    document.head.appendChild(st);
  } catch (e) {}
  try {
    var prevTheme = currentTheme;
    currentTheme = function () { return bigList === "rlc-biz" ? BASE_THEME : prevTheme.apply(this, arguments); };
  } catch (e) {}
  document.addEventListener("click", function (ev) {
    var el = ev.target && ev.target.closest ? ev.target.closest('[data-action="rlc-biz-pick"],[data-action="rlc-biz-buy"],[data-action="rlc-bc-answer"]') : null;
    if (!el) return;
    ev.preventDefault(); ev.stopPropagation();
    if (el.dataset.action === "rlc-bc-answer") {
      var yes = el.dataset.yes === "1";
      window.rlcMod.answerBootcamp(el.dataset.id, yes).then(function (res) {
        if (res) S = res;
        var r = res && res.rlc;
        if (r && r.ok) showToast(yes ? tl("Booked: {money} for the club", { money: fmtMoney(r.price || 0) }) : tl("Offer declined"));
        else showToast((r && r.error) || tl("Could not answer."), "error");
        render();
      }).catch(function (e) { showToast(tl("Error: {message}", { message: e.message }), "error"); });
      return;
    }
    var key = el.dataset.key || "store";
    if (el.dataset.action === "rlc-biz-pick") { pick = key; render(); return; }
    if (el.disabled) return;
    window.rlcMod.buyBuilding(key).then(function (res) {
      if (res) S = res;
      var r = res && res.rlc;
      if (r && r.ok) showToast(tl("{name} is open", { name: key === "store" ? tl("Club store") : key === "bootcamp" ? tl("Bootcamp facility") : tl("Stream studio") }));
      else showToast((r && r.error) || tl("Could not build it."), "error");
      render();
    }).catch(function (e) { showToast(tl("Error: {message}", { message: e.message }), "error"); });
  }, true);
})();

/* ===== RLC ENHANCER : titre in-game de chaque joueur du club (fiche joueur) ===== */
(function () {
  function e6(x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function pickHtml(p) {
    var v = S && S.rlcTitles && S.rlcTitles[p.id];
    if (!v || !v.choices || !v.choices.length) return "";
    var opts = '<option value="">' + e6(tl("Auto ({title})", { title: v.auto || tl("best title") })) + "</option>" +
      v.choices.map(function (c) { return '<option value="' + e6(c.key) + '"' + (v.pick === c.key ? " selected" : "") + ">" + e6(c.display) + "</option>"; }).join("");
    return '<div class="rlc-title-pick"><span>' + e6(tl("In-game title")) + '</span><select class="pre-select" data-rlc-title="' + p.id + '">' + opts + "</select>" +
      '<div class="rlc-title-note">' + e6(tl("Shown above his car in Rocket League.")) + "</div></div>";
  }
  try {
    var prev = playerModalHtml;
    playerModalHtml = function (p) {
      var html = prev.apply(this, arguments);
      try {
        if (!p || p.isUser || p.teamId !== C().userTeamId) return html;
        var extra = pickHtml(p);
        if (!extra) return html;
        var i = html.lastIndexOf('<div class="btnrow"');
        return i < 0 ? html : html.slice(0, i) + extra + html.slice(i);
      } catch (e) { return html; }
    };
  } catch (e) { console.error("[rlc-mod] title pick", e); }
  try {
    var st = document.createElement("style");
    st.textContent = ".rlc-title-pick{margin-top:14px;display:grid;grid-template-columns:auto 1fr;gap:6px 12px;align-items:center}.rlc-title-pick>span{font-weight:700;font-size:var(--f-small)}" +
      ".rlc-title-pick select{width:100%;font-size:14px;padding:7px 10px;height:auto;min-height:0}.rlc-title-note{grid-column:2;font-size:var(--f-tiny);color:var(--text-dim)}";
    document.head.appendChild(st);
  } catch (e) {}
  document.addEventListener("change", function (ev) {
    var el = ev.target;
    if (!el || !el.dataset || el.dataset.rlcTitle == null) return;
    window.rlcMod.pickTitle(el.dataset.rlcTitle, el.value || null).then(function (res) {
      if (res) S = res;
      showToast(el.value ? tl("Title saved: it shows from the next match") : tl("Back to the automatic title"));
    }).catch(function (e) { showToast(tl("Error: {message}", { message: e.message }), "error"); });
  }, true);
})();

/* ===== RLC ENHANCER : onglet Archives (facon Liquipedia) ===== */
(function () {
  var A = { season: null, view: "events", region: "all", event: null, team: null, data: {}, teamData: {}, seasons: null, loading: false };
  function e7(x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function load(q, cb) {
    if (A.loading) return;
    A.loading = true;
    window.rlcMod.archive(q).then(function (r) {
      A.loading = false;
      if (r && r.seasons) A.seasons = r.seasons;
      cb(r || {});
      render();
    }).catch(function (e) { A.loading = false; showToast(tl("Error: {message}", { message: e.message }), "error"); });
  }
  function cur() { return A.season == null ? (A.seasons && A.seasons[0] ? A.seasons[0].season : null) : A.season; }
  function D() { var n = cur(); return n == null ? null : A.data[n] || null; }
  function ensure() {
    var n = cur();
    if (A.team != null) { if (!A.teamData[A.team]) load({ team: A.team }, function (r) { if (r.team) A.teamData[A.team] = r.team; }); return; }
    if (n == null || !A.data[n]) load({ season: n }, function (r) { if (r.season) A.data[r.season.season] = r.season; });
  }
  function teamOf(d, id) { return (d.teams || []).find(function (t) { return t.id === id; }) || { id: id, name: "?", abbrev: "?" }; }
  function crestOf(t) { try { return crest(t, "small"); } catch (e) { return ""; } }
  function regName(d, id) { var r = (d.regions || []).find(function (x) { return x.id === id; }); return r ? r.short || r.name : id; }
  function modeTag(ev) { return ev.kind === "ewc" ? "EWC" : ev.kind === "ewclcq" ? "EWC LCQ" : ev.mode === "1v1" || ev.mode === "2v2" ? ev.mode : ""; }
  function kindClass(ev) { return ev.kind === "worlds" || ev.kind === "ewc" ? "big" : ev.kind === "major" ? "major" : ev.kind === "lcq" || ev.kind === "ewclcq" ? "lcq" : "open"; }
  function teamLink(d, id, names) {
    var t = teamOf(d, id);
    var label = names && names.length && !(names.length === 1 && names[0] === t.name) ? names.join(" & ") + ' <small>' + e7(t.name) + "</small>" : e7(t.name);
    return '<span class="arc-team" data-action="arc-team" data-id="' + id + '">' + crestOf(t) + '<span class="arc-tn">' + label + "</span></span>";
  }
  function chips(items, on, action) {
    return items.map(function (x) { return '<button class="arc-chip' + (String(x[0]) === String(on) ? " on" : "") + '" data-action="' + action + '" data-v="' + e7(x[0]) + '">' + e7(x[1]) + "</button>"; }).join("");
  }
  function headHtml(d) {
    var seasons = (A.seasons || []).map(function (s) { return [s.season, s.label + (s.current ? " \u2022" : "")]; });
    var h = '<div class="arc-head"><div class="arc-title">' + e7(tl("Archives")) + '</div><div class="arc-sub">' + e7(tl("Every season, every region, every event of your career.")) + "</div></div>";
    if (A.team != null) return h;
    h += '<div class="arc-bar">' + chips(seasons, cur(), "arc-season") + "</div>";
    h += '<div class="arc-bar">' + chips([["events", tl("Events")], ["ranking", tl("RLCS ranking")], ["teams", tl("Teams")]], A.view, "arc-view") + "</div>";
    if (d) {
      var regs = [["all", tl("All")], ["intl", tl("International events")]].concat((d.regions || []).map(function (r) { return [r.id, r.short || r.name]; }));
      if (A.view !== "events") regs = [["all", tl("World")]].concat((d.regions || []).map(function (r) { return [r.id, r.short || r.name]; }));
      h += '<div class="arc-bar">' + chips(regs, A.region, "arc-region") + "</div>";
    }
    return h;
  }
  function eventsHtml(d) {
    var list = d.events.filter(function (ev) {
      if (A.region === "all") return true;
      if (A.region === "intl") return ev.region == null;
      return ev.region === A.region;
    });
    if (!list.length) return '<div class="arc-empty">' + e7(tl("No event here yet.")) + "</div>";
    return '<div class="arc-list">' + list.map(function (ev) {
      var champ = ev.champion != null ? teamLink(d, ev.champion, ev.championNames) : '<span class="arc-dim">' + e7(ev.stage === "done" ? "" : tl("Not played yet")) + "</span>";
      var tag = modeTag(ev);
      return '<div class="arc-row arc-k-' + kindClass(ev) + (A.event === ev.key ? " on" : "") + '" data-action="arc-event" data-key="' + e7(ev.key) + '">' +
        '<span class="arc-date">' + e7(fmtDateShort(ev.startDate)) + "</span>" +
        '<span class="arc-ename">' + e7(tl(ev.name)) + (tag ? ' <i class="arc-tag">' + e7(tag) + "</i>" : "") + "</span>" +
        '<span class="arc-reg">' + e7(ev.region ? regName(d, ev.region) : tl("World")) + "</span>" +
        '<span class="arc-champ">' + champ + "</span></div>" + (A.event === ev.key ? eventDetailHtml(d, ev) : "");
    }).join("") + "</div>";
  }
  function stageName(st) {
    if (!st) return tl("Matches");
    if (st.indexOf("group:") === 0) return tl("Group {g}", { g: st.slice(6) });
    return { final: tl("Grand final"), semis: tl("Semi-finals"), quarters: tl("Quarter-finals"), lower: tl("Lower bracket"), playoffs: tl("Playoffs") }[st] || st;
  }
  function eventDetailHtml(d, ev) {
    var h = '<div class="arc-detail">';
    if (ev.placings.length) {
      h += '<div class="arc-col"><div class="arc-h">' + e7(tl("Final standings")) + "</div><table class=\"arc-table\">" + ev.placings.map(function (p) {
        var cls = p.place === 1 ? "g" : p.place === 2 ? "s" : p.place <= 4 ? "b" : "";
        return "<tr" + (p.teamId === d.userTeamId ? ' class="me"' : "") + '><td class="arc-pl ' + cls + '">' + e7(p.label) + "</td><td>" + teamLink(d, p.teamId, p.names) + '</td><td class="arc-r">' + (p.prize ? e7(fmtMoney(p.prize)) : "") + "</td></tr>";
      }).join("") + "</table>" + (ev.finalScore ? '<div class="arc-dim" style="margin-top:6px">' + e7(tl("Final: {score}", { score: ev.finalScore })) + "</div>" : "") + "</div>";
    }
    if (ev.series && ev.series.length) {
      var groups = {}, order = [];
      ev.series.forEach(function (x) { if (!groups[x.stage]) { groups[x.stage] = []; order.push(x.stage); } groups[x.stage].push(x); });
      order.sort(function (a, b) { var r = function (k) { return k.indexOf("group:") === 0 ? 0 : k === "lower" ? 2 : k === "quarters" ? 3 : k === "semis" ? 4 : k === "final" ? 5 : 1; }; return r(a) - r(b) || (a < b ? -1 : 1); });
      h += '<div class="arc-col"><div class="arc-h">' + e7(tl("Series")) + "</div>" + order.map(function (k) {
        return '<div class="arc-sh">' + e7(stageName(k)) + "</div>" + groups[k].map(function (x) {
          var ta = teamOf(d, x.a), tb = teamOf(d, x.b);
          return '<div class="arc-ser"><span class="' + (x.w === x.a ? "w" : "") + '" data-action="arc-team" data-id="' + x.a + '">' + e7(ta.name) + '</span><b>' + (x.wa == null ? "&ndash;" : x.wa + "-" + x.wb) + '</b><span class="' + (x.w === x.b ? "w" : "") + '" data-action="arc-team" data-id="' + x.b + '">' + e7(tb.name) + "</span></div>";
        }).join("");
      }).join("") + "</div>";
    }
    return h + "</div>";
  }
  function titlesOf(d, id) { return d.events.filter(function (ev) { return ev.champion === id && ev.src === "game"; }).length; }
  function rankingHtml(d) {
    var teams = d.teams.filter(function (t) { return A.region === "all" || t.region === A.region; })
      .sort(function (a, b) { return (d.ranking[b.id] || 0) - (d.ranking[a.id] || 0); });
    return '<table class="arc-table arc-rank"><tr><th>#</th><th>' + e7(tl("Team")) + "</th><th>" + e7(tl("Region")) + '</th><th class="arc-r">' + e7(tl("Titles")) + '</th><th class="arc-r">' + e7(tl("Points")) + "</th></tr>" +
      teams.map(function (t, i) {
        return "<tr" + (t.id === d.userTeamId ? ' class="me"' : "") + "><td>" + (i + 1) + "</td><td>" + teamLink(d, t.id) + "</td><td>" + e7(regName(d, t.region)) + '</td><td class="arc-r">' + (titlesOf(d, t.id) || "") + '</td><td class="arc-r"><b>' + (d.ranking[t.id] || 0) + "</b></td></tr>";
      }).join("") + "</table>";
  }
  function teamsHtml(d) {
    var teams = d.teams.filter(function (t) { return A.region === "all" || t.region === A.region; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    return '<div class="arc-grid">' + teams.map(function (t) {
      return '<div class="arc-tile" data-action="arc-team" data-id="' + t.id + '">' + crestOf(t) + '<div><b>' + e7(t.name) + '</b><div class="arc-dim">' + e7(regName(d, t.region)) + "</div></div></div>";
    }).join("") + "</div>";
  }
  function teamPageHtml() {
    var td = A.teamData[A.team];
    var back = '<button class="arc-chip" data-action="arc-back">&larr; ' + e7(tl("Back")) + "</button>";
    if (!td) return back + '<div class="arc-empty">' + e7(tl("Loading...")) + "</div>";
    var last = td.seasons[0] || {};
    var titles = td.seasons.reduce(function (n, r) { return n + r.titles; }, 0);
    var h = back + '<div class="arc-thead">' + crestOf(last) + '<div><div class="arc-title">' + e7(last.name || "?") + '</div><div class="arc-sub">' + e7(tl("{n} seasons in the archives · {t} titles", { n: td.seasons.length, t: titles })) + "</div></div></div>";
    h += td.seasons.map(function (r) {
      var res = r.results.map(function (x) {
        var cls = x.place === 1 ? "g" : x.place === 2 ? "s" : x.place <= 4 ? "b" : "";
        var tag = x.kind === "ewc" ? "EWC" : x.kind === "ewclcq" ? "EWC LCQ" : x.mode === "1v1" || x.mode === "2v2" ? x.mode : "";
        return '<span class="arc-res ' + cls + '" title="' + e7(x.names ? x.names.join(" & ") : "") + '">' + e7(tl(x.name)) + (tag ? " " + e7(tag) : "") + " <b>" + e7(x.label) + "</b></span>";
      }).join("");
      return '<div class="arc-season"><div class="arc-sh2"><b>' + e7(r.label) + "</b> &middot; " + e7(r.name) + (r.current ? " &middot; " + e7(tl("in progress")) : "") +
        '<span class="arc-pts">' + e7((r.current && !r.points ? tl("Season in progress") : tl("{p} RLCS points · #{r} in region · #{w} in the world", { p: r.points, r: r.regionRank || "-", w: r.worldRank || "-" }))) + "</span></div>" +
        '<div class="arc-reslist">' + (res || '<span class="arc-dim">' + e7(tl("No result yet.")) + "</span>") + "</div></div>";
    }).join("");
    return h;
  }
  function archivesHtml() {
    ensure();
    var d = D(), body;
    if (A.team != null) body = teamPageHtml();
    else if (!d) body = '<div class="arc-empty">' + e7(tl("Loading...")) + "</div>";
    else body = A.view === "ranking" ? rankingHtml(d) : A.view === "teams" ? teamsHtml(d) : eventsHtml(d);
    return '<div class="rlc-arc">' + headHtml(d) + '<div class="arc-body">' + body + "</div></div>";
  }
  try {
    var prevTab = tabInnerHtml;
    tabInnerHtml = function () {
      if (tab !== "archives") return prevTab.apply(this, arguments);
      var html = archivesHtml(), y = A.scroll || 0;
      if (y) requestAnimationFrame(function () { var el = document.querySelector(".rlc-arc"); if (el) el.scrollTop = y; });
      return html;
    };
    var prevTop = topbarHtml;
    topbarHtml = function () {
      var html = prevTop.apply(this, arguments);
      try {
        var btn = '<button class="' + (tab === "archives" ? "active" : "") + '" data-action="tab" data-tab="archives">' + tl("Archives") + "</button>";
        var i = html.indexOf('data-tab="inbox"');
        if (i < 0) return html;
        var j = html.lastIndexOf("<button", i);
        return j < 0 ? html : html.slice(0, j) + btn + html.slice(j);
      } catch (e) { return html; }
    };
  } catch (e) { console.error("[rlc-mod] archives tab", e); }
  try {
    var st = document.createElement("style");
    st.textContent = ".rlc-arc{height:100%;overflow-y:auto;box-sizing:border-box;padding:var(--s-4,20px) max(var(--s-4,20px),calc((100% - 1180px)/2))}.arc-head{margin-bottom:10px}.arc-title{font-size:var(--f-title,26px);font-weight:900}.arc-sub{color:var(--text-dim);font-size:var(--f-small)}" +
      ".arc-bar{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.arc-chip{background:var(--panel-2);border:1px solid var(--rule);color:var(--text);border-radius:999px;padding:5px 12px;font-size:var(--f-small);cursor:pointer}.arc-chip.on{background:var(--accent);color:#fff;border-color:transparent;font-weight:800}" +
      ".arc-body{margin-top:12px}.arc-list{display:flex;flex-direction:column;gap:4px}.arc-row{display:grid;grid-template-columns:78px 1fr 70px 1.1fr;gap:10px;align-items:center;padding:8px 12px;background:var(--card,var(--panel-2));border:1px solid var(--rule);border-left:4px solid var(--rule);border-radius:8px;cursor:pointer}" +
      ".arc-row:hover,.arc-row.on{border-color:var(--accent)}.arc-k-big{border-left-color:#d4a017}.arc-k-major{border-left-color:var(--accent)}.arc-k-lcq{border-left-color:#8a8a8a}.arc-date{color:var(--text-dim);font-size:var(--f-small)}.arc-ename{font-weight:800}" +
      ".arc-tag{font-style:normal;font-size:10px;font-weight:800;padding:1px 6px;border-radius:4px;background:var(--panel-2);border:1px solid var(--rule);margin-left:4px}.arc-reg{font-size:var(--f-small);color:var(--text-dim)}" +
      ".arc-team{display:inline-flex;align-items:center;gap:6px;cursor:pointer}.arc-team .crest{width:22px;height:22px;flex:0 0 22px}.arc-team small{color:var(--text-dim);margin-left:4px}.arc-team:hover .arc-tn{text-decoration:underline}.arc-dim{color:var(--text-dim);font-size:var(--f-small)}" +
      ".arc-detail{display:grid;grid-template-columns:1fr 1fr;gap:18px;padding:12px 14px 16px;margin:-2px 0 6px;background:var(--panel-2);border:1px solid var(--rule);border-top:none;border-radius:0 0 8px 8px}.arc-h{font-weight:900;margin-bottom:6px}" +
      ".arc-table{width:100%;border-collapse:collapse;font-size:var(--f-small)}.arc-table td,.arc-table th{padding:4px 6px;border-bottom:1px solid var(--rule);text-align:left}.arc-table th{color:var(--text-dim);font-weight:700}.arc-r{text-align:right!important}.arc-table tr.me td{font-weight:800;background:rgba(127,127,127,.12)}" +
      ".arc-pl{font-weight:900;width:44px}.arc-pl.g,.arc-res.g b{color:#d4a017}.arc-pl.s,.arc-res.s b{color:#9aa4ad}.arc-pl.b,.arc-res.b b{color:#b0703a}.arc-sh{font-weight:800;font-size:var(--f-tiny);text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim);margin:8px 0 3px}" +
      ".arc-ser{display:grid;grid-template-columns:1fr 46px 1fr;gap:6px;font-size:var(--f-small);padding:2px 0}.arc-ser span{cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.arc-ser span:first-child{text-align:right}.arc-ser span.w{font-weight:800}.arc-ser b{text-align:center}" +
      ".arc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px}.arc-tile{display:flex;gap:10px;align-items:center;padding:10px;background:var(--card,var(--panel-2));border:1px solid var(--rule);border-radius:8px;cursor:pointer}.arc-tile:hover{border-color:var(--accent)}.arc-tile .crest{width:34px;height:34px}" +
      ".arc-thead{display:flex;gap:14px;align-items:center;margin:12px 0}.arc-thead .crest{width:56px;height:56px}.arc-season{padding:10px 12px;background:var(--card,var(--panel-2));border:1px solid var(--rule);border-radius:8px;margin-bottom:6px}" +
      ".arc-sh2{display:flex;flex-wrap:wrap;gap:6px;align-items:baseline}.arc-pts{margin-left:auto;color:var(--text-dim);font-size:var(--f-small)}.arc-reslist{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}.arc-res{font-size:12px;padding:2px 8px;border-radius:999px;background:var(--panel-2);border:1px solid var(--rule)}" +
      ".arc-empty{padding:30px;text-align:center;color:var(--text-dim)}@media(max-width:900px){.arc-detail{grid-template-columns:1fr}.arc-row{grid-template-columns:64px 1fr 1fr}.arc-reg{display:none}}";
    document.head.appendChild(st);
  } catch (e) {}
  document.addEventListener("click", function (ev) {
    var el = ev.target && ev.target.closest ? ev.target.closest('[data-action^="arc-"]') : null;
    if (!el || tab !== "archives") return;
    ev.preventDefault(); ev.stopPropagation();
    var a = el.dataset.action, v = el.dataset.v;
    if (a !== "arc-event") A.scroll = 0;
    if (a === "arc-season") { A.season = Number(v); A.event = null; }
    else if (a === "arc-view") { A.view = v; A.region = "all"; A.event = null; }
    else if (a === "arc-region") { A.region = v; A.event = null; }
    else if (a === "arc-event") { var k = el.dataset.key; A.event = A.event === k ? null : k; }
    else if (a === "arc-team") { A.team = Number(el.dataset.id); }
    else if (a === "arc-back") { A.team = null; }
    render();
  }, true);
  document.addEventListener("scroll", function (ev) { var t = ev.target; if (t && t.classList && t.classList.contains("rlc-arc")) A.scroll = t.scrollTop; }, true);
  window.__rlcArchive = A;
})();

;/* ===== RLC ENHANCER : credit ===== */
(function () {
  const RLC_MOD_VERSION = "1.2";
  if (typeof doctorHtml !== "function") return;
  const orig = doctorHtml;
  doctorHtml = function () {
    const html = orig.apply(this, arguments);
    const line = tl("RLC Enhancer v{v} by Milan. All rights reserved.").replace("{v}", RLC_MOD_VERSION);
    const presets = tl("Pro presets: RLCareerProPresets by Matiyo (MIT license).");
    return html + '<div class="rlc-credit" style="margin:18px 0 4px;text-align:center;font-size:12px;letter-spacing:.06em;opacity:.6">' + esc(line) +
      '<div style="margin-top:4px">' + esc(presets) + "</div></div>";
  };
})();
