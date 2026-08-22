const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Relocatable: encrypts editable plain sources into ".u3enc" twins so the
// renderer process (and any mangled lookup) can read them.
const KEY = Buffer.from("QJBNiBmV55PDrewyne3GsA==", "base64");
const ROOT = path.join(__dirname, "extracted", "dist");
const DIRS = [path.join(ROOT, "main"), path.join(ROOT, "utils"), path.join(ROOT, "preload")];

for (const dir of DIRS) {
  for (const name of fs.readdirSync(dir)) {
    if (!/\.js$/i.test(name)) continue;
    const srcPath = path.join(dir, name);
    const dstPath = srcPath + ".u3enc";
    const plain = fs.readFileSync(srcPath);
    const iv = crypto.randomBytes(16);
    const ci = crypto.createCipheriv("aes-128-cbc", KEY, iv);
    fs.writeFileSync(dstPath, Buffer.concat([iv, ci.update(plain), ci.final()]));
    console.log(path.relative(ROOT, dstPath), "(" + plain.length + "B)");
  }
}
console.log("twins synced");
