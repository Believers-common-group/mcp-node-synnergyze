export default function handler(
  _request: unknown,
  response: { status: (code: number) => { json: (body: unknown) => void } },
) {
  response.status(200).json({
    status: "ok",
    service: "mcp-node-synnergyze",
    transport: "http",
  });
}
