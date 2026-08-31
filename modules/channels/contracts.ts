import type {
  PublicationDeliveryStateV1,
  PublicationReceiptV1 as RiverPublicationReceiptV1,
} from "../river/contracts.ts";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type ChannelClassification =
  | "PUBLIC"
  | "CUSTOMER"
  | "PARTNER"
  | "WORKFORCE"
  | "MANAGEMENT"
  | "GOVERNED_INTERNAL"
  | "CONFIDENTIAL"
  | "RESTRICTED";

export type HeaderBoardStatus =
  | "DRAFT"
  | "PREPARED"
  | "PENDING_ADMISSION"
  | "ADMITTED"
  | "ESCALATED"
  | "DENIED"
  | "PUBLISHED"
  | "OBSERVED"
  | "ACKNOWLEDGED"
  | "ACTED_ON"
  | "SUPERSEDED"
  | "WITHDRAWN"
  | "EXPIRED"
  | "ARCHIVED";

export type HeaderBoardActionCapability =
  | "ACKNOWLEDGE"
  | "COMMENT"
  | "SUBSCRIBE"
  | "REQUEST_ACCESS"
  | "PROPOSE_CHANGE"
  | "OPEN_API"
  | "FORK"
  | "ACCEPT"
  | "REJECT"
  | "REQUEST_REVIEW"
  | "EXECUTE_BOUNDED_ACTION";

export interface ChannelV1 {
  channelRef: string;
  ownerContextRef: string;
  subjectScopeRef: string;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  allowedClassifications: readonly ChannelClassification[];
  routeRefs: readonly string[];
  version: number;
  createdAt: string;
}

export interface ClassifiedProjectionFieldV1 {
  value: JsonValue;
  classification: ChannelClassification;
}

export interface HeaderBoardDraftV1 {
  headerBoardRef: string;
  channelRef: string;
  publicationType:
    | "ARTICLE"
    | "BULLETIN"
    | "ALERT"
    | "STATUS"
    | "PROPOSAL"
    | "REQUEST"
    | "TECHNICAL_NOTICE";
  subjectRef: string;
  sourceEventRefs: readonly string[];
  publisherPrincipalRef: string;
  publisherCapacityRef: string;
  audiencePolicyRef: string;
  classification: ChannelClassification;
  effectiveFrom: string;
  effectiveUntil?: string;
  actionCapabilities: readonly HeaderBoardActionCapability[];
  fields: Readonly<Record<string, ClassifiedProjectionFieldV1>>;
  supersedesRef?: string;
  correlationId: string;
}

export interface HeaderBoardV1 {
  headerBoardRef: string;
  channelRef: string;
  publicationType: HeaderBoardDraftV1["publicationType"];
  subjectRef: string;
  sourceEventRefs: readonly string[];
  publisherPrincipalRef: string;
  publisherCapacityRef: string;
  audiencePolicyRef: string;
  classification: ChannelClassification;
  effectiveFrom: string;
  effectiveUntil?: string;
  status: HeaderBoardStatus;
  actionCapabilities: readonly HeaderBoardActionCapability[];
  payload: Readonly<Record<string, JsonValue>>;
  fieldClassifications: Readonly<Record<string, ChannelClassification>>;
  supersedesRef?: string;
  correlationId: string;
}

export interface PublicationAdmissionRequestV1 {
  requestRef: string;
  headerBoardRef: string;
  channelRef: string;
  publisherPrincipalRef: string;
  representedPrincipalRef: string;
  publisherCapacityRef: string;
  contextRef: string;
  programRef: string;
  sourceEventRefs: readonly string[];
  classification: ChannelClassification;
  routeRefs: readonly string[];
  actionCapabilities: readonly HeaderBoardActionCapability[];
  authorityRefs: readonly string[];
  policyRefs: readonly string[];
  representationSourceRefs: readonly string[];
  evidenceReadinessRef: string;
  requestedAt: string;
  correlationId: string;
}

export type PublicationDeliveryState = PublicationDeliveryStateV1;
export type PublicationReceiptV1 = RiverPublicationReceiptV1;

export interface ServiceRouteV1 {
  routeRef: string;
  channelRef: string;
  serviceRef: string;
  transport:
    | "IN_MEMORY"
    | "WEB"
    | "APP"
    | "EMAIL"
    | "SMS"
    | "WHATSAPP"
    | "SLACK"
    | "MARKETPLACE_API"
    | "MCP"
    | "PRIVATE_SERVICE";
  endpoint: string;
  status: "ACTIVE" | "INACTIVE";
  allowedClassifications: readonly ChannelClassification[];
}

export interface ServiceDescriptorV1 {
  serviceRef: string;
  handle: string;
  transport: ServiceRouteV1["transport"];
  endpoint: string;
  capabilityRefs: readonly string[];
  publicKeyFingerprint: string;
  signerRef: string;
  validFrom: string;
  validUntil: string;
  version: number;
  signature: string;
}

export interface ChannelDeliveryEnvelopeV1 {
  deliveryRef: string;
  headerBoardRef: string;
  channelRef: string;
  routeRef: string;
  subjectRef: string;
  classification: ChannelClassification;
  publicationType: HeaderBoardV1["publicationType"];
  effectiveFrom: string;
  effectiveUntil?: string;
  actionCapabilities: readonly HeaderBoardActionCapability[];
  payload: Readonly<Record<string, JsonValue>>;
  correlationId: string;
}
