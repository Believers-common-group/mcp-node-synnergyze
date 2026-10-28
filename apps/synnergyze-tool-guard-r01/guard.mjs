/**
 * Synnergyze MCP tool-call guard R0.1: isolated, local, non-executing adapter.
 * It does not connect to GitHub or register MCP tools. A caller must supply a
 * trusted, version-pinned manifest and an explicitly injected transport.
 *
 * This is a strict JSON Schema *subset*, not a complete JSON Schema validator.
 * Unsupported constraints fail closed before reaching the transport.
 */
import { createHmac, randomBytes } from 'node:crypto';

const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const plain = (x) => x !== null && typeof x === 'object' && !Array.isArray(x) && (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
const blockedNames = new Set(['__proto__', 'prototype', 'constructor']);
const supported = new Set(['type', 'properties', 'required', 'additionalProperties', 'items', 'minItems', 'maxItems', 'minLength', 'maxLength', 'minimum', 'maximum', 'enum', 'const', 'description', 'title', 'default', 'examples', '$schema']);

// These are examples of observed upstream server-specific differences, not a
// promise that all GitHub MCP server versions use this spelling.
export const GITHUB_ISSUE_3605_ALIASES = Object.freeze({
  pull_request_read: Object.freeze({ pull_number: 'pullNumber' }),
  issue_read: Object.freeze({ issueNumber: 'issue_number' })
});

function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (!plain(value)) throw new TypeError('Non-JSON arguments');
  const keys = Object.keys(value).sort();
  if (keys.some((key) => blockedNames.has(key))) throw new TypeError('Prohibited argument key');
  return '{' + keys.map((key) => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}

/**
 * Bound all argument walks before canonicalization. Reject cycles, accessors,
 * sparse arrays and non-JSON values. JSON and tool schemas remain untrusted
 * data; neither may trigger unbounded traversal or implicit getters.
 */
function boundedJson(value, byteLimit, depth = 0, state = { nodes: 0, bytes: 0, seen: new WeakSet() }) {
  if (++state.nodes > 4096 || depth > 24) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') {
    state.bytes += Buffer.byteLength(value, 'utf8');
    return state.bytes <= byteLimit;
  }
  if (typeof value !== 'object' || !(Array.isArray(value) || plain(value))) return false;
  if (state.seen.has(value)) return false;
  state.seen.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  if (Object.getOwnPropertySymbols(value).length) return false;
  if (Array.isArray(value) && (keys.filter((k) => k !== 'length').length !== value.length ||
      keys.some((k) => k !== 'length' && (!/^(0|[1-9][0-9]*)$/.test(k) || Number(k) >= value.length)))) return false;
  for (const key of keys) {
    if (key === 'length' && Array.isArray(value)) continue;
    if (blockedNames.has(key) || !has(descriptors[key], 'value')) return false;
    state.bytes += Buffer.byteLength(key, 'utf8');
    if (state.bytes > byteLimit || !boundedJson(descriptors[key].value, byteLimit, depth + 1, state)) return false;
  }
  return true;
}

function schemaError(message) { return { code: 'UNSUPPORTED_SCHEMA', path: '$', detail: message }; }
function validateSchema(schema, path = '$', depth = 0) {
  if (depth > 24 || !plain(schema)) return schemaError('Unrecognized schema node');
  for (const key of Object.keys(schema)) {
    if (!supported.has(key)) return schemaError('Unsupported JSON Schema keyword: ' + key);
  }
  const types = schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.some((t) => !['object', 'array', 'string', 'integer', 'number', 'boolean', 'null'].includes(t))) return schemaError('Unsupported type');
  if (schema.properties !== undefined) {
    if (!plain(schema.properties)) return schemaError('Invalid properties');
    for (const [key, child] of Object.entries(schema.properties)) {
      if (blockedNames.has(key)) return schemaError('Prohibited property');
      const err = validateSchema(child, path + '.' + key, depth + 1);
      if (err) return err;
    }
  }
  if (schema.items !== undefined) {
    const err = validateSchema(schema.items, path + '[]', depth + 1);
    if (err) return err;
  }
  if (schema.required !== undefined && (!Array.isArray(schema.required) ||
      schema.required.some((x) => typeof x !== 'string' || blockedNames.has(x) || !has(schema.properties ?? {}, x)) ||
      new Set(schema.required).size !== schema.required.length)) return schemaError('Invalid or undeclared required field');
  if ((schema.properties !== undefined || schema.required !== undefined) && types.length && (types.length !== 1 || types[0] !== 'object')) return schemaError('Object constraints require exclusive object type');
  if (schema.items !== undefined && types.length && (types.length !== 1 || types[0] !== 'array')) return schemaError('Array items require exclusive array type');
  if (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== 'boolean') return schemaError('Unsupported additionalProperties');
  for (const key of ['minimum', 'maximum', 'minItems', 'maxItems', 'minLength', 'maxLength']) {
    if (schema[key] !== undefined && (typeof schema[key] !== 'number' || !Number.isFinite(schema[key]) || (key !== 'minimum' && key !== 'maximum' && (!Number.isInteger(schema[key]) || schema[key] < 0)))) return schemaError('Invalid ' + key);
  }
  if (schema.enum !== undefined && !Array.isArray(schema.enum)) return schemaError('Invalid enum');
  return null;
}

