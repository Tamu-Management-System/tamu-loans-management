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

Hosting (Vercel): `vercel.json` runs `npm run build:demo`, so the hosted site is the demo with the mock API
and sample data, until the backend exists. When it does, change `buildCommand` to `npm run build` and point
`VITE_API_URL` at the backend. Every address is served `index.html` so links into the app work directly.

Demo sign-in (dev and demo builds only): any demo account on the login page, password `tamu2026`.

Demo limits (there is no server, so the "server" lives in each browser): data you add stays in that browser and resets on
reload. An online application link is a plain random token, like the real one, so it only opens in the browser (and
profile) that made it: not in incognito, another browser or on a phone. The real backend fixes this, and nothing about
the link changes when it arrives.

The demo has no email either: when an admin invites someone, resends an invite or sends a reset link, the "email" is printed
in the browser console (look for `[demo email]`). Open that link in the same browser to try the "Set your password" page.
New accounts made this way can't actually sign in to the demo (the demo only knows its sample accounts).

Sample "Set your password" links (they open in any browser; add one to the site address, e.g. `http://localhost:5173/set-password/<token>`):

| Screen | Token |
|---|---|
| Invite, for Grace | `lF9s8BLc0oh5BgGK4oLFQmXQB7y7rurvQWwqPSmVSSs` |
| Password reset, for Sarah | `x4dDv2BLme-koAhRc4WDrukxuEq6fIHZMBUvMtJaJiU` |
| Expired link | `eJo0EOOMurRsR-Agqo30Uvn_Iwt4L5u7cT1E3NjckB4` |
| Already-used link | `RNI7fBvwCqY0ax1C8FTWoLyutlLrNfO6HOlW--7Axcg` |

Setting a password with the first two uses the link up in that browser (clear the site's data to reset it).

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
