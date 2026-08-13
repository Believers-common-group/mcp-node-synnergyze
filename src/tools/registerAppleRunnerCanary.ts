import { spawn } from "node:child_process";
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CustomMcpServer } from "../CustomMcpServer.ts";

export const AppleRunnerOperationId = "appleRunnerRunMetalCanary";
const REQUIRED_SCOPE = "APPLE-RUNNER-001:METAL-CANARY";
const FIXTURE_ID = "vector-add-f32-v1";
const MAX_OUTPUT_BYTES = 64 * 1024;
const EXECUTION_TIMEOUT_MS = 60_000;

export type WardenCapabilityPayload = {
  schema: "ALPHA-WARDEN-CAPABILITY-001";
  issuedBy: "WARDEN";
  status: "AUTHORIZED";
  capabilityId: string;
  principal: string;
  workspaceRef: string;
  tool: typeof AppleRunnerOperationId;
  runnerRef: string;
  scopes: string[];
  nonce: string;
  issuedAt: string;
  expiresAt: string;
};

function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function verifyWardenCapability(token: string, runnerRef: string): WardenCapabilityPayload {
  const secret = process.env.ALPHA_WARDEN_HMAC_SECRET;
  if (!secret) {
    throw new Error("WARDEN_AUTHORITY_VERIFIER_NOT_CONFIGURED");
  }

  const [payloadPart, signaturePart, ...extra] = token.split(".");
  if (!payloadPart || !signaturePart || extra.length) {
    throw new Error("INVALID_WARDEN_CAPABILITY_TOKEN");
  }

  const expectedSignature = createHmac("sha256", secret).update(payloadPart).digest();
  const actualSignature = decodeBase64Url(signaturePart);
  if (
    actualSignature.length !== expectedSignature.length ||
    !timingSafeEqual(actualSignature, expectedSignature)
  ) {
    throw new Error("INVALID_WARDEN_CAPABILITY_SIGNATURE");
  }

  let payload: WardenCapabilityPayload;
  try {
    payload = JSON.parse(decodeBase64Url(payloadPart).toString("utf8")) as WardenCapabilityPayload;
  } catch {
    throw new Error("INVALID_WARDEN_CAPABILITY_PAYLOAD");
  }

  if (
    payload.schema !== "ALPHA-WARDEN-CAPABILITY-001" ||
    payload.issuedBy !== "WARDEN" ||
    payload.status !== "AUTHORIZED"
  ) {
    throw new Error("WARDEN_CAPABILITY_NOT_AUTHORIZED");
  }
  if (payload.tool !== AppleRunnerOperationId) {
    throw new Error("WARDEN_CAPABILITY_TOOL_MISMATCH");
  }
  if (payload.runnerRef !== runnerRef) {
    throw new Error("WARDEN_CAPABILITY_RUNNER_MISMATCH");
  }
  if (!payload.scopes?.includes(REQUIRED_SCOPE)) {
    throw new Error("WARDEN_CAPABILITY_SCOPE_MISSING");
  }
  if (!payload.capabilityId || !payload.principal || !payload.workspaceRef || !payload.nonce) {
    throw new Error("WARDEN_CAPABILITY_CONTEXT_INCOMPLETE");
  }

  const issuedAt = Date.parse(payload.issuedAt);
  const expiresAt = Date.parse(payload.expiresAt);
  const now = Date.now();
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || issuedAt > now + 60_000) {
    throw new Error("WARDEN_CAPABILITY_TIME_INVALID");
  }
  if (expiresAt <= now) {
    throw new Error("WARDEN_CAPABILITY_EXPIRED");
  }

  return payload;
}

async function consumeReplayNonce(payload: WardenCapabilityPayload): Promise<void> {
  const replayRoot = process.env.ALPHA_WARDEN_REPLAY_DIR ?? join(tmpdir(), "alpha-newton-replay");
  await mkdir(replayRoot, { recursive: true });
  const marker = join(replayRoot, `${payload.capabilityId}-${payload.nonce}.used`);

  try {
    await writeFile(
      marker,
      JSON.stringify({ capabilityId: payload.capabilityId, nonce: payload.nonce, usedAt: new Date().toISOString() }),
      { flag: "wx", mode: 0o600 },
    );
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST") {
      throw new Error("WARDEN_CAPABILITY_REPLAY_DETECTED");
    }
    throw error;
  }
}

