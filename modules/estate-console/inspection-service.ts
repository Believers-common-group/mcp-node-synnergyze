import type { EstateProbeHealthV1, EstateProbeResultV1 } from "./contracts.ts";

export type EstateProbeNameV1 = "estate" | "genesis" | "warden" | "river" | "runtime";

export type EstateProbeV1 = () => EstateProbeResultV1;

export type EstateProbeRegistryV1 = Readonly<Record<EstateProbeNameV1, EstateProbeV1>>;

const PROBE_ORDER: readonly EstateProbeNameV1[] = [
  "estate",
  "genesis",
  "river",
  "runtime",
  "warden",
];

function unavailable(resourceRef: EstateProbeNameV1): EstateProbeResultV1 {
  return {
    probeRef: `PROBE:${resourceRef.toUpperCase()}:UNAVAILABLE`,
    resourceRef,
    health: "UNAVAILABLE",
    observedAt: new Date(0).toISOString(),
    data: {},
    sourceRefs: [],
  };
}

export class EstateConsoleInspectionServiceV1 {
  constructor(private readonly probes: EstateProbeRegistryV1) {}

  status(): readonly EstateProbeResultV1[] {
    return PROBE_ORDER.map((name) => this.runProbe(name));
  }

  health(): EstateProbeHealthV1 {
    const states = this.status().map(({ health }) => health);
    if (states.includes("UNAVAILABLE")) return "UNAVAILABLE";
    if (states.includes("DEGRADED")) return "DEGRADED";
    return "HEALTHY";
  }

  inspect(resourceRef: string): EstateProbeResultV1 {
    if (!PROBE_ORDER.includes(resourceRef as EstateProbeNameV1)) {
      throw new Error("estate_console_resource_not_exposed");
    }
    return this.runProbe(resourceRef as EstateProbeNameV1);
  }

  private runProbe(name: EstateProbeNameV1): EstateProbeResultV1 {
    try {
      const result = this.probes[name]();
      return {
        ...result,
        data: { ...result.data },
        sourceRefs: [...result.sourceRefs],
      };
    } catch {
      return unavailable(name);
    }
  }
}
