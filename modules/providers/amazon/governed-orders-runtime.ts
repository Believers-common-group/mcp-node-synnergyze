import { createHash } from "node:crypto";

import type { ActionEnvelopeV1, EvidenceReservationV1 } from "../../river/contracts.ts";
import type { WardenDecisionV1, WardenExecutionCheckpointV1 } from "../../warden/contracts.ts";

export interface AmazonSpApiConfigV1 {
  endpoint: string;
  lwaTokenEndpoint: string;
  lwaClientId: string;
  lwaClientSecret: string;
  refreshToken: string;
  marketplaceIds: readonly string[];
  userAgent: string;
}

export interface AmazonOrdersSearchQueryV1 {
  createdAfter?: string;
  createdBefore?: string;
  lastUpdatedAfter?: string;
  lastUpdatedBefore?: string;
  includedData?: readonly string[];
  fulfillmentStatuses?: readonly string[];
  fulfilledBy?: readonly string[];
  maxResultsPerPage?: number;
  paginationToken?: string;
}

interface AmazonMoneyV1 {
  amount?: string;
  currencyCode?: string;
}

interface AmazonOrderV1 {
  orderId?: string;
  createdTime?: string;
  lastUpdatedTime?: string;
  salesChannel?: {
    channelName?: string;
    marketplaceId?: string;
    marketplaceName?: string;
  };
  proceeds?: {
    grandTotal?: AmazonMoneyV1;
    proceedsTotal?: AmazonMoneyV1;
  };
  fulfillment?: {
    fulfillmentStatus?: string;
    fulfilledBy?: string;
    quantityFulfilled?: number;
    quantityUnfulfilled?: number;
  };
  [key: string]: unknown;
}

interface AmazonSearchOrdersResponseV1 {
  orders?: AmazonOrderV1[];
  pagination?: { nextToken?: string };
  createdBefore?: string;
  lastUpdatedBefore?: string;
}

export interface AmazonProviderReceiptV1 {
  providerRequestRef: string;
  operation: "searchOrders";
  endpoint: string;
  statusCode: number;
  responseDigest: string;
  accessTokenPersisted: false;
  observedAt: string;
  nextTokenPresent: boolean;
}

export interface AmazonOrderRegistryProjectionV1 {
  orderRef: string;
  providerOrderId: string;
  providerRef: "PROVIDER-AMAZON-001";
  marketplaceId?: string;
  marketplaceName?: string;
  channelName?: string;
  createdTime?: string;
  lastUpdatedTime?: string;
  fulfillmentStatus?: string;
  fulfilledBy?: string;
  quantityFulfilled?: number;
  quantityUnfulfilled?: number;
  proceedsAmount?: string;
  proceedsCurrency?: string;
  providerResponseDigest: string;
  providerEvidenceRef: string;
  correlationId: string;
  observedAt: string;
  piiProjected: false;
}

export interface AmazonRegistryProjectionWriteResultV1 {
  registryRevisionRef: string;
  orderRefs: readonly string[];
}

export interface AmazonRegistryProjectionWriterV1 {
  writeBatch(
    projections: readonly AmazonOrderRegistryProjectionV1[],
  ): Promise<AmazonRegistryProjectionWriteResultV1>;
}

export interface AmazonObservedProceedsV1 {
  orderRef: string;
  amount: string;
  currency: string;
}

export interface AmazonSilkObservationV1 {
  state: "OBSERVED_NONFINAL" | "NOT_OBSERVED";
  settlementFinality: false;
  moneyMoved: false;
  observedProceeds: readonly AmazonObservedProceedsV1[];
}

export interface AmazonRiverBindingV1 {
  state: "PROVIDER_OBSERVED" | "EXCEPTION";
  reservationRef: string;
  observationEvidenceRef?: string;
  providerResponseDigest?: string;
  sealed: false;
}

export interface AmazonProjectionV1 {
  registryRevisionRef: string | null;
  orderRefs: readonly string[];
}

export interface AmazonOrdersSyncExceptionV1 {
  code: "AMAZON_PROVIDER_ERROR" | "AMAZON_RESPONSE_INVALID";
  reason: string;
  providerStatusCode?: number;
  providerRequestRef?: string;
}

