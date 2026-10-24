// MCP 协议替身：验证桌面投递、等待与失败处理，不连接真实桌面或模型。
import readline from 'node:readline';
import fs from 'node:fs';
const lines = readline.createInterface({ input: process.stdin });
let reads = 0;
const respond = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
const text = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
for await (const line of lines) {
  const request = JSON.parse(line);
  if (request.method === 'initialize') respond(request.id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'test', version: '1' } });
  else if (request.method === 'tools/list') respond(request.id, { tools: ['read_thread', 'send_message_to_thread'].map(name => ({ name })) });
  else if (request.method === 'tools/call') {
    const { name, arguments: args, _meta } = request.params;
    fs.appendFileSync(process.env.DSH_TEST_TRACE, JSON.stringify({ name, reads, args, parentMode: process.env.DSH_PERMISSION_MODE, caller: _meta['openai/threadId'] }) + '\n');
    if (process.env.DSH_PERMISSION_MODE !== 'test-parent') { respond(request.id, { isError: true, content: [{ type: 'text', text: '权限变量泄漏' }] }); continue; }
    if (name === 'read_thread') {
      reads++;
      const state = fs.readFileSync(process.env.DSH_TEST_STATE, 'utf8').trim();
      const status = state === 'busy' || reads <= Number(process.env.DSH_TEST_BUSY_READS || 0) ? 'active' : 'idle';
      respond(request.id, text({ thread: { id: args.threadId, cwd: state === 'wrong-project' ? 'D:/another-project' : process.cwd(), status: { type: status } }, turns: [] }));
    } else if (name === 'send_message_to_thread') {
      if (process.env.DSH_TEST_NOTIFY_FAIL === 'accepted') { process.exit(8); }
      if (process.env.DSH_TEST_NOTIFY_FAIL === '1') respond(request.id, { isError: true, content: [{ type: 'text', text: '测试拒绝通知' }] });
      else respond(request.id, text({ threadId: args.threadId }));
    }
  }
}
