import { createPrivateKey, sign } from "node:crypto";

export interface ProducerSignatureEnvelopeV1 {
  alg: "Ed25519";
  key_id: string;
  signature: string;
}

export interface ProducerSigningInputV1 {
  privateKeyPem: string;
  keyId: string;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, canonicalize(record[key])]),
    );
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("non-finite numbers are not allowed in signed receipts");
  }
  return value;
}

export function canonicalReceiptBytes(receipt: object): Buffer {
  const unsigned = { ...(receipt as Record<string, unknown>) };
  delete unsigned.producer_signature;
  return Buffer.from(JSON.stringify(canonicalize(unsigned)), "utf8");
}

export function signProducerReceipt<T extends object>(
  receipt: T,
  signing: ProducerSigningInputV1,
): T & { producer_signature: ProducerSignatureEnvelopeV1 } {
  if (!signing.keyId?.trim()) throw new Error("producer key id is required");
  if (!signing.privateKeyPem?.trim()) throw new Error("producer private key is required");

  const privateKeyPem = signing.privateKeyPem.replace(/\\n/g, "\n");
  const key = createPrivateKey(privateKeyPem);
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error("producer key must be Ed25519");
  }

  const signature = sign(null, canonicalReceiptBytes(receipt), key).toString("base64url");
  return {
    ...receipt,
    producer_signature: {
      alg: "Ed25519",
      key_id: signing.keyId.trim(),
      signature,
    },
  };
}
