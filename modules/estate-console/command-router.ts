import { isAbsolute } from "node:path";

import type { EstateCommandV1 } from "./contracts.ts";

function invalidShape(): never {
  throw new Error("estate_console_invalid_command_shape");
}

function assertSingleIngressFilename(value: string): void {
  if (
    !value ||
    value === "." ||
    value === ".." ||
    isAbsolute(value) ||
    value.includes("/") ||
    value.includes("\\")
  ) {
    throw new Error("estate_console_artifact_path_not_allowed");
  }
}

export function parseEstateCommandLineV1(line: string): EstateCommandV1 {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (tokens[0] !== "estate" || tokens.length < 2) {
    throw new Error("estate_console_command_not_allowed");
  }

  const verb = tokens[1];
  switch (verb) {
    case "whoami":
      if (tokens.length !== 2) return invalidShape();
      return { verb: "WHOAMI", actionClass: "READ" };
    case "status":
      if (tokens.length !== 2) return invalidShape();
      return { verb: "STATUS", actionClass: "READ" };
    case "health":
      if (tokens.length !== 2) return invalidShape();
      return { verb: "HEALTH", actionClass: "READ" };
    case "inspect":
      if (tokens.length !== 3) return invalidShape();
      return { verb: "INSPECT", actionClass: "READ", resourceRef: tokens[2]! };
    case "submit":
      if (tokens.length !== 3) return invalidShape();
      assertSingleIngressFilename(tokens[2]!);
      return { verb: "SUBMIT", actionClass: "PROPOSE", artifactPath: tokens[2]! };
    case "receipts":
      if (tokens.length !== 2) return invalidShape();
      return { verb: "RECEIPTS", actionClass: "READ" };
    case "receipt":
      if (tokens.length !== 3) return invalidShape();
      return { verb: "RECEIPT", actionClass: "READ", receiptRef: tokens[2]! };
    case "exit":
      if (tokens.length !== 2) return invalidShape();
      return { verb: "EXIT", actionClass: "READ" };
    default:
      throw new Error("estate_console_command_not_allowed");
  }
}
