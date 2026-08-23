import type {
  FundingBalance,
  FundingKind,
  FundingReservation,
  FundingSettlement,
  FundingSource,
  ReserveFundingInput,
} from "./types.ts";

interface StoredReservation {
  input: ReserveFundingInput;
  reservation: FundingReservation;
  settlement?: FundingSettlement;
}

function samePriority(left: FundingKind[], right: FundingKind[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameReserveInput(left: ReserveFundingInput, right: ReserveFundingInput): boolean {
  return (
    left.reservationId === right.reservationId &&
    left.executionId === right.executionId &&
    left.principalId === right.principalId &&
    left.amount === right.amount &&
    left.currency === right.currency &&
    samePriority(left.sourcePriority, right.sourcePriority)
  );
}

export class InMemoryFundingLedger {
  private readonly sources = new Map<string, FundingSource>();
  private readonly balances = new Map<string, FundingBalance>();
  private readonly reservations = new Map<string, StoredReservation>();

  constructor(sources: FundingSource[]) {
    for (const source of sources) {
      if (this.sources.has(source.sourceId)) {
        throw new Error("DUPLICATE_FUNDING_SOURCE");
      }
      if (source.available < 0) {
        throw new Error("INVALID_FUNDING_BALANCE");
      }

      this.sources.set(source.sourceId, { ...source });
      this.balances.set(source.sourceId, {
        available: source.available,
        reserved: 0,
        settled: 0,
        currency: source.currency,
      });
    }
  }

  reserve(input: ReserveFundingInput): FundingReservation {
    const existing = this.reservations.get(input.reservationId);
    if (existing) {
      if (!sameReserveInput(existing.input, input)) {
        throw new Error("RESERVATION_IDEMPOTENCY_CONFLICT");
      }
      return { ...existing.reservation };
    }

    if (input.amount <= 0) {
      throw new Error("INVALID_RESERVATION_AMOUNT");
    }

    for (const kind of input.sourcePriority) {
      for (const [sourceId, source] of this.sources) {
        if (
          source.principalId !== input.principalId ||
          source.kind !== kind ||
          source.currency !== input.currency
        ) {
          continue;
        }

        const balance = this.balances.get(sourceId);
        if (!balance || balance.available < input.amount) {
          continue;
        }

        const nextBalance: FundingBalance = {
          available: balance.available - input.amount,
          reserved: balance.reserved + input.amount,
          settled: balance.settled,
          currency: balance.currency,
        };
        this.balances.set(sourceId, nextBalance);

        const reservation: FundingReservation = {
          reservationId: input.reservationId,
          executionId: input.executionId,
          principalId: input.principalId,
          sourceId,
          amountReserved: input.amount,
          currency: input.currency,
          status: "RESERVED",
        };

        this.reservations.set(input.reservationId, {
          input: {
            ...input,
            sourcePriority: [...input.sourcePriority],
          },
          reservation,
        });

        return { ...reservation };
      }
    }

    throw new Error("INSUFFICIENT_FUNDING");
  }

  settle(reservationId: string, actualAmount: number): FundingSettlement {
    const stored = this.requireReservation(reservationId);
    if (stored.settlement) {
      if (stored.settlement.amountSettled !== actualAmount) {
        throw new Error("SETTLEMENT_IDEMPOTENCY_CONFLICT");
      }
      return { ...stored.settlement };
    }
    if (stored.reservation.status !== "RESERVED") {
      throw new Error("RESERVATION_NOT_SETTLEABLE");
    }
    if (actualAmount < 0 || actualAmount > stored.reservation.amountReserved) {
      throw new Error("INVALID_SETTLEMENT_AMOUNT");
    }

    const balance = this.requireBalance(stored.reservation.sourceId);
    const released = stored.reservation.amountReserved - actualAmount;
    this.balances.set(stored.reservation.sourceId, {
      available: balance.available + released,
      reserved: balance.reserved - stored.reservation.amountReserved,
      settled: balance.settled + actualAmount,
      currency: balance.currency,
    });

    stored.reservation = {
      ...stored.reservation,
      status: "SETTLED",
    };
    stored.settlement = {
      reservationId,
      amountReserved: stored.reservation.amountReserved,
      amountSettled: actualAmount,
      amountReleased: released,
      currency: stored.reservation.currency,
    };

    return { ...stored.settlement };
  }

  release(reservationId: string): FundingReservation {
    const stored = this.requireReservation(reservationId);
    if (stored.reservation.status === "RELEASED") {
      return { ...stored.reservation };
    }
    if (stored.reservation.status === "SETTLED") {
      throw new Error("SETTLED_RESERVATION_CANNOT_BE_RELEASED");
    }

    const balance = this.requireBalance(stored.reservation.sourceId);
    this.balances.set(stored.reservation.sourceId, {
      available: balance.available + stored.reservation.amountReserved,
      reserved: balance.reserved - stored.reservation.amountReserved,
      settled: balance.settled,
      currency: balance.currency,
    });

    stored.reservation = {
      ...stored.reservation,
      status: "RELEASED",
    };

    return { ...stored.reservation };
  }

  balance(sourceId: string): FundingBalance {
    return { ...this.requireBalance(sourceId) };
  }

  private requireReservation(reservationId: string): StoredReservation {
    const reservation = this.reservations.get(reservationId);
    if (!reservation) {
      throw new Error("RESERVATION_NOT_FOUND");
    }
    return reservation;
  }

  private requireBalance(sourceId: string): FundingBalance {
    const balance = this.balances.get(sourceId);
    if (!balance) {
      throw new Error("FUNDING_SOURCE_NOT_FOUND");
    }
    return balance;
  }
}
