import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

import type { EstateArtifactV1, EstateConsoleSessionV1 } from "./contracts.ts";

export interface EstateConsoleArtifactServiceOptionsV1 {
  readonly ingressRoot: string;
  readonly session: EstateConsoleSessionV1;
}

interface RegisteredArtifactV1 {
  readonly artifact: EstateArtifactV1;
  readonly absolutePath: string;
}

function digestBytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function digestText(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function assertContained(root: string, candidate: string): void {
  const rel = relative(root, candidate);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) return;
  throw new Error("estate_console_artifact_path_outside_ingress");
}

export class EstateConsoleArtifactServiceV1 {
  private readonly incomingRoot: string;
  private readonly registered = new Map<string, RegisteredArtifactV1>();

  constructor(private readonly options: EstateConsoleArtifactServiceOptionsV1) {
    this.incomingRoot = realpathSync(resolve(options.ingressRoot, "incoming"));
  }

  registerIncoming(filename: string, mediaType: string): EstateArtifactV1 {
    const absolutePath = this.resolveIncoming(filename);
    const stats = lstatSync(absolutePath);
    if (stats.isSymbolicLink()) throw new Error("estate_console_artifact_symlink_denied");
    if (!stats.isFile()) throw new Error("estate_console_artifact_regular_file_required");

    const realPath = realpathSync(absolutePath);
    assertContained(this.incomingRoot, realPath);
    const bytes = readFileSync(realPath);
    const sha256 = `sha256:${digestBytes(bytes)}`;
    const identity = JSON.stringify({
      sessionRef: this.options.session.sessionRef,
      filename,
      mediaType,
      sha256,
      sizeBytes: stats.size,
    });
    const artifactRef = `ART:${digestText(identity).slice(0, 24)}`;
    const artifact: EstateArtifactV1 = {
      artifactRef,
      sessionRef: this.options.session.sessionRef,
      principalRef: this.options.session.principalRef,
      deviceRef: this.options.session.deviceRef,
      consoleRef: this.options.session.consoleRef,
      filename,
      mediaType,
      sha256,
      sizeBytes: stats.size,
      state: "REGISTERED",
      sourceRefs: [this.options.session.sessionRef],
      correlationId: this.options.session.correlationId,
    };

    this.registered.set(artifactRef, { artifact, absolutePath: realPath });
    return { ...artifact, sourceRefs: [...artifact.sourceRefs] };
  }

  verifyForSubmission(artifact: EstateArtifactV1): EstateArtifactV1 {
    const stored = this.registered.get(artifact.artifactRef);
    if (!stored) throw new Error("estate_console_artifact_not_registered");
    if (
      artifact.sessionRef !== stored.artifact.sessionRef ||
      artifact.filename !== stored.artifact.filename ||
      artifact.sha256 !== stored.artifact.sha256
    ) {
      throw new Error("estate_console_artifact_registration_mismatch");
    }

    const stats = lstatSync(stored.absolutePath);
    if (stats.isSymbolicLink()) throw new Error("estate_console_artifact_symlink_denied");
    if (!stats.isFile()) throw new Error("estate_console_artifact_regular_file_required");
    assertContained(this.incomingRoot, realpathSync(stored.absolutePath));

    const currentDigest = `sha256:${digestBytes(readFileSync(stored.absolutePath))}`;
    if (currentDigest !== stored.artifact.sha256 || stats.size !== stored.artifact.sizeBytes) {
      throw new Error("estate_console_artifact_digest_mismatch");
    }

    return { ...stored.artifact, sourceRefs: [...stored.artifact.sourceRefs] };
  }

  private resolveIncoming(filename: string): string {
    if (isAbsolute(filename)) {
      throw new Error("estate_console_artifact_absolute_path_denied");
    }
    const candidate = resolve(this.incomingRoot, filename);
    assertContained(this.incomingRoot, candidate);
    return candidate;
  }
}
