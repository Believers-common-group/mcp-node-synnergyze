import { describe, expect, it } from "vitest";

import type { LegislativeSourceAdapterV1 } from "./source-adapter.ts";

describe("LegislativeSourceAdapterV1", () => {
  it("is a read-side contract with no authority or execution surface", () => {
    const adapter = {} as LegislativeSourceAdapterV1;
    expect(adapter).not.toHaveProperty("authorize");
    expect(adapter).not.toHaveProperty("execute");
  });
});
