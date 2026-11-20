# Swatch Party

A shared bridesmaid dress lineup with autosave, Azazie submissions, named palette snapshots, and landscape PDF export.

## Local preview

Use Node.js 24 or newer.

```sh
npm ci
npm run dev
```

Open the workspace link printed by the server. The local database and workspace key are stored in the ignored `.data/` directory. Another browser can open the same link on this machine. For access from your phone on the same network, run `SWATCH_HOST=0.0.0.0 npm run dev` and replace localhost with your computer's LAN address.

```sh
npm test
npm run build
```

## Vercel

Import the repository or deploy the folder with the Vercel CLI. The project configuration serves `public/` and the workspace API. Set these environment variables before the first preview deployment:

- `DATABASE_URL` for a Neon Postgres database. The workspace API creates its two tables on first access. Use a separate database or branch for preview testing.
- `SWATCH_WORKSPACE_KEY` to a random value of at least 24 characters. Generate one with `openssl rand -hex 24`. Share the app URL with `#workspace=YOUR_KEY` appended. Anyone with that link has edit access.

The local SQLite workspace and deployed Postgres workspace are separate stores. Bundle and host assets you have rights to use. Uploaded photos are private to the workspace API.

## Photo previews

Verified Azazie photos are bundled with transparent cutouts. The picker offers only variants in the verified catalog. Each has the exact official style, fabric, and shade listing and a full-length cutout. An unfamiliar submission can be saved for later verification. It becomes selectable when its exact catalog entry is added. Previously selected combinations without an exact match show an empty preview. The lineup and PDF use exact catalog photos only.

Use **Set backdrop** to upload the shared background. The Mountain Terrace candidate is not bundled.
