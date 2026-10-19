# Jumps Book

Personal horse racing tracker: bet P&L for the 2026/27 jumps season, a horse tracker with notes, and form search.
Racing data comes from irishracing.com (personal, low-volume use, cached, and always linked back to the source).

## What's in here

- `public/index.html`: the whole app (works on laptop and phone, and can be added to your home screen).
- `netlify/functions/`: small server functions:
  - `data`: saves and loads your bets, tracked horses and notes (Netlify Blobs), merging changes from different devices.
  - `horse`: fetches a horse’s page from irishracing.com and turns it into form, stats and entries (cached 3 hours).
  - `search`: finds horses by name in an index built from UK and Irish racecards and entries.
  - `scheduled-index`: refreshes that index at 07:00 and 17:00 UTC.
  - `reindex`: refresh the index on demand (the “Refresh horse index” link in the app).
- `netlify/lib/irishracing.mjs`: all the page parsing, in one place, so it’s easy to fix if the site changes.

## Settings

Set one environment variable in Netlify: `APP_PASSCODE`, the passcode you type to open the app.
