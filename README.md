# Swatch Party

A shared bridesmaid dress lineup with autosave, Azazie and Birdy Grey submissions, named palette snapshots, and landscape PDF export.

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

Paste an Azazie or Birdy Grey dress URL to add it. For Birdy Grey, use the product page for the exact fabric and shade, such as Violet Chiffon in Dark Mauve. Add another shade using **Edit dress → Add another color** and paste its product URL. Supported Birdy Grey links use the style-fabric-dress-color format.

Attach an optional transparent PNG or WebP (up to 3 MB) in **Add a dress** or **Edit dress**. The file applies to the shade selected in the form. Use the photo for that exact shade. Save the lineup to share it with other devices. The cutout appears over the backdrop and in the PDF. If a shade has neither an uploaded cutout nor a catalog photo, the preview shows that a cutout is pending.

Use **Set backdrop** to upload the shared background.

### Publish a reusable catalog cutout

Use the CLI to make an exact variant available to every lineup. Install ImageMagick. On macOS 14 or later with Xcode Command Line Tools, the script can generate the cutout with Apple Vision. On other platforms, supply an existing transparent cutout as the third argument.

```sh
npm run add-color -- '<dress URL>' - '<transparent cutout.png>'
npm run add-color -- '<dress URL>' '<official photo URL>'
```

The dash reads the official product page image. If its metadata can't verify the style and shade, pass the official photo URL as shown in the second example. The script validates the retailer's image host and rejects opaque cutouts. Review the original and transparent WebP in `public/` for the exact style, fabric, and shade before committing those assets and the catalog entry. Bundle only photos you have permission to use.

### Add another retailer

Register a retailer in `public/retailers.js`. Its adapter supplies its product hosts and path rules, parser for style/fabric/shade, catalog key, listing link, and permitted image origins. Keep the style key independent of shade and include fabric where the retailer sells the same style in multiple fabrics. Add fixtures for multiple shades, a different fabric, and rejected lookalike domains. The catalog, shared workspace, lineup, and PDF use the same adapter-backed data.