export interface AmazonOrdersSyncResultV1 {
  state: "SYNCED" | "EXCEPTION";
  provider: AmazonProviderReceiptV1;
  river: AmazonRiverBindingV1;
  registry: {
    registryRevisionRef: string | null;
    orderRefs: readonly string[];
  };
  silk: AmazonSilkObservationV1;
  vsr: AmazonProjectionV1;
  empire: AmazonProjectionV1;
  exception?: AmazonOrdersSyncExceptionV1;
  realWorldWriteEffectOccurred: false;
}

export interface AmazonOrdersDeniedResultV1 {
  state: "DENIED";
  decisionRef: string;
  reasonCodes: readonly string[];
  providerInvoked: false;
  realWorldWriteEffectOccurred: false;
  observedAt: string;
}

type FetchLikeV1 = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type AmazonRuntimeErrorKindV1 = "INPUT" | "PROVIDER" | "RESPONSE";

interface AmazonRuntimeErrorMetadataV1 {
  statusCode?: number;
  providerRequestRef?: string;
  responseDigest?: string;
  endpoint?: string;
}

class AmazonRuntimeErrorV1 extends Error {
  readonly kind: AmazonRuntimeErrorKindV1;
  readonly metadata: AmazonRuntimeErrorMetadataV1;

  constructor(
    kind: AmazonRuntimeErrorKindV1,
    message: string,
    metadata: AmazonRuntimeErrorMetadataV1 = {},
  ) {
    super(message);
    this.name = "AmazonRuntimeErrorV1";
    this.kind = kind;
    this.metadata = metadata;
  }
}

const RESTRICTED_INCLUDED_DATA = new Set(["BUYER", "RECIPIENT", "TAX", "PAYMENT"]);

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sha256(value: string): string {
  return `sha256:${digest(value)}`;
}

function parseInstant(value: string, errorCode: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(errorCode);
  return parsed;
}

function requireNonEmpty(value: string, errorCode: string): void {
  if (!value.trim()) throw new Error(errorCode);
}

function validateConfig(config: AmazonSpApiConfigV1): void {
  for (const [value, code] of [
    [config.endpoint, "amazon_endpoint_required"],
    [config.lwaTokenEndpoint, "amazon_lwa_endpoint_required"],
    [config.lwaClientId, "amazon_lwa_client_id_required"],
    [config.lwaClientSecret, "amazon_lwa_client_secret_required"],
    [config.refreshToken, "amazon_refresh_token_required"],
    [config.userAgent, "amazon_user_agent_required"],
  ] as const) {
    requireNonEmpty(value, code);
  }
  if (!config.endpoint.startsWith("https://") || !config.lwaTokenEndpoint.startsWith("https://")) {
    throw new Error("amazon_https_endpoint_required");
  }
  if (config.marketplaceIds.length === 0 || config.marketplaceIds.some((value) => !value.trim())) {
    throw new Error("amazon_marketplace_id_required");
  }
}

function validateQuery(query: AmazonOrdersSearchQueryV1): void {
  const created = Boolean(query.createdAfter);
  const updated = Boolean(query.lastUpdatedAfter);
  if (created === updated) {
    throw new AmazonRuntimeErrorV1(
      "INPUT",
      "amazon_orders_exactly_one_time_anchor_required",
    );
  }
  if (created && (query.lastUpdatedBefore || query.lastUpdatedAfter)) {
    throw new AmazonRuntimeErrorV1(
      "INPUT",
      "amazon_orders_created_updated_filter_conflict",
    );
  }
  if (updated && (query.createdAfter || query.createdBefore)) {
    throw new AmazonRuntimeErrorV1(
      "INPUT",
      "amazon_orders_updated_created_filter_conflict",
    );
  }
  if (
    query.includedData?.some((value) => RESTRICTED_INCLUDED_DATA.has(value.toUpperCase()))
  ) {
    throw new AmazonRuntimeErrorV1(
      "INPUT",
      "amazon_orders_restricted_data_requires_separate_capability",
      { endpoint: "AMAZON:PRE_PROVIDER_VALIDATION" },
    );
  }
  if (
    query.maxResultsPerPage !== undefined &&
    (!Number.isInteger(query.maxResultsPerPage) ||
      query.maxResultsPerPage < 1 ||
      query.maxResultsPerPage > 100)
  ) {
    throw new AmazonRuntimeErrorV1("INPUT", "amazon_orders_invalid_page_size");
  }
}

function amazonDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("amazon_invalid_execution_time");
  return date.toISOString().replace(/[-:]|\.\d{3}/g, "");
}

