# Staging

**https://staging.soarcast.mckinleyaviation.com** is a private copy of SoarCast, with fake data, for checking a branch before it reaches production. It follows pjmgmt's staging standard (mckinley/pjmgmt, `hq/standards/staging.md`).

## Using it

1. Deploy a branch there. Every push to a pull request does it, and so does Actions → **Staging** → **Run workflow** on any branch (`.github/workflows/staging.yml`). It takes a few minutes. There is one staging site, so the most recent deploy is what it shows.
2. Open the site. Cloudflare Access asks for your email and sends you a one-time code.
3. On `/login`, click **Sign in as a test user**. That goes to `/dev/login`, where you pick one of these:

| Test user | What they have |
|---|---|
| Ada Admin | Admin: `/admin` (health, users) |
| Pia Pilot | Seattle area: follows Tiger Mountain (alerts on) and Mt. Si (her own directions), a private site, the morning digest on |
| Toni Traveler | "Annecy trip" (Planfait, Col de la Forclaz) and "Nepal" (Sarangkot, alerts off), wider margins in big mountains |
| Nina Newbie | Nothing saved yet |

The fake data is `scripts/staging-seed.mjs` (`npm run --silent staging:seed` prints the SQL). Every email ends in `@example.test`. The followed sites are real launches that pgsites' staging copy holds too, so their pages and forecasts work.

**Sites come from pgsites' staging copy** (https://staging.pgsites.mckinleyaviation.com, about 110 sites round Seattle, the Bernese Oberland, Annecy and Pokhara), never from production. Browse and search find only those. Sharing a private site writes to pgsites staging.

**Reset the data:** Actions → **Staging** → **Run workflow**, tick **reset**. This deletes the staging database, recreates it from the migrations and reloads the fake data. Use it when the data gets messy, or after a branch added a migration you then dropped.

## What staging doesn't do

- **No Google or GitHub sign-in.** Use the test users.
- **No email and no crons**, so no alerts, digests or health emails, and no hourly forecast refresh. Pages fetch their forecasts themselves.
- **No season build, NOGA copy or ensembles:** the jobs Worker (`jobs/`) runs only in production, so those sections are empty.
- **No Syncing Pilots:** "flown here" and "up now" show nothing.
- **No push notifications** (no VAPID keys) and no Airspace layer (no openAIP key).

Forecasts and weather still come from Open-Meteo, the same as production; staging only reads them.

## How it stays apart from production

Everything is defined by `env.staging` in `wrangler.toml`, and `test/staging-config.test.mjs` (`npm run test:staging`, also in CI) holds it there:

- **Its own Worker:** `soarcast-staging`.
- **Its own database:** `soarcast-staging-db`. `scripts/staging.mjs` fills in its id at deploy time and refuses any database or Worker whose name doesn't end in `-staging`.
- **Its own hostname**, a Workers custom domain with its own certificate. No workers.dev or preview URLs.
- **Its own secrets:** a random `BETTER_AUTH_SECRET`, given on the first deploy, and a `PGSITES_API_KEY` that only pgsites staging accepts.
- **pgsites' staging copy**, over the `PGSITES` service binding to `paragliding-sites-staging` (`configurePgsites` in `src/lib/pgsites-client.ts`). A service binding goes straight to that Worker, so Access in front of its hostname never turns the call away. The guard fails on a binding to any Worker not named `-staging`.
- **No email binding, no crons, no Syncing Pilots binding.**
- **No `/dev/login` in production:** only staging sets `DEV_AUTH` and `APP_ENV`.
- **Kept out of search results:** every page is sent with `X-Robots-Tag: noindex`, and pages show a "Staging · fake data" badge.

Production still deploys only from `main`, through `deploy.yml`.

## One-time setup

**Done on 2026-10-24.**

1. **Access, before the first deploy**, so the site is never public: `staging.soarcast.mckinleyaviation.com` is in the Zero Trust → Access application "McKinley staging" (allow: the owner's email, one-time PIN).
2. **The pgsites key:** one random key, set as `PGSITES_API_KEY` on `soarcast-staging` and as `API_KEY` on `paragliding-sites-staging`, and never written down. To change it, pipe a new one into both:

   ```sh
   key=$(openssl rand -hex 32)
   printf %s "$key" | npx wrangler secret put PGSITES_API_KEY --name soarcast-staging
   printf %s "$key" | npx wrangler secret put API_KEY --name paragliding-sites-staging
   ```

The first workflow run creates the database, the custom domain (DNS record and certificate) and `BETTER_AUTH_SECRET`, with the `CLOUDFLARE_API_TOKEN` repository secret that production deploys already use.

**To deploy by hand** (rarely needed): `node scripts/staging.mjs deploy [--reset]`, with `CLOUDFLARE_API_TOKEN` or `wrangler login`.
