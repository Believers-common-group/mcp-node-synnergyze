import type {
  AmazonOrdersGovernedRuntimeV1,
  AmazonOrdersSyncResultV1,
} from "./governed-orders-runtime.ts";
import { resolveAmazonBnrServiceBindingV1 } from "./bnr-node-001.ts";

type AmazonOrdersSyncInputV1 = Parameters<AmazonOrdersGovernedRuntimeV1["sync"]>[0];

export interface AmazonOrdersRuntimeDelegateV1 {
  sync(input: AmazonOrdersSyncInputV1): Promise<AmazonOrdersSyncResultV1>;
}

export type AmazonBnrOrdersSyncResultV1 = AmazonOrdersSyncResultV1 & {
  bnrNodeRef: "BNR-001";
  serviceRef: "AMAZON-SPAPI-ORDERS";
};

export class AmazonBnrOrdersRuntimeV1 {
  private readonly delegate: AmazonOrdersRuntimeDelegateV1;

  constructor(delegate: AmazonOrdersRuntimeDelegateV1) {
    this.delegate = delegate;
  }

  async sync(input: AmazonOrdersSyncInputV1): Promise<AmazonBnrOrdersSyncResultV1> {
    const binding = resolveAmazonBnrServiceBindingV1("AMAZON-SPAPI-ORDERS");
    if (
      input.action.action !== binding.capabilityRef ||
      input.action.capabilityRef !== binding.capabilityRef
    ) {
      throw new Error("amazon_bnr_orders_capability_required");
    }

    const result = await this.delegate.sync(input);
    return {
      ...result,
      bnrNodeRef: "BNR-001",
      serviceRef: "AMAZON-SPAPI-ORDERS",
    };
  }
}
