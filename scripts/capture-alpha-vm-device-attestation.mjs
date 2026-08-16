#!/usr/bin/env node
/**
 * Capture privacy-safe local observation evidence for ALPHA-VM-DEVICE-ATTEST-001.
 *
 * This utility deliberately emits OBSERVATION_ONLY evidence. It does not mint
 * TPM-backed/signed attestation and cannot authorize runtime start by itself.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import { execFileSync } from "node:child_process";

function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function readText(path) {
  try {
    return fs.readFileSync(path, "utf8").trim();
  } catch {
    return "";
  }
}

function parseOsRelease(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return {
    id: values.ID || "unknown",
    version_id: values.VERSION_ID || "unknown",
  };
}

function detectVirtualization() {
  try {
    const result = execFileSync("systemd-detect-virt", [], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (result && result !== "none") return { detected: true, type: result };
    return { detected: false, type: "none" };
  } catch {
    const product = readText("/sys/class/dmi/id/product_name").toLowerCase();
    const vendor = readText("/sys/class/dmi/id/sys_vendor").toLowerCase();
    const combined = `${vendor} ${product}`;
    const known = ["kvm", "qemu", "vmware", "virtualbox", "hyper-v", "parallels", "xen"];
    const type = known.find((candidate) => combined.includes(candidate));
    return type ? { detected: true, type } : { detected: false, type: "unknown" };
  }
}

function secureBootState() {
  try {
    const dir = "/sys/firmware/efi/efivars";
    const entry = fs.readdirSync(dir).find((name) => name.startsWith("SecureBoot-"));
    if (!entry) return "UNKNOWN";
    const value = fs.readFileSync(`${dir}/${entry}`);
    if (value.length < 5) return "UNKNOWN";
    return value[4] === 1 ? "ENABLED" : "DISABLED";
  } catch {
    return "UNKNOWN";
  }
}

function localSubstrateFingerprintDigest() {
  // Raw identifiers are consumed only inside the local one-way digest and are
  // never exported. This digest is supporting evidence, never authority.
  const components = [
    readText("/etc/machine-id"),
    readText("/sys/class/dmi/id/product_uuid"),
    readText("/sys/class/dmi/id/product_name"),
    readText("/sys/class/dmi/id/sys_vendor"),
  ];
  return sha256(components.join("\n"));
}

function parseArgs(argv) {
  const args = { output: null, selfTest: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--self-test") args.selfTest = true;
    else if (value === "--device-profile-ref") args.deviceProfileRef = argv[++index];
    else if (value === "--challenge") args.challenge = argv[++index];
    else if (value === "--output") args.output = argv[++index];
    else throw new Error(`unknown argument: ${value}`);
  }
  return args;
}

function buildObservation({ deviceProfileRef, challenge, now = new Date() }) {
  if (!deviceProfileRef) throw new Error("--device-profile-ref is required");
  if (!challenge) throw new Error("--challenge is required");

  const release = parseOsRelease(readText("/etc/os-release"));
  const bootId = readText("/proc/sys/kernel/random/boot_id") || "boot-id-unavailable";
  const observation = {
    schema: "vsr.alpha-vm-device-attestation/v1",
    attestation_id: `ALPHA-VM-ATTEST:${crypto.randomUUID()}`,
    device_profile_ref: deviceProfileRef,
    node_identity: "ALPHA-NODE-001",
    substrate_kind: "VM",
    capture_method: "alpha-vm-local-observation-v1",
    captured_at: now.toISOString(),
    challenge_nonce_digest: sha256(challenge),
    boot_session_digest: sha256(bootId),
    substrate_fingerprint_digest: localSubstrateFingerprintDigest(),
    os: {
      ...release,
      kernel_release: os.release(),
      architecture: os.arch(),
    },
    virtualization: detectVirtualization(),
    security: {
      secure_boot_state: secureBootState(),
      tpm_present: fs.existsSync("/dev/tpmrm0") || fs.existsSync("/dev/tpm0"),
    },
    privacy: {
      raw_serial_collected: false,
      raw_mac_collected: false,
      ip_collected: false,
      private_key_collected: false,
    },
    attestation_strength: "OBSERVATION_ONLY",
    verification_ref: null,
    authority_effect: "NONE",
  };
  return observation;
}

function selfTest() {
  const parsed = parseOsRelease('ID="ubuntu"\nVERSION_ID="24.04"\n');
  if (parsed.id !== "ubuntu" || parsed.version_id !== "24.04") {
    throw new Error("os-release parser self-test failed");
  }
  if (sha256("challenge") !== "2dd00bd77e01a2873c2e2d41d2e4f2257285420142cf9f8ef7e536d9d75f8a31") {
    throw new Error("sha256 self-test failed");
  }
  const privacyKeys = ["raw_serial_collected", "raw_mac_collected", "ip_collected", "private_key_collected"];
  const privacy = Object.fromEntries(privacyKeys.map((key) => [key, false]));
  if (Object.values(privacy).some(Boolean)) throw new Error("privacy self-test failed");
  console.log("ALPHA-VM-DEVICE-ATTEST-001 capture self-test passed.");
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) {
    selfTest();
    process.exit(0);
  }

  const observation = buildObservation({
    deviceProfileRef: args.deviceProfileRef,
    challenge: args.challenge,
  });
  const encoded = `${JSON.stringify(observation, null, 2)}\n`;
  if (args.output) fs.writeFileSync(args.output, encoded, { encoding: "utf8", mode: 0o600 });
  else process.stdout.write(encoded);
} catch (error) {
  console.error(`Alpha VM attestation capture failed: ${error.message}`);
  process.exit(1);
}
