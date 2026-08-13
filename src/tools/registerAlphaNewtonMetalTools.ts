import type { CustomMcpServer } from "../CustomMcpServer.ts";

export const AlphaNewtonOperationIds = {
  listCapabilities: "alphaNewtonListCapabilities",
  planMetalWorkload: "alphaNewtonPlanMetalWorkload",
  routeExecutionTarget: "alphaNewtonRouteExecutionTarget",
  planDevOpsRun: "alphaNewtonPlanDevOpsRun",
  createAuthorityEnvelope: "alphaNewtonCreateAuthorityEnvelope",
} as const;

const METAL_CAPABILITIES = {
  compute: {
    frameworks: ["Metal compute passes", "Metal Performance Shaders"],
    useFor: ["parallel numerical kernels", "buffer/texture transforms", "GPU preprocessing"],
  },
  imageProcessing: {
    frameworks: ["Metal Performance Shaders"],
    useFor: ["filters", "histograms/statistics", "optimized image kernels"],
  },
  tensorGraph: {
    frameworks: ["Metal Performance Shaders Graph"],
    useFor: ["tensor graphs", "ML inference", "ML training", "FFT/convolution workflows"],
  },
  rayTracing: {
    frameworks: ["Metal ray tracing", "Metal compute passes"],
    useFor: ["intersection queries", "reflections", "ray-traced rendering"],
  },
  rendering: {
    frameworks: ["Metal rendering", "MetalFX"],
    useFor: ["render pipelines", "temporal/spatial upscaling", "GPU frame generation"],
  },
  resources: {
    frameworks: ["Metal resource management"],
    useFor: ["buffers", "textures", "heaps", "argument buffers", "resource synchronization"],
  },
} as const;

const GOVERNED_SEQUENCE = [
  "IDENTIFY",
  "RELATE",
  "AUTHORIZE",
  "PROVISION",
  "ACT",
  "OBSERVE",
  "EVIDENCE",
  "EFFECT",
  "SETTLE",
  "CLOSE_OR_SUPERSEDE",
] as const;

function makePendingAuthorityEnvelope(input: {
  digitalMeId: string;
  authorityRef: string;
  workspaceRef: string;
  intent: string;
  requestedTool?: string;
  evidenceRefs?: string[];
  expiresAt?: string;
}) {
  return {
    schema: "ALPHA-NEWTON-AUTHORITY-ENVELOPE-001",
    status: "PENDING_WARDEN_AUTHORIZATION",
    executionAllowed: false,
    principal: input.digitalMeId,
    authorityRef: input.authorityRef,
    workspaceRef: input.workspaceRef,
    intent: input.intent,
    requestedTool: input.requestedTool ?? null,
    evidenceRefs: input.evidenceRefs ?? [],
    expiresAt: input.expiresAt ?? null,
    invariants: [
      "ENTITY != AGENT != LLM != AUTHORITY",
      "recommendation != authorization",
      "no secrets in tool arguments or evidence payloads",
      "execution requires a Warden-issued capability envelope",
    ],
  };
}

function workloadFrameworks(workloadClass: string): string[] {
  switch (workloadClass) {
    case "compute":
      return [...METAL_CAPABILITIES.compute.frameworks];
    case "image-processing":
      return [...METAL_CAPABILITIES.imageProcessing.frameworks];
    case "tensor-graph":
    case "ml-inference":
    case "ml-training":
      return [...METAL_CAPABILITIES.tensorGraph.frameworks];
    case "ray-tracing":
      return [...METAL_CAPABILITIES.rayTracing.frameworks];
    case "render":
      return [...METAL_CAPABILITIES.rendering.frameworks];
    case "resource-management":
      return [...METAL_CAPABILITIES.resources.frameworks];
    default:
      return [];
  }
}

