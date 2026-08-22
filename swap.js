const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Relocatable: everything resolved relative to this script's folder.
const KEY = Buffer.from("QJBNiBmV55PDrewyne3GsA==", "base64");
const ARC = path.join(__dirname, "client", "resources", "app.u3a");
const BOOT = path.join(__dirname, "hook", "bootstrap.js");
const OFF = 5337969, SLOT = 3872816;

const src = fs.readFileSync(BOOT);
const P = SLOT - 16;                       // required ciphertext body length
const LO = P - 16, HI = P - 1;             // valid plaintext lengths for this slot
if (src.length > HI) throw new Error("bootstrap too big: " + src.length);
const L = Math.max(src.length, LO);        // pad up to at least LO
console.log("plaintext padded to", L, "(src " + src.length + ") -> ciphertext " + SLOT);

const pt = Buffer.alloc(L, 0x20);
src.copy(pt);
pt.fill(0x0a, src.length);
const iv = crypto.randomBytes(16);
const ci = crypto.createCipheriv("aes-128-cbc", KEY, iv);
const ct = Buffer.concat([iv, ci.update(pt), ci.final()]);
if (ct.length !== SLOT) throw new Error("ct len " + ct.length + " != " + SLOT);

// self-test: decrypt back
const d = crypto.createDecipheriv("aes-128-cbc", KEY, ct.subarray(0, 16));
const rt = Buffer.concat([d.update(ct.subarray(16)), d.final()]);
if (!rt.subarray(0, src.length).equals(src)) throw new Error("roundtrip mismatch");
console.log("self-test OK");

const fd = fs.openSync(ARC, "r+");
fs.writeSync(fd, ct, 0, ct.length, OFF);
fs.closeSync(fd);
console.log("PATCHED app.u3a @" + OFF);
