/**
 * Reserved Synnergyze OAuth return endpoint.
 * Deliberately NOT a live OAuth handler: no token exchange occurs until
 * trusted identity/session, one-time nonce storage, and token vault are wired.
 * Never log or echo OAuth query parameters, codes, tokens, or cookies.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { GOOGLE_OAUTH_CLEAR_COOKIE } from '../modules/integrations/google-chat/oauth-transaction.ts';

export default function handler(request: IncomingMessage, response: ServerResponse) {
  response.setHeader('cache-control', 'no-store');
  response.setHeader('referrer-policy', 'no-referrer');
  response.setHeader('content-security-policy', "default-src 'none'; frame-ancestors 'none'");
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('set-cookie', GOOGLE_OAUTH_CLEAR_COOKIE);
  response.setHeader('content-type', 'application/json; charset=utf-8');
  if (request.method !== 'GET') {
    response.setHeader('allow', 'GET');
    response.statusCode = 405;
    response.end(JSON.stringify({ ok: false, reason: 'method_not_allowed' }));
    return;
  }
  // Fail closed even if query includes an OAuth code.
  response.statusCode = 503;
  response.end(JSON.stringify({ ok: false, reason: 'google_chat_oauth_not_commissioned' }));
}
