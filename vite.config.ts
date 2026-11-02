import { rm } from "node:fs/promises";
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
  const apiOrigin = env.VITE_API_URL ? new URL(env.VITE_API_URL).origin : "";
  // Demo builds show sample photos from these hosts; real photos come from the API
  const demoImageHosts = env.VITE_USE_MOCKS === "true" ? "https://images.unsplash.com https://ca.slack-edge.com" : "";
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    // 'unsafe-inline' is needed for React style attributes (e.g. progress-bar widths)
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    // blob: = documents the app has fetched with the session and previews in place (see DocumentPreviewDialog)
    `img-src 'self' data: blob: ${apiOrigin} ${demoImageHosts}`,
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

/**
 * Production builds without the mock API must not publish the mock worker file
 * (public/ is always copied into the build).
 */
function removeMockWorker(mockApiEnabled: boolean): Plugin {
  return {
    name: "remove-mock-worker",
    apply: "build",
    async closeBundle() {
      if (!mockApiEnabled) await rm("dist/mockServiceWorker.js", { force: true });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  // Mock API on in development (unless VITE_USE_MOCKS=false); off in builds unless VITE_USE_MOCKS=true.
  // A fixed true/false at build time, so a normal production build drops all mock and demo code.
  const mockApiEnabled = command === "serve" ? env.VITE_USE_MOCKS !== "false" : env.VITE_USE_MOCKS === "true";
  return {
    define: { __MOCK_API_ENABLED__: JSON.stringify(mockApiEnabled) },
    plugins: [react(), contentSecurityPolicy(env), removeMockWorker(mockApiEnabled)],
    build: {
      // No source maps in production: they would publish the readable source code
      sourcemap: false,
    },
  };
});
