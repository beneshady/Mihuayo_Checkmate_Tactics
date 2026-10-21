const path=require('node:path');
const pw=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async()=>{const t=Date.now();const b=await pw.chromium.launch({headless:true});const p=await b.newPage();await p.setContent('<h1>ok</h1>');console.log('LAUNCH OK',Date.now()-t+'ms',await p.textContent('h1'),b.version());await b.close();})().catch(e=>{console.error('LAUNCH FAIL',e.message);process.exitCode=1;});
