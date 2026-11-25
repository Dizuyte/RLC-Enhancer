/* RLC Enhancer installer. (c) 2026 Milan. All rights reserved. */
"use strict";
process.noAsar = true;
let fs;
try { fs = require("original-fs"); } catch (_e) { fs = require("fs"); }
const path = require("path");
const zlib = require("zlib");
const os = require("os");
const crypto = require("crypto");
const cp = require("child_process");

const KEY = Buffer.from("rlc-mod/milan/2026/all-rights-reserved");
const MARKS = ["RLC Enhancer", "RLC " + "Mod"]; // "RLC Mod" = ancien nom du mod (v1.0 et v1.1)

function say(en, fr) { console.log(en); if (fr) console.log("  " + fr); }
function fail(en, fr) {
  console.log("");
  console.log("ERROR: " + en);
  if (fr) console.log("ERREUR : " + fr);
  process.exit(1);
}

/* ---------- payload ---------- */
function loadPayload(file) {
  const raw = fs.readFileSync(file);
  const out = Buffer.alloc(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw[i] ^ KEY[i % KEY.length];
  return JSON.parse(zlib.gunzipSync(out).toString("utf8"));
}

/* ---------- asar ---------- */
function readAsar(file) {
  const fd = fs.openSync(file, "r");
  try {
    const head = Buffer.alloc(16);
    fs.readSync(fd, head, 0, 16, 0);
    const headerPickle = head.readUInt32LE(4);
    const strLen = head.readUInt32LE(12);
    const hb = Buffer.alloc(strLen);
    fs.readSync(fd, hb, 0, strLen, 16);
    return { file, header: JSON.parse(hb.toString("utf8")), base: 8 + headerPickle };
  } finally { fs.closeSync(fd); }
}
function nodeAt(asar, rel) {
  let n = asar.header;
  for (const part of rel.split("/")) {
    if (!n.files || !n.files[part]) return null;
    n = n.files[part];
  }
  return n;
}
function readEntry(asar, rel) {
  const n = nodeAt(asar, rel);
  if (!n || n.files || n.unpacked) return null;
  const buf = Buffer.alloc(n.size);
  const fd = fs.openSync(asar.file, "r");
  try { fs.readSync(fd, buf, 0, n.size, asar.base + Number(n.offset)); } finally { fs.closeSync(fd); }
  return buf;
}
function gameVersion(asar) {
  try { return JSON.parse(readEntry(asar, "package.json").toString("utf8")).version || "?"; } catch (_e) { return "?"; }
}
function isModded(asar) {
  const m = readEntry(asar, "main.js");
  const txt = !!m && m.toString("utf8");
  return !!txt && MARKS.some((k) => txt.indexOf(k) >= 0);
}
function integrityOf(buf) {
  const blockSize = 4 * 1024 * 1024, blocks = [];
  for (let i = 0; i < buf.length; i += blockSize) blocks.push(crypto.createHash("sha256").update(buf.subarray(i, i + blockSize)).digest("hex"));
  if (!blocks.length) blocks.push(crypto.createHash("sha256").update(Buffer.alloc(0)).digest("hex"));
  return { algorithm: "SHA256", hash: crypto.createHash("sha256").update(buf).digest("hex"), blockSize, blocks };
}

/* apply the payload operations in memory; returns Map rel -> Buffer, or throws */
function planChanges(asar, payload) {
  const changed = new Map();
  const get = (rel) => {
    if (changed.has(rel)) return changed.get(rel).toString("utf8");
    const b = readEntry(asar, rel);
    if (!b) throw new Error("missing file " + rel);
    return b.toString("utf8");
  };
  for (const op of payload.ops) {
    if (op.create !== undefined) { changed.set(op.file, Buffer.from(op.create, "utf8")); continue; }
    let s = get(op.file);
    if (op.replace) {
      const n = s.split(op.replace.from).length - 1;
      if (n !== 1) throw new Error("anchor not found in " + op.file);
      s = s.replace(op.replace.from, () => op.replace.to);
    }
    if (op.insertAfter) {
      const i = s.indexOf(op.insertAfter.anchor);
      if (i < 0) throw new Error("anchor not found in " + op.file);
      const j = i + op.insertAfter.anchor.length;
      const text = s.indexOf("\r\n") >= 0 ? op.insertAfter.text.replace(/\r?\n/g, "\r\n") : op.insertAfter.text;
      s = s.slice(0, j) + text + s.slice(j);
    }
    if (op.append !== undefined) s = s + op.append;
    changed.set(op.file, Buffer.from(s, "utf8"));
  }
  return changed;
}

function writeAsar(asar, changed, outFile) {
  const header = JSON.parse(JSON.stringify(asar.header));
  // add created files to the header
  for (const rel of changed.keys()) {
    const parts = rel.split("/");
    let n = header;
    for (let i = 0; i < parts.length - 1; i++) { n.files[parts[i]] = n.files[parts[i]] || { files: {} }; n = n.files[parts[i]]; }
    const leaf = parts[parts.length - 1];
    if (!n.files[leaf]) n.files[leaf] = { size: 0, offset: "0" };
  }
  const plan = []; let offset = 0;
  (function walk(n, pre) {
    for (const name of Object.keys(n.files)) {
      const e = n.files[name], rel = pre ? pre + "/" + name : name;
      if (e.files) { walk(e, rel); continue; }
      if (e.unpacked || e.link) continue;
      if (changed.has(rel)) {
        const buf = changed.get(rel);
        plan.push({ buf });
        e.size = buf.length;
        e.integrity = integrityOf(buf);
      } else {
        plan.push({ from: asar.base + Number(e.offset), size: e.size });
      }
      e.offset = String(offset);
      offset += e.size;
    }
  })(header, "");
  const json = Buffer.from(JSON.stringify(header), "utf8");
  const pad = (4 - (json.length % 4)) % 4;
  const payload = Buffer.alloc(8 + json.length + pad);
  payload.writeUInt32LE(4 + json.length + pad, 0);
  payload.writeUInt32LE(json.length, 4);
  json.copy(payload, 8);
  const size = Buffer.alloc(8);
  size.writeUInt32LE(4, 0);
  size.writeUInt32LE(payload.length, 4);
  const tmp = outFile + ".tmp";
  const out = fs.openSync(tmp, "w");
  const inp = fs.openSync(asar.file, "r");
  try {
    fs.writeSync(out, size); fs.writeSync(out, payload);
    const chunk = Buffer.alloc(8 * 1024 * 1024);
    for (const p of plan) {
      if (p.buf) { fs.writeSync(out, p.buf); continue; }
      let left = p.size, pos = p.from;
      while (left > 0) {
        const n = fs.readSync(inp, chunk, 0, Math.min(chunk.length, left), pos);
        if (n <= 0) throw new Error("read error");
        fs.writeSync(out, chunk, 0, n); left -= n; pos += n;
      }
    }
  } finally { fs.closeSync(out); fs.closeSync(inp); }
  fs.renameSync(tmp, outFile);
}

/* ---------- copy with progress ---------- */
function listTree(dir, skip, acc, rel) {
  acc = acc || []; rel = rel || "";
  for (const ent of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? path.join(rel, ent.name) : ent.name;
    if (skip(r, ent)) continue;
    if (ent.isDirectory()) listTree(dir, skip, acc, r);
    else if (ent.isFile()) acc.push({ rel: r, size: fs.statSync(path.join(dir, r)).size });
  }
  return acc;
}
function copyTree(src, dst, skip, label) {
  const files = listTree(src, skip);
  const total = files.reduce((a, f) => a + f.size, 0) || 1;
  let done = 0, shown = -1;
  for (const f of files) {
    const to = path.join(dst, f.rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(src, f.rel), to);
    done += f.size;
    const pct = Math.floor((done / total) * 20) * 5;
    if (pct !== shown) { shown = pct; process.stdout.write("\r  " + label + " " + pct + "%   "); }
  }
  process.stdout.write("\n");
}

/* ---------- windows helpers ---------- */
function psFolder(name, fallback) {
  try {
    const r = cp.execFileSync("powershell.exe", ["-NoProfile", "-Command", "[Environment]::GetFolderPath('" + name + "')"], { encoding: "utf8" }).trim();
    if (r && fs.existsSync(r)) return r;
  } catch (_e) {}
  return fallback;
}
function q(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }
function makeShortcut(lnk, exe, args, workdir) {
  const script =
    "$s=(New-Object -ComObject WScript.Shell).CreateShortcut(" + q(lnk) + ");" +
    "$s.TargetPath=" + q(exe) + ";$s.Arguments=" + q(args) + ";$s.WorkingDirectory=" + q(workdir) + ";" +
    "$s.IconLocation=" + q(exe + ",0") + ";$s.Description='RL Career Hub MOD';$s.Save()";
  cp.execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], { stdio: "ignore" });
}

