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

Verified Azazie photos are bundled with transparent cutouts for the exact style, fabric, and shade. Adding a color link makes its swatch selectable immediately. Selecting a shade with a pending photo shows a message in the preview. The app checks for catalog updates every few seconds while that preview is visible and replaces the message when the exact cutout is available. Photos and cutouts are published through the catalog. The lineup and PDF use exact catalog photos only.

Use **Set backdrop** to upload the shared background. The Mountain Terrace candidate is not bundled.

To publish an exact photo for a new shade, open the matching Azazie listing in a browser and copy its main photo URL from the page's `og:image` tag. Use the full-size image from that listing. The script checks the URL and image size, so visually confirm that the photo matches the style, fabric, and shade before publishing.

On a Mac with Xcode Command Line Tools and ImageMagick installed, run:

```sh
npm run add-color -- '<Azazie listing URL>' '<official Azazie photo URL>'
```

The script downloads directly from the Azazie image CDN. It tries the full-resolution `origin` image first and falls back to the supplied CDN URL. It saves the photo and transparent cutout under `public/` and adds the shade to the catalog. Review the cutout, then commit the catalog and its two image files and push to deploy. This workflow runs locally.
