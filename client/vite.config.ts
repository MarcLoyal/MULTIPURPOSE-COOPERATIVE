import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// On a Vercel preview deployment, point the client at this same branch's
// SERVER preview instead of production. VERCEL_ENV and
// VERCEL_GIT_COMMIT_REF are provided automatically by Vercel to every
// build (no setup needed); VITE_PREVIEW_SERVER_URL_TEMPLATE is the one
// thing to configure once, e.g.
// "https://multipurpose-cooperative-server-git-{branch}-<team>.vercel.app"
// (see server/.env.example's CLIENT_PREVIEW_ORIGIN_TEMPLATE for the
// matching piece on the server side).
function computePreviewApiUrl(): string {
  if (process.env.VERCEL_ENV !== "preview") return "";
  const branch = process.env.VERCEL_GIT_COMMIT_REF;
  const template = process.env.VITE_PREVIEW_SERVER_URL_TEMPLATE;
  if (!branch || !template) return "";
  // Mirrors Vercel's own branch -> subdomain slugification. Very long
  // branch names may get hashed/truncated by Vercel in ways this doesn't
  // replicate — keep branch names short if preview linking matters.
  const slug = branch
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return template.replace("{branch}", slug);
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
  define: {
    __PREVIEW_API_URL__: JSON.stringify(computePreviewApiUrl()),
  },
});
