'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const packageJSON = require('./package.json');

let server = null;
let currentPort = null;

exports.load = function load() {
  startServer().catch((error) => console.error('[codex-editor-bridge] failed to start', error));
};

exports.unload = function unload() {
  stopServer();
};

exports.methods = {
  printStatus() {
    console.log('[codex-editor-bridge]', { running: Boolean(server), port: currentPort });
    return { running: Boolean(server), port: currentPort };
  },
  async startServer() {
    return startServer();
  },
  stopServer() {
    return stopServer();
  },
  async sceneSummary() {
    return executeScene('sceneSummary', [{}]);
  },
};

async function startServer() {
  if (server) {
    return { running: true, port: currentPort, reused: true };
  }
  const config = readConfig();
  currentPort = config.port || 17388;
  server = http.createServer(handleRequest);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(currentPort, '127.0.0.1', resolve);
  });
  console.log('[codex-editor-bridge] listening on 127.0.0.1:' + currentPort);
  return { running: true, port: currentPort, reused: false };
}

function stopServer() {
  if (!server) {
    return { running: false, port: currentPort };
  }
  const closing = server;
  server = null;
  closing.close();
  console.log('[codex-editor-bridge] stopped');
  return { running: false, port: currentPort };
}

async function handleRequest(req, res) {
  try {
    const body = await readBody(req);
    const route = new URL(req.url || '/', 'http://127.0.0.1').pathname;
    if (req.method === 'GET' && route === '/health') {
      return sendJson(res, 200, {
        ok: true,
        package: packageJSON.name,
        version: packageJSON.version,
        port: currentPort,
      });
    }
    if (req.method === 'GET' && route === '/routes') {
      return sendJson(res, 200, {
        ok: true,
        routes: [
          'GET /health',
          'GET /routes',
          'POST /editor/message',
          'POST /assets/query',
          'POST /assets/info',
          'POST /assets/create',
          'POST /scene/summary',
          'POST /scene/open-scene',
          'POST /scene/node-detail',
          'POST /scene/create-node',
          'POST /scene/set-node',
          'POST /scene/add-component',
          'POST /scene/set-component-property',
          'POST /scene/set-component-asset-property',
          'POST /scene/set-component-asset-array-property',
          'POST /scene/apply-blueprint',
          'POST /scene/save',
        ],
      });
    }
    if (req.method === 'POST' && route === '/editor/message') {
      return sendJson(res, 200, await editorMessage(body || {}));
    }
    if (req.method === 'POST' && route === '/assets/query') {
      return sendJson(res, 200, await editorMessage({
        package: 'asset-db',
        message: 'query-assets',
        args: [body && body.options ? body.options : body || {}],
      }));
    }
    if (req.method === 'POST' && route === '/assets/info') {
      const id = body && (body.urlOrUuid || body.uuid || body.url);
      return sendJson(res, 200, await editorMessage({
        package: 'asset-db',
        message: 'query-asset-info',
        args: [id],
      }));
    }
    if (req.method === 'POST' && route === '/assets/create') {
      return sendJson(res, 200, await editorMessage({
        package: 'asset-db',
        message: 'create-asset',
        args: [body && body.url, body && body.content],
      }));
    }
    if (req.method === 'POST' && route === '/scene/summary') {
      return sendJson(res, 200, await executeScene('sceneSummary', [body || {}]));
    }
    if (req.method === 'POST' && route === '/scene/open-scene') {
      return sendJson(res, 200, await editorMessage({
        package: 'scene',
        message: 'open-scene',
        args: [body && (body.sceneUuid || body.uuid)],
      }));
    }
    if (req.method === 'POST' && route === '/scene/node-detail') {
      return sendJson(res, 200, await executeScene('nodeDetail', [body || {}]));
    }
    if (req.method === 'POST' && route === '/scene/create-node') {
      return sendJson(res, 200, await executeScene('createNode', [body || {}]));
    }
    if (req.method === 'POST' && route === '/scene/set-node') {
      return sendJson(res, 200, await executeScene('setNode', [body || {}]));
    }
    if (req.method === 'POST' && route === '/scene/add-component') {
      return sendJson(res, 200, await executeScene('addComponent', [body || {}]));
    }
    if (req.method === 'POST' && route === '/scene/set-component-property') {
      return sendJson(res, 200, await executeScene('setComponentProperty', [body || {}]));
    }
    if (req.method === 'POST' && route === '/scene/set-component-asset-property') {
      return sendJson(res, 200, await executeScene('setComponentAssetProperty', [body || {}]));
    }
    if (req.method === 'POST' && route === '/scene/set-component-asset-array-property') {
      return sendJson(res, 200, await executeScene('setComponentAssetArrayProperty', [body || {}]));
    }
    if (req.method === 'POST' && route === '/scene/apply-blueprint') {
      return sendJson(res, 200, await executeScene('applyBlueprint', [body || {}]));
    }
    if (req.method === 'POST' && route === '/scene/save') {
      return sendJson(res, 200, await editorMessage({
        package: 'scene',
        message: 'save-scene',
        args: body && Array.isArray(body.args) ? body.args : [],
      }));
    }
    return sendJson(res, 404, { ok: false, error: 'unknown route', route, method: req.method });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error && error.stack ? error.stack : String(error) });
  }
}

async function editorMessage(input) {
  const packageName = input.package || input.packageName;
  const message = input.message;
  const args = Array.isArray(input.args) ? input.args : [];
  if (!isAllowedEditorMessage(packageName, message)) {
    return {
      ok: false,
      error: 'Editor message is not allowlisted.',
      package: packageName,
      message,
    };
  }
  try {
    const result = await Editor.Message.request(packageName, message, ...args);
    return { ok: true, package: packageName, message, result };
  } catch (error) {
    return {
      ok: false,
      package: packageName,
      message,
      error: error && error.stack ? error.stack : String(error),
    };
  }
}

function isAllowedEditorMessage(packageName, message) {
  const allowed = {
    'asset-db': new Set([
      'refresh-asset',
      'query-assets',
      'query-asset-info',
      'query-uuid',
      'query-url',
      'query-path',
      'create-asset',
    ]),
    scene: new Set([
      'create-prefab',
      'execute-scene-script',
      'query-node',
      'open-scene',
      'save-scene',
    ]),
  };
  return Boolean(packageName && message && allowed[packageName] && allowed[packageName].has(message));
}

async function executeScene(method, args) {
  return Editor.Message.request('scene', 'execute-scene-script', {
    name: packageJSON.name,
    method,
    args: args || [],
  });
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'bridge-config.json'), 'utf8'));
  } catch {
    return { port: 17388 };
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => raw += chunk);
    req.on('error', reject);
    req.on('end', () => {
      if (!raw) return resolve(null);
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function sendJson(res, status, value) {
  const text = JSON.stringify(value === undefined ? null : value, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
  });
  res.end(text);
}
