import type {
  LegislativeObjectRefV1,
  RelatedSourceBundleV1,
  SourceEnvelopeV1,
  SourceHealthV1,
} from "../contracts.ts";

export interface LegislativeSourceAdapterV1 {
  getObject(ref: LegislativeObjectRefV1): Promise<SourceEnvelopeV1>;
  getActions(ref: LegislativeObjectRefV1): Promise<readonly SourceEnvelopeV1[]>;
  getRelated(ref: LegislativeObjectRefV1): Promise<RelatedSourceBundleV1>;
  health(): Promise<SourceHealthV1>;
}
