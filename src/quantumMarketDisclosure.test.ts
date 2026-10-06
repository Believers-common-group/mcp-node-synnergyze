import { describe, expect, it } from "vitest";
import {
  decideQuantumMarketDisclosure,
  projectQuantumMarketRecord,
  type DisclosureContext,
} from "./quantumMarketDisclosure.ts";

const q0: DisclosureContext = {
  tier: "Q0",
  authenticated: false,
};

const q1: DisclosureContext = {
  tier: "Q1",
  authenticated: true,
};

const q2: DisclosureContext = {
  tier: "Q2",
  authenticated: true,
  subscriberEntitled: true,
};

const q3: DisclosureContext = {
  tier: "Q3",
  authenticated: true,
  subscriberEntitled: true,
  premiumEntitled: true,
};

describe("Quantum Market progressive disclosure", () => {
  it("allows OPEN fields to guests", () => {
    expect(decideQuantumMarketDisclosure("OPEN", q0).allowed).toBe(true);
  });

  it("requires authentication for REGISTERED fields", () => {
    expect(decideQuantumMarketDisclosure("REGISTERED", q0).allowed).toBe(false);
    expect(decideQuantumMarketDisclosure("REGISTERED", q1).allowed).toBe(true);
  });

  it("requires paid entitlement for SUBSCRIBER fields", () => {
    expect(decideQuantumMarketDisclosure("SUBSCRIBER", q1).allowed).toBe(false);
    expect(decideQuantumMarketDisclosure("SUBSCRIBER", q2).allowed).toBe(true);
  });

  it("requires premium entitlement for PREMIUM fields", () => {
    expect(decideQuantumMarketDisclosure("PREMIUM", q2).allowed).toBe(false);
    expect(decideQuantumMarketDisclosure("PREMIUM", q3).allowed).toBe(true);
  });

  it("does not let Premium bypass protected classifications", () => {
    expect(decideQuantumMarketDisclosure("COMMERCIAL_CONFIDENTIAL", q3).allowed).toBe(false);
    expect(decideQuantumMarketDisclosure("ESTATE_PRIVATE", q3).allowed).toBe(false);
    expect(decideQuantumMarketDisclosure("TRANSACTION_BOUND", q3).allowed).toBe(false);
    expect(decideQuantumMarketDisclosure("REGULATED", q3).allowed).toBe(false);
    expect(decideQuantumMarketDisclosure("NEVER_PUBLIC", q3).allowed).toBe(false);
  });

  it("allows protected content only after its independent gate is satisfied", () => {
    expect(
      decideQuantumMarketDisclosure("COMMERCIAL_CONFIDENTIAL", {
        ...q3,
        commercialRelationship: true,
      }).allowed,
    ).toBe(true);

    expect(
      decideQuantumMarketDisclosure("ESTATE_PRIVATE", {
        ...q3,
        estateScopeMatch: true,
      }).allowed,
    ).toBe(true);

    expect(
      decideQuantumMarketDisclosure("TRANSACTION_BOUND", {
        ...q3,
        transactionEligible: true,
      }).allowed,
    ).toBe(true);

    expect(
      decideQuantumMarketDisclosure("REGULATED", {
        ...q3,
        regulatedApprovedByWarden: true,
      }).allowed,
    ).toBe(true);
  });

  it("projects one object differently by entitlement", () => {
    const record = {
      title: { value: "12 oz stretch denim", classification: "OPEN" as const },
      composition: { value: "98/2 cotton elastane", classification: "REGISTERED" as const },
      indicativeCost: { value: "decision-grade-band", classification: "SUBSCRIBER" as const },
      sourcingModel: { value: "optimized-scenario", classification: "PREMIUM" as const },
      clientContract: { value: "private", classification: "ESTATE_PRIVATE" as const },
    };

    expect(projectQuantumMarketRecord(record, q0)).toEqual({
      title: "12 oz stretch denim",
    });

    expect(projectQuantumMarketRecord(record, q1)).toEqual({
      title: "12 oz stretch denim",
      composition: "98/2 cotton elastane",
    });

    expect(projectQuantumMarketRecord(record, q2)).toEqual({
      title: "12 oz stretch denim",
      composition: "98/2 cotton elastane",
      indicativeCost: "decision-grade-band",
    });

    expect(projectQuantumMarketRecord(record, q3)).toEqual({
      title: "12 oz stretch denim",
      composition: "98/2 cotton elastane",
      indicativeCost: "decision-grade-band",
      sourcingModel: "optimized-scenario",
    });
  });
});
