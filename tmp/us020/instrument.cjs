// US-020 harness: instrument playLevel so a slow/hung level is visible in the log.
const fs=require('fs');
const p='tests/us020-acceptance-browser.cjs';
let t=fs.readFileSync(p,'utf8');
function sub(a,b,label){if(t.indexOf(a)<0)throw Error('anchor missing: '+label);t=t.split(a).join(b);console.log('patched '+label);}
sub(
`async function playLevel(p,maxTurns=12){
 let seen5=false,seen6=false;
 for(let guard=0;guard<maxTurns;guard++){
  let s=await st(p);if(s.phase!=='player')break;
  for(let q=0;q<10;q++){s=await st(p);if(s.phase!=='player')break;const a=choice(s);if(!a)break;await doAction(p,a);}
  s=await st(p);if(s.turn===5)seen5=true;if(s.turn>=6)seen6=true;
  if(s.phase==='rescue'){await p.locator('#btn-rescue-skip').click();continue;}
  if(s.phase==='player')await endTurn(p);
 }
 const s=await st(p);
 return{s,seen5,seen6};
}`,
`async function playLevel(p,maxTurns=12){
 let seen5=false,seen6=false;
 for(let guard=0;guard<maxTurns;guard++){
  let s=await st(p);if(s.phase!=='player')break;
  console.log('  playLevel turn',s.turn,'units',s.units.filter(u=>u.side==='player').length);
  for(let q=0;q<10;q++){s=await st(p);if(s.phase!=='player')break;const t0=Date.now();const a=choice(s);if(!a)break;await doAction(p,a);if(Date.now()-t0>3000)console.log('  slow choice',Date.now()-t0,'ms');}
  s=await st(p);if(s.turn===5)seen5=true;if(s.turn>=6)seen6=true;
  if(s.phase==='rescue'){await p.locator('#btn-rescue-skip').click({timeout:5000});continue;}
  if(s.phase==='player')await endTurn(p);
 }
 const s=await st(p);
 console.log('  playLevel done phase',s.phase,'turn',s.turn,'wave',s.wave);
 return{s,seen5,seen6};
}`,
'playLevel log');
sub(
`async function endTurn(p){await p.locator('#btn-end').click();await p.locator('#btn-confirm-yes').click();}`,
`async function endTurn(p){await p.locator('#btn-end').click({timeout:8000});await p.locator('#btn-confirm-yes').click({timeout:8000});await p.waitForTimeout(40);}`,
'endTurn timeout');
sub(
`async function selectUnit(p,id){await p.locator(\`[data-unit="\${id}"]\`).click();}`,
`async function selectUnit(p,id){await p.locator(\`[data-unit="\${id}"]\`).click({timeout:8000});}`,
'selectUnit timeout');
fs.writeFileSync(p,t);
console.log('harness instrumented');
