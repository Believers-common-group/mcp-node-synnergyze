export type ConsequenceState = "D0" | "D1" | "D2" | "D3" | "D4" | "D5";

const allowedTransitions: Readonly<Record<ConsequenceState, readonly ConsequenceState[]>> = {
  D0: ["D1"],
  D1: ["D2"],
  D2: ["D3"],
  D3: ["D4"],
  D4: ["D5"],
  D5: [],
};

export function assertConsequenceTransition(from: ConsequenceState, to: ConsequenceState): void {
  if (!allowedTransitions[from].includes(to)) {
    throw new Error(`ILLEGAL_CONSEQUENCE_TRANSITION:${from}->${to}`);
  }
}
