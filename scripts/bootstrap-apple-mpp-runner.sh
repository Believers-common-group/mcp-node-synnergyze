#!/usr/bin/env bash
set -euo pipefail

OUT_FILE="${1:-./apple-mpp-readiness.json}"
NODE_ID="${ALPHA_NODE_ID:-ALPHA-NODE-001}"
RUNNER_ID="${COMPUTE_APPLE_MPP_RUNNER_ID:-UNASSIGNED}"

fail() {
  local code="$1"
  local reason="$2"
  printf '{\n  "ok": false,\n  "node_id": "%s",\n  "runner_id": "%s",\n  "provider": "apple-mpp-local",\n  "status": "NOT_READY",\n  "reason": "%s"\n}\n' "$NODE_ID" "$RUNNER_ID" "$reason" | tee "$OUT_FILE"
  exit "$code"
}

[[ "$(uname -s)" == "Darwin" ]] || fail 20 "requires-macos-apple-runner"
[[ "$(uname -m)" == "arm64" ]] || fail 21 "requires-apple-silicon-arm64"

command -v xcodebuild >/dev/null 2>&1 || fail 22 "xcode-not-installed"
command -v xcrun >/dev/null 2>&1 || fail 23 "xcrun-not-available"

XCODE_VERSION="$(xcodebuild -version | awk 'NR==1 {print $2}')"
XCODE_MAJOR="${XCODE_VERSION%%.*}"
[[ "$XCODE_MAJOR" =~ ^[0-9]+$ ]] || fail 24 "unable-to-read-xcode-version"
(( XCODE_MAJOR >= 26 )) || fail 25 "xcode-26-or-later-required"

METAL_BIN="$(xcrun -f metal 2>/dev/null || true)"
[[ -n "$METAL_BIN" && -x "$METAL_BIN" ]] || fail 26 "metal-compiler-not-found"

SDK_PATH="$(xcrun --sdk macosx --show-sdk-path 2>/dev/null || true)"
[[ -n "$SDK_PATH" && -d "$SDK_PATH" ]] || fail 27 "macos-sdk-not-found"

CHIP="$(system_profiler SPHardwareDataType 2>/dev/null | awk -F': ' '/Chip:/ {print $2; exit}')"
[[ -n "$CHIP" ]] || fail 28 "unable-to-identify-apple-chip"

case "$CHIP" in
  *M5*) ;;
  *) fail 29 "m5-family-runner-required-for-current-alpha-mpp-profile" ;;
esac

cat >"$OUT_FILE" <<JSON
{
  "ok": true,
  "node_id": "$NODE_ID",
  "runner_id": "$RUNNER_ID",
  "provider": "apple-mpp-local",
  "status": "TOOLCHAIN_READY",
  "hardware": "$CHIP",
  "architecture": "$(uname -m)",
  "xcode_version": "$XCODE_VERSION",
  "metal_compiler": "$METAL_BIN",
  "sdk_path": "$SDK_PATH",
  "activation_allowed": false,
  "next_gate": "warden-enrolment-and-synthetic-mpp-workload-proof"
}
JSON

cat "$OUT_FILE"
printf '\nApple MPP toolchain readiness passed. Provider remains fail-closed until Warden enrolment and the synthetic MPP workload proof complete.\n'
