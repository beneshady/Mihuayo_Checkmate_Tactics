// US-020 harness fixes: dismiss the first-entry camp guide before interacting.
const fs=require('fs');
const p='tests/us020-acceptance-browser.cjs';
let t=fs.readFileSync(p,'utf8');
function sub(a,b,label){if(t.indexOf(a)<0)throw Error('anchor missing: '+label);t=t.split(a).join(b);console.log('patched '+label);}
sub(
"async function shot(p,name){const file=path.join(dir,name);await p.screenshot({path:file});shots.push(name);return name;}",
[
 "async function shot(p,name){const file=path.join(dir,name);await p.screenshot({path:file});shots.push(name);return name;}",
 "async function dismissGuide(p){if(await p.locator('#camp-guide').isVisible()){await p.locator('#camp-guide-close').click();await p.waitForTimeout(60);}}"
].join('\n'),
'helper');
sub(
" await p.locator('#tutorial-done-ok').click();\n await waitView(p,'camp');\n return{skipDisabled,skipReason,overlay,doneCopy,progress,reward,beforeEnd};",
[
 " await p.locator('#tutorial-done-ok').click();",
 " await waitView(p,'camp');",
 " const guideFirstSeen=await p.locator('#camp-guide').isVisible();",
 " if(guideFirstSeen)await shot(p,'c26-guide.png');",
 " await dismissGuide(p);",
 " return{skipDisabled,skipReason,overlay,doneCopy,progress,reward,beforeEnd,guideFirstSeen};"
].join('\n'),
'runTutorial guide');
sub(
" const guideShownFirst=await p1.locator('#camp-guide').isVisible();\n await p1.locator('#camp-guide-close').click();\n const guideClosed=await p1.locator('#camp-guide').isVisible();\n await p1.locator('#camp-help').click();",
[
 " const guideShownFirst=tut.guideFirstSeen;",
 " await p1.locator('#camp-help').click();"
].join('\n'),
'C26 guide');
sub(
" A.equal(helpVisible,true);A.equal((await st(p1)).gold,goldBeforeHelp,'帮助不扣资源');\n await shot(p1,'c26-guide.png');",
" A.equal(helpVisible,true);A.equal((await st(p1)).gold,goldBeforeHelp,'帮助不扣资源');\n await dismissGuide(p1);",
'C26 close');
sub("  await p1.locator('#camp-guide').isVisible().then(async v=>{if(v)await p1.locator('#camp-guide-close').click();});\n","","C01 leftover");
sub(" await p6.locator('#camp-guide').isVisible().then(async v=>{if(v)await p6.locator('#camp-guide-close').click();});\n","","C06 leftover");
fs.writeFileSync(p,t);
console.log('harness patched');
