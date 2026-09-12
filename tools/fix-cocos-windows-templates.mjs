// 固定上游版本的 Windows 模板定位补丁；不改 Scene/Prefab 序列化内容。
import { readFileSync, writeFileSync } from 'node:fs';
const file = '.tools/cocos-creator-local-mcp/src/tools/cocos-local.ts';
let source = readFileSync(file, 'utf8');
const old = 'dirname(dirname(creatorPath)), "Resources"';
const replacement = '...(process.platform === "win32" ? [dirname(creatorPath), "resources"] : [dirname(dirname(creatorPath)), "Resources"])';
if (!source.includes(replacement)) {
  if (source.split(old).length !== 3) throw new Error('上游结构已变化，停止补丁');
  source = source.replaceAll(old, replacement);
}
source = source.replace('basename, dirname, extname, join, relative, resolve }', 'basename, dirname, extname, join, relative, resolve, sep }')
  .replaceAll('`${root}/`', '`${root}${sep}`').replaceAll('`${assetsRoot}/`', '`${assetsRoot}${sep}`');
writeFileSync(file, source);
