# Letterboxd CSV

This is a PWA where you can provide keys for EAN or UPC database API to scan a barcode on any DVD or Blu-ray and it generates a CSV file which can be imported on letterboxd.com

1. enter an API key for at least one supported database API
2. scan barcode on a DVD or Blu-ray with your smartphone (iOS, Android)
3. the PWA
    - starts to search for EAN or UPC in the available databases in specified order to retrieve corresponding film title
    - as soon as a result was found, it searches for film title in themoviedb.org to retrieve corresponding tmdbID
    - it shows the results to the user, who can confirm if the found film should go into the CSV
    - generates CSV if it doesn't exist yet
    - adds new entry to CSV if it doesn't exist yet
6. when done with your scans, download CSV to import on letterboxd.com
7. continue with scans later

## APIs

### Barcode Database APIs

EAN (European Article Number) or UPC (Universal Product Code) databases to look for film title. Currently supported databases in order of priority:

- https://upcmdb.com/api -> API Key: `VITE_UPCMDB_API_KEY`
- https://upcdatabase.org/api -> API Key: `VITE_UPCDATABASE_API_KEY`
- https://eandata.com/feed/ -> API Key: `VITE_EANDATA_API_KEY`
- https://www.upcitemdb.com/api/explorer#!/lookup/get_trial_lookup -> API Key: `VITE_UPCITEMDB_API_KEY` (optional)

Keys live in `.env.local`, which is gitignored. `.env.example` lists the variable names; never
commit real keys. See "## Secrets" below.

### TMDB API

General API documentation:
https://developer.themoviedb.org/reference/getting-started

API Key: `VITE_TMDB_API_KEY` (in `.env.local`, gitignored)

Endpoint to search for film and movie by title:
https://api.themoviedb.org/3/search/multi

### Letterboxd API

General API documentation:
https://api-docs.letterboxd.com/

Letterboxd CSV format description:
https://letterboxd.com/about/importing-data/

## PWA UI

- when starting the PWA first time and no API keys are available, give user an option to enter API key for all supported providers
- show title and poster for TMDB results to the user and provide an option to confirm