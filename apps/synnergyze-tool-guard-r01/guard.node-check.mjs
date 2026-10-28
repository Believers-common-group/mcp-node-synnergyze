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
test('effect-bearing and unclassified tools are denied pending Warden authorization', async () => {
  const m = mock(async () => { throw Error('Must never execute'); }, { maxReadOnlyRetries: 2 });
  const first = await m.guard.invoke('mutation', { target: 'synthetic' });
  const again = await m.guard.invoke('mutation', { target: 'synthetic' });
  assert.equal(first.classification, 'WARDEN_AUTHORIZATION_REQUIRED');
  assert.equal(first.transportAttempts, 0);
  assert.equal(again.classification, 'WARDEN_AUTHORIZATION_REQUIRED');
  assert.equal(m.count(), 0);
  const unclassified = createMcpToolCallGuard({ tools: { unknownEffect: { version: 'v1', inputSchema: { type: 'object' } } }, transport: async () => { throw Error('Must never execute'); } });
  assert.equal((await unclassified.invoke('unknownEffect', {})).classification, 'WARDEN_AUTHORIZATION_REQUIRED');
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

test('rejects cyclic inputs before fingerprinting or transport', async () => {
  const m = mock();
  const args = { paths: ['src/file.mjs'] };
  args.self = args;
  const r = await m.guard.invoke('secret_scanning', args);
  assert.equal(r.classification, 'INVALID_OR_OVERSIZED_ARGUMENTS');
  assert.equal(r.transportAttempts, 0);
  assert.equal(m.count(), 0);
});
test('rejects deep inputs before recursive canonicalization', async () => {
  const m = mock();
  let deep = 'leaf';
  for (let i = 0; i < 40; i++) deep = [deep];
  const r = await m.guard.invoke('secret_scanning', { paths: [deep] });
  assert.equal(r.classification, 'INVALID_OR_OVERSIZED_ARGUMENTS');
  assert.equal(m.count(), 0);
});
test('rejects input with getters without executing them', async () => {
  let reads = 0;
  const args = Object.defineProperty({}, 'paths', {
    enumerable: true,
    get() { reads++; throw new Error('Getter must never run'); }
  });
  const m = mock();
  const r = await m.guard.invoke('secret_scanning', args);
  assert.equal(r.classification, 'INVALID_OR_OVERSIZED_ARGUMENTS');
  assert.equal(reads, 0);
  assert.equal(m.count(), 0);
});
test('rejects sparse arrays and symbol-keyed properties without dispatch', async () => {
  const m = mock();
  const sparse = new Array(2);
  sparse[0] = 'src/file';
  assert.equal((await m.guard.invoke('secret_scanning', { paths: sparse })).classification, 'INVALID_OR_OVERSIZED_ARGUMENTS');
  const symbols = { paths: ['src/file'] };
  symbols[Symbol('untracked')] = 'hidden';
  assert.equal((await m.guard.invoke('secret_scanning', symbols)).classification, 'INVALID_OR_OVERSIZED_ARGUMENTS');
  assert.equal(m.count(), 0);
});
test('rejects oversized arguments with no transport attempt', async () => {
  const m = mock();
  const r = await m.guard.invoke('secret_scanning', { paths: ['a'.repeat(40000)] });
  assert.equal(r.classification, 'INVALID_OR_OVERSIZED_ARGUMENTS');
  assert.equal(r.transportAttempts, 0);
  assert.equal(m.count(), 0);
});
test('rejects cyclic or accessor-based tool input schemas', async () => {
  const circularSchema = { type: 'object', properties: {} };
  circularSchema.properties.self = circularSchema;
  let reads = 0;
  const accessorSchema = Object.defineProperty({ type: 'object' }, 'properties', {
    enumerable: true, get() { reads++; throw new Error('Not allowed'); }
  });
  let calls = 0;
  const guard = createMcpToolCallGuard({
    tools: {
      circular: { version: 'v1', readOnly: true, inputSchema: circularSchema },
      accessor: { version: 'v1', readOnly: true, inputSchema: accessorSchema }
    },
    transport: async () => { calls++; }
  });
  assert.equal((await guard.invoke('circular', {})).classification, 'INVALID_OR_OVERSIZED_SCHEMA');
  assert.equal((await guard.invoke('accessor', {})).classification, 'INVALID_OR_OVERSIZED_SCHEMA');
  assert.equal(reads, 0);
  assert.equal(calls, 0);
});
test('rejects required schema fields missing from declared properties', async () => {
  const guard = createMcpToolCallGuard({
    tools: { drift: { version: 'v1', readOnly: true, inputSchema: {
      type: 'object', required: ['paths'], properties: { path: { type: 'string' } }
    } } },
    transport: async () => { throw Error('Must not run'); }
  });
  const r = await guard.invoke('drift', { path: 'file' });
  assert.equal(r.classification, 'UNSUPPORTED_SCHEMA');
});
test('nested JSON-RPC -32602 responses are terminal', async () => {
  const m = mock(async () => ({ result: { error: { code: -32602, message: 'Missing required' } } }), { maxReadOnlyRetries: 2 });
  const a = await m.guard.invoke('issue_read', issueArgs);
  const b = await m.guard.invoke('issue_read', issueArgs);
  assert.equal(a.classification, 'REMOTE_INVALID_ARGUMENTS');
  assert.equal(b.classification, 'REPEATED_TERMINAL_FAILURE');
  assert.equal(m.count(), 1);
});
test('null and string remote responses cannot be reported as success', async () => {
  for (const returned of [null, undefined, 'unexpected']) {
    const m = mock(async () => returned);
    const r = await m.guard.invoke('issue_read', issueArgs);
    assert.equal(r.classification, 'MALFORMED_REMOTE_RESPONSE');
    assert.equal(r.ok, false);
    assert.equal(m.count(), 1);
  }
});
test('concurrent identical invocations dispatch at most once in one process', async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const m = mock(async () => { await pending; return { result: { ok: true } }; });
  const first = m.guard.invoke('issue_read', issueArgs);
  const second = await m.guard.invoke('issue_read', issueArgs);
  assert.equal(second.classification, 'IN_FLIGHT_DUPLICATE');
  assert.equal(second.transportAttempts, 0);
  assert.equal(m.count(), 1);
  release();
  assert.equal((await first).ok, true);
  assert.equal(m.count(), 1);
});
test('successful read does not permanently memoize an old response', async () => {
  const m = mock();
  assert.equal((await m.guard.invoke('issue_read', issueArgs)).ok, true);
  assert.equal((await m.guard.invoke('issue_read', issueArgs)).ok, true);
  assert.equal(m.count(), 2);
});

test('mixed type schema cannot bypass required object properties', async () => {
  let calls = 0;
  const guard = createMcpToolCallGuard({
    tools: { union: { version: 'v1', readOnly: true,
      inputSchema: { type: ['object', 'string'], required: ['id'], properties: { id: { type: 'string' } } } } },
    transport: async () => { calls++; return { result: true }; }
  });
  assert.equal((await guard.invoke('union', {})).classification, 'UNSUPPORTED_SCHEMA');
  assert.equal(calls, 0);
});
