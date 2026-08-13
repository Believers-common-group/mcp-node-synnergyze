import { spawn } from "node:child_process";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import type { CustomMcpServer } from "../CustomMcpServer.ts";

export const AppleRunnerBuildOperationId = "appleRunnerBuildSwiftArtifact";
const REQUIRED_SCOPE = "APPLE-RUNNER-001:SWIFT-BUILD";
const FIXTURE_ID = "metal-vector-add-package-v1";
const PRODUCT_NAME = "alpha-metal-artifact";
const MAX_OUTPUT_BYTES = 256 * 1024;
const EXECUTION_TIMEOUT_MS = 180_000;

export type AppleBuildWardenCapabilityPayload = {
  schema: "ALPHA-WARDEN-CAPABILITY-001";
  issuedBy: "WARDEN";
  status: "AUTHORIZED";
  capabilityId: string;
  principal: string;
  workspaceRef: string;
  tool: typeof AppleRunnerBuildOperationId;
  runnerRef: string;
  scopes: string[];
  nonce: string;
  issuedAt: string;
  expiresAt: string;
};

type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function verifyWardenCapability(
  token: string,
  runnerRef: string,
): AppleBuildWardenCapabilityPayload {
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

  let payload: AppleBuildWardenCapabilityPayload;
  try {
    payload = JSON.parse(
      decodeBase64Url(payloadPart).toString("utf8"),
    ) as AppleBuildWardenCapabilityPayload;
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
  if (payload.tool !== AppleRunnerBuildOperationId) {
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

async function consumeReplayNonce(payload: AppleBuildWardenCapabilityPayload): Promise<void> {
  const replayRoot = process.env.ALPHA_WARDEN_REPLAY_DIR ?? join(tmpdir(), "alpha-newton-replay");
  await mkdir(replayRoot, { recursive: true });
  const markerId = sha256(`${payload.capabilityId}\0${payload.nonce}`);
  const marker = join(replayRoot, `${markerId}.used`);

  try {
    await writeFile(
      marker,
      JSON.stringify({
        capabilityId: payload.capabilityId,
        nonce: payload.nonce,
        usedAt: new Date().toISOString(),
      }),
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

function runFixedCommand(command: string, args: string[], cwd: string): Promise<CommandResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let killedForOutput = false;
    let timedOut = false;

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

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, EXECUTION_TIMEOUT_MS);

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
      if (timedOut) {
        reject(new Error("APPLE_RUNNER_BUILD_TIMEOUT"));
        return;
      }
      resolveResult({
        stdout: stdout.toString("utf8").trim(),
        stderr: stderr.toString("utf8").trim(),
        exitCode: code ?? -1,
      });
    });
  });
}

const PACKAGE_SWIFT = `// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "AlphaMetalArtifact",
    platforms: [.macOS(.v15)],
    products: [
        .library(name: "AlphaMetalCore", targets: ["AlphaMetalCore"]),
        .executable(name: "${PRODUCT_NAME}", targets: ["AlphaMetalArtifact"]),
    ],
    targets: [
        .target(name: "AlphaMetalCore"),
        .executableTarget(name: "AlphaMetalArtifact", dependencies: ["AlphaMetalCore"]),
        .testTarget(name: "AlphaMetalCoreTests", dependencies: ["AlphaMetalCore"]),
    ]
)
`;

const CORE_SWIFT = String.raw`import Foundation
import Metal

public struct AlphaMetalEvidence: Codable, Sendable {
    public let schema: String
    public let fixture: String
    public let deviceName: String
    public let registryID: UInt64
    public let unifiedMemory: Bool
    public let output: [Float]
    public let expected: [Float]
    public let correct: Bool
    public let cpuElapsedMs: Double
    public let gpuElapsedMs: Double?
}

public enum AlphaMetalFailure: Error {
    case deviceUnavailable
    case commandQueueUnavailable
    case functionUnavailable
    case resourceAllocationFailed
    case commandFailed(String)
}

public func runMetalVectorAdd() throws -> AlphaMetalEvidence {
    guard let device = MTLCreateSystemDefaultDevice() else {
        throw AlphaMetalFailure.deviceUnavailable
    }
    guard let queue = device.makeCommandQueue() else {
        throw AlphaMetalFailure.commandQueueUnavailable
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

    let library = try device.makeLibrary(source: source, options: nil)
    guard let function = library.makeFunction(name: "vector_add") else {
        throw AlphaMetalFailure.functionUnavailable
    }
    let pipeline = try device.makeComputePipelineState(function: function)

    let a: [Float] = [1, 2, 3, 4]
    let b: [Float] = [10, 20, 30, 40]
    let expected: [Float] = [11, 22, 33, 44]
    let byteCount = a.count * MemoryLayout<Float>.stride

    guard let aBuffer = device.makeBuffer(bytes: a, length: byteCount),
          let bBuffer = device.makeBuffer(bytes: b, length: byteCount),
          let outBuffer = device.makeBuffer(length: byteCount),
          let commandBuffer = queue.makeCommandBuffer(),
          let encoder = commandBuffer.makeComputeCommandEncoder() else {
        throw AlphaMetalFailure.resourceAllocationFailed
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

    guard commandBuffer.status == .completed else {
        throw AlphaMetalFailure.commandFailed(String(describing: commandBuffer.error))
    }

    let values = outBuffer.contents().bindMemory(to: Float.self, capacity: a.count)
    let output = Array(UnsafeBufferPointer(start: values, count: a.count))
    let gpuElapsed = commandBuffer.gpuEndTime > commandBuffer.gpuStartTime
        ? (commandBuffer.gpuEndTime - commandBuffer.gpuStartTime) * 1000.0
        : nil

    return AlphaMetalEvidence(
        schema: "APPLE-RUNNER-METAL-ARTIFACT-EVIDENCE-001",
        fixture: "metal-vector-add-package-v1",
        deviceName: device.name,
        registryID: device.registryID,
        unifiedMemory: device.hasUnifiedMemory,
        output: output,
        expected: expected,
        correct: output == expected,
        cpuElapsedMs: Double(end - start) / 1_000_000.0,
        gpuElapsedMs: gpuElapsed
    )
}
`;

