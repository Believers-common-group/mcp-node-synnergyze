import { describe, expect, it } from "vitest";

import { parseEstateCommandLineV1 } from "./command-router.ts";

describe("Estate Console command grammar", () => {
  it.each([
    ["estate whoami", { verb: "WHOAMI", actionClass: "READ" }],
    ["estate status", { verb: "STATUS", actionClass: "READ" }],
    ["estate health", { verb: "HEALTH", actionClass: "READ" }],
    ["estate inspect river", { verb: "INSPECT", actionClass: "READ", resourceRef: "river" }],
    ["estate submit deployment.yaml", { verb: "SUBMIT", actionClass: "PROPOSE", artifactPath: "deployment.yaml" }],
    ["estate receipts", { verb: "RECEIPTS", actionClass: "READ" }],
    ["estate receipt RIVER-CONSOLE-RECEIPT:001", { verb: "RECEIPT", actionClass: "READ", receiptRef: "RIVER-CONSOLE-RECEIPT:001" }],
    ["estate exit", { verb: "EXIT", actionClass: "READ" }],
  ] as const)("parses %s", (line, expected) => {
    expect(parseEstateCommandLineV1(line)).toEqual(expected);
  });

  it.each([
    "estate restart river-api",
    "estate deploy deployment.yaml",
    "estate delete deployment.yaml",
    "estate grant admin",
    "bash",
    "sh",
    "powershell",
    "kubectl get pods",
    "docker ps",
    "psql",
  ])("rejects ungoverned or effect-capable input: %s", (line) => {
    expect(() => parseEstateCommandLineV1(line)).toThrow("estate_console_command_not_allowed");
  });

  it.each([
    "estate submit ../../escape.yaml",
    "estate submit ../escape.yaml",
    "estate submit /tmp/escape.yaml",
    "estate submit subdir/deployment.yaml",
    "estate submit subdir\\deployment.yaml",
  ])("rejects artifact paths that are not a single ingress filename: %s", (line) => {
    expect(() => parseEstateCommandLineV1(line)).toThrow("estate_console_artifact_path_not_allowed");
  });

  it.each([
    "estate inspect",
    "estate inspect river extra",
    "estate submit",
    "estate receipts extra",
    "estate receipt",
    "estate exit now",
  ])("rejects malformed allowed verbs: %s", (line) => {
    expect(() => parseEstateCommandLineV1(line)).toThrow("estate_console_invalid_command_shape");
  });
});
