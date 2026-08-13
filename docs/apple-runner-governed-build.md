# APPLE-RUNNER-001 Governed Build Adapter

`appleRunnerBuildSwiftArtifact` is the second executing tool on the Alpha/Newton Apple runner surface. It extends the proven Metal canary into a fixed build/test/artifact workflow without introducing arbitrary shell access.

## Fixed workload

The only accepted fixture is `metal-vector-add-package-v1`.

The adapter generates a deterministic local Swift package containing:

- `AlphaMetalCore` — Metal vector-add implementation;
- `alpha-metal-artifact` — release executable;
- `AlphaMetalCoreTests` — a physical Metal correctness test.

The package is built with SwiftPM in release mode, tested, and then the built executable is executed again as an artifact self-test. The expected vector is always `[11, 22, 33, 44]`.

## Authority boundary

Execution requires a Warden capability with:

- schema `ALPHA-WARDEN-CAPABILITY-001`;
- `issuedBy: WARDEN`;
- `status: AUTHORIZED`;
- tool `appleRunnerBuildSwiftArtifact`;
- runner bound to the requested `runnerRef`;
- scope `APPLE-RUNNER-001:SWIFT-BUILD`;
- principal and workspace context;
- valid issue/expiry times;
- a single-use nonce.

`ALPHA_WARDEN_HMAC_SECRET` is runner configuration and is never accepted through MCP arguments.

A separate `ALPHA_ARTIFACT_HMAC_SECRET` signs the artifact manifest. Separating execution authority verification from artifact attestation prevents one key from silently serving both purposes.

## Command allow-list

The MCP tool accepts no executable, shell expression, package path, output path, build flags or user-defined script. Internally it may run only the fixed sequence:

1. `xcrun swift build -c release --product alpha-metal-artifact`
2. `xcrun swift test -c release`
3. `xcrun swift build -c release --show-bin-path`
4. the built fixed executable with zero arguments
5. `sw_vers -productVersion`
6. `xcodebuild -version`
7. `xcrun swift --version`

All child processes use `shell: false`, bounded output and a hard execution timeout.

## Artifact and evidence

The output executable is copied to a runner-controlled artifact directory. Configure `ALPHA_APPLE_ARTIFACT_DIR` for durable runner-local storage. Without it, the adapter uses the runner temporary directory and reports that durable storage is not configured.

Each build persists:

- `alpha-metal-artifact`;
- `build.log`;
- `test.log`;
- `manifest.json`;
- `manifest.sig`.

The manifest includes:

- artifact SHA-256 and size;
- deterministic source SHA-256;
- build/test log hashes;
- physical Metal self-test evidence;
- macOS, Xcode and Swift identities;
- GitHub repository/commit provenance when present;
- DigitalMe principal/workspace/capability context;
- generation timestamp.

The returned reference uses the semantic form:

`apple-runner://APPLE-RUNNER-001/<run-id>/alpha-metal-artifact`

The local filesystem path is intentionally not part of the MCP input contract.

## Current security posture

The adapter still does **not** permit:

- arbitrary shell or command execution;
- arbitrary repositories or user-supplied source code;
- production deployment;
- App Store signing/notarization;
- raw Registry/database credentials;
- reusable capability tokens.

The HMAC manifest signature is an Alpha-runner integrity attestation, not Apple code signing. A future release adapter should introduce an asymmetric signing identity or platform signing service before distributing production artifacts.
