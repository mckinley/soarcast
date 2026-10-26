# Staging

**https://staging.soarcast.mckinleyaviation.com** is a private copy of SoarCast, with fake data, for checking a branch before it reaches production. It follows pjmgmt's staging standard (mckinley/pjmgmt, `hq/standards/staging.md`).

It's optional. Changes normally go straight to `main` and production. Use staging only when a change needs clicking through first (a risky migration, a new flow) or the owner asks for it.

## Using it

1. Deploy a branch there. Every push to a pull request does it, and so does Actions → **Staging** → **Run workflow** on any branch (`.github/workflows/staging.yml`). It takes a few minutes. There is one staging site, so the most recent deploy is what it shows.
2. Open the site and enter the staging password: `STAGING_PASSWORD` in `env.staging` of `wrangler.toml`, the same for every app of the owner's. Give it to anyone you want to let in. The browser remembers it for 30 days. A script or agent sends it as an `X-Staging-Password` header, or with basic auth under any user name.
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
- **pgsites' staging copy**, over the `PGSITES` service binding to `paragliding-sites-staging` (`configurePgsites` in `src/lib/pgsites-client.ts`). A service binding goes straight to that Worker, and each call carries the staging password that site asks for. The guard fails on a binding to any Worker not named `-staging`.
- **No email binding, no crons, no Syncing Pilots binding.**
- **No `/dev/login` in production:** only staging sets `DEV_AUTH` and `APP_ENV`.
- **Behind a password:** `src/lib/staging-gate.ts` answers any request without the staging password with a password form (or a 401 for a script) before the app runs. It's a plain var in `wrangler.toml`: it keeps strangers and crawlers out of fake data, and isn't a secret.
- **Kept out of search results:** every page is sent with `X-Robots-Tag: noindex`, and pages show a "Staging · fake data" badge.

Production still deploys only from `main`, through `deploy.yml`.

## One-time setup

**Done on 2026-10-24.**

1. **Password:** nothing to set up. `STAGING_PASSWORD` in `env.staging` keeps the site private from the first deploy. (Until 2026-10-26 a Cloudflare Access application did this, which kept agents out and needed every hostname and person listed.)
2. **The pgsites key:** one random key, set as `PGSITES_API_KEY` on `soarcast-staging` and as `API_KEY` on `paragliding-sites-staging`, and never written down. To change it, pipe a new one into both:

   ```sh
   key=$(openssl rand -hex 32)
   printf %s "$key" | npx wrangler secret put PGSITES_API_KEY --name soarcast-staging
   printf %s "$key" | npx wrangler secret put API_KEY --name paragliding-sites-staging
   ```

The first workflow run creates the database, the custom domain (DNS record and certificate) and `BETTER_AUTH_SECRET`, with the `CLOUDFLARE_API_TOKEN` repository secret that production deploys already use.

**To deploy by hand** (rarely needed): `node scripts/staging.mjs deploy [--reset]`, with `CLOUDFLARE_API_TOKEN` or `wrangler login`.
