import { app } from "../src/app";

// Vercel serverless entrypoint. Local dev still uses src/index.ts
// (app.listen) — this file is only imported when running on Vercel.
//
// An Express app is itself a valid (req, res) => void request handler
// (that's literally what app.listen passes to http.createServer), and
// Vercel's Node.js runtime invokes this file's default export with real
// (req, res) objects — so exporting `app` directly is both correct and
// sufficient.
//
// This file used to wrap `app` with serverless-http, which targets
// AWS Lambda/Azure's (event, context, callback) invocation shape —
// serverless-http's own README doesn't list Vercel as a supported
// provider. Fed real (req, res) instead of a Lambda event/context, its
// internal promise chain never resolved, so every request (including
// ones Express never even got to route, like /favicon.ico) hung until
// Vercel's platform-level function timeout killed it at 300s.
export default app;
