import type { IncomingMessage, ServerResponse } from "http";

// Deliberately standalone: no Express, no serverless-http, no Prisma, no
// import from src/ at all. Vercel treats every file under api/ as its own
// independent function, so this one can't hang for any reason app.ts or
// its import chain could — if /api/ping doesn't respond immediately, the
// problem is Vercel's function invocation itself (cold start, region,
// account-level issue), not this app's code.
export default function handler(_req: IncomingMessage, res: ServerResponse) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ status: "ok", pong: true, at: new Date().toISOString() }));
}
