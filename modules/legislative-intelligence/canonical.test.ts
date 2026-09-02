import { describe, expect, it } from "vitest";

import { canonicalizeV1, sha256CanonicalV1 } from "./canonical.ts";

describe("canonical legislative hashing", () => {
  it("is stable across object key order", () => {
    expect(canonicalizeV1({ b: 2, a: 1 })).toBe(canonicalizeV1({ a: 1, b: 2 }));
    expect(sha256CanonicalV1({ b: 2, a: 1 })).toBe(sha256CanonicalV1({ a: 1, b: 2 }));
  });
});