const MAIN_SWIFT = String.raw`import Foundation
import AlphaMetalCore

func fail(_ message: String, code: Int32) -> Never {
    fputs(message + "\n", stderr)
    exit(code)
}

do {
    let evidence = try runMetalVectorAdd()
    let data = try JSONEncoder().encode(evidence)
    print(String(decoding: data, as: UTF8.self))
    if !evidence.correct {
        fail("METAL_ARTIFACT_OUTPUT_MISMATCH", code: 26)
    }
} catch {
    fail("METAL_ARTIFACT_FAILED: \(error)", code: 20)
}
`;

const TEST_SWIFT = `import XCTest
@testable import AlphaMetalCore

final class AlphaMetalCoreTests: XCTestCase {
    func testDeterministicVectorAdd() throws {
        let evidence = try runMetalVectorAdd()
        XCTAssertTrue(evidence.correct)
        XCTAssertEqual(evidence.output, [11, 22, 33, 44])
        XCTAssertEqual(evidence.expected, [11, 22, 33, 44])
    }
}
`;

async function writeFixedPackage(workDir: string): Promise<string> {
  const coreDir = join(workDir, "Sources", "AlphaMetalCore");
  const executableDir = join(workDir, "Sources", "AlphaMetalArtifact");
  const testDir = join(workDir, "Tests", "AlphaMetalCoreTests");
  await mkdir(coreDir, { recursive: true });
  await mkdir(executableDir, { recursive: true });
  await mkdir(testDir, { recursive: true });

  await writeFile(join(workDir, "Package.swift"), PACKAGE_SWIFT, { mode: 0o600 });
  await writeFile(join(coreDir, "AlphaMetalCore.swift"), CORE_SWIFT, { mode: 0o600 });
  await writeFile(join(executableDir, "main.swift"), MAIN_SWIFT, { mode: 0o600 });
  await writeFile(join(testDir, "AlphaMetalCoreTests.swift"), TEST_SWIFT, { mode: 0o600 });

  return sha256([PACKAGE_SWIFT, CORE_SWIFT, MAIN_SWIFT, TEST_SWIFT].join("\n---\n"));
}

async function requireSuccessful(
  label: string,
  command: string,
  args: string[],
  cwd: string,
): Promise<CommandResult> {
  const result = await runFixedCommand(command, args, cwd);
  if (result.exitCode !== 0) {
    throw new Error(
      `${label}_FAILED exit=${result.exitCode} stderr=${result.stderr || "<empty>"}`,
    );
  }
  return result;
}

