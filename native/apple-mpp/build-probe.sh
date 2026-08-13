#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC="$ROOT_DIR/native/apple-mpp/AlphaMppGemmProbe.metal"
OUT_DIR="${ALPHA_MPP_BUILD_DIR:-$ROOT_DIR/.alpha/mpp-build}"
IR="$OUT_DIR/AlphaMppGemmProbe.ir"
LIB="$OUT_DIR/AlphaMppGemmProbe.metallib"
EVIDENCE="$OUT_DIR/compile-evidence.json"
NODE_ID="${ALPHA_NODE_ID:-ALPHA-NODE-001}"
RUNNER_ID="${COMPUTE_APPLE_MPP_RUNNER_ID:-UNASSIGNED}"

mkdir -p "$OUT_DIR"

fail() {
  local code="$1"
  local reason="$2"
  printf '{\n  "ok": false,\n  "node_id": "%s",\n  "runner_id": "%s",\n  "provider": "apple-mpp-local",\n  "proof_stage": "COMPILE",\n  "reason": "%s",\n  "activation_allowed": false\n}\n' \
    "$NODE_ID" "$RUNNER_ID" "$reason" | tee "$EVIDENCE"
  exit "$code"
}

[[ "$(uname -s)" == "Darwin" ]] || fail 40 "requires-macos"
[[ "$(uname -m)" == "arm64" ]] || fail 41 "requires-apple-silicon-arm64"
command -v xcrun >/dev/null 2>&1 || fail 42 "xcrun-not-found"
command -v xcodebuild >/dev/null 2>&1 || fail 43 "xcodebuild-not-found"
[[ -f "$SRC" ]] || fail 44 "probe-source-missing"

METAL_BIN="$(xcrun -sdk macosx -f metal 2>/dev/null || true)"
[[ -n "$METAL_BIN" ]] || fail 45 "metal-compiler-not-found"

XCODE_VERSION="$(xcodebuild -version | awk 'NR==1 {print $2}')"
CHIP="$(system_profiler SPHardwareDataType 2>/dev/null | awk -F': ' '/Chip:/ {print $2; exit}')"
[[ -n "$CHIP" ]] || fail 46 "apple-chip-undetected"

rm -f "$IR" "$LIB"
xcrun -sdk macosx metal -c "$SRC" -o "$IR"
xcrun -sdk macosx metal "$IR" -o "$LIB"

[[ -s "$IR" ]] || fail 47 "metal-ir-not-produced"
[[ -s "$LIB" ]] || fail 48 "metallib-not-produced"

SOURCE_SHA="$(shasum -a 256 "$SRC" | awk '{print $1}')"
LIB_SHA="$(shasum -a 256 "$LIB" | awk '{print $1}')"

cat >"$EVIDENCE" <<JSON
{
  "ok": true,
  "node_id": "$NODE_ID",
  "runner_id": "$RUNNER_ID",
  "provider": "apple-mpp-local",
  "proof_stage": "COMPILE",
  "hardware": "$CHIP",
  "architecture": "$(uname -m)",
  "xcode_version": "$XCODE_VERSION",
  "metal_compiler": "$METAL_BIN",
  "source_sha256": "$SOURCE_SHA",
  "metallib_sha256": "$LIB_SHA",
  "metallib": "$LIB",
  "activation_allowed": false,
  "next_gate": "native-dispatch-and-result-verification"
}
JSON

cat "$EVIDENCE"
printf '\nCompile gate passed. This is not an MPP execution proof and does not activate the provider.\n'
