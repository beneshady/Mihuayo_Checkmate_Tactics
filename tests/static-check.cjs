// 静态一致性检查：app.js 引用的 DOM id 必须存在于 index.html；
// app.js 引用的 M0 API 必须存在于 rules.js 导出。
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '../web/index.html'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '../web/js/app.js'), 'utf8');
const R = require('../web/js/rules.js');

let fail = 0;
const ids = new Set();
for (const m of app.matchAll(/\$\('([^']+)'\)/g)) ids.add(m[1]);
for (const id of ids) {
  if (!new RegExp(`id="${id}"`).test(html)) { console.error('MISSING DOM id:', id); fail++; }
}
console.log('DOM ids referenced:', ids.size);

const apis = new Set();
for (const m of app.matchAll(/(?<![A-Za-z_$])(?:M0|R)\.([A-Za-z_$][\w$]*)/g)) apis.add(m[1]);
for (const api of apis) {
  if (!(api in R)) { console.error('MISSING rules API:', api); fail++; }
}
console.log('rules APIs referenced:', apis.size);
if (fail) { process.exit(1); }
console.log('static check: OK');
