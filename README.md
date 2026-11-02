# Tamu Loans — frontend

Loan Management & Accounting System for Tamu Cleaning Services, built by KadoshDev.
React + TypeScript + Vite. The backend is built separately; until it's ready, a mock API
(MSW) runs in the browser and answers `/api` requests with sample data.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173, with the mock API and demo tools
npm run build        # production build: NO mock API, sample data or demo tools
npm run build:demo   # build WITH the mock API, for client presentations only
npm run lint
```

Demo sign-in (dev and demo builds only): any demo account on the login page, password `tamu2026`.

## How it's organised

```
src/
  api/          API client (the only place that calls fetch), response types, data hooks
  app/          App entry, providers, routes, menu (navigation.ts), feature flags
  auth/         Session, sign-in guard, permissions, can(), idle timeout
  components/   Shared UI: layout shell, buttons, dialogs, toasts, icons
  lib/          Formatting and small hooks
  modules/      One folder per proposal module, added as screens are built
  pages/        Top-level pages
  mocks/        Mock API: sample data + endpoint handlers (removed when the backend is live)
  demo/         TEMPORARY demo controls for client presentations
  styles/       Design tokens and global styles
docs/
  api-contract.md   Every endpoint the frontend uses: the backend developer's spec
  security.md       Security: what the frontend does, and what the backend and hosting must do
```

## Rules of the codebase

- **Data goes through `src/api/client.ts`**, never `fetch()` in a component.
- **Check permissions, not roles:** `can("loans.approve")`, never `role === "finance"`.
  Custom roles then work without code changes.
- **New endpoint?** Add it to `docs/api-contract.md` and a matching handler in `src/mocks/handlers.ts`.
- **Colours and sizes** come from `src/styles/tokens.css`.
- **Phase 2 features** (Modules 3 & 4) are marked `release: "phase-2"` and shown as "Coming soon"
  unless "Show Phase 2" is on in the demo controls.

## Switching to the real backend

Production builds (`npm run build`) never include the mock API. Point them at the backend with `.env.production.local`:

```
VITE_API_URL=https://api.example.com
```

To use the real backend during development, create `.env.local` with the same `VITE_API_URL` and `VITE_USE_MOCKS=false`.

## Security

This is a financial system. Read [docs/security.md](docs/security.md) before changing sign-in, sessions,
permissions or the build, and before any release.

## Design reference

The approved design is the mockup `../loan_dashboard_v2.html`. Screens are rebuilt from it as components.
