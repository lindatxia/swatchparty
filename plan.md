# Swatch Party implementation plan

Status: Draft for review

## Outcome

Help the wedding party compare real dress options in a shared lineup, choose a cohesive palette, and export the result. A bridesmaid should be able to submit three Azazie links from her phone. The bride should be able to open the same workspace on another device, switch between those options, and see both dresses against the same venue backdrop.

Everyone with the shared workspace link can view, add, edit, and delete. The first release uses one workspace link and no accounts or role system.

## Starting point

The local repo is a static HTML, CSS, and JavaScript prototype. `index.html` defines the page, `style.css` defines its layout, and `studio.js` holds the color catalog, sample preferences, presets, previews, and URL-based share state. Reuse the palette data and the independent style and color controls. Seed the shared workspace with verified options using stable IDs. Leave missing sizes, product links, and picks blank until supplied.

## Proposed architecture

- Keep the existing HTML, CSS, and JavaScript frontend. Serve JSON endpoints with Vercel Functions under `api/` and put the schema and seed script under `db/`. Use Neon Postgres for shared state and managed object storage for preview images.
- Store the workspace and its draft, bridesmaids, dress options, and named lineup snapshots. Store each option's submitted URL, style, color, size, and preview asset reference. Store a copy of the chosen labels, link, and asset references in each saved lineup so later edits or deletions cannot alter it.
- Use a high-entropy workspace link as the shared access key. Check workspace access on reads and writes and keep secrets server-side. Anyone with the link can see sizes and make edits. Leave sizes out of the PDF.
- Keep compatibility with existing URL-encoded lineups where their selections can be mapped. Open an old link as a preview so visiting it can't overwrite the shared draft.

## Build sequence

### 1. Prove the Azazie photo and color flow

Try representative URLs from the current lineup, including a color query parameter, a color in the product slug, a size parameter, and a link the catalog will not serve. Read the color when available and show it for confirmation. Keep the size field editable. Confirm that the image belongs to the submitted style and color before presenting it as exact.

Seed a small photo catalog by opening each Azazie product URL in a browser, verifying the displayed style and color, and saving the matching full-length image from the product CDN. Velma in Ganache (89722501) and Alexia in Sea Moss (120694489) both yielded verified 600 × 830 catalog images. Look up the product ID and selected color on submission so known picks need only one paste. For an unfamiliar option, attempt approved product and image hosts with limits on redirects, download size, and processing time. If the product page cannot be read, save the option and let the group paste the direct photo URL or attach a photo. Prove that full-length cutouts preserve the hem and transparent edges from a small set of representative dress photos before choosing a cutout service or library.

### 2. Ship a shared submission and comparison flow

- Add **Add a dress from a link** beneath each bridesmaid's column. The form starts with that bridesmaid selected and supports multiple options, including the same style in different colors. Add edit, delete, and undo for submissions.
- Show one model per bridesmaid and one row per submitted style, with selectable swatches from the approved Azazie colors. A style change preserves the selected color where possible. A color change keeps the selected style, and both leave the rest of the lineup in place.
- Show **View on Azazie** for the exact selection when its product link is known. Otherwise show **View original on Azazie** when an original link is available. Open links in a new tab. Treat submitted sizes as preferences.
- Autosave every completed workspace change, including draft selections, palette and backdrop changes, and submission edits. Keep updates responsive on screen and persist them to the server. Display **Saving…**, **Saved**, or **Couldn’t save · Retry**, and show **Last saved at** from the server using the viewer's local time. Keep the last successful timestamp and the pending edit when a save fails.
- Save targeted edits. Use a version check for concurrent edits to the same option or selection so a stale browser cannot silently overwrite a newer edit. Refresh shared state when the app is reopened or the tab regains focus.

### 3. Apply the design and add named lineups

- Use the rough home screen sketch as the layout reference. Center the lowercase Swatch Party wordmark in Averia Sans Libre. Use a warm off-white background, plum text, rounded corners, and subtle organic swatch shapes. Keep interface copy concise and free of em dashes.
- Keep the five-person lineup visible side by side on desktop. On a phone, fit about two columns in a horizontally swipeable lineup without making the whole page scroll sideways. Give swatches and actions clear tap targets and accessible names.
- Show full-length model cutouts at a consistent scale and baseline. Offer one continuous venue backdrop and a plain comparison view. The Mountain Terrace photo is the candidate. Get a usable source image for the chosen backdrop before shipping it. Use a labeled approximation when an exact-color photo is unavailable and a dress reference exists.
- Offer **All Mauve**, **Mauve + Brown**, and **Garden Mix**. Garden Mix combines greens, mauves and dusty pinks, and browns. Save multiple named snapshots per palette and let people reopen, edit, or delete them. Keep draft autosaves independent of named snapshots. Use an explicit update action to replace a snapshot.
- Let the group mark one saved lineup as final. Treat the sketch's **My fave!** reaction as a follow-up until its behavior is agreed.

### 4. Export and release

- Add **Download PDF** for the displayed lineup. Render a single landscape page from the complete lineup data so the PDF includes everyone on mobile. Follow the reference with names above the full-length dress previews, style and color below, and **No dress selected** for blank slots. Use the selected backdrop, align the hems, and omit controls and sizes. Use the same preview assets in the lineup and the PDF.
- Deploy a Vercel preview with sample data. Review the key flows in the browser and verify that image failures and save failures remain recoverable. Release to the wedding party after the preview is checked.

## Acceptance checks

| Scenario | Expected result |
| --- | --- |
| Submit two dress URLs on a phone, then open the workspace on a second device | Both options appear under the right bridesmaid with their saved color and size. |
| Submit a blocked or incomplete Azazie link | The option can be saved, with a confirmed color and a replacement photo if needed. |
| Switch Hanna from Gabriela to Mona, then change only the color | Each edit shows the right dress and leaves the other bridesmaids in place. An approximate color is labeled. |
| Edit a lineup and reload after it saves | The current palette, selections, and backdrop reopen as saved. The last-saved timestamp reflects the last successful write. |
| Simulate a failed save or overlapping edits | A retry is available after failure. A stale edit to the same data is surfaced for resolution. |
| Save two Garden Mix variants, select one as final, and edit the draft | Both saved variants reopen unchanged and the final choice is clear. |
| Open an Azazie link from a saved lineup | The link opens the exact product color when available. An original-only link is labeled. |
| Export from a phone with only two columns visible | One landscape PDF includes the full lineup, names, full-length previews, and selected backdrop. |
| Check the phone layout and keyboard navigation | The page fits the viewport, the lineup is swipeable, and controls have visible focus and readable labels. |

After release, capture reported issues as reproducible cases and add regression checks for the behavior they exposed.
