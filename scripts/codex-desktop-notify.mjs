// 通过 Codex 随附 MCP 服务投递完成通知，不创建第二个 Codex CLI 会话。
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

export function findDesktopServer(env = process.env) {
  if (env.DSH_DESKTOP_MCP_SERVER) return path.resolve(env.DSH_DESKTOP_MCP_SERVER);
  const home = env.CODEX_HOME || path.join(env.USERPROFILE || env.HOME, '.codex');
  const base = path.join(home, 'plugins/cache/openai-bundled/codex-app-tools');
  const versions = fs.readdirSync(base).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  const found = versions.map(v => path.join(base, v, 'server.mjs')).find(p => fs.existsSync(p));
  if (!found) throw new Error('未发现 Codex 随附的 codex-app-tools/server.mjs。请从 Codex 终端运行。');
  return found;
}

class DesktopMcp {
  constructor(server) {
    this.seq = 0;
    this.pending = new Map();
    this.buffer = '';
    this.child = spawn(process.execPath, [server], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', data => {
      this.buffer += data;
      let index;
      while ((index = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, index); this.buffer = this.buffer.slice(index + 1);
        if (!line.trim()) continue;
        try {
          const response = JSON.parse(line);
          const waiting = this.pending.get(response.id);
          if (waiting) {
            this.pending.delete(response.id); clearTimeout(waiting.timer);
            if (response.error) waiting.reject(new Error(response.error.message));
            else waiting.resolve(response.result);
          } else if (response.method && response.id != null) {
            // 不伪造工具审批响应；当前桥只允许读取状态和已获用户授权的交付通知。
            this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: response.id, error: { code: -32601, message: '本桥不处理交互审批；请在 Codex 内处理。' } }) + '\n');
          }
        } catch (error) { this.fail(error); }
      }
    });
    this.child.stderr.on('data', chunk => process.stderr.write(chunk));
    this.child.on('error', error => this.fail(error));
    this.child.on('exit', code => this.fail(new Error(`桌面 MCP 连接退出：${code}`)));
    this.child.stdin.on('error', error => this.fail(error));
  }
  fail(error) {
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(error); }
    this.pending.clear();
  }
  request(method, params, timeout = 30000) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`桌面 MCP 超时：${method}`)); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }
  async initialize() {
    await this.request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'dsh-completion-callback', version: '1.0.0' } });
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const { tools } = await this.request('tools/list', {});
    for (const name of ['read_thread', 'send_message_to_thread']) {
      if (!tools.some(tool => tool.name === name)) throw new Error(`桌面缺少 ${name} 工具。`);
    }
  }
  call(name, args, caller) {
    return this.request('tools/call', { name, arguments: args, _meta: { 'openai/threadId': caller } }, 60000);
  }
  close() { this.fail(new Error('连接已结束')); this.child.stdin.end(); this.child.kill(); }
}

