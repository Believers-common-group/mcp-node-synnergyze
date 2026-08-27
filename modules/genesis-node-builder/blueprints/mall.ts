import type { AcquisitionGateV1 } from "../contracts.ts";

export interface EvidenceRequirementDefinitionV1 {
  requirementClass: string;
  category: string;
  mandatoryForGate: AcquisitionGateV1;
  waivable: boolean;
  acceptableEvidenceClasses: readonly string[];
  reasonCode: string;
}

export const MALL_REQUIREMENT_DEFINITIONS_V1: readonly EvidenceRequirementDefinitionV1[] = [
  {
    requirementClass: "IDENTITY_EVIDENCE",
    category: "identity",
    mandatoryForGate: "G1",
    waivable: false,
    acceptableEvidenceClasses: ["PROPERTY_IDENTITY_RECORD"],
    reasonCode: "mall_identity_evidence_required",
  },
  {
    requirementClass: "JURISDICTION_EVIDENCE",
    category: "jurisdiction",
    mandatoryForGate: "G1",
    waivable: false,
    acceptableEvidenceClasses: ["JURISDICTION_RECORD"],
    reasonCode: "mall_jurisdiction_evidence_required",
  },
  {
    requirementClass: "REGISTRATION_EVIDENCE",
    category: "registration",
    mandatoryForGate: "G2",
    waivable: false,
    acceptableEvidenceClasses: ["REGISTERED_DOCUMENT"],
    reasonCode: "mall_registration_evidence_required",
  },
  {
    requirementClass: "TITLE_CHAIN_EVIDENCE",
    category: "title_chain",
    mandatoryForGate: "G3",
    waivable: false,
    acceptableEvidenceClasses: ["TITLE_CHAIN_DOCUMENT"],
    reasonCode: "mall_title_chain_evidence_required",
  },
  {
    requirementClass: "ENCUMBRANCE_EVIDENCE",
    category: "encumbrance",
    mandatoryForGate: "G3",
    waivable: true,
    acceptableEvidenceClasses: ["ENCUMBRANCE_RECORD"],
    reasonCode: "mall_encumbrance_evidence_required",
  },
  {
    requirementClass: "PARCEL_BOUNDARY_EVIDENCE",
    category: "land_boundary",
    mandatoryForGate: "G3",
    waivable: false,
    acceptableEvidenceClasses: ["AUTHORITATIVE_SURVEY"],
    reasonCode: "mall_authoritative_parcel_boundary_required",
  },
  {
    requirementClass: "MUNICIPAL_IDENTIFIER_EVIDENCE",
    category: "municipal",
    mandatoryForGate: "G2",
    waivable: true,
    acceptableEvidenceClasses: ["MUNICIPAL_PROPERTY_RECORD"],
    reasonCode: "mall_municipal_identifier_evidence_required",
  },
  {
    requirementClass: "BUILDING_APPROVAL_EVIDENCE",
    category: "building_approvals",
    mandatoryForGate: "G3",
    waivable: true,
    acceptableEvidenceClasses: ["SANCTIONED_BUILDING_PLAN"],
    reasonCode: "mall_building_approval_evidence_required",
  },
  {
    requirementClass: "AS_BUILT_GEOMETRY_EVIDENCE",
    category: "spatial_as_built",
    mandatoryForGate: "G3",
    waivable: true,
    acceptableEvidenceClasses: ["ENGINEERING_AS_BUILT"],
    reasonCode: "mall_as_built_geometry_evidence_required",
  },
  {
    requirementClass: "OCCUPANCY_COMPLETION_EVIDENCE",
    category: "statutory",
    mandatoryForGate: "G3",
    waivable: true,
    acceptableEvidenceClasses: ["OCCUPANCY_CERTIFICATE", "COMPLETION_CERTIFICATE"],
    reasonCode: "mall_occupancy_completion_evidence_required",
  },
  {
    requirementClass: "FIRE_STATUTORY_EVIDENCE",
    category: "statutory",
    mandatoryForGate: "G3",
    waivable: true,
    acceptableEvidenceClasses: ["FIRE_APPROVAL"],
    reasonCode: "mall_fire_statutory_evidence_required",
  },
  {
    requirementClass: "TENANCY_REGISTER_EVIDENCE",
    category: "tenancy_commercial",
    mandatoryForGate: "G2",
    waivable: true,
    acceptableEvidenceClasses: ["TENANT_REGISTER"],
    reasonCode: "mall_tenancy_register_evidence_required",
  },
  {
    requirementClass: "ENGINEERING_UTILITY_EVIDENCE",
    category: "engineering_utilities",
    mandatoryForGate: "G2",
    waivable: true,
    acceptableEvidenceClasses: ["ENGINEERING_UTILITY_REGISTER"],
    reasonCode: "mall_engineering_utility_evidence_required",
  },
];