export function registerAlphaNewtonMetalTools(server: CustomMcpServer) {
  server.tool({
    name: AlphaNewtonOperationIds.listCapabilities,
    description:
      "List the Alpha Node Newton agentic-builder tool surface for Apple Metal/MPS acceleration and governed DevOps planning.",
    annotations: { readOnlyHint: true },
    inputSchema: undefined,
    cb: async () =>
      JSON.stringify({
        toolPack: "ALPHA-NEWTON-METAL-TOOLS-001",
        role: "governed planning and capability surface; not an execution authority",
        capabilities: METAL_CAPABILITIES,
        executionBoundary: {
          appleMetalRuntime: "requires an Apple platform/runner with Metal support",
          nonAppleControlPlane:
            "may plan, generate manifests, review evidence, and orchestrate remote Apple runners but cannot execute Metal locally",
        },
      }),
  });

  server.tool({
    name: AlphaNewtonOperationIds.planMetalWorkload,
    description:
      "Plan a Metal/MPS workload and return framework choices, build stages, evidence requirements, and acceptance checks without executing code.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        workloadClass: {
          type: "string",
          enum: [
            "compute",
            "image-processing",
            "tensor-graph",
            "ml-inference",
            "ml-training",
            "ray-tracing",
            "render",
            "resource-management",
          ],
        },
        objective: { type: "string", minLength: 1 },
        targetPlatform: {
          type: "string",
          enum: ["macOS", "iOS", "iPadOS", "visionOS", "unspecified-apple"],
        },
        targetDevice: { type: "string" },
        latencyTargetMs: { type: "number", minimum: 0 },
        memoryBudgetMb: { type: "number", minimum: 1 },
        notes: { type: "string" },
      },
      required: ["workloadClass", "objective", "targetPlatform"],
    },
    cb: async (args) => {
      const input = args as {
        workloadClass: string;
        objective: string;
        targetPlatform: string;
        targetDevice?: string;
        latencyTargetMs?: number;
        memoryBudgetMb?: number;
        notes?: string;
      };
      const frameworks = workloadFrameworks(input.workloadClass);

      return JSON.stringify({
        schema: "ALPHA-NEWTON-METAL-PLAN-001",
        objective: input.objective,
        workloadClass: input.workloadClass,
        target: {
          platform: input.targetPlatform,
          device: input.targetDevice ?? "resolve-at-build-time",
        },
        frameworkCandidates: frameworks,
        pipeline: [
          "resolve Apple runner and SDK/Xcode compatibility",
          "define buffers/textures/tensors and data ownership",
          "select framework primitive before writing custom shader code",
          "compile/build with warnings treated as evidence",
          "run deterministic synthetic fixture",
          "capture CPU/GPU timing, memory, and correctness evidence",
          "compare against acceptance thresholds",
          "publish immutable build/evidence references",
        ],
        constraints: {
          latencyTargetMs: input.latencyTargetMs ?? null,
          memoryBudgetMb: input.memoryBudgetMb ?? null,
          notes: input.notes ?? null,
        },
        acceptanceChecks: [
          "build succeeds on the declared Apple target",
          "same fixture produces expected numerical or pixel output",
          "no unauthorized fallback path changes semantics",
          "resource lifetime and synchronization are explicit",
          "performance measurements include device, OS, SDK, and build identity",
        ],
        executionAllowed: false,
        nextGate: "WARDEN_AUTHORIZATION_FOR_BUILD_OR_RUN",
      });
    },
  });

  server.tool({
    name: AlphaNewtonOperationIds.routeExecutionTarget,
    description:
      "Route a requested workload between the Alpha control plane and an Apple execution runner. This is a routing decision only; it does not start a runner.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        workloadClass: { type: "string", minLength: 1 },
        requiresMetal: { type: "boolean" },
        localHostClass: {
          type: "string",
          enum: ["apple-silicon", "intel-mac", "linux", "windows", "unknown"],
        },
        preferredRunnerRef: { type: "string" },
      },
      required: ["workloadClass", "requiresMetal", "localHostClass"],
    },
    cb: async (args) => {
      const input = args as {
        workloadClass: string;
        requiresMetal: boolean;
        localHostClass: string;
        preferredRunnerRef?: string;
      };
      const localCanRunMetal =
        input.localHostClass === "apple-silicon" || input.localHostClass === "intel-mac";
      const needsRemoteAppleRunner = input.requiresMetal && !localCanRunMetal;

      return JSON.stringify({
        schema: "ALPHA-NEWTON-EXECUTION-ROUTE-001",
        workloadClass: input.workloadClass,
        route: needsRemoteAppleRunner
          ? "CONTROL_PLANE_TO_REMOTE_APPLE_RUNNER"
          : "LOCAL_OR_DECLARED_RUNNER",
        preferredRunnerRef: input.preferredRunnerRef ?? null,
        localMetalCapable: localCanRunMetal,
        requiresRemoteAppleRunner: needsRemoteAppleRunner,
        executionAllowed: false,
        nextGate: "RESOLVE_RUNNER_IDENTITY_AND_WARDEN_CAPABILITY",
      });
    },
  });

  server.tool({
    name: AlphaNewtonOperationIds.planDevOpsRun,
    description:
      "Create a governed DevOps run plan for an agentic builder, including authority, test, evidence, release and rollback gates. No repository or deployment changes are performed.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        repository: { type: "string", minLength: 1 },
        ref: { type: "string", minLength: 1 },
        goal: { type: "string", minLength: 1 },
        targetEnvironment: {
          type: "string",
          enum: ["local", "dev", "test", "staging", "production"],
        },
        changeClass: {
          type: "string",
          enum: ["docs", "code", "schema", "infra", "security", "release"],
        },
        requestedTools: { type: "array", items: { type: "string" } },
        digitalMeId: { type: "string", minLength: 1 },
        authorityRef: { type: "string", minLength: 1 },
        workspaceRef: { type: "string", minLength: 1 },
      },
      required: [
        "repository",
        "ref",
        "goal",
        "targetEnvironment",
        "changeClass",
        "digitalMeId",
        "authorityRef",
        "workspaceRef",
      ],
    },
    cb: async (args) => {
      const input = args as {
        repository: string;
        ref: string;
        goal: string;
        targetEnvironment: string;
        changeClass: string;
        requestedTools?: string[];
        digitalMeId: string;
        authorityRef: string;
        workspaceRef: string;
      };

      const production = input.targetEnvironment === "production";
      return JSON.stringify({
        schema: "ALPHA-NEWTON-DEVOPS-RUN-001",
        repository: input.repository,
        ref: input.ref,
        goal: input.goal,
        targetEnvironment: input.targetEnvironment,
        changeClass: input.changeClass,
        requestedTools: input.requestedTools ?? [],
        governedSequence: GOVERNED_SEQUENCE,
        authorityEnvelope: makePendingAuthorityEnvelope({
          digitalMeId: input.digitalMeId,
          authorityRef: input.authorityRef,
          workspaceRef: input.workspaceRef,
          intent: input.goal,
        }),
        stages: [
          { id: "preflight", checks: ["repo/ref resolves", "working tree or change set identified"] },
          { id: "authority", checks: ["principal resolved", "capability scope covers requested tools"] },
          { id: "build", checks: ["dependencies pinned", "build reproducible"] },
          { id: "test", checks: ["unit/static tests", "smallest synthetic workflow"] },
          { id: "evidence", checks: ["logs/artifacts hashed", "test and build identity recorded"] },
          {
            id: "release",
            checks: production
              ? ["explicit production authorization", "rollback target captured", "post-release verification"]
              : ["environment-scoped authorization", "post-run verification"],
          },
          { id: "close", checks: ["effect recorded", "exceptions resolved or carried forward"] },
        ],
        executionAllowed: false,
        nextGate: "WARDEN_AUTHORIZATION_FOR_CHANGESET",
      });
    },
  });

  server.tool({
    name: AlphaNewtonOperationIds.createAuthorityEnvelope,
    description:
      "Create a non-executing authority request envelope for a Newton/Alpha tool invocation. The envelope remains pending until Warden issues the actual capability.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        digitalMeId: { type: "string", minLength: 1 },
        authorityRef: { type: "string", minLength: 1 },
        workspaceRef: { type: "string", minLength: 1 },
        intent: { type: "string", minLength: 1 },
        requestedTool: { type: "string", minLength: 1 },
        evidenceRefs: { type: "array", items: { type: "string" } },
        expiresAt: { type: "string" },
      },
      required: ["digitalMeId", "authorityRef", "workspaceRef", "intent", "requestedTool"],
    },
    cb: async (args) =>
      JSON.stringify(
        makePendingAuthorityEnvelope(
          args as {
            digitalMeId: string;
            authorityRef: string;
            workspaceRef: string;
            intent: string;
            requestedTool: string;
            evidenceRefs?: string[];
            expiresAt?: string;
          },
        ),
      ),
  });
}
