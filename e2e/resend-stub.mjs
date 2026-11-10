// A local stand-in for Resend's HTTP API in the end-to-end tests: it keeps
// what the app posts to /emails and shows it again on GET /emails. Nothing
// leaves the machine.
import { createServer } from "node:http";

const port = Number(process.env.RESEND_STUB_PORT ?? 3199);
const sent = [];

createServer((request, response) => {
  if (request.method === "GET" && request.url === "/emails") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(sent));
    return;
  }
  if (request.method === "POST" && request.url === "/emails") {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      const key = request.headers["idempotency-key"];
      const earlier = sent.find((email) => email.idempotencyKey === key);
      const id = earlier?.id ?? `stub_${sent.length + 1}`;
      if (!earlier) sent.push({ id, idempotencyKey: key, authorized: request.headers.authorization === "Bearer stub-not-a-key", ...JSON.parse(body) });
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ id }));
    });
    return;
  }
  // Playwright waits for this answer before the tests start.
  response.writeHead(request.url === "/" ? 200 : 404);
  response.end();
}).listen(port, "127.0.0.1");
