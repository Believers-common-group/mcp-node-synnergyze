export type EstateCapabilityV1 = "DISCOVER" | "OBSERVE" | "INSPECT" | "SUBMIT";

export type EstateActionClassV1 = "READ" | "PROPOSE";

export type EstateEnvironmentV1 = "STAGING";

export type EstateDeviceStateV1 = "ACTIVE" | "REVOKED";

export type EstateSessionStateV1 = "ACTIVE" | "CLOSED" | "EXPIRED" | "REVOKED";

export interface EstateConsoleDeviceV1 {
  readonly deviceRef: string;
  readonly consoleRef: string;
  readonly estateRef: string;
  readonly nodeRef: string;
  readonly deviceClass: "TABLET" | "DESKTOP" | "MOBILE" | "WEB" | "MACHINE" | "AGENT";
  readonly platform: string;
  readonly state: EstateDeviceStateV1;
  readonly sourceRefs: readonly string[];
}

export interface EstateConsoleProfileV1 {
  readonly profileRef: string;
  readonly environment: EstateEnvironmentV1;
  readonly capabilities: readonly EstateCapabilityV1[];
  readonly sourceRefs: readonly string[];
}

export interface EstateConsoleSessionV1 {
  readonly sessionRef: string;
  readonly principalRef: string;
  readonly deviceRef: string;
  readonly consoleRef: string;
  readonly estateRef: string;
  readonly nodeRef: string;
  readonly profileRef: string;
  readonly environment: EstateEnvironmentV1;
  readonly capabilities: readonly EstateCapabilityV1[];
  readonly state: EstateSessionStateV1;
  readonly admittedAt: string;
  readonly validUntil: string;
  readonly closedAt?: string;
  readonly sourceRefs: readonly string[];
  readonly correlationId: string;
}

export interface EstateConsoleAdmissionRequestV1 {
  readonly transportCredentialRef: string;
  readonly principalRef: string;
  readonly deviceRef: string;
  readonly consoleRef: string;
  readonly nodeRef: string;
  readonly requestedProfileRef: string;
  readonly requestedAt: string;
  readonly correlationId: string;
}

export type EstateConsoleAdmissionResultV1 =
  | {
      readonly state: "ISSUED";
      readonly session: EstateConsoleSessionV1;
    }
  | {
      readonly state: "ENROLLMENT_REQUIRED" | "DENIED";
      readonly reasonCode: string;
      readonly correlationId: string;
    };

export type EstateCommandV1 =
  | { readonly verb: "WHOAMI"; readonly actionClass: "READ" }
  | { readonly verb: "STATUS"; readonly actionClass: "READ" }
  | { readonly verb: "HEALTH"; readonly actionClass: "READ" }
  | { readonly verb: "INSPECT"; readonly actionClass: "READ"; readonly resourceRef: string }
  | { readonly verb: "SUBMIT"; readonly actionClass: "PROPOSE"; readonly artifactPath: string }
  | { readonly verb: "RECEIPTS"; readonly actionClass: "READ" }
  | { readonly verb: "RECEIPT"; readonly actionClass: "READ"; readonly receiptRef: string }
  | { readonly verb: "EXIT"; readonly actionClass: "READ" };

export interface EstateCommandResultV1<T = unknown> {
  readonly ok: boolean;
  readonly code: string;
  readonly data?: T;
  readonly receiptRef?: string;
}

export type EstateArtifactStateV1 =
  | "INERT"
  | "REGISTERED"
  | "SUBMITTED"
  | "AUTHORIZED_PROPOSAL"
  | "DENIED"
  | "HELD_FOR_REVIEW"
  | "REJECTED";

export interface EstateArtifactV1 {
  readonly artifactRef: string;
  readonly sessionRef: string;
  readonly principalRef: string;
  readonly deviceRef: string;
  readonly consoleRef: string;
  readonly filename: string;
  readonly mediaType: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly state: EstateArtifactStateV1;
  readonly sourceRefs: readonly string[];
  readonly correlationId: string;
}

export type EstateReceiptStateV1 =
  | "RESERVED"
  | "RECORDED"
  | "AUTHORIZED"
  | "DENIED"
  | "REJECTED"
  | "HELD_FOR_REVIEW";

export interface EstateReceiptProjectionV1 {
  readonly receiptRef: string;
  readonly sessionRef: string;
  readonly correlationId: string;
  readonly actionClass: EstateActionClassV1;
  readonly state: EstateReceiptStateV1;
  readonly recordedAt: string;
  readonly wardenDecisionRef?: string;
  readonly reasonCodes: readonly string[];
}

export type EstateProbeHealthV1 = "HEALTHY" | "DEGRADED" | "UNAVAILABLE";

export interface EstateProbeResultV1 {
  readonly probeRef: string;
  readonly resourceRef: string;
  readonly health: EstateProbeHealthV1;
  readonly observedAt: string;
  readonly data: Readonly<Record<string, unknown>>;
  readonly sourceRefs: readonly string[];
}
