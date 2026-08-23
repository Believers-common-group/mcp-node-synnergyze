import { readFile } from "node:fs/promises";

import { Pool } from "@neondatabase/serverless";

import { AmazonBnrOrdersRuntimeV1 } from "./bnr-orders-runtime.ts";
import {
  AmazonOrdersGovernedRuntimeV1,
  type AmazonOrdersSearchQueryV1,
  type AmazonSpApiConfigV1,
} from "./governed-orders-runtime.ts";
import {
  assertAmazonLiveProofPrerequisitesV1,
  evaluateAmazonLiveProofBnrReadinessV1,
  type AmazonLiveAuthorityBundleV1,
} from "./live-proof.ts";
import { PostgresAmazonRegistryOutboxWriterV1 } from "./postgres-registry-outbox-writer.ts";
import type { AmazonPostgresQueryExecutorV1 } from "./postgres-registry-writer.ts";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`amazon_live_missing_env:${name}`);
  return value;
}

function csv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function loadAuthorityBundle(path: string): Promise<AmazonLiveAuthorityBundleV1> {
  const raw = await readFile(path, "utf8");
  const value = JSON.parse(raw) as unknown;
  if (!value || typeof value !== "object") throw new Error("amazon_live_authority_bundle_invalid");
  const bundle = value as Partial<AmazonLiveAuthorityBundleV1>;
  if (!bundle.action || !bundle.decision || !bundle.reservation || !bundle.checkpoint) {
    throw new Error("amazon_live_authority_bundle_incomplete");
  }
  return bundle as AmazonLiveAuthorityBundleV1;
}

function amazonConfig(): AmazonSpApiConfigV1 {
  return {
    endpoint: requiredEnv("AMAZON_SPAPI_ENDPOINT"),
    lwaTokenEndpoint: process.env.AMAZON_LWA_TOKEN_ENDPOINT ?? "https://api.amazon.com/auth/o2/token",
    lwaClientId: requiredEnv("AMAZON_LWA_CLIENT_ID"),
    lwaClientSecret: requiredEnv("AMAZON_LWA_CLIENT_SECRET"),
    refreshToken: requiredEnv("AMAZON_LWA_REFRESH_TOKEN"),
    marketplaceIds: csv(requiredEnv("AMAZON_MARKETPLACE_IDS")),
    userAgent:
      process.env.AMAZON_SPAPI_USER_AGENT ??
      "VSR-Amazon-Orders-R0.1/0.1 (Language=TypeScript; Platform=Synnergyze)",
  };
}

function searchQuery(): AmazonOrdersSearchQueryV1 {
  const createdAfter = argValue("--created-after") ?? process.env.AMAZON_CREATED_AFTER;
  const lastUpdatedAfter = argValue("--last-updated-after") ?? process.env.AMAZON_LAST_UPDATED_AFTER;
  if (Boolean(createdAfter) === Boolean(lastUpdatedAfter)) {
    throw new Error("amazon_live_exactly_one_time_anchor_required");
  }

  const includedData = csv(process.env.AMAZON_INCLUDED_DATA ?? "PROCEEDS,FULFILLMENT");
  return {
    ...(createdAfter ? { createdAfter } : {}),
    ...(lastUpdatedAfter ? { lastUpdatedAfter } : {}),
    includedData,
    maxResultsPerPage: Number(process.env.AMAZON_MAX_RESULTS_PER_PAGE ?? "50"),
  };
}

async function main(): Promise<void> {
  const authorityPath = argValue("--authority-bundle") ?? process.env.AMAZON_AUTHORITY_BUNDLE;
  if (!authorityPath) throw new Error("amazon_live_authority_bundle_path_required");

  const authority = await loadAuthorityBundle(authorityPath);
  const query = searchQuery();
  const activationAck = process.env.AMAZON_E2E_LIVE_ACK;
  assertAmazonLiveProofPrerequisitesV1({
    activationAck,
    authority,
    includedData: query.includedData ?? [],
  });

  const config = amazonConfig();
  const databaseUrl = requiredEnv("CWR_REGISTRY_DATABASE_URL");
  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  const db: AmazonPostgresQueryExecutorV1 = {
    query: async <T = Record<string, unknown>>(
      sql: string,
      params: readonly unknown[] = [],
    ) => {
      const result = await client.query(sql, [...params]);
      return {
        rows: result.rows as T[],
        rowCount: result.rowCount ?? result.rows.length,
      };
    },
  };

  try {
    const registryWriter = new PostgresAmazonRegistryOutboxWriterV1(db);
    const providerRuntime = new AmazonOrdersGovernedRuntimeV1({
      config,
      registryWriter,
    });
    const runtime = new AmazonBnrOrdersRuntimeV1(providerRuntime);
    const executedAt = new Date().toISOString();
    const result = await runtime.sync({
      action: authority.action,
      reservation: authority.reservation,
      decision: authority.decision,
      checkpoint: authority.checkpoint,
      query,
      executedAt,
      observedAt: executedAt,
    });

    const providerObserved = result.state === "SYNCED";
    const registryCommitted = result.registry.registryRevisionRef !== null;
    const riverSealVerified = result.river.sealed;
    const bnrReadiness = evaluateAmazonLiveProofBnrReadinessV1({
      activationAck,
      authority,
      includedData: query.includedData ?? [],
      bnrEvidence: {
        partnerLifecycle: "PROPOSED_PARTNER",
        runtimeReadiness: providerObserved ? "READY" : "BLOCKED",
        authorityState: "EXTERNAL_UNRESOLVED",
        evidenceState: riverSealVerified ? "READY" : "UNRESOLVED",
        commercialState: "UNRESOLVED",
        requiredServicesResolved: true,
        wardenPolicyActive: true,
        riverOperational: riverSealVerified,
        registryDurable: registryCommitted,
        activationEvidenceValid: false,
        suspended: false,
        amazonCredentialsPresent: true,
        engagementContextPresent: process.env.AMAZON_BNR_ENGAGEMENT_CONTEXT_PRESENT === "true",
        readinessCheckedAt: executedAt,
      },
    });

    const report = {
      proof: "PROVIDER-AMAZON-ORDERS-LIVE-001",
      bnrNodeRef: result.bnrNodeRef,
      serviceRef: result.serviceRef,
      bnrReadiness,
      state: result.state,
      providerObserved,
      registryCommitted,
      registryOutboxCommitted: providerObserved && registryCommitted,
      riverSealVerified,
      silkSettlementFinality: result.silk.settlementFinality,
      moneyMoved: result.silk.moneyMoved,
      vsrEmpireRevisionEquivalent:
        result.vsr.registryRevisionRef === result.empire.registryRevisionRef &&
        JSON.stringify(result.vsr.orderRefs) === JSON.stringify(result.empire.orderRefs),
      c2LiveProofComplete: providerObserved && registryCommitted && riverSealVerified,
      bnrActivationComplete: bnrReadiness.activationState === "ACTIVE",
      result,
    };

    // The result is intentionally credential-free; the provider client never returns
    // the LWA client secret, refresh token, or ephemeral access token.
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (result.state !== "SYNCED") process.exitCode = 2;
    if (result.state === "SYNCED" && !result.river.sealed) process.exitCode = 3;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "amazon_live_unknown_error";
  process.stderr.write(`${JSON.stringify({ ok: false, error: message })}\n`);
  process.exitCode = 1;
});