function decode(result) {
  const text = (result.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  if (result.isError) throw new Error(text || '桌面工具拒绝请求');
  try { return JSON.parse(text); } catch { throw new Error('桌面工具未返回预期的 JSON 结果'); }
}

export async function notifyDesktop(recordPath, { waitSeconds = 21600, pollSeconds = 30 } = {}) {
  let record = JSON.parse(fs.readFileSync(recordPath, 'utf8').replace(/^\uFEFF/, ''));
  const save = changes => {
    record = { ...record, ...changes, updatedAt: new Date().toISOString() };
    const tmp = `${recordPath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(record, null, 2)); fs.renameSync(tmp, recordPath);
  };
  if (record.notifyState === 'delivered') return 0;
  if (['sending', 'notifying', 'uncertain'].includes(record.notifyState)) {
    throw new Error('上次投递状态不明确，先核对目标会话，不能重复发送。');
  }
  if (!['exited', 'start-failed'].includes(record.dshState)) throw new Error('DSH 尚未确认退出。');
  const caller = process.env.CODEX_THREAD_ID || record.callerThreadId;
  if (!caller) throw new Error('缺少实际派发会话 CODEX_THREAD_ID，请从 Codex 会话终端重试。');
  if (!process.env.CODEX_APP_TOOLS_PIPE_PATH && !process.env.DSH_DESKTOP_MCP_SERVER) {
    throw new Error('缺少桌面 MCP 连接，请从正在运行的 Codex 终端派发或重试。');
  }
  // 包装脚本意外退出后，旧通知子进程可能仍在等候。独立所有权文件避免二次重试并行投递。
  const workerPath = path.join(path.dirname(recordPath), 'notify-worker.lock');
  const acquire = () => {
    try { const fd = fs.openSync(workerPath, 'wx'); fs.writeFileSync(fd, JSON.stringify({ pid: process.pid })); return fd; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let owner;
      try { owner = JSON.parse(fs.readFileSync(workerPath, 'utf8')); } catch { throw new Error('通知进程锁尚未完整写入，稍后再试。'); }
      try { process.kill(owner.pid, 0); } catch (probe) {
        if (probe.code === 'ESRCH') { fs.unlinkSync(workerPath); return acquire(); }
        throw new Error('不能确认旧通知进程已退出，保留结果。');
      }
      throw new Error(`已有通知进程 ${owner.pid}，不能重复投递。`);
    }
  };
  const workerFd = acquire();
  let mcp;
  let sending = false;
  const marker = `[DSH 完成回调 ${record.runId}]`;
  save({ notifyTransport: 'desktop-mcp', notifyState: 'pending', error: null });
  try {
    mcp = new DesktopMcp(findDesktopServer());
    await mcp.initialize();
    const deadline = Date.now() + waitSeconds * 1000;
    for (;;) {
      const snapshot = decode(await mcp.call('read_thread', { threadId: record.codexThreadId, hostId: 'local', turnLimit: 2, includeOutputs: false, maxOutputCharsPerItem: 1800 }, caller));
      const thread = snapshot.thread;
      if (!thread || thread.id !== record.codexThreadId || path.resolve(thread.cwd || '') !== path.resolve(record.projectRoot)) {
        throw new Error('目标会话 ID 或项目目录不匹配，停止通知。');
      }
      // 进程在收到回执前退出时，可通过目标会话中已持久化的运行标记避免重发。
      const alreadyReceived = (snapshot.turns || []).some(turn => (turn.items || []).some(item =>
        item.type === 'userMessage' && (item.content || []).some(c => c.type === 'text' && c.text?.includes(marker))));
      if (alreadyReceived) {
        save({ notifyState: 'delivered', reviewState: 'not-tracked', error: null, notificationReceipt: { recoveredFromThread: true, threadId: thread.id } });
        return 0;
      }
      const status = thread.status?.type;
      if (status === 'idle') break;
      save({ notifyState: 'waiting', targetStatus: status || 'unknown', error: '目标尚未空闲，脚本等待投递，不调用模型。' });
      if (Date.now() >= deadline) {
        save({ notifyState: 'pending', error: '等待目标空闲超时；保留结果，可仅重试通知。' });
        return 2;
      }
      await delay(Math.min(pollSeconds * 1000, Math.max(1, deadline - Date.now())));
    }
    // 桌面仍可在状态检查之后接收用户消息；通过同一桌面发送，避免多 writer 冲突。
    const prompt = `${marker}\n用户已授权本任务交付后的结果审阅。DSH 状态：${record.dshState}，退出码：${record.dshExitCode}；结束不等于验收通过。\n需求文档：${record.taskDoc}\n运行记录：${recordPath}\n请读取本运行记录、同目录 dsh.stdout.log 的简短交付和需求文档最新验收结果，仅审阅本次范围内的证据、未验项及版本。正常结束不等于通过；发现遗漏按已授权范围经 scripts/run-dsh.ps1 串行退修/补验，真实阻塞向用户说明。不默认重跑测试或亲自浏览器验收，不创建巡检、不提交推送。若此文档明确本次是只读接入测试，只按其中回调测试要求回复，勿处理历史游戏任务。最终结论包含本次运行编号。`;
    save({ notifyState: 'sending', notifyAttempt: (record.notifyAttempt || 0) + 1, error: null });
    sending = true;
    const receipt = await mcp.call('send_message_to_thread', { threadId: record.codexThreadId, hostId: 'local', prompt }, caller);
    fs.writeFileSync(path.join(path.dirname(recordPath), `desktop.${record.notifyAttempt}.receipt.json`), JSON.stringify(receipt, null, 2));
    if (receipt.isError) {
      save({ notifyState: 'pending', error: (receipt.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n') || '桌面拒绝本次通知' });
      return 2;
    }
    const accepted = decode(receipt);
    if (accepted.threadId !== record.codexThreadId) throw new Error('通知回执的 threadId 不匹配，需人工核对。');
    save({ notifyState: 'delivered', deliveredAt: new Date().toISOString(), reviewState: 'pending', notificationReceipt: accepted, targetStatus: 'submitted', error: null });
    console.log(`桌面已接收 DSH 回调：${record.runId}；审阅结果由接收会话回报。`);
    return 0;
  } catch (error) {
    save({ notifyState: sending ? 'uncertain' : 'pending', error: error.message });
    console.error(error.message);
    return 2;
  } finally {
    mcp?.close();
    fs.closeSync(workerFd);
    // 只清理本次拥有的运行目录锁，不触碰其他进程或会话锁。
    if (JSON.parse(fs.readFileSync(workerPath, 'utf8')).pid === process.pid) fs.unlinkSync(workerPath);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const recordPath = args[args.indexOf('--record') + 1];
  const option = (name, fallback) => args.includes(name) ? Number(args[args.indexOf(name) + 1]) : fallback;
  try {
    if (!args.includes('--record') || !recordPath) throw new Error('需要 --record <run.json>');
    process.exitCode = await notifyDesktop(path.resolve(recordPath), { waitSeconds: option('--wait-seconds', 21600), pollSeconds: option('--poll-seconds', 30) });
  } catch (error) { console.error(error.message); process.exitCode = 2; }
}