function assertGovernedExecution(input: {
  action: ActionEnvelopeV1;
  reservation: EvidenceReservationV1;
  decision: WardenDecisionV1;
  checkpoint: WardenExecutionCheckpointV1;
  executedAt: string;
}): void {
  const { action, reservation, decision, checkpoint, executedAt } = input;
  if (decision.decision !== "ALLOW" || !decision.actionToken) {
    throw new Error("amazon_warden_allow_required");
  }
  if (action.capabilityRef !== "amazon.orders.search" || action.action !== "amazon.orders.search") {
    throw new Error("amazon_orders_capability_required");
  }
  if (action.wardenDecisionRef !== decision.decisionRef) {
    throw new Error("amazon_warden_decision_mismatch");
  }
  if (action.requestRef !== decision.requestRef || action.actionToken !== decision.actionToken) {
    throw new Error("amazon_warden_action_binding_mismatch");
  }
  if (action.targetRef !== decision.targetRef || action.correlationId !== decision.correlationId) {
    throw new Error("amazon_warden_target_or_correlation_mismatch");
  }
  if (reservation.state !== "RESERVED" || reservation.actionRef !== action.actionRef) {
    throw new Error("amazon_river_reservation_required");
  }
  if (
    reservation.wardenDecisionRef !== decision.decisionRef ||
    reservation.correlationId !== action.correlationId
  ) {
    throw new Error("amazon_river_reservation_binding_mismatch");
  }
  if (checkpoint.state !== "VALID") {
    throw new Error(`amazon_warden_checkpoint_${checkpoint.state.toLowerCase()}`);
  }
  if (
    checkpoint.decisionRef !== decision.decisionRef ||
    checkpoint.wardenRef !== decision.wardenRef ||
    checkpoint.correlationId !== action.correlationId
  ) {
    throw new Error("amazon_warden_checkpoint_binding_mismatch");
  }

  const decided = parseInstant(decision.decidedAt, "amazon_invalid_decision_time");
  const reserved = parseInstant(reservation.reservedAt, "amazon_invalid_reservation_time");
  const checked = parseInstant(checkpoint.checkedAt, "amazon_invalid_checkpoint_time");
  const executed = parseInstant(executedAt, "amazon_invalid_execution_time");
  if (reserved < decided || checked < reserved || executed < checked) {
    throw new Error("amazon_invalid_governed_execution_sequence");
  }
  if (!decision.validUntil || executed > parseInstant(decision.validUntil, "amazon_invalid_validity")) {
    throw new Error("amazon_warden_decision_expired");
  }
}

function appendCsv(url: URL, name: string, values: readonly string[] | undefined): void {
  if (values?.length) url.searchParams.set(name, values.join(","));
}

async function responseText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function providerRequestRef(response: Response, fallback: string): string {
  return response.headers.get("x-amzn-requestid") ?? response.headers.get("x-amzn-request-id") ?? fallback;
}

class AmazonSpApiOrdersClientV1 {
  private readonly config: AmazonSpApiConfigV1;
  private readonly fetchImpl: FetchLikeV1;

  constructor(config: AmazonSpApiConfigV1, fetchImpl: FetchLikeV1) {
    validateConfig(config);
    this.config = config;
    this.fetchImpl = fetchImpl;
  }

