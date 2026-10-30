import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "8h",
  port: Number(process.env.PORT ?? 4000),
  // Comma-separated list so both the production frontend URL and any
  // Vercel preview-deployment URLs can be allowed at once.
  clientOrigins: (process.env.CLIENT_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  // Intentionally not `required()` — unset means first-time setup can
  // never succeed (every attempt fails closed, see setup.routes.ts),
  // not that the server refuses to start. Set once in Vercel, given
  // privately to the cooperative, removable after setup completes.
  setupCode: process.env.SETUP_CODE,
};
