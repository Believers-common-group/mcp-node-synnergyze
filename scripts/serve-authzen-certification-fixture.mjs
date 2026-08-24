import { createServer } from "node:http";

import handler, { AUTHZEN_CERTIFICATION_ROUTE_MAP } from "../api/authzen-cert.ts";

const host = process.env.AUTHZEN_CERT_HOST ?? "127.0.0.1";
const port = Number(process.env.AUTHZEN_CERT_PORT ?? "4010");
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
  throw new Error("AUTHZEN_CERT_PORT must be a valid TCP port");
}

const routeByPublicPath = new Map(
  Object.entries(AUTHZEN_CERTIFICATION_ROUTE_MAP).map(([route, path]) => [path, route]),
);

const server = createServer(async (request, response) => {
  try {
    const incoming = new URL(request.url ?? "/", `http://${request.headers.host ?? `${host}:${port}`}`);
    const route = routeByPublicPath.get(incoming.pathname);
    if (!route) {
      response.statusCode = 404;
      response.setHeader("content-type", "application/problem+json; charset=utf-8");
      response.end(
        JSON.stringify({
          type: "urn:openid:authzen:error:not_found",
          title: "unknown_certification_path",
          status: 404,
        }),
      );
      return;
    }

    request.url = `/api/authzen-cert?route=${encodeURIComponent(route)}`;
    request.headers["x-forwarded-proto"] = "http";
    request.headers["x-forwarded-host"] = request.headers.host ?? `${host}:${port}`;
    await handler(request, response);
  } catch (error) {
    response.statusCode = 500;
    response.setHeader("content-type", "application/problem+json; charset=utf-8");
    response.end(
      JSON.stringify({
        type: "urn:openid:authzen:error:server_error",
        title: "authzen_local_fixture_error",
        status: 500,
        detail: error instanceof Error ? error.message : "unknown_error",
      }),
    );
  }
});

server.listen(port, host, () => {
  console.log(`AUTHZEN-CERT-FIXTURE listening http://${host}:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
