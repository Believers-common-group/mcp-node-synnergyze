import { describe, expect, it } from "vitest";

import {
  assertProofReferenceIntegrityV1,
  createGenesisDeviceProofReferenceV1,
  createRiverReservationProofReferenceV1,
  createRiverRuntimeCompositeProofReferenceV1,
  createRiverSealProofReferenceV1,
  createSynnergyzeCompositionProofReferenceV1,
  createSynnergyzeExecutionProofReferenceV1,
  createSynnergyzeVerificationProofReferenceV1,
  createWardenAuthorizationProofReferenceV1,
} from "./proof-reference.ts";

const base = {
  subjectRef: "GENESIS-DEVICE-ALPHA-LG-001",
  scope: "ESTATE" as const,
  scopeRef: "GENESIS-ESTATE-001",
  sourceRefs: ["REF-B", "REF-A", "REF-A"],
  createdAt: "2026-09-12T05:00:00.000Z",
  synthetic: true,
};

describe("ProofReferenceV1", () => {
  it("creates a deterministic Genesis device Proof ID over canonical source refs", () => {
    const proof = createGenesisDeviceProofReferenceV1(base);
    const reordered = createGenesisDeviceProofReferenceV1({
      ...base,
      sourceRefs: ["REF-A", "REF-B"],
    });

    expect(proof.proofFrom).toBe("GENESIS");
    expect(proof.proofType).toBe("GENESIS_DEVICE_RESOLUTION");
    expect(proof.proofId).toMatch(/^E-GEN-DEVICE-[0-9A-F]{8}$/);
    expect(proof.integrityDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(proof.sourceRefs).toEqual(["REF-A", "REF-B"]);
    expect(reordered).toEqual(proof);
    expect(() => assertProofReferenceIntegrityV1(proof)).not.toThrow();
  });

  it("changes Proof ID and digest when canonical proof material changes", () => {
    const proof = createGenesisDeviceProofReferenceV1(base);
    const changed = createGenesisDeviceProofReferenceV1({
      ...base,
      sourceRefs: ["REF-C"],
    });

    expect(changed.proofId).not.toBe(proof.proofId);
    expect(changed.integrityDigest).not.toBe(proof.integrityDigest);
  });

  it("fails closed when the readable Proof ID no longer matches its digest", () => {
    const proof = createGenesisDeviceProofReferenceV1(base);

    expect(() =>
      assertProofReferenceIntegrityV1({
        ...proof,
        proofId: "E-GEN-DEVICE-DEADBEEF",
      }),
    ).toThrow("proof_id_digest_mismatch");
  });

  it("fails closed when stored integrity digest is tampered", () => {
    const proof = createGenesisDeviceProofReferenceV1(base);

    expect(() =>
      assertProofReferenceIntegrityV1({
        ...proof,
        integrityDigest:
          "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      }),
    ).toThrow("proof_integrity_digest_mismatch");
  });

  it("hard-codes the proving system for every proof class", () => {
    const genesis = createGenesisDeviceProofReferenceV1(base);
    const composition = createSynnergyzeCompositionProofReferenceV1({
      ...base,
      subjectRef: "WARDEN-REQUEST:001",
    });
    const warden = createWardenAuthorizationProofReferenceV1({
      ...base,
      subjectRef: "WARDEN-DECISION:001",
    });
    const reservation = createRiverReservationProofReferenceV1({
      ...base,
      subjectRef: "RIVER-RESERVATION:001",
    });
    const execution = createSynnergyzeExecutionProofReferenceV1({
      ...base,
      subjectRef: "SYNNERGYZE-EXECUTION-RECEIPT:001",
    });
    const verification = createSynnergyzeVerificationProofReferenceV1({
      ...base,
      subjectRef: "VERIFIED-EFFECT:001",
    });
    const seal = createRiverSealProofReferenceV1({
      ...base,
      subjectRef: "RIVER-EVIDENCE-SEALED:001",
    });
    const composite = createRiverRuntimeCompositeProofReferenceV1({
      ...base,
      subjectRef: "CORR:RUNTIME-001",
      scope: "GROUP",
      scopeRef: "GROUP:ALPHA-RUNTIME-QUALIFICATION-001",
    });

    expect([
      genesis.proofFrom,
      composition.proofFrom,
      warden.proofFrom,
      reservation.proofFrom,
      execution.proofFrom,
      verification.proofFrom,
      seal.proofFrom,
      composite.proofFrom,
    ]).toEqual([
      "GENESIS",
      "SYNNERGYZE",
      "WARDEN",
      "RIVEROS",
      "SYNNERGYZE",
      "SYNNERGYZE",
      "RIVEROS",
      "RIVEROS",
    ]);

    expect(composition.proofId).toMatch(/^E-SYN-COMPOSE-[0-9A-F]{8}$/);
    expect(warden.proofId).toMatch(/^E-WAR-AUTH-[0-9A-F]{8}$/);
    expect(reservation.proofId).toMatch(/^E-RIV-RESERVE-[0-9A-F]{8}$/);
    expect(execution.proofId).toMatch(/^E-SYN-EXEC-[0-9A-F]{8}$/);
    expect(verification.proofId).toMatch(/^E-SYN-VERIFY-[0-9A-F]{8}$/);
    expect(seal.proofId).toMatch(/^E-RIV-SEAL-[0-9A-F]{8}$/);
    expect(composite.proofId).toMatch(/^G-RIV-RUNTIME-[0-9A-F]{8}$/);
  });

  it("binds native createdAt and supersession into proof identity", () => {
    const proof = createGenesisDeviceProofReferenceV1(base);
    const later = createGenesisDeviceProofReferenceV1({
      ...base,
      createdAt: "2026-09-12T05:00:01.000Z",
    });
    const superseding = createGenesisDeviceProofReferenceV1({
      ...base,
      supersedesProofId: proof.proofId,
    });

    expect(later.proofId).not.toBe(proof.proofId);
    expect(superseding.proofId).not.toBe(proof.proofId);
    expect(superseding.supersedesProofId).toBe(proof.proofId);
  });

  it("does not disclose raw estate identity inside the readable Proof ID", () => {
    const proof = createWardenAuthorizationProofReferenceV1({
      ...base,
      subjectRef: "WARDEN-DECISION:001",
    });

    expect(proof.scopeRef).toBe("GENESIS-ESTATE-001");
    expect(proof.proofId).not.toContain("GENESIS-ESTATE-001");
  });
});
