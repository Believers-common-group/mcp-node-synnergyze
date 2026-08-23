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

  // The Warden conformance tool is deliberately outside the normal Algolia
  // allow-list. It requires both VSR_WARDEN_MCP_CONFORMANCE=1 and an explicit
  // --allow-tools wardenEvaluateConformanceDecision opt-in.
  maybeRegisterWardenConformanceDecision(server, toolFilter);

  // The composite Warden -> River reservation capability is independently
  // gated. It requires both Warden and River conformance switches plus an
  // explicit allow-tools entry; enabling Warden alone cannot expose River.
  maybeRegisterRiverWardenConformanceReservation(server, toolFilter);

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

      if (securityKeys.has("applicationId")) {
        result.applicationId = credentials.applicationId;
      }

      if (securityKeys.has("apiKey")) {
        result.apiKey = credentials.apiKey;
      }

      return result;
    };
  } else {
    const appState = await AppStateManager.load();

    if (!appState.get("accessToken")) {
      const token = await authenticate();

      await appState.update({
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
      });
    }

    const dashboardApi = new DashboardApi({ baseUrl: CONFIG.dashboardApiBaseUrl, appState });

    processCallbackArguments = async (params, securityKeys) => {
      const result = { ...params };

      if (securityKeys.has("apiKey")) {
        result.apiKey = await dashboardApi.getApiKey(params.applicationId);
      }

      return result;
    };

    regionHotFixMiddlewares.push(makeRegionRequestMiddleware(dashboardApi));

    if (isToolAllowed(GetUserInfoOperationId, toolFilter)) {
      registerGetUserInfo(server, dashboardApi);
    }

    if (isToolAllowed(GetApplicationsOperationId, toolFilter)) {
      registerGetApplications(server, dashboardApi);
    }

    if (isToolAllowed(SetAttributesForFacetingOperationId, toolFilter)) {
      registerSetAttributesForFaceting(server, dashboardApi);
    }

    if (isToolAllowed(SetCustomRankingOperationId, toolFilter)) {
      registerSetCustomRanking(server, dashboardApi);
    }
  }

  for (const openApiSpec of [
    SearchSpec,
    AnalyticsSpec,
    RecommendSpec,
    ABTestingSpec,
    MonitoringSpec,
    CollectionsSpec,
    QuerySuggestionsSpec,
  ]) {
    registerOpenApiTools({
      server,
      processInputSchema,
      processCallbackArguments,
      openApiSpec,
      toolFilter,
    });
  }

  registerOpenApiTools({
    server,
    processInputSchema,
    processCallbackArguments,
    openApiSpec: UsageSpec,
    toolFilter,
    requestMiddlewares: [
      async ({ request }) => {
        const url = new URL(request.url);
        const nameParams = url.searchParams.get("name");

        if (!nameParams) {
          return new Request(url, request.clone());
        }

        const nameValues = nameParams.split(",");

        url.searchParams.delete("name");

        nameValues.forEach((value) => {
          url.searchParams.append("name", value);
        });

        return new Request(url, request.clone());
      },
    ],
  });

  registerOpenApiTools({
    server,
    processInputSchema,
    processCallbackArguments,
    openApiSpec: IngestionSpec,
    toolFilter,
    requestMiddlewares: [...regionHotFixMiddlewares],
  });

  return server;
}

export async function startServer(options: StartServerOptions): Promise<CustomMcpServer> {
  const server = await createServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}
