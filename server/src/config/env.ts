import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Optional: a template for this project's own client preview URLs, e.g.
// "https://multipurpose-cooperative-git-{branch}-<team>.vercel.app" (the
// exact pattern Vercel gives each branch — check an actual preview deploy
// for your project/team slug). When set, any origin matching it for *any*
// branch is allowed by CORS, in addition to the static CLIENT_ORIGIN
// list — so every PR's preview client can reach this server without
// hand-adding its URL per PR, while origins that don't match this
// project's own hostname pattern are still rejected.
function compilePreviewOriginRegex(template?: string): RegExp | undefined {
  if (!template) return undefined;
  const BRANCH_SENTINEL = "@@BRANCH@@";
  const withSentinel = template.replace("{branch}", BRANCH_SENTINEL);
  const escaped = withSentinel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = escaped.replace(BRANCH_SENTINEL, "[a-z0-9-]+");
  return new RegExp(`^${pattern}$`, "i");
}

export const env = {
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "8h",
  port: Number(process.env.PORT ?? 4000),
  // Comma-separated list for origins known up front (local dev, production).
  clientOrigins: (process.env.CLIENT_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  previewClientOriginRegex: compilePreviewOriginRegex(process.env.CLIENT_PREVIEW_ORIGIN_TEMPLATE),
};