export function registerAppleRunnerBuild(server: CustomMcpServer) {
  server.tool({
    name: AppleRunnerBuildOperationId,
    description:
      "Build and test the fixed APPLE-RUNNER-001 Swift/Metal package, persist its executable and logs, and return a signed artifact manifest. Requires a Warden-signed single-use build capability.",
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
      const artifactSigningSecret = process.env.ALPHA_ARTIFACT_HMAC_SECRET;
      if (!artifactSigningSecret) {
        throw new Error("ARTIFACT_SIGNER_NOT_CONFIGURED");
      }
      if (process.platform !== "darwin") {
        throw new Error("APPLE_RUNNER_REQUIRES_MACOS");
      }

      await consumeReplayNonce(capability);

      const workDir = await mkdtemp(join(tmpdir(), "alpha-apple-build-"));
      try {
        const sourceSha256 = await writeFixedPackage(workDir);
        const build = await requireSuccessful(
          "APPLE_SWIFT_BUILD",
          "xcrun",
          ["swift", "build", "-c", "release", "--product", PRODUCT_NAME],
          workDir,
        );
        const tests = await requireSuccessful(
          "APPLE_SWIFT_TEST",
          "xcrun",
          ["swift", "test", "-c", "release"],
          workDir,
        );
        const binPathResult = await requireSuccessful(
          "APPLE_SWIFT_BIN_PATH",
          "xcrun",
          ["swift", "build", "-c", "release", "--show-bin-path"],
          workDir,
        );

        const binRoot = resolve(binPathResult.stdout);
        const resolvedWorkDir = resolve(workDir);
        if (!binRoot.startsWith(`${resolvedWorkDir}${sep}`)) {
          throw new Error("APPLE_BUILD_BIN_PATH_OUTSIDE_WORKDIR");
        }
        const executablePath = join(binRoot, PRODUCT_NAME);
        const verification = await requireSuccessful(
          "APPLE_ARTIFACT_SELF_TEST",
          executablePath,
          [],
          workDir,
        );
        const evidence = JSON.parse(verification.stdout) as {
          correct?: boolean;
          output?: number[];
          expected?: number[];
          [key: string]: unknown;
        };
        if (
          evidence.correct !== true ||
          JSON.stringify(evidence.output) !== JSON.stringify([11, 22, 33, 44])
        ) {
          throw new Error("APPLE_ARTIFACT_VERIFICATION_MISMATCH");
        }

        const executable = await readFile(executablePath);
        const executableStats = await stat(executablePath);
        const artifactSha256 = sha256(executable);
        const buildLog = `${build.stdout}\n${build.stderr}`.trim();
        const testLog = `${tests.stdout}\n${tests.stderr}`.trim();
        const runId = sha256(`${capability.capabilityId}\0${capability.nonce}`).slice(0, 24);
        const artifactRoot =
          process.env.ALPHA_APPLE_ARTIFACT_DIR ?? join(tmpdir(), "alpha-apple-artifacts");
        await mkdir(artifactRoot, { recursive: true });
        const runDir = join(artifactRoot, runId);
        try {
          await mkdir(runDir, { recursive: false, mode: 0o700 });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "EEXIST") {
            throw new Error("APPLE_ARTIFACT_ALREADY_EXISTS");
          }
          throw error;
        }

        const persistedExecutable = join(runDir, PRODUCT_NAME);
        await copyFile(executablePath, persistedExecutable);
        await chmod(persistedExecutable, 0o700);
        await writeFile(join(runDir, "build.log"), buildLog, { mode: 0o600 });
        await writeFile(join(runDir, "test.log"), testLog, { mode: 0o600 });

        const os = await requireSuccessful("APPLE_SW_VERS", "sw_vers", ["-productVersion"], workDir);
        const xcode = await requireSuccessful("APPLE_XCODE_VERSION", "xcodebuild", ["-version"], workDir);
        const swift = await requireSuccessful("APPLE_SWIFT_VERSION", "xcrun", ["swift", "--version"], workDir);

        const artifactRef = `apple-runner://${input.runnerRef}/${runId}/${PRODUCT_NAME}`;
        const manifest = {
          schema: "APPLE-RUNNER-ARTIFACT-MANIFEST-001",
          artifactId: `APPLE-ARTIFACT-${runId}`,
          artifactRef,
          fixture: input.fixture,
          runnerRef: input.runnerRef,
          capability: {
            capabilityId: capability.capabilityId,
            principal: capability.principal,
            workspaceRef: capability.workspaceRef,
            nonce: capability.nonce,
          },
          artifact: {
            name: PRODUCT_NAME,
            configuration: "release",
            sha256: artifactSha256,
            sizeBytes: executableStats.size,
          },
          sourceSha256,
          verification: {
            testsPassed: true,
            artifactSelfTestPassed: true,
            evidence,
            buildLogSha256: sha256(buildLog),
            testLogSha256: sha256(testLog),
          },
          toolchain: {
            macOS: os.stdout,
            xcode: xcode.stdout,
            swift: swift.stdout,
          },
          provenance: {
            repository: process.env.GITHUB_REPOSITORY ?? null,
            gitCommit: process.env.GITHUB_SHA ?? null,
          },
          generatedAt: new Date().toISOString(),
        };
        const manifestJson = JSON.stringify(manifest);
        const signature = createHmac("sha256", artifactSigningSecret)
          .update(manifestJson)
          .digest("base64url");
        await writeFile(join(runDir, "manifest.json"), manifestJson, { mode: 0o600 });
        await writeFile(join(runDir, "manifest.sig"), signature, { mode: 0o600 });

        return JSON.stringify({
          schema: "APPLE-RUNNER-BUILD-EXECUTION-001",
          runnerRef: input.runnerRef,
          fixture: input.fixture,
          executionPolicy: {
            shell: false,
            arbitraryCommandExecution: false,
            allowedCommands: [
              "xcrun swift build -c release --product alpha-metal-artifact",
              "xcrun swift test -c release",
              "xcrun swift build -c release --show-bin-path",
              "<built-fixed-artifact>",
              "sw_vers -productVersion",
              "xcodebuild -version",
              "xcrun swift --version",
            ],
          },
          manifest,
          manifestSignature: {
            algorithm: "HMAC-SHA256",
            value: signature,
          },
          storage: {
            artifactRef,
            durableStorageConfigured: Boolean(process.env.ALPHA_APPLE_ARTIFACT_DIR),
          },
        });
      } finally {
        await rm(workDir, { recursive: true, force: true });
      }
    },
  });
}
