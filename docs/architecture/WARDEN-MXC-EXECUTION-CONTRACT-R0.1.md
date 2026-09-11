# WARDEN-MXC-EXECUTION-CONTRACT-R0.1

Status: **DRAFT / FAIL-CLOSED / NON-PRODUCTION**

## Purpose

Define the boundary between Synnergyze workflow intent, Genesis canonical context, Warden authority, Microsoft MXC containment enforcement, and River evidence.

## Architectural invariant

> No valid Warden decision = no MXC execution.

MXC is an execution-enforcement provider. It MUST NOT become an identity registry, workflow authority, authorization authority, or evidence authority.

## Authority chain

```text
DigitalMe
  -> Genesis (canonical principal/device/estate/workspace context)
  -> Synnergyze (intent and orchestration)
  -> Warden (authoritative allow/deny decision)
  -> River reservation
  -> Execution Contract Compiler
  -> MXC SandboxPolicy
  -> MXC containment backend
  -> physical effect
  -> River observation/receipt
  -> effect verification/reconciliation
```

## R0.1 scope

- MXC policy schema pinned to `0.8.0-alpha`.
- One-shot execution only.
- Abstract containment intent `process`; record the resolved backend separately.
- Default-deny network posture.
- Explicit bounded filesystem grants.
- Workload digest binding.
- River reservation before spawn and receipt after completion/failure.
- No native/unsandboxed fallback if MXC is unavailable.
- No automatic permission learning from observed denials.

State-aware persistent sandbox APIs are outside R0.1 and require a separate R0.2 qualification gate.

## Canonical execution contract

```ts
export interface WardenExecutionContractR01 {
  contractVersion: "WARDEN-MXC-R0.1";
  executionId: string;

  authority: {
    wardenDecisionId: string;
    decisionHash: string;
    decision: "ALLOW";
    issuedAt: string;
    effectiveFrom: string;
    expiresAt: string;
  };

  principal: {
    principalId: string;
    digitalMeId?: string;
  };

  genesisContext: {
    nodeId: string;
    deviceId: string;
    estateId?: string;
    workspaceId: string;
    locationId?: string;
  };

  workload: {
    workloadId: string;
    artifactDigest: string;
    commandDigest: string;
    purpose: string;
  };

  permissions: {
    filesystemRead: string[];
    filesystemWrite: string[];
    networkEgress: NetworkGrant[];
    networkIngress: NetworkGrant[];
    hostLoopback: boolean;
    ui: "deny" | "restricted";
    timeoutMs: number;
  };

  runtime: {
    provider: "MXC";
    mxcSchema: "0.8.0-alpha";
    containment: "process";
  };

  evidence: {
    riverReservationId: string;
    receiptRequired: true;
    captureStdout: boolean;
    captureStderr: boolean;
  };
}

export interface NetworkGrant {
  cidr: string;
  protocol: "tcp" | "udp";
  port: number;
}
```

## Compiler rules

The compiler is a monotonic permission reducer:

```text
MXC_effective_permissions subset-of Warden_authorised_permissions
```

It MUST NOT infer authority from an MXC policy and MUST NOT enlarge a Warden grant because a host helper, discovered tool, environment variable, or runtime capability is available.

Before policy compilation/spawn it MUST verify:

1. Warden decision exists and is `ALLOW`.
2. Decision integrity/signature/hash is valid.
3. Decision is effective and unexpired at the immediate pre-spawn check.
4. Principal matches the decision.
5. Genesis node/device/workspace context matches the decision.
6. Workload/artifact/command digests match the authorized workload.
7. Requested filesystem, network, UI, and timeout permissions do not exceed the decision.
8. River reservation exists and matches the execution ID/decision.
9. MXC provider and requested schema/backend capability are available.

Any failure MUST terminate before workload spawn.

## Network floor

R0.1 defaults to explicit deny even where MXC schema defaults would independently deny:

```text
egress.default = deny
ingress.default = deny
hostLoopback = deny
```

Specific access MUST be represented as narrow protocol/port/destination grants.

## Filesystem floor

Filesystem access MUST be explicit. Discovery of a host path or installed tool is evidence of availability only; it is not authorization. Broad host-root grants require a separately justified Warden decision.

## Workload binding

The Warden decision MUST bind the exact executable/artifact, command/arguments, relevant environment contract, and input manifest through cryptographic digests. A post-authorization mutation requires a new decision.

## Evidence lifecycle

```text
intent
 -> Warden decision
 -> River reservation
 -> authority/context revalidation
 -> MXC policy compilation
 -> MXC spawn
 -> observation
 -> completion/failure
 -> effect verification
 -> River receipt
 -> reconciliation/exception journal as required
```

Execution MUST NOT proceed on the assumption that evidence can be reconstructed after the fact.

## No fallback invariant

This is forbidden:

```text
MXC failure -> native shell/child_process execution
```

Required behavior:

```text
MXC unavailable/unsupported/failed
 -> EXECUTION_UNAVAILABLE
 -> River exception evidence
 -> no workload spawn
```

## Denial learning

Sandbox denials MAY be captured as River observations for policy engineering. They MUST NOT automatically modify permissions. Any broadened permission requires a new policy/authority decision.

## Minimum R0.1 acceptance gate

- MXC-W-001 no Warden decision -> deny before spawn
- MXC-W-002 Warden DENY -> deny
- MXC-W-003 expired decision -> deny
- MXC-W-004 unknown decision -> deny
- MXC-W-005 invalid decision integrity -> deny
- MXC-W-006 principal mismatch -> deny
- MXC-W-007 Genesis device mismatch -> deny
- MXC-W-008 workspace mismatch -> deny
- MXC-W-009 workload digest mutation -> deny
- MXC-W-010 filesystem request exceeds grant -> deny
- MXC-W-011 network request exceeds grant -> deny
- MXC-W-012 timeout exceeds grant -> deny
- MXC-W-013 missing/mismatched River reservation -> deny
- MXC-W-014 MXC unavailable -> deny; never native fallback
- MXC-W-015 policy compilation failure -> deny
- MXC-W-016 unsupported backend/schema -> deny
- MXC-W-017 unauthorized file read -> MXC/OS blocks
- MXC-W-018 unauthorized file write -> MXC/OS blocks
- MXC-W-019 unauthorized network egress -> MXC blocks
- MXC-W-020 host loopback attempt -> MXC blocks
- MXC-W-021 authorized bounded resource access -> pass
- MXC-W-022 success -> River success receipt
- MXC-W-023 workload failure -> River failure receipt
- MXC-W-024 MXC/runtime crash -> exception journal; never assume success
- MXC-W-025 duplicate execution ID -> idempotent reject/reconcile
- MXC-W-026 queued decision expires before spawn -> deny on revalidation
- MXC-W-027 compiler permission broadening -> reject
- MXC-W-028 resolved backend recorded and checked against allowed runtime contract

## Promotion rule

MXC MUST remain `CANDIDATE_EXECUTION_PROVIDER` until all authority-boundary tests (MXC-W-001 through MXC-W-016) pass. It MUST remain non-production until the containment/evidence tests through MXC-W-028 pass and a separate Warden-fit review approves promotion.
