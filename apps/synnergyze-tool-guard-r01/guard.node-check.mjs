import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMcpToolCallGuard } from './guard.mjs';

const tools = Object.freeze({
  pull_request_read: { version: 'github-mcp-observed-2026-10-28', readOnly: true, inputSchema: { type: 'object', required: ['owner','repo','method','pullNumber'], additionalProperties: false, properties: { owner: { type: 'string', minLength: 1 }, repo: { type: 'string', minLength: 1 }, method: { type: 'string', enum: ['get'] }, pullNumber: { type: 'integer', minimum: 1 } } } },
  issue_read: { version: 'github-mcp-observed-2026-10-28', readOnly: true, inputSchema: { type: 'object', required: ['owner','repo','method','issue_number'], additionalProperties: false, properties: { owner: { type: 'string' }, repo: { type: 'string' }, method: { type: 'string', enum: ['get'] }, issue_number: { type: 'integer', minimum: 1 } } } },
  secret_scanning: { version: 'local-test-schema', readOnly: true, inputSchema: { type: 'object', required: ['paths'], additionalProperties: false, properties: { paths: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } } } } },
  mutation: { version: 'local-test-schema', readOnly: false, inputSchema: { type: 'object', required: ['target'], properties: { target: { type: 'string' } } } }
});
const prArgs = { owner: 'tauri-apps', repo: 'tauri', method: 'get', pull_number: 16225 };
const issueArgs = { owner: 'tauri-apps', repo: 'tauri', method: 'get', issueNumber: 16223 };
const mock = (fn = async () => ({ result: 'OK' }), options = {}) => { let calls = 0; const guard = createMcpToolCallGuard({ tools, transport: async (name, args) => { calls++; return fn(name, args); }, ...options }); return { guard, count: () => calls }; };

