#!/usr/bin/env node
/* تغيير ثيم المتجر بأمان:  node tools/set-theme.js اسم-الثيم
   - يتأكد أن الثيم موجود في js/themes.js ثم يكتب اسمه في theme.preset داخل js/config.js (الملف الذي يقرؤه الموقع فعلاً).
   - بدون اسم: يعرض الثيم الحالي وقائمة الثيمات المتاحة.
   ملاحظة: js/config.template.js نسخة فارغة للمتاجر الجديدة ولا تحمّلها أي صفحة، فتغيير الثيم فيها لا يؤثر على الموقع. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const cfgPath = path.join(root, "js", "config.js");
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root, "js", "themes.js"), "utf8") + "\n;this.__T = STORE_THEMES;", ctx);
const themes = ctx.__T;
const names = Object.keys(themes);

let cfg = fs.readFileSync(cfgPath, "utf8");
const re = /(theme:\s*\{[\s\S]*?\bpreset:\s*)(["'])([^"']*)\2/;
const m = re.exec(cfg);
if (!m) { console.error("✗ لم أجد theme.preset داخل js/config.js"); process.exit(1); }
const current = m[3];
const want = process.argv[2];

if (!want) {
  console.log("الثيم الحالي في js/config.js: " + current + "\n\nالثيمات المتاحة:");
  names.forEach(n => console.log("  " + (n === current ? "●" : "○") + " " + n + "  — " + (themes[n].label || "")));
  console.log("\nللتغيير: node tools/set-theme.js اسم-الثيم");
  process.exit(0);
}
if (names.indexOf(want) < 0) {
  console.error("✗ الثيم «" + want + "» غير موجود في js/themes.js.\nالمتاح: " + names.join(" · "));
  process.exit(1);
}
if (want === current) { console.log("✓ الثيم «" + want + "» هو المفعَّل أصلاً في js/config.js — لا تغيير."); process.exit(0); }
cfg = cfg.replace(re, function (all, pre, q) { return pre + q + want + q; });
fs.writeFileSync(cfgPath, cfg);
console.log("✓ js/config.js ← theme.preset: \"" + want + "\" (كان \"" + current + "\")");
console.log("  حدّث الصفحة (Ctrl+F5). إن كنت فتحت معاينة سابقاً أضف ‎?theme=off‎ مرة واحدة للرابط.");
console.log("  للفحص:  node tools/check-themes.js " + want);
