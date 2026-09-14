import type { EstateReceiptProjectionV1 } from "./contracts.ts";
import type {
  RiverConsoleReceiptReservationRequestV1,
  RiverConsoleReceiptTransitionV1,
  RiverConsoleReceiptWardenTransitionV1,
} from "../river/console-receipt-service.ts";

export interface ConsoleReceiptPortV1 {
  reserve(input: RiverConsoleReceiptReservationRequestV1): EstateReceiptProjectionV1;
  recordRead(input: RiverConsoleReceiptTransitionV1): EstateReceiptProjectionV1;
  recordAuthorizedProposal(
    input: RiverConsoleReceiptWardenTransitionV1,
  ): EstateReceiptProjectionV1;
  recordDeniedProposal(
    input: RiverConsoleReceiptWardenTransitionV1,
  ): EstateReceiptProjectionV1;
  recordHeldProposal(
    input: RiverConsoleReceiptWardenTransitionV1,
  ): EstateReceiptProjectionV1;
  recordRejected(input: RiverConsoleReceiptTransitionV1): EstateReceiptProjectionV1;
  get(receiptRef: string): EstateReceiptProjectionV1 | undefined;
}

export class EstateConsoleReceiptAdapterV1 implements ConsoleReceiptPortV1 {
  constructor(private readonly river: ConsoleReceiptPortV1) {}

  reserve(input: RiverConsoleReceiptReservationRequestV1): EstateReceiptProjectionV1 {
    return this.river.reserve(input);
  }

  recordRead(input: RiverConsoleReceiptTransitionV1): EstateReceiptProjectionV1 {
    return this.river.recordRead(input);
  }

  recordAuthorizedProposal(
    input: RiverConsoleReceiptWardenTransitionV1,
  ): EstateReceiptProjectionV1 {
    return this.river.recordAuthorizedProposal(input);
  }

  recordDeniedProposal(
    input: RiverConsoleReceiptWardenTransitionV1,
  ): EstateReceiptProjectionV1 {
    return this.river.recordDeniedProposal(input);
  }

  recordHeldProposal(
    input: RiverConsoleReceiptWardenTransitionV1,
  ): EstateReceiptProjectionV1 {
    return this.river.recordHeldProposal(input);
  }

  recordRejected(input: RiverConsoleReceiptTransitionV1): EstateReceiptProjectionV1 {
    return this.river.recordRejected(input);
  }

  get(receiptRef: string): EstateReceiptProjectionV1 | undefined {
    return this.river.get(receiptRef);
  }
}
