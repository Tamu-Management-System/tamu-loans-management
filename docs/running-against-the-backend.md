# Running the frontend against the backend

The screens talk to the backend only through `src/api/client.ts`. Every call is first turned into the backend's own route by `src/api/backendRoutes.ts`, so no screen knows the difference.

## Switching it on

There are two ways to give the screens the backend's address. **Use the first**: it keeps people signed in after a page reload.

**1. Through the frontend's own address (recommended).** The frontend passes `/api` on to the backend, so the browser sees one site.

| Setting | Value | Where |
|---|---|---|
| `VITE_API_URL` | `/api` | `.env.local` (development) or the hosting's environment settings (build) |
| `API_PROXY_TARGET` | the backend's address, for example `https://loan-app-rest-api.onrender.com` | `.env.local`, for `npm run dev` only |

- In development, Vite passes `/api` on to `API_PROXY_TARGET` (`vite.config.ts`).
- On Vercel, `vercel.json` rewrites `/api/*` to the backend (change the address there if the backend moves).
- The backend needs no CORS setting for this, because the browser only talks to the frontend's own address.

**2. Directly to the backend.** `VITE_API_URL=https://loan-app-rest-api.onrender.com/api`, and the backend's `CORS_ORIGINS` must list the frontend's address. This works for signing in, but the sign-in cookie is `SameSite=Lax` and is not sent between two different sites, so **a page reload signs the person out**. See `docs/backend-review.md`, item 6.

`npm run build` refuses to run without `VITE_API_URL`.

On the backend side (its own settings, not in this repo):

- `FRONTEND_URL` is what the invite, reset and online-form links are built from (`/set-password/<token>`, `/forms/<token>`), so it must be the frontend's public address.
- `NODE_ENV=production` on the live server (it makes the sign-in cookie `Secure`; the live server currently does not send `Secure`).
- `CORS_ORIGINS` must be the frontend's address, never `*`. The live server currently answers any website.

## How a call is translated

- A read the screens make as `GET /loans/list?status=active&page=2` becomes `POST /api/private/Loans/list/query` with `{ "query": { "status": "active", "page": 2 } }`.
- A change keeps its method and body and only gets the backend's path (`POST /applications/APP-1/approve` becomes `POST /api/private/LoanApplications/APP-1/decision/approve`).
- Downloads (documents, CSV, PDF) stay a `GET` with their query string.
- The full table is the `RULES` list in `backendRoutes.ts`. It was checked against every row of `docs/frontend-mapping.md` in the backend repository (all 90 match) and against every call the screens make. The mock API that used to stand in for the backend was removed afterwards (git history, commit `ff3cc8e`).

## Signing in

- `POST /api/public/account/login` with `{ username, password }` (the staff email is the username). The answer's `content.idToken` is kept in memory only and sent as `Authorization: Bearer`.
- The backend also sets a `Refresh` cookie (HTTP-only). After a reload, or when the token ends, the client calls `POST /api/public/account/refresh` once, shares that one renewal between all waiting calls, and repeats the call that got the 401.
- The cookie is `SameSite=Lax`, so it is only sent when the browser sees the frontend and the API as one site. That is why the recommended setup passes `/api` through the frontend (or the two share a domain such as `app.` and `api.`).

## Not available from the backend yet

- Profile photos (`/me/photo` is not built on the backend). The profile page shows the initials only.
