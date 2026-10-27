import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { test } from 'node:test';

test('real MCP stdio protocol: read-only public overview and admission gates', { timeout: 15000 }, async (t) => {
  const child = spawn(process.execPath, ['apps/synnergyze-discovery-mcp-r01/server.mjs'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { PATH: process.env.PATH || '', NODE_ENV: 'test', HOME: process.env.HOME || '' }
  });
  t.after(() => { if (!child.killed) child.kill('SIGTERM'); });
  let id = 1;
  let errors = '';
  const outstanding = new Map();
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (part) => { errors += part; });
  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    try {
      const reply = JSON.parse(line);
      if (reply.id === undefined) return;
      const current = outstanding.get(reply.id);
      if (!current) return;
      outstanding.delete(reply.id);
      current.resolve(reply);
    } catch (err) {
      for (const pending of outstanding.values()) pending.reject(err);
      outstanding.clear();
    }
  });
  child.on('error', (err) => {
    for (const pending of outstanding.values()) pending.reject(err);
    outstanding.clear();
  });
  child.on('exit', (code) => {
    for (const pending of outstanding.values()) {
      pending.reject(new Error('MCP exited ' + code + ': ' + errors.slice(0, 1000)));
    }
    outstanding.clear();
  });
  const rpc = (method, params = {}) => {
    const requestId = id++;
    const response = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        outstanding.delete(requestId);
        reject(new Error('Timed out: ' + method + '; ' + errors.slice(0, 1000)));
      }, 6000);
      outstanding.set(requestId, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); }
      });
    });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params }) + '\n');
    return response;
  };

  const initialized = await rpc('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'synnergyze-discovery-smoke-test', version: '0.1.0' }
  });
  assert.equal(initialized.error, undefined, JSON.stringify(initialized.error));
  assert.match(initialized.result.serverInfo.name, /synnergyze-discovery/);
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  const listing = await rpc('tools/list');
  assert.equal(listing.error, undefined);
  const names = listing.result.tools.map((tool) => tool.name).sort();
  assert.deepEqual(names, ['synnergyze_public_overview', 'synnergyze_registry_admission_gates']);
  for (const tool of listing.result.tools) {
    assert.deepEqual(tool.inputSchema.properties ?? {}, {});
  }

  const overview = await rpc('tools/call', { name: 'synnergyze_public_overview', arguments: {} });
  assert.equal(overview.error, undefined);
  const metadata = JSON.parse(overview.result.content[0].text);
  assert.equal(metadata.registered, false);
  assert.equal(metadata.operationalService, false);
  assert.equal(metadata.publicRemoteEndpoint, null);
  assert.equal(metadata.stage, 'SYNTHETIC_LOCAL_ONLY');
  assert.match(metadata.existingDraftPullRequest, /pull\/153$/);

  const gateReply = await rpc('tools/call', { name: 'synnergyze_registry_admission_gates', arguments: {} });
  assert.equal(gateReply.error, undefined);
  const gateData = JSON.parse(gateReply.result.content[0].text);
  assert.equal(gateData.status, 'HOLD');
  assert.ok(gateData.forbiddenInThisCandidate.length >= 4);

  const forbidden = await rpc('tools/call', { name: 'create_payment', arguments: {} });
  assert.ok(forbidden.error || forbidden.result?.isError, 'unknown mutations must fail closed');
  assert.equal(errors.includes('SyntaxError'), false, errors);

  child.stdin.end();
  await Promise.race([once(child, 'exit'), new Promise((_, reject) => setTimeout(() => reject(new Error('Child did not exit after EOF')), 3000))]);
});
