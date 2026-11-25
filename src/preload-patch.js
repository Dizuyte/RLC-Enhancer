/* RLC Enhancer (c) 2026 Milan. All rights reserved. Source published for reading only:
   no copy, reuse or redistribution without Milan's written permission. See LICENSE.txt. */

;/* ===== RLC ENHANCER (Claude) ===== */
(function () {
  try {
    var e = require("electron");
    e.contextBridge.exposeInMainWorld("rlcMod", {
      setStartBudget: function (v) { return e.ipcRenderer.invoke("rlc-set-start-budget", v == null ? null : Number(v)); },
      acceptJob: function (id) { return e.ipcRenderer.invoke("rlc-job-accept", Number(id)); },
      declineJob: function (id) { return e.ipcRenderer.invoke("rlc-job-decline", id == null ? null : Number(id)); },
      ensureJobs: function () { return e.ipcRenderer.invoke("rlc-jobs-ensure"); },
      setModePicks: function (picks) { return e.ipcRenderer.invoke("rlc-modes-picks", picks); },
      simRlcGame: function (all) { return e.ipcRenderer.invoke("rlc-sim-game", { all: !!all }); },
      playRlcMatch: function () { return e.ipcRenderer.invoke("rlc-play-match"); },
      buyBuilding: function (key) { return e.ipcRenderer.invoke("rlc-biz-buy", String(key)); },
      answerBootcamp: function (id, yes) { return e.ipcRenderer.invoke("rlc-bootcamp-answer", Number(id), !!yes); },
      pickTitle: function (pid, key) { return e.ipcRenderer.invoke("rlc-title-pick", Number(pid), key || null); },
      archive: function (q) { return e.ipcRenderer.invoke("rlc-archive", q || {}); },
    });
  } catch (err) { console.error("[rlc-mod] preload", err); }
})();
