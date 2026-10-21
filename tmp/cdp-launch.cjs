const {spawn}=require('node:child_process');
const path=require('node:path'),os=require('node:os'),fs=require('node:fs');
const exe=path.join(process.env.LOCALAPPDATA,'ms-playwright','chromium_headless_shell-1234','chrome-headless-shell-win64','chrome-headless-shell.exe');
const ud=path.join(os.tmpdir(),'dsh-cdp-us019');fs.mkdirSync(ud,{recursive:true});
const ch=spawn(exe,['--headless','--no-sandbox','--remote-debugging-port=9333','--user-data-dir='+ud,'about:blank'],{detached:true,stdio:'ignore'});
ch.unref();console.log('spawned',ch.pid);
