#!/usr/bin/env node
/* رفع رقم النسخة (cache-busting) في كل الصفحات دفعة واحدة:  node tools/set-version.js 78
   يبدّل ?v=NN في كل ملفات *.html ويحدّث assetVersion في js/config.js لتبقى كلها متطابقة. */
const fs = require("fs");
const path = require("path");
const n = parseInt(process.argv[2], 10);
if (!Number.isInteger(n) || n < 1) { console.error("الاستخدام: node tools/set-version.js 78"); process.exit(1); }
const root = path.join(__dirname, "..");
let files = 0;
fs.readdirSync(root).filter(f => f.endsWith(".html")).forEach(f => {
  const p = path.join(root, f);
  const s = fs.readFileSync(p, "utf8");
  const t = s.replace(/\?v=\d+/g, "?v=" + n);
  if (t !== s) { fs.writeFileSync(p, t); files++; }
});
const cp = path.join(root, "js", "config.js");
const c = fs.readFileSync(cp, "utf8");
const c2 = c.replace(/(assetVersion:\s*)\d+/, "$1" + n);
if (c2 !== c) fs.writeFileSync(cp, c2);
console.log("تم: ?v=" + n + " في " + files + " صفحة، وassetVersion=" + n + " في config.js");
