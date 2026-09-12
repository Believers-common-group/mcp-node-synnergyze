#!/usr/bin/env -S node --experimental-strip-types

import { authenticate } from "../authentication.ts";
import { AppStateManager } from "../appState.ts";
import { DashboardApi } from "../DashboardApi.ts";
import {
  operationId as GetUserInfoOperationId,
  registerGetUserInfo,
} from "../tools/registerGetUserInfo.ts";
import {
  operationId as GetApplicationsOperationId,
  registerGetApplications,
} from "../tools/registerGetApplications.ts";
import { maybeRegisterWardenConformanceDecision } from "../tools/registerWardenConformanceDecision.ts";
import { maybeRegisterRiverWardenConformanceReservation } from "../tools/registerRiverWardenConformanceReservation.ts";
import { maybeRegisterWardenRiverSynnergyzeConformanceExecution } from "../tools/registerWardenRiverSynnergyzeConformanceExecution.ts";
import { maybeRegisterWardenRiverEffectConformance } from "../tools/registerWardenRiverEffectConformance.ts";
import { maybeRegisterSynnergyzeRuntimeActivation } from "../tools/registerSynnergyzeRuntimeActivation.ts";
import { maybeRegisterWardenReconciliationConformance } from "../tools/registerWardenReconciliationConformance.ts";
import {
  createDefaultPestelLegislativeServiceV1,
  maybeRegisterPestelLegislativeIngest,
} from "../tools/registerPestelLegislativeIngest.ts";
import { maybeRegisterPestelImpactBrief } from "../tools/registerPestelImpactBrief.ts";
import { InMemoryLegislativeIntelligenceResultStoreV1 } from "../../modules/legislative-intelligence/result-store.ts";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type {
  ProcessCallbackArguments,
  ProcessInputSchema,
  RequestMiddleware,
} from "../tools/registerOpenApi.ts";
import { registerOpenApiTools } from "../tools/registerOpenApi.ts";
import { CONFIG } from "../config.ts";
import {
  ABTestingSpec,
  AnalyticsSpec,
  CollectionsSpec,
  IngestionSpec,
  MonitoringSpec,
  QuerySuggestionsSpec,
  RecommendSpec,
  SearchSpec,
  UsageSpec,
} from "../openApi.ts";
import { CliFilteringOptionsSchema, getToolFilter, isToolAllowed } from "../toolFilters.ts";
import {
  operationId as SetAttributesForFacetingOperationId,
  registerSetAttributesForFaceting,
} from "../tools/registerSetAttributesForFaceting.ts";
import {
  registerSetCustomRanking,
  operationId as SetCustomRankingOperationId,
} from "../tools/registerSetCustomRanking.ts";

import { CustomMcpServer } from "../CustomMcpServer.ts";
import { z } from "zod";

export const StartServerOptionsSchema = CliFilteringOptionsSchema.extend({
  credentials: z
    .object({
      applicationId: z.string(),
      apiKey: z.string(),
    })
    .optional(),
});

export type StartServerOptions = z.infer<typeof StartServerOptionsSchema>;

function makeRegionRequestMiddleware(dashboardApi: DashboardApi): RequestMiddleware {
  return async ({ request, params }) => {
    const application = await dashboardApi.getApplication(params.applicationId);
    const region = application.data.attributes.log_region === "de" ? "eu" : "us";

    const url = new URL(request.url);
    const regionFromUrl = url.hostname.match(/data\.(.+)\.algolia.com/)?.[0];

    if (regionFromUrl !== region) {
      console.error("Had to adjust region from", regionFromUrl, "to", region);
      url.hostname = `data.${region}.algolia.com`;
      return new Request(url, request.clone());
    }

    return request;
  };
}

export async function createServer(options: StartServerOptions): Promise<CustomMcpServer> {
  const { credentials, ...opts } = StartServerOptionsSchema.parse(options);
  const toolFilter = getToolFilter(opts);

  const server = new CustomMcpServer({
    name: "algolia",
    version: CONFIG.version,
    capabilities: {
      resources: {},
      tools: {},
    },
  });

  maybeRegisterWardenConformanceDecision(server, toolFilter);
  maybeRegisterRiverWardenConformanceReservation(server, toolFilter);
  maybeRegisterWardenRiverSynnergyzeConformanceExecution(server, toolFilter);
  maybeRegisterWardenRiverEffectConformance(server, toolFilter);
  maybeRegisterSynnergyzeRuntimeActivation(server, toolFilter);
  maybeRegisterWardenReconciliationConformance(server, toolFilter);

  const pestelResultStore = new InMemoryLegislativeIntelligenceResultStoreV1();
  const pestelService = createDefaultPestelLegislativeServiceV1();
  maybeRegisterPestelLegislativeIngest(server, toolFilter, pestelService, pestelResultStore);
  maybeRegisterPestelImpactBrief(server, toolFilter, pestelResultStore);

  const regionHotFixMiddlewares: RequestMiddleware[] = [];
  let processCallbackArguments: ProcessCallbackArguments;
  const processInputSchema: ProcessInputSchema = (inputSchema) => {
    if (credentials && inputSchema.properties?.applicationId) {
      delete inputSchema.properties.applicationId;

      if (Array.isArray(inputSchema.required)) {
        inputSchema.required = inputSchema.required.filter((item) => item !== "applicationId");
      }
    }

    return inputSchema;
  };

  if (credentials) {
    processCallbackArguments = async (params, securityKeys) => {
      const result = { ...params };
      if (securityKeys.has("applicationId")) result.applicationId = credentials.applicationId;
      if (securityKeys.has("apiKey")) result.apiKey = credentials.apiKey;
      return result;
    };
  } else {
    const appState = await AppStateManager.load();
    const { accessToken } = appState.getAll();

    if (!accessToken) {
      await authenticate(appState);
    }

    const dashboardApi = new DashboardApi(appState);
    regionHotFixMiddlewares.push(makeRegionRequestMiddleware(dashboardApi));
    processCallbackArguments = async (params) => {
      if (typeof params.applicationId !== "string") return params;
      const apiKey = await dashboardApi.getApiKey(params.applicationId);
      return { ...params, apiKey };
    };
  }

  for (const openApiSpec of [
    SearchSpec,
    AnalyticsSpec,
    RecommendSpec,
    ABTestingSpec,
    MonitoringSpec,
    CollectionsSpec,
    QuerySuggestionsSpec,
    UsageSpec,
    IngestionSpec,
  ]) {
    registerOpenApiTools({
      server,
      openApiSpec,
      filter: toolFilter,
      processInputSchema,
      processCallbackArguments,
      requestMiddlewares: regionHotFixMiddlewares,
    });
  }

  if (isToolAllowed(GetUserInfoOperationId, toolFilter)) registerGetUserInfo(server);
  if (isToolAllowed(GetApplicationsOperationId, toolFilter)) registerGetApplications(server);
  if (isToolAllowed(SetAttributesForFacetingOperationId, toolFilter)) {
    registerSetAttributesForFaceting(server);
  }
  if (isToolAllowed(SetCustomRankingOperationId, toolFilter)) registerSetCustomRanking(server);

  return server;
}

export async function startServer(options: StartServerOptions): Promise<CustomMcpServer> {
  const server = await createServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}
