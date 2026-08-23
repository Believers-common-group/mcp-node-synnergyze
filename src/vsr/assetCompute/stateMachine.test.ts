import { describe, expect, it } from "vitest";
import { assertTransition } from "./stateMachine.ts";

describe("assertTransition", () => {
  it("allows AUTHORIZED -> FUNDS_RESERVED", () => {
    expect(() => assertTransition("AUTHORIZED", "FUNDS_RESERVED")).not.toThrow();
  });

  it("rejects REQUESTED -> DISPATCHED", () => {
    expect(() => assertTransition("REQUESTED", "DISPATCHED")).toThrowError(
      "INVALID_EXECUTION_TRANSITION",
    );
  });

  it("rejects AUTHORIZED -> EFFECT_VERIFIED", () => {
    expect(() => assertTransition("AUTHORIZED", "EFFECT_VERIFIED")).toThrowError(
      "INVALID_EXECUTION_TRANSITION",
    );
  });

  it("rejects DISPATCHED -> SETTLED", () => {
    expect(() => assertTransition("DISPATCHED", "SETTLED")).toThrowError(
      "INVALID_EXECUTION_TRANSITION",
    );
  });
});
