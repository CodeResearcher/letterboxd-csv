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
Database and UPCitemdb do not. This repository includes a Cloudflare Worker (`worker/`) that
proxies exactly those two APIs, and the app ships with its URL as the **built-in default**, so both
databases work with no setup.

The default lives in `src/config/envKeys.ts` and can be overridden with `VITE_CORS_PROXY_URL`. It is
a deliberately *specific* proxy rather than a public one, because the well-known free proxies are not
dependable — during testing `corsproxy.io` began requiring a paid key, `api.allorigins.win` returned
408/500/522 and strips custom request headers, and `cors.eu.org` / `api.cors.lol` both returned 429 —
and because routing a key through a stranger's server means whoever runs it can read that key.

Users can still replace or clear the proxy in **Settings → CORS proxy**. A saved value always wins,
including a deliberately empty one, so clearing the field is respected on the next launch and the
two databases are simply skipped.

#### Deploy your own Worker

The Worker lives in [`worker/`](worker/) and is a real, deployable project, not a snippet. The
Cloudflare free tier allows 100,000 requests per day, far more than personal disc scanning needs.

```bash
npx wrangler login                       # once, in a browser
npm run worker:dev                       # run it locally on http://localhost:8787
npm run worker:deploy                    # publish to workers.dev
```

`npm run worker:deploy` prints the deployed URL, for example
`https://letterboxd-csv-proxy.your-name.workers.dev/`. Point the app at it by setting
`VITE_CORS_PROXY_URL` to that URL (see below) and rebuilding, or paste it into
**Settings → CORS proxy** for a one-off.

The Worker is deliberately strict, so it is safe to leave running public:

- **Host allowlist.** It only reaches `api.upcdatabase.org` and `api.upcitemdb.com`. Everything
  else, including internal addresses and `file://`, is rejected with a 400. Without this, a public
  proxy is an SSRF vector.
- **No request headers are forwarded.** The credential always travels in the target's query string,
  which is how UPC Database is called (`?apikey=`) and why it works through a pass-through proxy.
- **No bindings or secrets.** `worker/wrangler.toml` holds no state, so there is nothing to leak.

Any proxy that accepts `?url=<encoded target>` and returns permissive CORS headers works too. Enter
its base URL in **Settings → CORS proxy**. Providers without a proxy simply report that they were
skipped, and the chain falls through to the next one.

## Configuration

Keys fall into two tiers, and they live in different files for a reason:

| Variable | Required | Ships in build? |
| --- | --- | --- |
| `VITE_TMDB_API_KEY` | yes | yes |
| `VITE_CORS_PROXY_URL` | no | yes (a URL, not a secret) |
| `VITE_UPCMDB_API_KEY` | no | no |
| `VITE_UPCDATABASE_API_KEY` | no | no |
| `VITE_EANDATA_API_KEY` | no | no |
| `VITE_UPCITEMDB_API_KEY` | no | no |

All of them live in a single gitignored `.env.local`. Only `VITE_TMDB_API_KEY` is mandatory:

```bash
cp .env.example .env.local     # then set VITE_TMDB_API_KEY
```

**TMDB** is needed by every visitor, so its key is compiled into the client bundle and is public in
any deployment. Do not put anything there you are not willing to make public.

**`VITE_CORS_PROXY_URL`** is public in the same way: it is a URL, readable by anyone, and meant to
be. The Worker behind it carries no credential and only forwards to the allowlisted barcode
databases, so sharing the URL does not expose anything sensitive. When unset, the app falls back to
the built-in default in `src/config/envKeys.ts`. A value saved in Settings overrides it, and
clearing it in Settings is respected on the next launch.

**Barcode keys are optional and act as presets.** If at least one is set the app treats itself as
already configured and skips first-run onboarding; with none, the user is asked for a key. They are
paid or rate-limited quotas, so they are kept out of production builds by a single mechanism: the
code that reads them is gated on `import.meta.env.DEV`, which Vite replaces with `false` and
dead-code eliminates — so even though `.env.local` *is* loaded during a production build, the keys
never reach the bundle. After a build you can confirm none leaked:

