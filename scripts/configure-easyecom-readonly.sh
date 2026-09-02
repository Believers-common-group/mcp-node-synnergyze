#!/usr/bin/env bash
set -euo pipefail

CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/vsr"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/vsr/credential-receipts"
ENV_FILE="$CONFIG_DIR/easyecom-readonly.env"
mkdir -p "$CONFIG_DIR" "$STATE_DIR"
umask 077

read -r -p "EasyEcom getAllOrdersV2 HTTPS endpoint: " endpoint
case "$endpoint" in
  https://*) ;;
  *) echo "Endpoint must use https://" >&2; exit 1 ;;
esac

read -r -s -p "EasyEcom webhook token: " webhook_token; echo
read -r -s -p "EasyEcom API JWT: " api_jwt; echo
read -r -s -p "EasyEcom X-API-Key: " api_key; echo

for value_name in webhook_token api_jwt api_key; do
  if [ -z "${!value_name}" ]; then
    echo "Required credential is empty: $value_name" >&2
    exit 1
  fi
done

if command -v openssl >/dev/null 2>&1; then
  trigger_secret="$(openssl rand -hex 32)"
else
  trigger_secret="$(head -c 48 /dev/urandom | base64 | tr -d '\n' | tr '/+' '_-')"
fi

shell_quote() {
  printf '%q' "$1"
}

{
  printf 'export EASYECOM_GET_ALL_ORDERS_V2_URL=%s\n' "$(shell_quote "$endpoint")"
  printf 'export EASYECOM_WEBHOOK_TOKEN=%s\n' "$(shell_quote "$webhook_token")"
  printf 'export EASYECOM_API_JWT=%s\n' "$(shell_quote "$api_jwt")"
  printf 'export EASYECOM_X_API_KEY=%s\n' "$(shell_quote "$api_key")"
  printf 'export EASYECOM_BACKFILL_TRIGGER_SECRET=%s\n' "$(shell_quote "$trigger_secret")"
} > "$ENV_FILE"
chmod 600 "$ENV_FILE"

fingerprint() {
  printf '%s' "$1" | sha256sum | awk '{print substr($1,1,16)}'
}

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
receipt="$STATE_DIR/easyecom-readonly-$stamp.json"
cat > "$receipt" <<EOF
{
  "schema": "vsr.credential-admission-receipt/v1",
  "provider": "EasyEcom",
  "scope": "read-only-commerce-admission",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "config_file": "$ENV_FILE",
  "credentials": {
    "EASYECOM_WEBHOOK_TOKEN": {"fingerprint_sha256_16": "$(fingerprint "$webhook_token")"},
    "EASYECOM_API_JWT": {"fingerprint_sha256_16": "$(fingerprint "$api_jwt")"},
    "EASYECOM_X_API_KEY": {"fingerprint_sha256_16": "$(fingerprint "$api_key")"},
    "EASYECOM_BACKFILL_TRIGGER_SECRET": {"fingerprint_sha256_16": "$(fingerprint "$trigger_secret")"}
  }
}
EOF
chmod 600 "$receipt"

unset webhook_token api_jwt api_key trigger_secret

echo "EasyEcom read-only credentials admitted locally."
echo "Config: $ENV_FILE"
echo "Receipt: $receipt"
echo "Load for an Alpha shell with: source $ENV_FILE"