test('issue #3605: pull_number -> pullNumber only when schema advertises destination', async () => {
  const m = mock((name,args) => { assert.equal(name, 'pull_request_read'); assert.equal(args.pullNumber, 16225); assert.equal('pull_number' in args, false); return {}; });
  assert.equal((await m.guard.invoke('pull_request_read', prArgs)).ok, true);
  assert.equal(m.count(), 1);
});
test('issue #3605: issueNumber -> issue_number only when advertised', async () => {
  const m = mock((name,args) => { assert.equal(args.issue_number, 16223); return {}; });
  assert.equal((await m.guard.invoke('issue_read', issueArgs)).ok, true);
  assert.equal(m.count(), 1);
});
test('conflicting alias and canonical name denies without dispatch', async () => {
  const m = mock();
  const r = await m.guard.invoke('issue_read', { ...issueArgs, issue_number: 16224 });
  assert.equal(r.classification, 'AMBIGUOUS_ARGUMENT'); assert.equal(m.count(), 0);
});
test('required paths missing: deny before calling scanner', async () => {
  const m = mock(); const a = await m.guard.invoke('secret_scanning', {}); const b = await m.guard.invoke('secret_scanning', {});
  assert.equal(a.classification, 'MISSING_REQUIRED_ARGUMENT'); assert.equal(a.path, '$.paths'); assert.equal(b.transportAttempts, 0); assert.equal(m.count(), 0);
});
test('scanner paths must be a nonempty list of nonempty strings', async () => {
  const m = mock(); for (const paths of [[], [''], [123], 'file.mjs']) assert.equal((await m.guard.invoke('secret_scanning', { paths })).ok, false);
  assert.equal(m.count(), 0);
  assert.equal((await m.guard.invoke('secret_scanning', { paths: ['src/server.mjs'] })).ok, true); assert.equal(m.count(), 1);
});
test('unknown tool and unknown parameters fail closed', async () => {
  const m = mock(); assert.equal((await m.guard.invoke('not_registered', {})).classification, 'UNKNOWN_OR_UNPINNED_TOOL');
  assert.equal((await m.guard.invoke('secret_scanning', { paths: ['a'], extra: 1 })).classification, 'UNKNOWN_ARGUMENT'); assert.equal(m.count(), 0);
});
test('unsupported schema constraints fail closed before execution', async () => {
  let called = 0; const guard = createMcpToolCallGuard({ tools: { complex: { version: 'v1', readOnly: true, inputSchema: { type: 'object', oneOf: [{ type: 'object' }] } } }, transport: async () => { called++; } });
  assert.equal((await guard.invoke('complex', {})).classification, 'UNSUPPORTED_SCHEMA'); assert.equal(called, 0);
});
test('remote -32602 is terminal; unchanged replays are blocked', async () => {
  const m = mock(async () => ({ error: { code: -32602, message: 'Invalid input' } }), { maxReadOnlyRetries: 2 });
  const a = await m.guard.invoke('issue_read', issueArgs); const b = await m.guard.invoke('issue_read', issueArgs);
  assert.equal(a.classification, 'REMOTE_INVALID_ARGUMENTS'); assert.equal(a.transportAttempts, 1);
  assert.equal(b.classification, 'REPEATED_TERMINAL_FAILURE'); assert.equal(b.transportAttempts, 0); assert.equal(m.count(), 1);
});
test('other remote JSON-RPC errors do not retry', async () => {
  const m = mock(async () => ({ error: { code: -32000, message: 'Denied' } }), { maxReadOnlyRetries: 2 });
  assert.equal((await m.guard.invoke('issue_read', issueArgs)).classification, 'REMOTE_ERROR'); assert.equal(m.count(), 1);
});
test('read-only transient network failure retries only within explicit budget', async () => {
  let seen = 0; const m = mock(async () => { if (++seen === 1) throw Object.assign(new Error('transient'), { code: 'ECONNRESET' }); return { value: 'ok' }; }, { maxReadOnlyRetries: 1 });
  const r = await m.guard.invoke('issue_read', issueArgs); assert.equal(r.ok, true); assert.equal(r.transportAttempts, 2); assert.equal(m.count(), 2);
});
test('writes are never retried after an unknown transport result', async () => {
  const m = mock(async () => { throw Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }); }, { maxReadOnlyRetries: 2 });
  const first = await m.guard.invoke('mutation', { target: 'synthetic' }); const again = await m.guard.invoke('mutation', { target: 'synthetic' });
  assert.equal(first.classification, 'TRANSIENT_RETRY_EXHAUSTED'); assert.equal(first.transportAttempts, 1); assert.equal(again.classification, 'REPEATED_TERMINAL_FAILURE'); assert.equal(m.count(), 1);
});
test('different payload is not blocked by failed earlier payload', async () => {
  const m = mock(async () => ({ error: { code: -32602 } }));
  assert.equal((await m.guard.invoke('issue_read', issueArgs)).transportAttempts, 1);
  assert.equal((await m.guard.invoke('issue_read', { ...issueArgs, issueNumber: 16224 })).transportAttempts, 1); assert.equal(m.count(), 2);
});
test('normalized equivalent argument order generates same scoped fingerprint', async () => {
  const m = mock(async () => ({ error: { code: -32602 } }));
  const one = await m.guard.invoke('issue_read', issueArgs);
  const two = await m.guard.invoke('issue_read', { issue_number: 16223, method: 'get', repo: 'tauri', owner: 'tauri-apps' });
  assert.equal(one.fingerprint, two.fingerprint); assert.equal(two.transportAttempts, 0); assert.equal(m.count(), 1);
});
test('malformed or dangerous JSON is denied without transport', async () => {
  const m = mock(); const malicious = JSON.parse('{"paths":["foo"],"__proto__":{"admin":true}}');
  assert.equal((await m.guard.invoke('secret_scanning', malicious)).ok, false);
  assert.equal((await m.guard.invoke('secret_scanning', { paths: [undefined] })).ok, false);
  assert.equal(m.count(), 0);
});
test('no retries by default even for transient read-only failure', async () => {
  const m = mock(async () => { throw Object.assign(new Error('timeout'), { status: 503 }); });
  const a = await m.guard.invoke('issue_read', issueArgs); assert.equal(a.transportAttempts, 1); assert.equal(m.count(), 1);
});

test('nested MCP result.isError is terminal and blocks unchanged calls', async () => {
  const m = mock(async () => ({ result: { isError: true, content: [{ type: 'text', text: 'denied' }] } }), { maxReadOnlyRetries: 2 });
  const a = await m.guard.invoke('issue_read', issueArgs);
  const b = await m.guard.invoke('issue_read', issueArgs);
  assert.equal(a.classification, 'REMOTE_ERROR');
  assert.equal(a.transportAttempts, 1);
  assert.equal(b.classification, 'REPEATED_TERMINAL_FAILURE');
  assert.equal(m.count(), 1);
});
