// Root-level shim so Vercel's single-project, Root-Directory-at-repo-root
// deployment auto-detects this as the API's serverless function. The real
// code lives in server/api/index.ts — untouched, still used by the
// existing two-project deployment — this just re-exports it so there's
// exactly one implementation, not two to keep in sync.
export { default } from "../server/api/index";
