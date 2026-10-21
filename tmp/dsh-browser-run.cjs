const {spawn}=require('node:child_process');
const path=require('node:path'),fs=require('node:fs');
const exe=path.join(process.env.LOCALAPPDATA,'ms-playwright','chromium_headless_shell-1234','chrome-headless-shell-win64','chrome-headless-shell.exe');
const ud=path.join(process.cwd(),'tmp','dsh-browser-profile');
fs.mkdirSync(ud,{recursive:true});
const ch=spawn(exe,['--headless','--no-sandbox','--disable-gpu','--remote-debugging-port=9333','--user-data-dir='+ud,'about:blank'],{stdio:'ignore',windowsHide:true});
ch.on('exit',(c,s)=>{console.log('chrome exit',c,s);process.exit(0);});
console.log('chrome pid',ch.pid);
setInterval(()=>{},60000);
