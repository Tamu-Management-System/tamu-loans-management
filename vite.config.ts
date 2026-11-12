import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Content Security Policy for production builds: the browser only loads scripts, styles,
 * fonts, images and API calls from the sources listed here, which limits the damage if
 * malicious content is ever injected. Not used by `npm run dev` (it needs inline scripts
 * for live reload). Headers the hosting must add on top (frame-ancestors, HSTS, …) are
 * listed in docs/security.md.
 */
function contentSecurityPolicy(env: Record<string, string>): Plugin {
  // A relative address (/api) is served from this site, so it needs nothing extra; only a full address adds a source
  const apiOrigin = /^https?:\/\//.test(env.VITE_API_URL ?? "") ? new URL(env.VITE_API_URL).origin : "";
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    // 'unsafe-inline' is needed for React style attributes (e.g. progress-bar widths)
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    // blob: = documents the app has fetched with the session and previews in place (see DocumentPreviewDialog)
    `img-src 'self' data: blob: ${apiOrigin}`,
    "frame-src blob:",
    `connect-src 'self' ${apiOrigin}`,
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ]
    .map((directive) => directive.replace(/\s+/g, " ").trim())
    .join("; ");

  return {
    name: "content-security-policy",
    apply: "build",
    transformIndexHtml: () => [{ tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: policy }, injectTo: "head-prepend" }],
  };
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  // A build with no API address would call its own host for the API and fail in confusing ways, so refuse it
  if (command === "build" && !env.VITE_API_URL) throw new Error("Set VITE_API_URL to the backend's API address (for example https://api.tamu.example/api) before building.");
  // `npm run dev` can serve the backend under this site's own /api (VITE_API_URL=/api). Then the browser sees one site, so the
  // backend's HTTP-only sign-in cookie is kept and a page reload doesn't sign people out. (Not VITE_-prefixed: the browser never gets it.)
  const apiTarget = loadEnv(mode, process.cwd(), "").API_PROXY_TARGET;
  return {
    server: apiTarget ? { proxy: { "/api": { target: apiTarget, changeOrigin: true, secure: true } } } : undefined,
    plugins: [react(), contentSecurityPolicy(env)],
    build: {
      // No source maps in production: they would publish the readable source code
      sourcemap: false,
    },
  };
});