```bash
npm run build
rg 'YOUR_BARCODE_KEY' dist/    # no matches expected
```

Users are expected to enter their own barcode keys on first launch; those are stored in
localStorage on their device and never leave it except to reach the issuing API. For deployment,
set `VITE_TMDB_API_KEY` in your host's environment before building.

Both `.env.local` and `.env.example` exist; only `.env.local` holds values and is gitignored, while
`.env.example` holds the names with blank values and is safe to commit.

## Development

```bash
npm install
npm run dev         # http://localhost:5173 (localhost counts as a secure context for the camera)
npm test            # app + Worker suites
npm run build       # check:keys + tsc + vite build
npm run check:keys  # verify no barcode key can reach a build
npm run preview     # serve the production build
```

The Worker has its own commands, tests, and tsconfig, and is never part of the app bundle:

```bash
npm run worker:dev        # local Worker on http://localhost:8787
npm run worker:deploy     # deploy to Cloudflare
npm run worker:test       # Worker test suite
npm run worker:typecheck  # typecheck Worker separately
```

`vite --host` serves over plain HTTP on your LAN, which browsers refuse to grant camera access to.
To test on a real phone, use an HTTPS tunnel (for example `cloudflared tunnel --url
http://localhost:5173`) or deploy a preview build.

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` builds and publishes the app on every push to `main`. It runs the
key-policy guard, the tests, and a final scan of `dist/` before uploading, so a stray barcode key
fails the deploy instead of being published.

Three things to set up once in the repository:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.** Already enabled for this
   repository. The workflow passes `enablement: true` as well, but the `GITHUB_TOKEN` cannot
   *create* the Pages site on a repo where it has never been turned on — that first step needs a
   repo admin, either through this setting or `POST /repos/{owner}/{repo}/pages` with
   `{"build_type":"workflow"}`.
2. **Settings → Secrets and variables → Actions → New repository secret**, named
   `VITE_TMDB_API_KEY`. Without it the deploy still succeeds, but the app shows its "set a TMDB
   key" banner to every visitor.
3. Optionally the same screen's **Variables** tab, named `VITE_CORS_PROXY_URL`, if you deployed your
   own Worker. Unset is fine: the app falls back to its built-in default.

> **Scope matters.** These must be **repository-level**, not environment-level. GitHub only exposes
> environment secrets to jobs that declare that environment, and the `build` job deliberately does
> not: it runs before the `deploy` job that names `github-pages`. A key stored under the
> `github-pages` environment therefore resolves to an empty string during the build, the bundle
> ships without it, and nothing in the logs says why. The build job reads only repo-level
> `secrets.*` and `vars.*`.

Barcode keys are intentionally not part of this. They are gated on `import.meta.env.DEV`, so a
production build ignores them, and the workflow's final `dist/` scan fails the deploy if one ever
appears. Visitors enter their own barcode keys in Settings; those stay in their browser's
localStorage.

The site is served from a subpath, `https://coderesearcher.github.io/letterboxd-csv/`,
so absolute paths like `/icons/...` would 404. `vite.config.ts` derives every path from one value,
`PAGES_BASE`, which defaults to `/<repo>/` and is passed explicitly by the workflow
(`/${{ github.event.repository.name }}/`) so forks and renames work. For a root deployment build
with `PAGES_BASE=/ npm run build`.

That derivation matters for more than the JS bundle: the PWA manifest's `start_url`, `scope` and
icon URLs are not rewritten by Vite, so they are built from the same value, and the service
worker's `navigateFallback` is relative (`index.html`) so it resolves inside the subpath scope.

The repository is a *project* site, not a user site, so the URL keeps the repo name as a path
segment. A user site would require renaming the repo to `CodeResearcher.github.io` and building
with `PAGES_BASE=/`.

To preview a subpath build locally:

```bash
npm run build
mkdir -p /tmp/gh/letterboxd-csv && cp -r dist/* /tmp/gh/letterboxd-csv/
npx http-server /tmp/gh -p 4301
# open http://localhost:4301/letterboxd-csv/
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
