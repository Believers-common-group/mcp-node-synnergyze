import type { LegislativeSourceRecord, SourceEnvelope } from "../../contracts.ts";
import { sha256Ref } from "../../contracts.ts";
import type { CongressGovCredentialProvider } from "./credential-provider.ts";

const CONGRESS_BASE_URL = "https://api.congress.gov/v3";

export type CongressGovHttpErrorCode =
  | "CONGRESS_UNAUTHORIZED"
  | "CONGRESS_FORBIDDEN"
  | "CONGRESS_RATE_LIMITED"
  | "CONGRESS_UPSTREAM_ERROR"
  | "CONGRESS_HTTP_ERROR";

export class CongressGovHttpError extends Error {
  constructor(
    public readonly code: CongressGovHttpErrorCode,
    public readonly status: number,
    public readonly path: string,
  ) {
    super(`${code}:${status}:${path}`);
    this.name = "CongressGovHttpError";
  }

  static fromStatus(status: number, path: string): CongressGovHttpError {
    if (status === 401) return new CongressGovHttpError("CONGRESS_UNAUTHORIZED", status, path);
    if (status === 403) return new CongressGovHttpError("CONGRESS_FORBIDDEN", status, path);
    if (status === 429) return new CongressGovHttpError("CONGRESS_RATE_LIMITED", status, path);
    if (status >= 500) return new CongressGovHttpError("CONGRESS_UPSTREAM_ERROR", status, path);
    return new CongressGovHttpError("CONGRESS_HTTP_ERROR", status, path);
  }
}

export interface CongressGovGetRequest {
  path: string;
  sourceObjectType: LegislativeSourceRecord["sourceObjectType"];
  sourceObjectId: string;
}

export class CongressGovClient {
  constructor(
    private readonly credentials: CongressGovCredentialProvider,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async getJson<T>(request: CongressGovGetRequest, retrievedAt: string): Promise<SourceEnvelope<T>> {
    if (!request.path.startsWith("/")) {
      throw new Error("congress_path_must_be_relative");
    }

    const url = new URL(`${CONGRESS_BASE_URL}${request.path}`);
    if (url.searchParams.has("api_key")) {
      throw new Error("congress_api_key_query_prohibited");
    }

    const requestReceiptId = await this.credentials.getAdmissionReceiptRef();
    const apiKey = await this.credentials.getApiKey();

    const response = await this.fetchFn(url, {
      method: "GET",
      headers: {
        "X-Api-Key": apiKey,
      },
    });

    if (!response.ok) {
      throw CongressGovHttpError.fromStatus(response.status, url.pathname);
    }

    const payload = (await response.json()) as T;
    return {
      sourceRecord: {
        sourceId: `CONGRESS-GOV:${request.sourceObjectId}`,
        sourceSystem: "congress.gov",
        jurisdiction: "US-FEDERAL",
        sourceObjectType: request.sourceObjectType,
        sourceObjectId: request.sourceObjectId,
        sourceUrl: url.toString(),
        retrievedAt,
        rawSha256: sha256Ref("sha256", payload),
        requestReceiptId,
      },
      payload,
      httpStatus: response.status,
      rateLimit: {
        limit: response.headers.get("x-ratelimit-limit") ?? undefined,
        remaining: response.headers.get("x-ratelimit-remaining") ?? undefined,
      },
    };
  }
}