  private async accessToken(): Promise<string> {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.config.refreshToken,
      client_id: this.config.lwaClientId,
      client_secret: this.config.lwaClientSecret,
    });
    const response = await this.fetchImpl(this.config.lwaTokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: body.toString(),
    });
    const raw = await responseText(response);
    if (!response.ok) {
      throw new AmazonRuntimeErrorV1("PROVIDER", "amazon_lwa_token_request_failed", {
        statusCode: response.status,
        providerRequestRef: providerRequestRef(response, "LWA:NO-REQUEST-ID"),
        responseDigest: sha256(raw),
        endpoint: this.config.lwaTokenEndpoint,
      });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new AmazonRuntimeErrorV1("RESPONSE", "amazon_lwa_token_response_invalid", {
        statusCode: response.status,
        providerRequestRef: providerRequestRef(response, "LWA:NO-REQUEST-ID"),
        responseDigest: sha256(raw),
        endpoint: this.config.lwaTokenEndpoint,
      });
    }
    const token =
      payload && typeof payload === "object" && "access_token" in payload
        ? (payload as { access_token?: unknown }).access_token
        : undefined;
    if (typeof token !== "string" || !token) {
      throw new AmazonRuntimeErrorV1("RESPONSE", "amazon_lwa_access_token_missing", {
        statusCode: response.status,
        providerRequestRef: providerRequestRef(response, "LWA:NO-REQUEST-ID"),
        responseDigest: sha256(raw),
        endpoint: this.config.lwaTokenEndpoint,
      });
    }
    return token;
  }

  async searchOrders(input: {
    query: AmazonOrdersSearchQueryV1;
    executedAt: string;
    observedAt: string;
  }): Promise<{ receipt: AmazonProviderReceiptV1; payload: AmazonSearchOrdersResponseV1 }> {
    validateQuery(input.query);
    const token = await this.accessToken();
    const url = new URL("/orders/2026-01-01/orders", this.config.endpoint);
    if (input.query.createdAfter) url.searchParams.set("createdAfter", input.query.createdAfter);
    if (input.query.createdBefore) url.searchParams.set("createdBefore", input.query.createdBefore);
    if (input.query.lastUpdatedAfter) {
      url.searchParams.set("lastUpdatedAfter", input.query.lastUpdatedAfter);
    }
    if (input.query.lastUpdatedBefore) {
      url.searchParams.set("lastUpdatedBefore", input.query.lastUpdatedBefore);
    }
    appendCsv(url, "marketplaceIds", this.config.marketplaceIds);
    appendCsv(url, "includedData", input.query.includedData);
    appendCsv(url, "fulfillmentStatuses", input.query.fulfillmentStatuses);
    appendCsv(url, "fulfilledBy", input.query.fulfilledBy);
    if (input.query.maxResultsPerPage !== undefined) {
      url.searchParams.set("maxResultsPerPage", String(input.query.maxResultsPerPage));
    }
    if (input.query.paginationToken) {
      url.searchParams.set("paginationToken", input.query.paginationToken);
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          accept: "application/json",
          "x-amz-access-token": token,
          "x-amz-date": amazonDate(input.executedAt),
          "user-agent": this.config.userAgent,
        },
      });
    } catch {
      throw new AmazonRuntimeErrorV1("PROVIDER", "amazon_spapi_network_error", {
        providerRequestRef: "AMAZON:NO-RESPONSE",
        endpoint: url.toString(),
      });
    }

    const raw = await responseText(response);
    const responseDigest = sha256(raw);
    const requestRef = providerRequestRef(
      response,
      `AMAZON-REQUEST:${digest(url.toString()).slice(0, 24)}`,
    );
    if (!response.ok) {
      throw new AmazonRuntimeErrorV1("PROVIDER", "amazon_spapi_search_orders_failed", {
        statusCode: response.status,
        providerRequestRef: requestRef,
        responseDigest,
        endpoint: url.toString(),
      });
    }

    let payload: AmazonSearchOrdersResponseV1;
    try {
      payload = JSON.parse(raw) as AmazonSearchOrdersResponseV1;
    } catch {
      throw new AmazonRuntimeErrorV1("RESPONSE", "amazon_spapi_search_orders_invalid_json", {
        statusCode: response.status,
        providerRequestRef: requestRef,
        responseDigest,
        endpoint: url.toString(),
      });
    }
    if (!payload || !Array.isArray(payload.orders)) {
      throw new AmazonRuntimeErrorV1("RESPONSE", "amazon_spapi_search_orders_shape_invalid", {
        statusCode: response.status,
        providerRequestRef: requestRef,
        responseDigest,
        endpoint: url.toString(),
      });
    }

    return {
      receipt: {
        providerRequestRef: requestRef,
        operation: "searchOrders",
        endpoint: url.toString(),
        statusCode: response.status,
        responseDigest,
        accessTokenPersisted: false,
        observedAt: input.observedAt,
        nextTokenPresent: Boolean(payload.pagination?.nextToken),
      },
      payload,
    };
  }
}

function money(order: AmazonOrderV1): AmazonMoneyV1 | undefined {
  return order.proceeds?.grandTotal ?? order.proceeds?.proceedsTotal;
}

