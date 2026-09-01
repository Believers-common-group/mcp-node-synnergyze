import { CongressGovClientV1 } from "../modules/legislative-intelligence/adapters/congress-gov/client.ts";
import { WindowsDpapiCongressGovCredentialProviderV1 } from "../modules/legislative-intelligence/adapters/congress-gov/credential-provider.ts";

const credentials = new WindowsDpapiCongressGovCredentialProviderV1();
const client = new CongressGovClientV1(credentials);
const health = await client.health();

const output = {
  sourceSystem: health.sourceSystem,
  ok: health.ok,
  ...(health.httpStatus !== undefined ? { httpStatus: health.httpStatus } : {}),
  credentialAdmissionRef: health.credentialAdmissionRef,
  ...(health.credentialFingerprintPrefix
    ? { credentialFingerprintPrefix: health.credentialFingerprintPrefix }
    : {}),
  checkedAt: health.checkedAt,
  ...(!health.ok && health.errorCode ? { errorCode: health.errorCode } : {}),
};

console.log(JSON.stringify(output, null, 2));
if (!health.ok) process.exitCode = 1;
