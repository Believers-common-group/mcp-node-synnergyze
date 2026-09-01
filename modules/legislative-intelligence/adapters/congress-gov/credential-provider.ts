export interface CongressGovCredentialProvider {
  getApiKey(): Promise<string>;
  getAdmissionReceiptRef(): Promise<string>;
}

export class StaticTestCredentialProvider implements CongressGovCredentialProvider {
  constructor(
    private readonly key: string,
    private readonly receiptRef = "CREDENTIAL-RECEIPT:TEST",
  ) {}

  async getApiKey(): Promise<string> {
    return this.key;
  }

  async getAdmissionReceiptRef(): Promise<string> {
    return this.receiptRef;
  }
}
