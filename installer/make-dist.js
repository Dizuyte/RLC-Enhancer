// RLC Enhancer (c) 2026 Milan. All rights reserved. See LICENSE.txt.
// Builds the shareable RLC Enhancer package: payload.bin (minified, encoded mod code) + installer.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
let esbuild;
try { esbuild = require("esbuild"); } catch (_e) { esbuild = require("/opt/npm-tools/node_modules/esbuild"); }

// usage: node make-dist.js [output folder]   (needs: npm install esbuild)
const MOD = process.env.RLC_SRC || path.join(__dirname, "..", "src");
const OUT = path.resolve(process.argv[2] || path.join(__dirname, "..", "dist", "RLC Enhancer"));
const VERSION = "1.2";
const GAME = "0.2.0-beta.33";
const KEY = Buffer.from("rlc-mod/milan/2026/all-rights-reserved");
const BANNER =
  "/* RLC Enhancer v" + VERSION + " (c) 2026 Milan. All rights reserved.\n" +
  "   Copying, redistributing, modifying or reusing this code, in whole or in part, including in RL Career Hub\n" +
  "   itself or any other project, is prohibited without the author's written permission. */\n";

const min = (file) =>
  esbuild.transformSync(fs.readFileSync(path.join(MOD, file), "utf8"), { minify: true, legalComments: "none", charset: "utf8" }).code;
const chunk = (...files) => "\n;" + BANNER + files.map(min).join("\n;");

const WATCH = "_0x3b0050['bots']===0x6&&_0x3b0050['cars']===0x6&&_0x3b0050[_0x36788b(0x438)]===0x3&&_0x3b0050['orangeCars']===0x3";
const payload = {
  mod: VERSION,
  game: GAME,
  ops: [
    { file: "main.js", replace: { from: WATCH, to: "(typeof __rlcWatchOk==='function'&&__rlcWatchOk(_0x3b0050)!==null?__rlcWatchOk(_0x3b0050):(" + WATCH + "))" } },
    { file: "engine/titles.js", append: chunk("titles-patch.js") },
    { file: "main.js", append: chunk("main-patch.js") },
    { file: "preload.js", append: chunk("preload-patch.js") },
    { file: "renderer/app.js", append: chunk("renderer-patch.js") },
    { file: "engine/league.js", append: chunk("engine-patch.js", "engine-modes.js", "engine-career.js", "engine-business.js", "engine-archive.js") },
    { file: "renderer/lang/rlc-mod.js", create: BANNER + min("rlc-mod-lang.js") },
    { file: "renderer/index.html", insertAfter: { anchor: '<script src="lang/ar.js"></script>', text: '\n  <script src="lang/rlc-mod.js"></script>' } },
  ],
};

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "files"), { recursive: true });
const gz = zlib.gzipSync(Buffer.from(JSON.stringify(payload), "utf8"), { level: 9 });
for (let i = 0; i < gz.length; i++) gz[i] ^= KEY[i % KEY.length];
fs.writeFileSync(path.join(OUT, "files", "payload.bin"), gz);
const inst = esbuild.transformSync(fs.readFileSync(path.join(__dirname, "install.js"), "utf8"), { minify: true, legalComments: "none" }).code;
fs.writeFileSync(path.join(OUT, "files", "install.js"), "/* RLC Enhancer installer (c) 2026 Milan. All rights reserved. */\n" + inst);
for (const f of fs.readdirSync(path.join(__dirname, "static"))) {
  const dest = f === "LICENSE.txt" ? [path.join(OUT, f), path.join(OUT, "files", f)] : [path.join(OUT, f)];
  for (const d of dest) fs.copyFileSync(path.join(__dirname, "static", f), d);
}
// RLCareerProPresets (Matiyo, MIT): shipped as-is, with its license, in files/presets
const VENDOR = [path.join(__dirname, "vendor", "RLCareerProPresets"), path.join(__dirname, "..", "vendor", "RLCareerProPresets")].find((d) => fs.existsSync(d));
if (!VENDOR) throw new Error("vendor/RLCareerProPresets is missing");
fs.mkdirSync(path.join(OUT, "files", "presets"), { recursive: true });
for (const f of fs.readdirSync(VENDOR)) fs.copyFileSync(path.join(VENDOR, f), path.join(OUT, "files", "presets", f));
console.log("payload", gz.length, "bytes");
