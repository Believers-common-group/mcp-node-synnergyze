import { describe, expect, it } from "vitest";

import { sha256Ref, stableJson } from "./contracts.ts";

describe("legislative contracts", () => {
  it("canonicalizes object keys recursively", () => {
    expect(stableJson({ z: 1, a: { y: 2, x: 1 } })).toBe('{"a":{"x":1,"y":2},"z":1}');
  });

  it("returns deterministic prefixed identities", () => {
    expect(sha256Ref("LEG-EVENT", { b: 2, a: 1 })).toBe(
      sha256Ref("LEG-EVENT", { a: 1, b: 2 }),
    );
  });
});
