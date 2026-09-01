import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

import {
  CongressGovClient,
  CongressGovClientV1,
  CongressGovHttpError,
} from "./client.ts";
import {
  StaticCongressGovCredentialProviderV1,
  StaticTestCredentialProvider,
} from "./credential-provider.ts";

const secret = "SENTINEL_CONGRESS_SECRET_12345";
const baseUrl = "https://api.congress.gov/v3";

let observedHeader: string | null = null;

const server = setupServer(
  http.get(`${baseUrl}/bill/119/hr/1001`, ({ request }) => {
    observedHeader = request.headers.get("x-api-key");
    return HttpResponse.json(
      { bill: { congress: 119, type: "HR", number: "1001", title: "Synthetic Bill" } },
      { headers: { "x-ratelimit-limit": "5000", "x-ratelimit-remaining": "4999" } },
    );
  }),
  http.get(`${baseUrl}/bill/119/hr/401`, () => new HttpResponse(null, { status: 401 })),
  http.get(`${baseUrl}/bill/119/hr/429`, () => new HttpResponse(null, { status: 429 })),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  observedHeader = null;
  server.resetHandlers();
});
afterAll(() => server.close());

describe("CongressGovClient", () => {
  it("injects X-Api-Key only at dispatch and excludes it from serialized results", async () => {
    const client = new CongressGovClient(
      new StaticTestCredentialProvider(secret, "CREDENTIAL-RECEIPT:TEST"),
    );

    const result = await client.getJson(
      {
        path: "/bill/119/hr/1001?format=json",
        sourceObjectType: "bill",
        sourceObjectId: "119-HR-1001",
      },
      "2026-09-02T00:00:00.000Z",
    );

    expect(observedHeader).toBe(secret);
    expect(result.httpStatus).toBe(200);
    expect(result.rateLimit).toEqual({ limit: "5000", remaining: "4999" });
    expect(result.sourceRecord.requestReceiptId).toBe("CREDENTIAL-RECEIPT:TEST");
    expect(result.sourceRecord.sourceUrl).not.toContain("api_key=");
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it("rejects query-string credential transport before dispatch", async () => {
    const client = new CongressGovClient(new StaticTestCredentialProvider(secret));

    await expect(
      client.getJson(
        {
          path: `/bill/119/hr/1001?api_key=${secret}`,
          sourceObjectType: "bill",
          sourceObjectId: "119-HR-1001",
        },
        "2026-09-02T00:00:00.000Z",
      ),
    ).rejects.toThrow("congress_api_key_query_prohibited");
  });

  it.each([
    ["/bill/119/hr/401", 401, "CONGRESS_UNAUTHORIZED"],
    ["/bill/119/hr/429", 429, "CONGRESS_RATE_LIMITED"],
  ] as const)("returns safe typed HTTP errors for %s", async (path, status, code) => {
    const client = new CongressGovClient(new StaticTestCredentialProvider(secret));

    let caught: unknown;
    try {
      await client.getJson(
        { path, sourceObjectType: "bill", sourceObjectId: path.split("/").at(-1) ?? "unknown" },
        "2026-09-02T00:00:00.000Z",
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(CongressGovHttpError);
    expect((caught as CongressGovHttpError).status).toBe(status);
    expect((caught as CongressGovHttpError).code).toBe(code);
    expect(JSON.stringify(caught)).not.toContain(secret);
    expect(String(caught)).not.toContain(secret);
  });
});

describe("CongressGovClientV1", () => {
  it("returns a versioned source envelope with only non-secret credential metadata", async () => {
    const client = new CongressGovClientV1(
      new StaticCongressGovCredentialProviderV1(secret, "0123456789abcdef"),
    );

    const result = await client.getSource(
      {
        sourcePath: "/bill/119/hr/1001?format=json",
        sourceObjectType: "bill",
        sourceObjectId: "119-hr-1001",
      },
      "2026-09-02T00:00:00.000Z",
    );

    expect(observedHeader).toBe(secret);
    expect(result.schemaVersion).toBe("LEG-SOURCE:R0.1");
    expect(result.rawSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.credentialAdmissionRef).toBe("CONGRESS-GOV-API-KEY-001");
    expect(result.credentialFingerprintPrefix).toBe("0123456789abcdef");
    expect(result.rateLimitLimit).toBe(5000);
    expect(result.rateLimitRemaining).toBe(4999);
    expect(JSON.stringify(result)).not.toContain(secret);
  });
});