const SWIFT_METAL_CANARY = String.raw`import Foundation
import Metal

struct Evidence: Codable {
    let schema: String
    let fixture: String
    let deviceName: String
    let registryID: UInt64
    let lowPower: Bool
    let removable: Bool
    let unifiedMemory: Bool
    let osVersion: String
    let output: [Float]
    let expected: [Float]
    let correct: Bool
    let cpuElapsedMs: Double
    let gpuElapsedMs: Double?
}

guard let device = MTLCreateSystemDefaultDevice() else {
    fputs("METAL_DEVICE_UNAVAILABLE\n", stderr)
    exit(20)
}

guard let queue = device.makeCommandQueue() else {
    fputs("METAL_COMMAND_QUEUE_UNAVAILABLE\n", stderr)
    exit(21)
}

let source = """
#include <metal_stdlib>
using namespace metal;
kernel void vector_add(const device float* a [[buffer(0)]],
                       const device float* b [[buffer(1)]],
                       device float* out [[buffer(2)]],
                       uint id [[thread_position_in_grid]]) {
    out[id] = a[id] + b[id];
}
"""

let library: MTLLibrary
let function: MTLFunction
let pipeline: MTLComputePipelineState

do {
    library = try device.makeLibrary(source: source, options: nil)
    guard let resolved = library.makeFunction(name: "vector_add") else {
        fputs("METAL_FUNCTION_UNAVAILABLE\n", stderr)
        exit(22)
    }
    function = resolved
    pipeline = try device.makeComputePipelineState(function: function)
} catch {
    fputs("METAL_PIPELINE_BUILD_FAILED: \(error)\n", stderr)
    exit(23)
}

let a: [Float] = [1, 2, 3, 4]
let b: [Float] = [10, 20, 30, 40]
let expected: [Float] = [11, 22, 33, 44]
let byteCount = a.count * MemoryLayout<Float>.stride

guard let aBuffer = device.makeBuffer(bytes: a, length: byteCount),
      let bBuffer = device.makeBuffer(bytes: b, length: byteCount),
      let outBuffer = device.makeBuffer(length: byteCount),
      let commandBuffer = queue.makeCommandBuffer(),
      let encoder = commandBuffer.makeComputeCommandEncoder() else {
    fputs("METAL_RESOURCE_ALLOCATION_FAILED\n", stderr)
    exit(24)
}

encoder.setComputePipelineState(pipeline)
encoder.setBuffer(aBuffer, offset: 0, index: 0)
encoder.setBuffer(bBuffer, offset: 0, index: 1)
encoder.setBuffer(outBuffer, offset: 0, index: 2)
let width = min(pipeline.maxTotalThreadsPerThreadgroup, a.count)
encoder.dispatchThreads(
    MTLSize(width: a.count, height: 1, depth: 1),
    threadsPerThreadgroup: MTLSize(width: width, height: 1, depth: 1)
)
encoder.endEncoding()

let start = DispatchTime.now().uptimeNanoseconds
commandBuffer.commit()
commandBuffer.waitUntilCompleted()
let end = DispatchTime.now().uptimeNanoseconds

if commandBuffer.status != .completed {
    fputs("METAL_COMMAND_FAILED: \(String(describing: commandBuffer.error))\n", stderr)
    exit(25)
}

let values = outBuffer.contents().bindMemory(to: Float.self, capacity: a.count)
let output = Array(UnsafeBufferPointer(start: values, count: a.count))
let correct = output == expected
let gpuElapsed = commandBuffer.gpuEndTime > commandBuffer.gpuStartTime
    ? (commandBuffer.gpuEndTime - commandBuffer.gpuStartTime) * 1000.0
    : nil
let evidence = Evidence(
    schema: "APPLE-RUNNER-METAL-EVIDENCE-001",
    fixture: "vector-add-f32-v1",
    deviceName: device.name,
    registryID: device.registryID,
    lowPower: device.isLowPower,
    removable: device.isRemovable,
    unifiedMemory: device.hasUnifiedMemory,
    osVersion: ProcessInfo.processInfo.operatingSystemVersionString,
    output: output,
    expected: expected,
    correct: correct,
    cpuElapsedMs: Double(end - start) / 1_000_000.0,
    gpuElapsedMs: gpuElapsed
)

let data = try JSONEncoder().encode(evidence)
print(String(decoding: data, as: UTF8.self))
if !correct { exit(26) }
`;