function normalizeOrders(input: {
  orders: readonly AmazonOrderV1[];
  receipt: AmazonProviderReceiptV1;
  evidenceRef: string;
  correlationId: string;
  observedAt: string;
}): AmazonOrderRegistryProjectionV1[] {
  const projections: AmazonOrderRegistryProjectionV1[] = [];
  for (const order of input.orders) {
    if (typeof order.orderId !== "string" || !order.orderId) {
      throw new AmazonRuntimeErrorV1("RESPONSE", "amazon_order_id_required", {
        providerRequestRef: input.receipt.providerRequestRef,
        responseDigest: input.receipt.responseDigest,
        endpoint: input.receipt.endpoint,
      });
    }
    const proceeds = money(order);
    projections.push({
      orderRef: `AMAZON-ORDER:${order.orderId}`,
      providerOrderId: order.orderId,
      providerRef: "PROVIDER-AMAZON-001",
      marketplaceId: order.salesChannel?.marketplaceId,
      marketplaceName: order.salesChannel?.marketplaceName,
      channelName: order.salesChannel?.channelName,
      createdTime: order.createdTime,
      lastUpdatedTime: order.lastUpdatedTime,
      fulfillmentStatus: order.fulfillment?.fulfillmentStatus,
      fulfilledBy: order.fulfillment?.fulfilledBy,
      quantityFulfilled: order.fulfillment?.quantityFulfilled,
      quantityUnfulfilled: order.fulfillment?.quantityUnfulfilled,
      proceedsAmount: proceeds?.amount,
      proceedsCurrency: proceeds?.currencyCode,
      providerResponseDigest: input.receipt.responseDigest,
      providerEvidenceRef: input.evidenceRef,
      correlationId: input.correlationId,
      observedAt: input.observedAt,
      piiProjected: false,
    });
  }
  return projections;
}

function silkObservation(
  projections: readonly AmazonOrderRegistryProjectionV1[],
): AmazonSilkObservationV1 {
  const observedProceeds = projections.flatMap((projection) =>
    projection.proceedsAmount && projection.proceedsCurrency
      ? [
          {
            orderRef: projection.orderRef,
            amount: projection.proceedsAmount,
            currency: projection.proceedsCurrency,
          },
        ]
      : [],
  );
  return {
    state: "OBSERVED_NONFINAL",
    settlementFinality: false,
    moneyMoved: false,
    observedProceeds,
  };
}

export class InMemoryAmazonRegistryProjectionWriterV1
  implements AmazonRegistryProjectionWriterV1
{
  private readonly projections = new Map<string, AmazonOrderRegistryProjectionV1>();

  async writeBatch(
    projections: readonly AmazonOrderRegistryProjectionV1[],
  ): Promise<AmazonRegistryProjectionWriteResultV1> {
    for (const projection of projections) {
      this.projections.set(projection.orderRef, { ...projection });
    }
    const canonical = [...this.projections.values()]
      .sort((a, b) => a.orderRef.localeCompare(b.orderRef))
      .map((projection) => ({
        orderRef: projection.orderRef,
        lastUpdatedTime: projection.lastUpdatedTime ?? null,
        providerResponseDigest: projection.providerResponseDigest,
        providerEvidenceRef: projection.providerEvidenceRef,
      }));
    return {
      registryRevisionRef: `REGISTRY-REVISION:AMAZON:${digest(JSON.stringify(canonical)).slice(0, 24)}`,
      orderRefs: projections.map((projection) => projection.orderRef),
    };
  }

  projectionCount(): number {
    return this.projections.size;
  }

  list(): readonly AmazonOrderRegistryProjectionV1[] {
    return [...this.projections.values()].map((projection) => ({ ...projection }));
  }
}

function exceptionProviderReceipt(
  error: AmazonRuntimeErrorV1,
  observedAt: string,
): AmazonProviderReceiptV1 {
  return {
    providerRequestRef: error.metadata.providerRequestRef ?? "AMAZON:NO-REQUEST-ID",
    operation: "searchOrders",
    endpoint: error.metadata.endpoint ?? "AMAZON:ENDPOINT-UNAVAILABLE",
    statusCode: error.metadata.statusCode ?? 0,
    responseDigest: error.metadata.responseDigest ?? sha256(error.message),
    accessTokenPersisted: false,
    observedAt,
    nextTokenPresent: false,
  };
}

export class AmazonOrdersGovernedRuntimeV1 {
  private readonly client: AmazonSpApiOrdersClientV1;
  private readonly registryWriter: AmazonRegistryProjectionWriterV1;

