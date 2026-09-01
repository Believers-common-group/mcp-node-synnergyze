export interface CongressBillDetailResponse {
  bill?: {
    congress?: number;
    type?: string;
    number?: string;
    title?: string;
    introducedDate?: string;
    updateDate?: string;
    originChamber?: string;
    sponsors?: Array<{
      fullName?: string;
      bioguideId?: string;
    }>;
  };
}

export interface CongressActionsResponse {
  actions?: Array<{
    actionDate?: string;
    text?: string;
    type?: string;
  }>;
}

export interface CongressSubjectsResponse {
  subjects?: {
    legislativeSubjects?: Array<{ name?: string }>;
    policyArea?: { name?: string };
  };
}

export interface CongressCommitteesResponse {
  committees?: Array<{
    name?: string;
    systemCode?: string;
  }>;
}

export interface CongressSummariesResponse {
  summaries?: Array<{
    actionDate?: string;
    actionDesc?: string;
    text?: string;
  }>;
}

export interface CongressLawState {
  lawNumber?: string;
  effectiveDate?: string;
  enforced?: boolean;
}

export interface CanonicalCongressBillBundle {
  sourceRef: string;
  jurisdiction: "US-FEDERAL";
  objectType: "bill";
  objectId: string;
  title?: string;
  introducedDate?: string;
  sourceUpdatedAt?: string;
  originChamber?: string;
  actions: Array<{ actionDate?: string; text: string }>;
  subjects: string[];
  committees: string[];
  actors: string[];
  summary?: string;
  lawState?: CongressLawState;
  evidenceRefs: string[];
  completeness: {
    bill: boolean;
    actions: boolean;
    amendments: boolean;
    committees: boolean;
    subjects: boolean;
    summaries: boolean;
    law: boolean;
  };
}
