# Writing the Guide

The Guide (`/guide` in the app) explains SoarCast to pilots. Each page is a Markdown file in
`src/guide/pages/`. This file is for whoever writes or changes those pages.

## The reader

- The reader is a pilot who found SoarCast and wants to understand it. They fly. They are not a
  weather expert or a programmer.
- They know nothing about how SoarCast is built, or about any conversation behind it. Never
  mention chats, threads, pull requests, tickets, the people who build SoarCast, code names or
  internal services (pgsites, D1, Cloudflare, the forecast engine).
- They may land on any page from a link. Each page must make sense on its own.

## How to write

- Short, simple sentences. One idea per sentence. Aim for under 20 words. The test fails a
  sentence over 25.
- No em dashes, en dashes or semicolons. Split the sentence instead. Use a colon only to start a
  list or an example.
- Plain words. Explain a weather or flying term the first time a page uses it, in a few words.
  For example, write "how fast the air cools as it rises" rather than "lapse rate", or give both.
- No Latin shorthand like "e.g.", "i.e." or "etc.".
- Say each thing once. If another page covers it, link to that page instead of repeating it.
- Give as much detail as a pilot needs to trust or use the result, and no more. Leave out how the
  code works.
- Call the app SoarCast. Don't write "we" or "our".
- Name pages, headings and labels neutrally. Never "Your ..." or "My ...". Plain sentences can
  say "a pilot" or "you".
- Use the exact words the screens use: card titles, buttons and the day words Go, Flyable,
  Marginal and Not flyable. Never show or mention the 0 to 100 score.
- Use the units the app shows: km/h, m, °C.
- Say what the data can't tell the pilot. Honest limits are part of every page.
- Describe what SoarCast does today. No history, plans or dates, so no "new", "soon",
  "used to", "no longer" or "we changed".
- Link each outside source by name to its own site.
- Keep personal data out: no one's flights, home sites or names.

These writing rules also apply to text on screens, in emails and in alerts.

## Numbers come from the code

Write `{{name}}` for any number the code decides, such as a distance, an age or a count of days.
Add the name to `src/guide/facts.ts`, taken from the constant the code uses. If that constant sits
in a server file, move it into a `src/lib` module and import it from both places. A hand-typed
number goes stale the day the code changes.

## Keeping pages right

Every change to SoarCast asks one question: does the Guide still match? There are three cases.

1. The change alters something a page describes. Update the page.
2. The change removes something a page describes. Remove it from the page.
3. The change adds something a pilot would need explained. Add it to the right page, or add a
   page.

`npm run guide:check` lists the pages whose `covers` include the files a change touches. Read each
listed page in full, not only the part you think changed. Think about pages it doesn't list too,
since `covers` can miss things. When a page starts to describe more code, add those files to its
`covers`.

Most changes need no Guide edit. The check is still required. Say what you decided in the pull
request's Guide section.

## Adding a page

1. Add `src/guide/pages/<slug>.md`. The slug becomes the address, `/guide/<slug>`.
2. Start it with front matter: `title`, `summary`, `order` and `covers` (see `src/guide/guide.ts`).
3. The title names the topic plainly, like "Data sources" or "Reading the windgram".
4. The summary is one sentence. It shows on the Guide's index and as the page description.
5. Open with two or three sentences that say what the page answers. Then give one `##` section to
   each question.
6. Link other pages with their address, like `/planning` or `/guide/data-sources`.
7. Run `npm run test`. The Guide test checks the rules a machine can: dashes, semicolons,
   sentence length, internal words, facts, covers and links between pages.