  constructor(input: {
    config: AmazonSpApiConfigV1;
    fetchImpl?: FetchLikeV1;
    registryWriter: AmazonRegistryProjectionWriterV1;
  }) {
    this.client = new AmazonSpApiOrdersClientV1(input.config, input.fetchImpl ?? fetch);
    this.registryWriter = input.registryWriter;
  }

  async sync(input: {
    action: ActionEnvelopeV1;
    reservation: EvidenceReservationV1;
    decision: WardenDecisionV1;
    checkpoint: WardenExecutionCheckpointV1;
    query: AmazonOrdersSearchQueryV1;
    executedAt: string;
    observedAt: string;
  }): Promise<AmazonOrdersSyncResultV1> {
    assertGovernedExecution(input);
    const observed = parseInstant(input.observedAt, "amazon_invalid_observation_time");
    const executed = parseInstant(input.executedAt, "amazon_invalid_execution_time");
    if (observed < executed) throw new Error("amazon_observation_before_execution");

    try {
      const provider = await this.client.searchOrders({
        query: input.query,
        executedAt: input.executedAt,
        observedAt: input.observedAt,
      });
      const evidenceRef = `AMAZON-PROVIDER-EVIDENCE:${digest(
        [
          input.action.actionRef,
          input.reservation.reservationRef,
          provider.receipt.providerRequestRef,
          provider.receipt.responseDigest,
          input.observedAt,
        ].join("|"),
      ).slice(0, 24)}`;
      const projections = normalizeOrders({
        orders: provider.payload.orders ?? [],
        receipt: provider.receipt,
        evidenceRef,
        correlationId: input.action.correlationId,
        observedAt: input.observedAt,
      });
      const registry = await this.registryWriter.writeBatch(projections);
      const projection: AmazonProjectionV1 = {
        registryRevisionRef: registry.registryRevisionRef,
        orderRefs: [...registry.orderRefs],
      };

      return {
        state: "SYNCED",
        provider: provider.receipt,
        river: {
          state: "PROVIDER_OBSERVED",
          reservationRef: input.reservation.reservationRef,
          observationEvidenceRef: evidenceRef,
          providerResponseDigest: provider.receipt.responseDigest,
          sealed: false,
        },
        registry: {
          registryRevisionRef: registry.registryRevisionRef,
          orderRefs: [...registry.orderRefs],
        },
        silk: silkObservation(projections),
        vsr: { ...projection, orderRefs: [...projection.orderRefs] },
        empire: { ...projection, orderRefs: [...projection.orderRefs] },
        realWorldWriteEffectOccurred: false,
      };
    } catch (error) {
      const runtimeError =
        error instanceof AmazonRuntimeErrorV1
          ? error
          : new AmazonRuntimeErrorV1("RESPONSE", "amazon_provider_response_invalid");
      const provider = exceptionProviderReceipt(runtimeError, input.observedAt);
      const emptyProjection: AmazonProjectionV1 = { registryRevisionRef: null, orderRefs: [] };
      return {
        state: "EXCEPTION",
        provider,
        river: {
          state: "EXCEPTION",
          reservationRef: input.reservation.reservationRef,
          providerResponseDigest: provider.responseDigest,
          sealed: false,
        },
        registry: { registryRevisionRef: null, orderRefs: [] },
        silk: {
          state: "NOT_OBSERVED",
          settlementFinality: false,
          moneyMoved: false,
          observedProceeds: [],
        },
        vsr: { ...emptyProjection },
        empire: { ...emptyProjection },
        exception: {
          code:
            runtimeError.kind === "PROVIDER"
              ? "AMAZON_PROVIDER_ERROR"
              : "AMAZON_RESPONSE_INVALID",
          reason: runtimeError.message,
          providerStatusCode: runtimeError.metadata.statusCode,
          providerRequestRef: runtimeError.metadata.providerRequestRef,
        },
        realWorldWriteEffectOccurred: false,
      };
    }
  }

  async syncDenied(input: {
    request: { requestRef: string };
    decision: WardenDecisionV1;
    observedAt: string;
  }): Promise<AmazonOrdersDeniedResultV1> {
    if (input.decision.decision === "ALLOW") {
      throw new Error("amazon_sync_denied_requires_non_allow_decision");
    }
    return {
      state: "DENIED",
      decisionRef: input.decision.decisionRef,
      reasonCodes: [...input.decision.reasonCodes],
      providerInvoked: false,
      realWorldWriteEffectOccurred: false,
      observedAt: input.observedAt,
    };
  }
}
