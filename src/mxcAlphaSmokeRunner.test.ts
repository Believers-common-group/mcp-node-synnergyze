import { describe, expect, it, vi } from "vitest";
import type { PlatformSupport } from "@microsoft/mxc-sdk";
import {
  assertAlphaProcessContainerReady,
  MxcAlphaSmokeRunnerError,
} from "./mxcAlphaSmokeRunner.js";

function support(overrides: Partial<PlatformSupport> = {}): PlatformSupport {
  return {
    isSupported: true,
    reason: "",
    availableMethods: ["processcontainer"],
    ...overrides,
  };
}

describe("Alpha MXC physical smoke readiness gate", () => {
  it("requires explicit operator opt-in before probing or executing anything", () => {
    const getPlatformSupport = vi.fn(() => support());

    expect(() =>
      assertAlphaProcessContainerReady(
        { optIn: false },
        { platform: "win32", getPlatformSupport },
      ),
    ).toThrowError(
      expect.objectContaining({ code: "OPT_IN_REQUIRED" }) as MxcAlphaSmokeRunnerError,
    );
    expect(getPlatformSupport).not.toHaveBeenCalled();
  });

  it("rejects non-Windows hosts even when opt-in is present", () => {
    const getPlatformSupport = vi.fn(() => support());

    expect(() =>
      assertAlphaProcessContainerReady(
        { optIn: true },
        { platform: "linux", getPlatformSupport },
      ),
    ).toThrowError(
      expect.objectContaining({ code: "WINDOWS_HOST_REQUIRED" }) as MxcAlphaSmokeRunnerError,
    );
    expect(getPlatformSupport).not.toHaveBeenCalled();
  });

  it("rejects hosts where MXC reports the platform unsupported", () => {
    const getPlatformSupport = vi.fn(() =>
      support({ isSupported: false, reason: "MXC unavailable", availableMethods: [] }),
    );

    expect(() =>
      assertAlphaProcessContainerReady(
        { optIn: true },
        { platform: "win32", getPlatformSupport },
      ),
    ).toThrowError(
      expect.objectContaining({ code: "MXC_UNSUPPORTED" }) as MxcAlphaSmokeRunnerError,
    );
  });

  it("rejects Windows hosts without ProcessContainer availability", () => {
    const getPlatformSupport = vi.fn(() =>
      support({ availableMethods: ["windows_sandbox"] }),
    );

    expect(() =>
      assertAlphaProcessContainerReady(
        { optIn: true },
        { platform: "win32", getPlatformSupport },
      ),
    ).toThrowError(
      expect.objectContaining({ code: "PROCESSCONTAINER_UNAVAILABLE" }) as MxcAlphaSmokeRunnerError,
    );
  });

  it("returns an evidence-safe capability snapshot when the Alpha gate is satisfied", () => {
    const getPlatformSupport = vi.fn(() =>
      support({
        availableMethods: ["processcontainer", "windows_sandbox"],
        isolationTier: "appcontainer-bfs",
      }),
    );

    expect(
      assertAlphaProcessContainerReady(
        { optIn: true },
        { platform: "win32", getPlatformSupport },
      ),
    ).toEqual({
      platform: "win32",
      provider: "MXC",
      backend: "processcontainer",
      isolationTier: "appcontainer-bfs",
    });
  });
});