function runFixedCommand(command: string, args: string[], cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let killedForOutput = false;

    const append = (current: Buffer, chunk: Buffer): Buffer => {
      const next = Buffer.concat([current, chunk]);
      if (next.length > MAX_OUTPUT_BYTES) {
        killedForOutput = true;
        child.kill("SIGKILL");
        return next.subarray(0, MAX_OUTPUT_BYTES);
      }
      return next;
    };

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });

    const timeout = setTimeout(() => child.kill("SIGKILL"), EXECUTION_TIMEOUT_MS);
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (killedForOutput) {
        reject(new Error("APPLE_RUNNER_OUTPUT_LIMIT_EXCEEDED"));
        return;
      }
      resolve({
        stdout: stdout.toString("utf8").trim(),
        stderr: stderr.toString("utf8").trim(),
        exitCode: code ?? -1,
      });
    });
  });
}

export function registerAppleRunnerCanary(server: CustomMcpServer) {
  server.tool({
    name: AppleRunnerOperationId,
    description:
      "Execute the fixed APPLE-RUNNER-001 Metal vector-add canary on an authorized macOS runner and return structured evidence. Requires a Warden-signed, single-use capability token.",
    annotations: { destructiveHint: false, idempotentHint: false },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        runnerRef: { type: "string", minLength: 1 },
        fixture: { type: "string", enum: [FIXTURE_ID] },
        capabilityToken: { type: "string", minLength: 16 },
      },
      required: ["runnerRef", "fixture", "capabilityToken"],
    },
    cb: async (args) => {
      const input = args as {
        runnerRef: string;
        fixture: typeof FIXTURE_ID;
        capabilityToken: string;
      };

      const capability = verifyWardenCapability(input.capabilityToken, input.runnerRef);
      if (process.platform !== "darwin") {
        throw new Error("APPLE_RUNNER_REQUIRES_MACOS");
      }

      // Consume only immediately before execution so routing mistakes do not burn the capability.
      await consumeReplayNonce(capability);

      const workDir = await mkdtemp(join(tmpdir(), "alpha-apple-runner-"));
      const scriptPath = join(workDir, "metal_canary.swift");
      try {
        await writeFile(scriptPath, SWIFT_METAL_CANARY, { mode: 0o600 });
        const result = await runFixedCommand("xcrun", ["swift", scriptPath], workDir);
        if (result.exitCode !== 0) {
          throw new Error(
            `APPLE_RUNNER_CANARY_FAILED exit=${result.exitCode} stderr=${result.stderr || "<empty>"}`,
          );
        }

        const evidence = JSON.parse(result.stdout) as Record<string, unknown>;
        return JSON.stringify({
          schema: "APPLE-RUNNER-EXECUTION-001",
          runnerRef: input.runnerRef,
          fixture: input.fixture,
          capability: {
            capabilityId: capability.capabilityId,
            principal: capability.principal,
            workspaceRef: capability.workspaceRef,
            nonce: capability.nonce,
          },
          commandPolicy: {
            shell: false,
            executable: "xcrun",
            arguments: ["swift", "<generated-fixed-fixture>"],
            arbitraryCommandExecution: false,
          },
          evidence,
          stderr: result.stderr || null,
          executedAt: new Date().toISOString(),
        });
      } finally {
        await rm(workDir, { recursive: true, force: true });
      }
    },
  });
}
