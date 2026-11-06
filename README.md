# Letterboxd Disc Registration

A PWA for scanning the barcode on a DVD or Blu-ray case and building a CSV you can import into
[Letterboxd](https://letterboxd.com/about/importing-data/). Works on iOS and Android; no app store,
no account.

## How it works

1. Enter an API key for at least one barcode database (first launch prompts for them).
2. Scan the barcode with your phone's camera, or type the digits.
3. The app queries your enabled databases **in priority order and stops at the first hit**, so
   lower-priority providers are never charged for a lookup that already succeeded.
4. The retrieved product title is cleaned of retailer noise ("Blu-ray", "[Region B]",
   "Collector's Edition", ...) and searched on TMDB.
5. You confirm the match — title, year, poster. **Nothing is written to the CSV before you confirm.**
6. Confirmed entries are added to an on-device list, skipping anything already there.
7. Download the CSV whenever you like and import it on Letterboxd. Scans persist, so you can stop
   and come back later.

The CSV contains a single column, `tmdbID`, which is all Letterboxd needs to identify a film.

## Getting API keys

| Provider | Key | Notes |
| --- | --- | --- |
| [UPCMDB](https://upcmdb.com/) | Required | Physical-media database with IMDb IDs and editions. Best hit rate for discs. Called from the browser directly. |
| [UPC Database](https://upcdatabase.org/api) | Required | General product catalog. **Blocks browser requests** (no CORS headers), so it needs a proxy. |
| [EANdata](https://eandata.com/feed/) | Required | General EAN/UPC feed. Free accounts allow 15 lookups per day. Called from the browser directly. |
| [UPCitemdb](https://www.upcitemdb.com/api/explorer#!//lookup/get_trial_lookup) | Optional | Works without a key on the free trial (100 lookups/day). **Blocks browser requests**, so it needs a proxy. |

### CORS proxy

UPCMDB and EANdata allow cross-origin requests, so they work in a plain static deployment. UPC
Database and UPCitemdb do not. To use them, run any small proxy that accepts
`?url=<encoded target>` and returns the target's body with permissive CORS headers, then paste its
base URL into **Settings → CORS proxy**. Providers without a proxy simply report that they were
skipped, and the chain falls through to the next one.

## Configuration

Keys fall into two tiers, and they live in different files for a reason:

| Variable | File | Scope | Ships in build? |
| --- | --- | --- | --- |
| `VITE_TMDB_API_KEY` | `.env.local` | Everyone using the app | yes |
| `VITE_UPCMDB_API_KEY` | `.env.development.local` | Local testing | no |
| `VITE_UPCDATABASE_API_KEY` | `.env.development.local` | Local testing | no |
| `VITE_EANDATA_API_KEY` | `.env.development.local` | Local testing | no |
| `VITE_UPCITEMDB_API_KEY` | `.env.development.local` | Local testing | no |

```bash
cp .env.example .env.local     # then set VITE_TMDB_API_KEY
# optionally, for scanning without signing up:
cp .env.example .env.development.local   # then set the barcode keys
```

**TMDB** is needed by every visitor, so its key is compiled into the client bundle and is public in
any deployment. Do not put anything there you are not willing to make public.

**Barcode-database keys are for testing only.** They are paid or rate-limited quotas, so they are
kept out of builds two ways: they live in `.env.development.local`, which `vite build` never reads,
and the code that reads them is gated on `import.meta.env.DEV`, which Vite replaces with `false`
and dead-code eliminates in production. After a build you can confirm none leaked:

```bash
npm run build
rg 'YOUR_BARCODE_KEY' dist/    # no matches expected
```

Users are expected to enter their own barcode keys on first launch; those are stored in
localStorage on their device and never leave it except to reach the issuing API. For deployment,
set `VITE_TMDB_API_KEY` in your host's environment before building.

Both `.env.local` and `.env.development.local` are gitignored; `.env.example` holds the names with
blank values and is safe to commit.

## Development

```bash
npm install
npm run dev         # http://localhost:5173 (localhost counts as a secure context for the camera)
npm test            # Vitest
npm run build       # check:keys + tsc + vite build
npm run check:keys  # verify no barcode key can reach a build
npm run preview     # serve the production build
```

`vite --host` serves over plain HTTP on your LAN, which browsers refuse to grant camera access to.
To test on a real phone, use an HTTPS tunnel (for example `cloudflared tunnel --url
http://localhost:5173`) or deploy a preview build.

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` builds and publishes the app on every push to `main`. It runs the
key-policy guard, the tests, and a final scan of `dist/` before uploading, so a stray barcode key
fails the deploy instead of being published.

Two things to set up once in the repository:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.** The workflow also passes
   `enablement: true`, which turns Pages on automatically on the first run.
2. **Settings → Secrets and variables → Actions → New repository secret**, named
   `VITE_TMDB_API_KEY`. Without it the deploy still succeeds, but the app shows its "set a TMDB
   key" banner to every visitor.

The site is served from a subpath, `https://coderesearcher.github.io/letterboxd-csv.github.io/`,
so absolute paths like `/icons/...` would 404. `vite.config.ts` derives every path from one value,
`PAGES_BASE`, which defaults to `/<repo>/` and is passed explicitly by the workflow
(`/${{ github.event.repository.name }}/`) so forks and renames work. For a root deployment build
with `PAGES_BASE=/ npm run build`.

That derivation matters for more than the JS bundle: the PWA manifest's `start_url`, `scope` and
icon URLs are not rewritten by Vite, so they are built from the same value, and the service
worker's `navigateFallback` is relative (`index.html`) so it resolves inside the subpath scope.

Note that the repository name `letterboxd-csv.github.io` is a *project* site, not a user site, so
the URL keeps the repo name as a path segment. A user site would require renaming the repo to
`CodeResearcher.github.io` and building with `PAGES_BASE=/`.

To preview a subpath build locally:

```bash
npm run build
mkdir -p /tmp/gh/letterboxd-csv.github.io && cp -r dist/* /tmp/gh/letterboxd-csv.github.io/
npx http-server /tmp/gh -p 4301
# open http://localhost:4301/letterboxd-csv.github.io/
```

## Adding a barcode database

The provider layer exists so this is a small, local change:

1. Create `src/services/barcodeDbs/yourProvider.ts` exporting a `BarcodeProvider` (see
   `types.ts` for the contract: `id`, `label`, `credentialFields`, `lookup`).
2. Import it in `src/services/barcodeDbs/registry.ts` and add it to `ALL_PROVIDERS`.
3. Add fixtures for it in `src/services/barcodeDbs/providers.test.ts`. The shared contract suite in
   `providerContract.ts` covers the result-shape rules for free.

Nothing in the scanner, the settings UI, or the TMDB code needs to change: Settings renders itself
from `credentialFields`, and the orchestrator reads the registry.

## Project layout

```
src/
  components/        Onboarding, Scanner, ManualEntry, ConfirmMatch, CollectionList, Settings
  hooks/useScanFlow  barcode -> providers -> TMDB -> confirm -> store
  services/
    barcodeDbs/      provider contract, registry, orchestrator, one file per database
    normalizeBarcode UPC-A/EAN-13/EAN-8 handling and check digits
    scanner          ZXing camera engine behind a swappable interface
    tmdb             search/multi, ignoring media_type
    letterboxdCsv    CSV generation and download
  store/             settings (localStorage), collection (IndexedDB via idb-keyval)
  utils/titleCleanup disc-title noise removal
```

## Notes and limits

- Storage is on-device (IndexedDB). Clearing site data or uninstalling the PWA deletes the list, so
  download the CSV first. Settings has a **Protect from eviction** button that asks the browser to
  keep the data.
- TMDB movie and TV IDs overlap. Since the CSV carries only `tmdbID`, a wrongly confirmed TV result
  could import a different film, so check each match before confirming.
- Camera scanning needs HTTPS. The app says so if `getUserMedia` is unavailable.
- Torch/flash support depends on the device: Android Chrome generally has it, iOS Safari generally
  does not. The button only appears when the camera reports support.