/* ---------- main ---------- */
function patchFile(srcAsarFile, outFile, payload) {
  const asar = readAsar(srcAsarFile);
  writeAsar(asar, planChanges(asar, payload), outFile);
}

// ---------- RLCareerProPresets (Matiyo, MIT) ----------
// Same hook as its install.py, written into the modded copy only. It finds the presets
// folder from start_match.py's own place, so no user name is written in the game files.
const LIV_BEGIN = "# >>> RLCareerLiveries hook (local mod - delete this block to disable) >>>";
const LIV_END = "# <<< RLCareerLiveries hook <<<";
const LIV_ANCHORS = ["# <<< RLCareerBotMixer hook <<<", 'spec = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))'];
function installPresets(here, root, game) {
  const src = path.join(here, "presets");
  if (!fs.existsSync(path.join(src, "liveries.py"))) return;
  const dest = path.join(root, "presets");
  fs.mkdirSync(dest, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    const to = path.join(dest, f);
    if (f === "config.json" && fs.existsSync(to)) continue; // keep the player's settings
    fs.copyFileSync(path.join(src, f), to);
  }
  const target = path.join(game, "resources", "rlbot", "start_match.py");
  if (!fs.existsSync(target)) throw new Error("start_match.py missing");
  const raw = fs.readFileSync(target, "utf8");
  const eol = raw.indexOf("\r\n") >= 0 ? "\r\n" : "\n";
  const lines = raw.split(eol);
  const start = lines.findIndex((l) => l.trim() === LIV_BEGIN);
  if (start >= 0) {
    const end = lines.findIndex((l, i) => i > start && l.trim() === LIV_END);
    lines.splice(start, (end >= 0 ? end : start) - start + 1);
  }
  let at = -1;
  for (const a of LIV_ANCHORS) { at = lines.findIndex((l) => l.trim() === a); if (at >= 0) break; }
  if (at < 0) at = lines.findIndex((l) => /^\s*spec\s*=\s*json\.loads?\(/.test(l));
  if (at < 0) throw new Error("start_match.py changed");
  const indent = lines[at].slice(0, lines[at].length - lines[at].trimStart().length);
  const hook = [
    LIV_BEGIN,
    "try:",
    "    import os as _os, sys as _sys",
    '    _liv_home = _os.path.normpath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", "..", "..", "presets"))',
    '    if _os.path.isfile(_os.path.join(_liv_home, "liveries.py")):',
    "        _sys.path.insert(0, _liv_home)",
    "        import liveries",
    "        spec = liveries.dress(spec)",
    "except Exception as _exc:  # the mod must never stop a match from starting",
    '    print(f"[liveries] skipped: {_exc!r}", flush=True)',
    LIV_END,
  ];
  lines.splice(at + 1, 0, ...hook.map((l) => indent + l));
  const tmp = target + ".tmp";
  fs.writeFileSync(tmp, lines.join(eol), "utf8");
  fs.renameSync(tmp, target);
  say("Pro presets installed (RLCareerProPresets by Matiyo).", "Presets des pros installes (RLCareerProPresets par Matiyo).");
}

function main() {
  const args = process.argv.slice(2);
  const here = __dirname;
  const payload = loadPayload(path.join(here, "payload.bin"));

  if (args[0] === "--patch-only") { patchFile(args[1], args[2], payload); console.log("patched"); return; }

  const gameDir = args[0];
  const importSaves = String(args[1] || "Y").toUpperCase() === "Y";
  say("", "");
  say("RLC Enhancer v" + payload.mod + " by Milan. All rights reserved.", "RLC Enhancer v" + payload.mod + " par Milan. Tous droits reserves.");
  say("", "");

  const srcExe = path.join(gameDir, "RL Career Hub.exe");
  const srcAsarFile = path.join(gameDir, "resources", "app.asar");
  if (!fs.existsSync(srcExe) || !fs.existsSync(srcAsarFile)) fail("RL Career Hub was not found in " + gameDir, "RL Career Hub est introuvable dans " + gameDir);

  const docs = psFolder("MyDocuments", path.join(os.homedir(), "Documents"));
  const root = path.join(docs, "RL Career Hub Mod");
  const game = path.join(root, "RL Career Hub");
  const data = path.join(root, "rl-career-hub (AppData)");
  const exe = path.join(game, "RL Career Hub.exe");
  const asarFile = path.join(game, "resources", "app.asar");
  const backup = path.join(game, "resources", "app.asar.original");

  // 1. pick the clean game files to patch
  const src = readAsar(srcAsarFile);
  const srcVersion = gameVersion(src);
  let base = null;
  if (fs.existsSync(backup)) {
    const b = readAsar(backup);
    if (gameVersion(b) === srcVersion || isModded(src)) base = b;
  }
  if (!base) {
    if (isModded(src)) fail("Your RL Career Hub install is already modified. Reinstall the game from Nixus, then run this again.", "Ton RL Career Hub est deja modifie. Reinstalle le jeu de Nixus puis relance l'installation.");
    base = src;
  }
  const baseVersion = gameVersion(base);
  try { planChanges(base, payload); } catch (_e) {
    if (baseVersion === payload.game) fail("Your RL Career Hub files are different from the official " + baseVersion + ". Reinstall the game from Nixus, then try again.",
      "Tes fichiers RL Career Hub sont differents de la version officielle " + baseVersion + ". Reinstalle le jeu de Nixus puis reessaie.");
    fail("This mod works with RL Career Hub " + payload.game + ", you have " + baseVersion + ". Wait for a mod update.",
      "Ce mod marche avec RL Career Hub " + payload.game + ", tu as la " + baseVersion + ". Attends une mise a jour du mod.");
  }

  // 2. copy the game (first install or new game version)
  const needCopy = !fs.existsSync(exe) || base === src;
  if (needCopy) {
    say("Copying the game to " + game + " ...", "Copie du jeu dans " + game + " ...");
    const skip = (r) => {
      const n = r.replace(/\\/g, "/").toLowerCase();
      return n === "resources/app" || n.startsWith("resources/app/") || n === "resources/app.asar" ||
        n === "resources/app.asar.original" || n.startsWith("uninstall ");
    };
    try { copyTree(gameDir, game, skip, "game / jeu"); } catch (e) {
      fail("Copy failed (" + e.code + "). Close RL Career Hub and try again.", "La copie a echoue (" + e.code + "). Ferme RL Career Hub et reessaie.");
    }
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.copyFileSync(srcAsarFile, backup);
    base = readAsar(backup);
  }
  // an old unpacked "app" folder would be loaded instead of app.asar
  const stale = path.join(game, "resources", "app");
  if (fs.existsSync(stale)) { try { fs.renameSync(stale, stale + ".disabled-" + Date.now()); } catch (_e) {} }

  // 3. patch
  say("Installing the mod ...", "Installation du mod ...");
  try { writeAsar(base, planChanges(base, payload), asarFile); } catch (e) {
    fail("Could not write the game files (" + (e.code || e.message) + "). Close RL Career Hub MOD and try again.",
      "Impossible d'ecrire les fichiers du jeu (" + (e.code || e.message) + "). Ferme RL Career Hub MOD et reessaie.");
  }

  // 3b. pro presets (RLCareerProPresets by Matiyo, MIT): files next to the copy + hook in its start_match.py
  try { installPresets(here, root, game); } catch (e) {
    say("Pro presets not installed (" + (e.code || e.message) + "). The mod works without them.",
      "Presets des pros non installes (" + (e.code || e.message) + "). Le mod marche sans.");
  }

  // 4. saves
  if (!fs.existsSync(data)) {
    const appData = process.env.APPDATA ? path.join(process.env.APPDATA, "rl-career-hub") : null;
    if (importSaves && appData && fs.existsSync(appData)) {
      say("Copying your saves and settings ...", "Copie de tes saves et reglages ...");
      const junk = new Set(["cache", "code cache", "gpucache", "dawngraphitecache", "dawnwebgpucache", "blob_storage", "shared dictionary", "lockfile", "network", "crashpad"]);
      const skip = (r) => {
        const n = r.replace(/\\/g, "/").toLowerCase();
        return junk.has(n.split("/")[0]) || /\.log$/.test(n) || n.startsWith("sharedstorage");
      };
      try { copyTree(appData, data, skip, "saves"); } catch (e) {
        say("Some files could not be copied (" + e.code + "). Close RL Career Hub and run the installer again to retry.",
          "Certains fichiers n'ont pas ete copies (" + e.code + "). Ferme RL Career Hub et relance l'installation pour reessayer.");
      }
    } else {
      fs.mkdirSync(data, { recursive: true });
    }
  } else {
    say("Keeping your existing mod saves.", "Tes saves du mod sont conservees.");
  }

  // 5. launchers
  const argLine = '--user-data-dir="' + data + '"';
  fs.writeFileSync(path.join(root, "Launch RL Career Hub MOD.bat"),
    "@echo off\r\nrem RLC Enhancer by Milan. Launches the modded copy with its own data.\r\nstart \"\" \"%~dp0RL Career Hub\\RL Career Hub.exe\" --user-data-dir=\"%~dp0rl-career-hub (AppData)\"\r\n");
  try { fs.copyFileSync(path.join(here, "LICENSE.txt"), path.join(root, "LICENSE.txt")); } catch (_e) {}
  const desktop = psFolder("Desktop", path.join(os.homedir(), "Desktop"));
  let lnkOk = true;
  try {
    makeShortcut(path.join(root, "RL Career Hub MOD.lnk"), exe, argLine, game);
    makeShortcut(path.join(desktop, "RL Career Hub MOD.lnk"), exe, argLine, game);
  } catch (_e) { lnkOk = false; }

  fs.writeFileSync(path.join(root, "rlc-mod-version.txt"), "RLC Enhancer " + payload.mod + " for RL Career Hub " + baseVersion + "\r\n");
  say("", "");
  say("Done! RLC Enhancer v" + payload.mod + " is installed in " + root, "Termine ! RLC Enhancer v" + payload.mod + " est installe dans " + root);
  if (lnkOk) say('Start it with the "RL Career Hub MOD" shortcut on your desktop.', 'Lance-le avec le raccourci "RL Career Hub MOD" sur ton bureau.');
  else say('Start it with "Launch RL Career Hub MOD.bat" in that folder.', 'Lance-le avec "Launch RL Career Hub MOD.bat" dans ce dossier.');
  say("Your normal RL Career Hub is not modified.", "Ton RL Career Hub normal n'est pas modifie.");
}

try { main(); } catch (e) { fail(String(e && e.message || e), "erreur inattendue"); }
