import { describe, expect, it } from "vitest";
import {
  reserveGoogleChatOAuthTransaction,
  type GoogleChatNonceLedger,
} from "./nonce-ledger.ts";

const binding = {
  actorRef: "DIGITALME:TEST",
  principalRef: "PRINCIPAL:TEST",
  googleAccountBindingRef: "ACCOUNT:TEST",
  consentRef: "CONSENT:TEST",
  wardenRequestRef: "WARDEN:TEST",
  correlationId: "CORRELATION:TEST",
};

function inMemoryLedger(): GoogleChatNonceLedger {
  const rows = new Map<string, { binding: string; expiresAt: number }>();
  return {
    async reserve(nonce, who, expiresAt) {
      if (rows.has(nonce)) return false;
      rows.set(nonce, { binding: JSON.stringify(who), expiresAt });
      return true;
    },
    async consumeTransactionNonce(nonce, who) {
      const row = rows.get(nonce);
      if (!row || row.binding !== JSON.stringify(who) || row.expiresAt <= Date.now()) return false;
      rows.delete(nonce);
      return true;
    },
  };
}

describe("GEN-CON-GCHAT-001 durable nonce contract", () => {
  it("must reserve before callback consumption", async () => {
    const ledger = inMemoryLedger();
    expect(await ledger.consumeTransactionNonce("N", binding)).toBe(false);
    await reserveGoogleChatOAuthTransaction(ledger, {transactionNonce:"N"}, binding, Date.now()+100000);
    expect(await ledger.consumeTransactionNonce("N", binding)).toBe(true);
    expect(await ledger.consumeTransactionNonce("N", binding)).toBe(false);
  });
  it("cannot consume nonce across principals", async () => {
    const ledger = inMemoryLedger();
    await ledger.reserve("N", binding, Date.now()+100000);
    expect(await ledger.consumeTransactionNonce("N", {...binding,actorRef:"OTHER"})).toBe(false);
    expect(await ledger.consumeTransactionNonce("N", binding)).toBe(true);
  });
  it("rejects conflicting duplicate registration", async () => {
    const ledger = inMemoryLedger();
    await ledger.reserve("N", binding, Date.now()+100000);
    await expect(reserveGoogleChatOAuthTransaction(ledger,{transactionNonce:"N"},binding,Date.now()+100000))
      .rejects.toThrow("oauth_transaction_not_reserved");
  });
  it("rejects expired nonce", async () => {
    const ledger = inMemoryLedger();
    await ledger.reserve("N",binding,Date.now()-1000);
    expect(await ledger.consumeTransactionNonce("N",binding)).toBe(false);
  });
});
