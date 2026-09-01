import type {
  LegislativeObjectRefV1,
  RelatedSourceBundleV1,
  SourceEnvelopeV1,
  SourceHealthV1,
} from "../../contracts.ts";
import type { LegislativeSourceAdapterV1 } from "../source-adapter.ts";
import type { CongressGovClientV1 } from "./client.ts";

const API_ORIGIN = "https://api.congress.gov";
const API_PREFIX = "/v3";
const MAX_PAGES = 100;

type RelatedType = "actions" | "amendments" | "committees" | "subjects" | "summaries";

function canonicalBillId(ref: LegislativeObjectRefV1): string {
  return `${ref.congress}-${ref.billType.toLowerCase()}-${ref.number}`;
}

function billBasePath(ref: LegislativeObjectRefV1): string {
  if (
    ref.jurisdiction !== "US-FEDERAL" ||
    ref.objectType !== "bill" ||
    !Number.isInteger(ref.congress) ||
    ref.congress <= 0 ||
    !Number.isInteger(ref.number) ||
    ref.number <= 0 ||
    !/^[a-z]+$/i.test(ref.billType)
  ) {
    throw new Error("CONGRESS_OBJECT_REF_INVALID");
  }
  return `/bill/${ref.congress}/${ref.billType.toLowerCase()}/${ref.number}`;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function paginationNext(body: unknown): string | undefined {
  const pagination = record(record(body)?.pagination);
  return typeof pagination?.next === "string" && pagination.next.length > 0
    ? pagination.next
    : undefined;
}

function containsCredentialQuery(url: URL): boolean {
  return [...url.searchParams.keys()].some((key) => {
    const normalized = key.toLowerCase();
    return normalized === "api_key" || normalized === "apikey";
  });
}

function safeApiSourcePath(value: string): string | undefined {
  try {
    if (value.startsWith("/v3/")) {
      const url = new URL(`${API_ORIGIN}${value}`);
      if (containsCredentialQuery(url)) return undefined;
      return `${url.pathname.slice(API_PREFIX.length)}${url.search}`;
    }
    if (value.startsWith("/")) {
      const url = new URL(`${API_ORIGIN}${API_PREFIX}${value}`);
      if (containsCredentialQuery(url)) return undefined;
      return `${value}${url.search && !value.includes("?") ? url.search : ""}`;
    }

    const url = new URL(value);
    if (
      url.origin !== API_ORIGIN ||
      (url.pathname !== API_PREFIX && !url.pathname.startsWith(`${API_PREFIX}/`)) ||
      containsCredentialQuery(url)
    ) {
      return undefined;
    }
    const path = url.pathname.slice(API_PREFIX.length) || "/";
    return `${path}${url.search}`;
  } catch {
    return undefined;
  }
}

function declaredLawEntries(body: unknown): Record<string, unknown>[] {
  const bill = record(record(body)?.bill);
  const laws = bill?.laws;
  return Array.isArray(laws) ? laws.map(record).filter((item): item is Record<string, unknown> => Boolean(item)) : [];
}

function lawSourceObjectId(ref: LegislativeObjectRefV1, entry: Record<string, unknown>): string {
  const type = typeof entry.type === "string" ? entry.type.toLowerCase().replace(/\s+/g, "-") : "law";
  const number = typeof entry.number === "string" || typeof entry.number === "number" ? String(entry.number) : "unknown";
  return `${ref.congress}-${type}-${number}`;
}

export class CongressGovSourceAdapterV1 implements LegislativeSourceAdapterV1 {
  constructor(private readonly client: CongressGovClientV1) {}

  async getObject(ref: LegislativeObjectRefV1): Promise<SourceEnvelopeV1> {
    const path = billBasePath(ref);
    return this.client.getJson(path, "bill", canonicalBillId(ref));
  }

  async getActions(ref: LegislativeObjectRefV1): Promise<readonly SourceEnvelopeV1[]> {
    return this.getPages(ref, "actions");
  }

  async getRelated(ref: LegislativeObjectRefV1): Promise<RelatedSourceBundleV1> {
    const bill = await this.getObject(ref);
    const actions = await this.getPages(ref, "actions");
    const amendments = await this.getPages(ref, "amendments");
    const committees = await this.getPages(ref, "committees");
    const subjects = await this.getPages(ref, "subjects");
    const summaries = await this.getPages(ref, "summaries");
    const law = await this.getLawIfDeclared(ref, bill);

    return {
      bill,
      actions,
      amendments,
      committees,
      subjects,
      summaries,
      ...(law ? { law } : {}),
    };
  }

  async health(): Promise<SourceHealthV1> {
    return this.client.health();
  }

  private async getPages(
    ref: LegislativeObjectRefV1,
    type: RelatedType,
  ): Promise<readonly SourceEnvelopeV1[]> {
    const basePath = `${billBasePath(ref)}/${type}`;
    const billId = canonicalBillId(ref);
    const pages: SourceEnvelopeV1[] = [];
    const seen = new Set<string>();
    let path: string | undefined = basePath;

    for (let page = 1; path && page <= MAX_PAGES; page += 1) {
      if (seen.has(path)) throw new Error("CONGRESS_PAGINATION_LOOP");
      seen.add(path);
      const envelope = await this.client.getJson(path, type, `${billId}:${type}:${page}`);
      pages.push(envelope);

      const next = paginationNext(envelope.body);
      if (!next) return pages;
      path = safeApiSourcePath(next);
      if (!path) throw new Error("CONGRESS_PAGINATION_NEXT_UNSAFE");
    }

    if (path) throw new Error("CONGRESS_PAGINATION_LIMIT_EXCEEDED");
    return pages;
  }

  private async getLawIfDeclared(
    ref: LegislativeObjectRefV1,
    bill: SourceEnvelopeV1,
  ): Promise<SourceEnvelopeV1 | undefined> {
    const entries = declaredLawEntries(bill.body);
    if (entries.length === 0) return undefined;

    const candidates = entries
      .map((entry) => ({ entry, url: typeof entry.url === "string" ? safeApiSourcePath(entry.url) : undefined }))
      .filter((candidate): candidate is { entry: Record<string, unknown>; url: string } => Boolean(candidate.url))
      .sort((a, b) => a.url.localeCompare(b.url));

    const selected = candidates[0];
    if (!selected) throw new Error("LAW_DETAIL_UNRESOLVABLE");
    return this.client.getJson(selected.url, "law", lawSourceObjectId(ref, selected.entry));
  }
}
