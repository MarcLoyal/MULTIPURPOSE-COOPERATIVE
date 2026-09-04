import serverless from "serverless-http";
import { app } from "../src/app";

// Vercel serverless entrypoint. Local dev still uses src/index.ts
// (app.listen) — this file is only imported when running on Vercel.
export default serverless(app);
