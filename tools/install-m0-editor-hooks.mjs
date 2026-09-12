import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
const root='game/extensions/codex-editor-bridge/';
let browser=readFileSync(root+'browser.js','utf8');
browser=browser.replaceAll("\n      'refresh-asset',",'').replaceAll("\n      'create-prefab',",'')
 .replace("'asset-db': new Set([", "'asset-db': new Set([\n      'refresh-asset',")
 .replace("scene: new Set([", "scene: new Set([\n      'create-prefab',");
writeFileSync(root+'browser.js',browser);
let scene=readFileSync(root+'scene.js','utf8');
if(!scene.includes("require('./m0-hooks')"))scene+="\nObject.assign(exports.methods, require('./m0-hooks'));\n";
writeFileSync(root+'scene.js',scene);
copyFileSync('tools/m0-editor-hooks.cjs',root+'m0-hooks.js');
copyFileSync('.tools/cocos-creator-local-mcp/LICENSE',root+'LICENSE');