function check(value, schema, path = '$', depth = 0) {
  if (depth > 24) return { code: 'INVALID_ARGUMENTS', path, detail: 'Nested input too deep' };
  const typeOk = (t) => ({
    object: () => plain(value), array: () => Array.isArray(value), string: () => typeof value === 'string',
    integer: () => Number.isSafeInteger(value), number: () => typeof value === 'number' && Number.isFinite(value),
    boolean: () => typeof value === 'boolean', null: () => value === null
  })[t]?.() ?? false;
  const types = schema.type === undefined ? (schema.properties || schema.required ? ['object'] : schema.items ? ['array'] : []) : Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.length && !types.some(typeOk)) return { code: 'INVALID_ARGUMENTS', path, detail: 'Expected ' + types.join('|') };
  if (schema.enum && !schema.enum.some((x) => canonical(x) === canonical(value))) return { code: 'INVALID_ARGUMENTS', path, detail: 'Value not allowed' };
  if (has(schema, 'const') && canonical(schema.const) !== canonical(value)) return { code: 'INVALID_ARGUMENTS', path, detail: 'Value not allowed' };
  if (typeof value === 'string' && ((schema.minLength !== undefined && value.length < schema.minLength) || (schema.maxLength !== undefined && value.length > schema.maxLength))) return { code: 'INVALID_ARGUMENTS', path, detail: 'String length out of range' };
  if (typeof value === 'number' && ((schema.minimum !== undefined && value < schema.minimum) || (schema.maximum !== undefined && value > schema.maximum))) return { code: 'INVALID_ARGUMENTS', path, detail: 'Number out of range' };
  if (Array.isArray(value)) {
    if ((schema.minItems !== undefined && value.length < schema.minItems) || (schema.maxItems !== undefined && value.length > schema.maxItems)) return { code: 'INVALID_ARGUMENTS', path, detail: 'Array length out of range' };
    if (schema.items) for (let i = 0; i < value.length; i++) { const err = check(value[i], schema.items, path + '[' + i + ']', depth + 1); if (err) return err; }
  }
  if (plain(value)) {
    for (const key of Object.keys(value)) if (blockedNames.has(key)) return { code: 'INVALID_ARGUMENTS', path, detail: 'Prohibited argument key' };
    for (const key of schema.required ?? []) if (!has(value, key)) return { code: 'MISSING_REQUIRED_ARGUMENT', path: path + '.' + key, detail: 'Required' };
    // Stricter than JSON Schema's default additionalProperties:true: unknown
    // arguments are always denied at this security boundary.
    for (const [key, val] of Object.entries(value)) {
      if (!has(schema.properties ?? {}, key)) return { code: 'UNKNOWN_ARGUMENT', path: path + '.' + key, detail: 'Unregistered argument' };
      const err = check(val, schema.properties[key], path + '.' + key, depth + 1);
      if (err) return err;
    }
  }
  return null;
}

function normalize(name, args, schema, aliases) {
  if (!plain(args)) return { error: { code: 'INVALID_ARGUMENTS', path: '$', detail: 'Expected argument object' } };
  const next = { ...args };
  const map = aliases[name] ?? {};
  for (const [source, destination] of Object.entries(map)) {
    // Only apply an alias when its destination is an actual advertised field.
    if (!has(schema.properties ?? {}, destination) || has(schema.properties ?? {}, source) || !has(next, source)) continue;
    if (has(next, destination)) return { error: { code: 'AMBIGUOUS_ARGUMENT', path: '$.' + destination, detail: 'Both alias and canonical name supplied' } };
    next[destination] = next[source];
    delete next[source];
  }
  return { args: next };
}

function remoteFailure(response) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) return { code: 'MALFORMED_REMOTE_RESPONSE', status: null };
  const nestedError = response.result && typeof response.result === 'object' ? response.result.error : undefined;
  if (response.error || nestedError) {
    const c = (response.error ?? nestedError)?.code;
    return { code: c === -32602 ? 'REMOTE_INVALID_ARGUMENTS' : 'REMOTE_ERROR', status: (response.error ?? nestedError)?.status ?? null };
  }
  if (response && typeof response === 'object' && (response.isError === true || response.result?.isError === true)) return { code: 'REMOTE_ERROR', status: null };
  return null;
}

function retryable(err) {
  const code = err?.code;
  const status = err?.status ?? err?.statusCode;
  return [408, 502, 503, 504, '408', '502', '503', '504'].includes(status) || ['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN'].includes(code);
}

