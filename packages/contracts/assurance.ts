export type AssuranceLevel = "A0" | "A1" | "A2" | "A3" | "A4";

export function assuranceRank(level: AssuranceLevel): number {
  return Number(level.slice(1));
}
