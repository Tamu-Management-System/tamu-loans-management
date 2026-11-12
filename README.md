# Tamu Loans — frontend

Loan Management & Accounting System for Tamu Cleaning Services, built by KadoshDev.
React + TypeScript + Vite. It talks to the backend API (`loan-app-rest-api`) only; there is no mock API or sample data in this repository.

## Run it

You need the backend's address (for example the deployed one, `https://loan-app-rest-api.onrender.com`):

```bash
npm install
printf 'VITE_API_URL=/api\nAPI_PROXY_TARGET=https://loan-app-rest-api.onrender.com\n' > .env.local   # git-ignored
npm run dev          # http://localhost:5173, with /api passed on to the backend
npm run build        # production build; refuses to run without VITE_API_URL
npm run lint
```

How the address is given, and why `/api` is passed through the frontend, is in
[docs/running-against-the-backend.md](docs/running-against-the-backend.md).

Hosting (Vercel): `vercel.json` runs `npm run build` and rewrites `/api/*` to the backend; set `VITE_API_URL=/api` in the project's
environment settings. Every other address is served `index.html` so links into the app work directly.

Sign-in is the staff email and password, as set by the backend.

## Layout

```
src/
  api/          The one place that talks to the backend (client.ts) and the route table (backendRoutes.ts)
  app/          App entry, providers, routes, menu (navigation.ts)
  auth/         Session, sign-in guard, permissions, can(), idle timeout
  components/   Shared UI: layout shell, buttons, dialogs, toasts, icons
  lib/          Formatting and small hooks
  modules/      One folder per proposal module, added as screens are built
  pages/        Top-level pages
  styles/       Design tokens and global styles
docs/
  api-contract.md              Every endpoint the frontend uses, and what each screen expects
  backend-mapping.md           What the backend covers, and what is missing
  backend-review.md            A read-through of the backend code: what matches, what to fix
  running-against-the-backend.md   How the screens reach the backend
  security.md                  Security: what the frontend does, and what the backend and hosting must do
```

## Rules of the codebase

- **Data goes through `src/api/client.ts`**, never `fetch()` in a component.
- **Check permissions, not roles:** `can("loans.approve")`, never `role === "finance"`.
  Custom roles then work without code changes.
- **New endpoint?** Add it to `docs/api-contract.md`, to the route table in `src/api/backendRoutes.ts`, and make sure the backend has it.
- **Colours and sizes** come from `src/styles/tokens.css`.
- **No business numbers in code:** limits, thresholds and defaults live in Settings.

## Security

This is a financial system. Read [docs/security.md](docs/security.md) before changing sign-in, sessions,
permissions or the build, and before any release.

## Design reference

The approved design is the mockup `../loan_dashboard_v2.html`. Screens are rebuilt from it as components.
