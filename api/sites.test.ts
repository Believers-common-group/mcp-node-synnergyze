import { describe, expect, it } from "vitest";

import {
  ESTATE_SITE_REGISTRY,
  isAllowedSiteOrigin,
  resolveSite,
} from "./sites.ts";

describe("REG-SITE-001 estate site federation", () => {
  it("contains exactly BC, CC and VSR under one Alpha node", () => {
    expect(ESTATE_SITE_REGISTRY.sites.map((site) => site.id)).toEqual(["bc", "cc", "vsr"]);
    expect(new Set(ESTATE_SITE_REGISTRY.sites.map((site) => site.alpha_node_id))).toEqual(
      new Set(["ALPHA-NODE-001"]),
    );
  });

  it("keeps Warden as authority rather than any website", () => {
    expect(ESTATE_SITE_REGISTRY.authority_boundary).toBe("WARDEN");
    for (const site of ESTATE_SITE_REGISTRY.sites) {
      expect(site.authority_boundary).toBe("WARDEN");
    }
  });

  it("does not use a shared cross-domain cookie as identity continuity", () => {
    expect(ESTATE_SITE_REGISTRY.session_policy).toBe("NO_SHARED_CROSS_DOMAIN_COOKIE");
  });

  it("resolves each site deterministically", () => {
    expect(resolveSite("bc")?.canonical_url).toBe("https://believerscommon.com");
    expect(resolveSite("cc")?.canonical_url).toBe("https://creators-common.org");
    expect(resolveSite("vsr")?.canonical_url).toBe("https://virtualsilkroad.com");
    expect(resolveSite("unknown")).toBeUndefined();
  });

  it("allows canonical site origins and Vercel release previews only", () => {
    expect(isAllowedSiteOrigin("https://believerscommon.com")).toBe(true);
    expect(isAllowedSiteOrigin("https://www.creators-common.org")).toBe(true);
    expect(isAllowedSiteOrigin("https://preview-123.vercel.app")).toBe(true);
    expect(isAllowedSiteOrigin("https://attacker.example")).toBe(false);
  });
});
