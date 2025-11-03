# WhatsApp Web JS Service

A minimal wrapper around `whatsapp-web.js` to provide QR codes and session management via HTTP and Server-Sent Events (SSE).

## Endpoints

- `POST /sessions/:id/start` — initialize/start a session (id can be your QR session id)
- `GET /sessions/:id/qr` — SSE stream; emits `qr` (dataUrl) repeatedly and `linked` when authenticated
- `POST /sessions/:id/logout` — logout & cleanup
- `GET /health` — health check

## Running locally

```bash
# From repo root (PowerShell)
npm run whatsapp:dev
```

This starts the service on `http://localhost:4000`.

In your Next.js app, set:

```
WA_QR_PROVIDER=whatsapp-web-js
WHATSAPP_SERVICE_URL=http://localhost:4000
```

Then run your Next.js app and open the QR screen.

## Deploy on Render (recommended)

1. Commit this repo to GitHub (done).
2. In Render, “New +” > “Blueprint”. Point to this repo.
3. Render will auto-detect `render.yaml` and set up the service.
4. Create or confirm a Disk mounted at `/app/.wwebjs_auth` (Render will do this from `render.yaml`).
5. Deploy.

After deployment, set these variables in Vercel (Production):

```
WA_QR_PROVIDER=whatsapp-web-js
WHATSAPP_SERVICE_URL=https://<your-render-service>.onrender.com
```

## Notes

- This service uses Chromium installed in the container. The Dockerfile sets `PUPPETEER_EXECUTABLE_PATH` accordingly.
- The LocalAuth directory is mounted on a persistent disk so sessions survive restarts.
- For multiple tenants, use distinct `:id` values.
