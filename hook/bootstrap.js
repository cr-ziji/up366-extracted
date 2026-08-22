const fs = require("fs"), path = require("path"), M = require("module");

// Fully relocatable: derive everything from the running exe location.
// Layout must be preserved:  <BASE>\client\up366.exe  +  <BASE>\extracted\...
const CLIENT_DIR = path.dirname(process.execPath);            // <BASE>\client
const BASE = path.dirname(CLIENT_DIR);                        // <BASE>
const SRCROOT = path.join(BASE, "extracted") + path.sep;
const log = (m) => { try { fs.appendFileSync(path.join(BASE, "hook.log"), m + "\n"); } catch (e) {} };

try {
  log("chain-hook @ " + new Date().toISOString() + " base=" + BASE);
  const origRead = fs.readFileSync, origStat = fs.statSync;

  // Their fs hooks append ".u3enc" to every .js/.html/.htm/.css/.xml read and
  // try to AES-decrypt it. For files inside our editable source tree we bypass
  // both (the "orig" flag skips name mangling; plain ".js" never matches the
  // decrypt regex).
  const MANGLED = /\.(js|html|htm|css|xml)$/i;
  const isSrc = (p) => typeof p === "string" && p.startsWith(SRCROOT) && MANGLED.test(p);
  const withOrig = (o) => Object.assign({}, o || {}, { orig: true });

  fs.readFileSync = function (p, opts) {
    if (isSrc(p)) return origRead.call(fs, p, withOrig(opts));
    return origRead.call(fs, p, opts);
  };
  const origReadA = fs.readFile;
  fs.readFile = function (p) {
    const a = Array.prototype.slice.call(arguments);
    if (isSrc(p)) {
      if (a.length >= 2 && typeof a[1] === "function") a.splice(1, 0, { orig: true });
      else a[1] = withOrig(a[1]);
    }
    return origReadA.apply(fs, a);
  };
  fs.statSync = function (p, opts) {
    if (isSrc(p) && !(opts && opts.orig)) return origStat.call(fs, p, withOrig(opts));
    return origStat.call(fs, p, opts);
  };
  const origLstat = fs.lstatSync;
  fs.lstatSync = function (p, opts) {
    if (isSrc(p) && !(opts && opts.orig)) return origLstat.call(fs, p, withOrig(opts));
    return origLstat.call(fs, p, opts);
  };
  if (fs.promises) {
    const po = fs.promises;
    const pRead = po.readFile, pStat = po.stat, pLstat = po.lstat;
    po.readFile = function (p, opts) {
      if (isSrc(p)) return pRead.call(po, p, withOrig(opts));
      return pRead.call(po, p, opts);
    };
    po.stat = function (p, opts) {
      if (isSrc(p) && !(opts && opts.orig)) return pStat.call(po, p, withOrig(opts));
      return pStat.call(po, p, opts);
    };
    po.lstat = function (p, opts) {
      if (isSrc(p) && !(opts && opts.orig)) return pLstat.call(po, p, withOrig(opts));
      return pLstat.call(po, p, opts);
    };
  }
  if (typeof fs.internalModuleStat === "function") {
    const o = fs.internalModuleStat;
    fs.internalModuleStat = function (p) {
      if (typeof p === "string" && p.startsWith(SRCROOT)) {
        try { return origStat.call(fs, p, { orig: true }).isDirectory() ? 1 : 0; } catch (e) { return -34; }
      }
      return o(p);
    };
  }
  if (typeof fs.internalModuleReadJSON === "function") {
    const o = fs.internalModuleReadJSON;
    fs.internalModuleReadJSON = function (p) {
      if (typeof p === "string" && p.startsWith(SRCROOT)) {
        try {
          if (!origStat.call(fs, p, { orig: true }).isFile()) return ["", false];
          return [origRead.call(fs, p, { encoding: "utf8", orig: true }), true];
        } catch (e) { return ["", false]; }
      }
      return o(p);
    };
  }

  const origCe = console.error;
  console.error = function () {
    try {
      log("[CE] " + Array.prototype.map.call(arguments, (a) => typeof a === "string" ? a : JSON.stringify(a)).join(" ").slice(0, 600));
    } catch (e) {}
    return origCe.apply(console, arguments);
  };

  try { require("inspector").open(9229, "127.0.0.1", false); }
  catch (e) { log("inspector.open failed (port busy?): " + e.message); }

  const { app } = require("electron");
  app.setPath("userData", path.join(BASE, "userdata"));
  // Bake in renderer remote debugging so a bare launch works too.
  if (!process.argv.some((a) => String(a).indexOf("remote-debugging-port-u3=") >= 0)) {
    app.commandLine.appendSwitch("remote-debugging-port-u3", "9222");
  }
  process.on("uncaughtException", (e) => log("UNCAUGHT: " + (e && e.stack || e)));
  process.on("unhandledRejection", (e) => log("REJECTED: " + (e && e.stack || e)));

  const mainPath = path.join(SRCROOT, "dist", "main", "index.js");
  const code = origRead.call(fs, mainPath, { encoding: "utf8", orig: true });
  log("real main loaded from disk: " + code.length + " bytes");
  const mod = new M.Module(mainPath, null);
  mod.filename = mainPath;
  mod.paths = M._nodeModulePaths(path.dirname(mainPath));
  mod._compile(code, mainPath);
  log("real main compiled OK");
} catch (e) {
  log("BOOT FAIL: " + (e && e.stack || e));
}
