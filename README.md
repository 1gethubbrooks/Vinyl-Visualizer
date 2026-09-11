# The Selection Wall

A small app for picking your record store's "albums of the month" wall &mdash; eight slots, two rows of four, pulled from your own vinyl catalog. Pick a theme (Summer, Winter, Date Night, etc.) and matching albums float to the top of each dropdown. Cover art loads automatically from the iTunes catalog; you can override any cover with your own photo or image link.

This is a plain static site &mdash; no build step, no server, no account required. It runs entirely in the browser.

## Run it locally

Because the app loads `data/catalog.json` with `fetch`, most browsers block that from a bare `file://` page. Serve the folder instead:

```bash
cd selection-wall
python3 -m http.server 8000
# then open http://localhost:8000
```

(Any static server works &mdash; `npx serve`, VS Code's Live Server extension, etc.)

## Deploy to GitHub Pages

1. Create a new repository on GitHub and push this folder's contents to it:

   ```bash
   cd selection-wall
   git init
   git add .
   git commit -m "Selection Wall app"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```

2. On GitHub, go to **Settings &rarr; Pages**.
3. Under **Build and deployment**, set **Source** to "Deploy from a branch," branch `main`, folder `/ (root)`.
4. Save. GitHub gives you a URL like `https://<your-username>.github.io/<your-repo>/` within a minute or two.

That's it &mdash; no build step, secrets, or backend to configure.

## How data is stored

- **Catalog** (`data/catalog.json`): your 213 records, each auto-tagged with genre/mood/season for theme matching. Edit this file directly to add, remove, or re-tag albums &mdash; it's plain JSON.
- **Wall layout & theme**: saved in the browser's `localStorage`, per-device. Use **Export my data** / **Import data** at the bottom of the page to move your wall (and any manual cover overrides) between computers or keep a backup.
- **Cover art**: fetched from the free [iTunes Search API](https://performance-partners.apple.com/search-api) the first time each album is shown, then cached in `localStorage` so it isn't re-fetched every visit. No API key needed.
- **Manual cover overrides**: if iTunes doesn't have a match (common for smaller/indie releases) or picks the wrong art, click **Fix cover** on any catalog row to paste a direct image URL, or click **Photo** on a filled wall slot to upload your own shot &mdash; both are also saved in `localStorage`.

## Editing the catalog

`data/catalog.json` is a plain array:

```json
{
  "id": "adele-30",
  "artist": "Adele",
  "album": "30",
  "genres": ["pop", "soul"],
  "moods": ["romantic", "mellow", "emotional"],
  "seasons": ["fall", "winter"]
}
```

- `id` must be unique.
- `genres`, `moods`, and `seasons` drive which albums a theme suggests (see the `THEMES` array near the top of `app.js` to see or edit what each theme looks for).
- No `coverUrl` field needed &mdash; art is fetched automatically at runtime.

## Notes

- Because `localStorage` is per-browser, the wall you build on the shop computer won't automatically appear on your phone. Use Export/Import to sync, or keep the shop's display on one dedicated machine/browser.
- Uploaded photos are stored as embedded image data in `localStorage`, which has a a few-MB ceiling per site in most browsers &mdash; fine for a handful of custom covers, not for uploading photos for all 213 records. Prefer "Fix cover" with a hosted image link for bulk overrides.
