import { readFileSync } from 'node:fs';
const request=async(route,data)=>{
  const response=await fetch('http://127.0.0.1:17388'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const result=await response.json();if(!response.ok||result.ok===false)throw Error(JSON.stringify(result));return result;
};
const meta=JSON.parse(readFileSync('game/assets/scenes/Main.scene.meta','utf8'));
await request('/scene/open-scene',{sceneUuid:meta.uuid});
await request('/editor/message',{package:'asset-db',message:'refresh-asset',args:['db://assets']});
console.log(await request('/editor/message',{package:'scene',message:'execute-scene-script',args:[{name:'codex-editor-bridge',method:'assembleM0',args:[]}]}));
console.log(await request('/scene/save',{}));
