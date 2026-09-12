// 使用仓库已固定版本的 MCP 服务；不依赖会话是否注册了工具。
import { Client } from '../.tools/cocos-creator-local-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from '../.tools/cocos-creator-local-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
const client = new Client({ name: 'm0-local', version: '1.0.0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: ['.tools/cocos-creator-local-mcp/dist/index.js'] }));
try {
  const args = process.argv[3] ? JSON.parse(process.argv[3]) : {};
  console.log(JSON.stringify(await client.callTool({ name: process.argv[2], arguments: args }, undefined, { timeout: (args.timeoutMs ?? 60000) + 15000 }), null, 2));
} finally { await client.close(); }