export function createMcpToolCallGuard({ tools, transport, aliases = GITHUB_ISSUE_3605_ALIASES, maxReadOnlyRetries = 0, cacheLimit = 256, maxArgumentBytes = 32768 } = {}) {
  if (!plain(tools) || typeof transport !== 'function') throw new TypeError('Trusted manifest and transport required');
  if (!Number.isInteger(maxReadOnlyRetries) || maxReadOnlyRetries < 0 || maxReadOnlyRetries > 2) throw new RangeError('Retry limit must be 0..2');
  if (!Number.isInteger(cacheLimit) || cacheLimit < 1 || cacheLimit > 4096) throw new RangeError('Cache size out of range');
  if (!Number.isInteger(maxArgumentBytes) || maxArgumentBytes < 64 || maxArgumentBytes > 65536) throw new RangeError('Argument budget out of range');
  const salt = randomBytes(32);
  const terminal = new Map();
  const inFlight = new Set();
  function remember(key, code) {
    terminal.set(key, code);
    if (terminal.size > cacheLimit) terminal.delete(terminal.keys().next().value);
  }
  return Object.freeze({
    async invoke(name, providedArgs) {
      const descriptor = has(tools, name) ? tools[name] : null;
      if (!descriptor || typeof descriptor.version !== 'string' || !descriptor.version || !plain(descriptor.inputSchema)) {
        return { ok: false, classification: 'UNKNOWN_OR_UNPINNED_TOOL', retryable: false, transportAttempts: 0 };
      }
      if (descriptor.inputSchema.type !== 'object') return { ok: false, classification: 'UNSUPPORTED_SCHEMA', retryable: false, transportAttempts: 0 };
      if (!boundedJson(descriptor.inputSchema, maxArgumentBytes)) return { ok: false, classification: 'INVALID_OR_OVERSIZED_SCHEMA', retryable: false, transportAttempts: 0 };
      if (descriptor.readOnly !== true) return { ok: false, classification: 'WARDEN_AUTHORIZATION_REQUIRED', retryable: false, transportAttempts: 0 };
      const schemaErr = validateSchema(descriptor.inputSchema);
      if (schemaErr) return { ok: false, classification: schemaErr.code, path: schemaErr.path, retryable: false, transportAttempts: 0 };
      if (!boundedJson(providedArgs, maxArgumentBytes)) return { ok: false, classification: 'INVALID_OR_OVERSIZED_ARGUMENTS', retryable: false, transportAttempts: 0 };
      const normalized = normalize(name, providedArgs, descriptor.inputSchema, aliases);
      if (normalized.error) return { ok: false, classification: normalized.error.code, path: normalized.error.path, retryable: false, transportAttempts: 0 };
      let args;
      try {
        if (!boundedJson(normalized.args, maxArgumentBytes)) return { ok: false, classification: 'INVALID_OR_OVERSIZED_ARGUMENTS', retryable: false, transportAttempts: 0 };
        args = canonical(normalized.args);
        if (Buffer.byteLength(args, 'utf8') > maxArgumentBytes) return { ok: false, classification: 'INVALID_OR_OVERSIZED_ARGUMENTS', retryable: false, transportAttempts: 0 };
      } catch { return { ok: false, classification: 'INVALID_ARGUMENTS', retryable: false, transportAttempts: 0 }; }
      const input = JSON.parse(args);
      const fingerprint = createHmac('sha256', salt).update(canonical({ name, version: descriptor.version, args: input })).digest('hex');
      const invalid = check(input, descriptor.inputSchema);
      if (invalid) return { ok: false, classification: invalid.code, path: invalid.path, retryable: false, transportAttempts: 0, fingerprint };
      if (terminal.has(fingerprint)) return { ok: false, classification: 'REPEATED_TERMINAL_FAILURE', priorClassification: terminal.get(fingerprint), retryable: false, transportAttempts: 0, fingerprint };
      if (inFlight.has(fingerprint)) return { ok: false, classification: 'IN_FLIGHT_DUPLICATE', retryable: false, transportAttempts: 0, fingerprint };
      inFlight.add(fingerprint);
      try {
      const cap = maxReadOnlyRetries;
      for (let attempt = 1; attempt <= cap + 1; attempt++) {
        try {
          const result = await transport(name, input);
          const failure = remoteFailure(result);
          if (!failure) return { ok: true, classification: 'OK', result, transportAttempts: attempt, fingerprint };
          // MCP JSON-RPC errors are not retried: they can be permission or schema failures.
          remember(fingerprint, failure.code);
          return { ok: false, classification: failure.code, retryable: false, transportAttempts: attempt, fingerprint };
        } catch (err) {
          if (retryable(err) && attempt <= cap) continue;
          const classification = retryable(err) ? 'TRANSIENT_RETRY_EXHAUSTED' : 'TRANSPORT_FAILURE';
          remember(fingerprint, classification);
          return { ok: false, classification, retryable: false, transportAttempts: attempt, fingerprint };
        }
      }
      } finally {
        inFlight.delete(fingerprint);
      }
    }
  });
}
