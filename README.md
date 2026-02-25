# Quiz Creator

Minimal quiz creation website (Node + Express backend, static frontend).

Run locally:

```bash
npm install
npm start
```

Open http://0.0.0.0:80 in your browser.

## HTTPS (Optional)

To run with HTTPS, set certificate/key paths before starting:

```bash
set SSL_KEY_PATH=C:\path\to\key.pem
set SSL_CERT_PATH=C:\path\to\cert.pem
set HTTPS_PORT=443
set HTTP_PORT=80
npm start
```

Optional env vars:

- `SSL_CA_PATH` (CA bundle, if needed)
- `ENABLE_HTTP_REDIRECT=false` to disable HTTP -> HTTPS redirect

If cert files are not configured or not found, the server falls back to HTTP on `PORT` (default `3000`).

## Prompt Quiz Generation (No API)

Create/edit pages include a built-in prompt generator that creates a starter quiz locally.
No external API key is required.

You can also generate a draft quiz from a study guide PDF on create/edit pages.
