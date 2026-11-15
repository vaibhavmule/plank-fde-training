# Day 14: scraping and browser use

Two ways to read the web. `scrape` fetches a page, sends its text to the small
model with a Zod schema, and follows the next link. `browse` drives the
machine's Chrome from screenshots, one action at a time, for systems with no
API.

## The scraper

`src/lib/scrape.ts` splits `fetchPage` out of `readPage`, so the Day 7 guards —
private addresses, every redirect, a 512 KB cap — apply to scraping too.
`extractText` now takes a character limit, and `scrape` uses 12,000 of them.
There are no selectors: the schema says what to extract, and the field
descriptions say how each value is written. `nextLink` follows `rel="next"`, or
a link whose text is next, more, older, › or ».

`pnpm scrape <url> [--pages n] [--limit n]` uses the supplier schema: name,
hours, services, prices and contact. Values stay as the page writes them.

### Three kinds of page

| Page                                                                   | Kind                   | Result                                                                       |
| ---------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------- |
| [Tartine Bakery](https://www.tartinebakery.com/)                       | one supplier           | 1 record, `hours: null` and `prices: []` because the homepage states neither |
| [Stumptown locations](https://www.stumptowncoffee.com/pages/locations) | a listing of suppliers | 5 records, one per cafe, with hours and address exactly as written           |
| [Excalidraw](https://excalidraw.com/)                                  | drawn by JavaScript    | 0 records: the HTML is an app shell, so the fields are not in the text       |

The JavaScript page is the gap Firecrawl closes: it renders the page before
extraction. Without rendering, the scraper sees only the shell, so it reports
no record rather than inventing one. The same happens on Photopea.

The live test scrapes the first two Hacker News pages and expects more than 30
stories. A page holds 30, so the count and the `?p=2` address both prove the
next link was followed.

## The browser agent

`src/lib/browser-agent.ts` defines a 9-method `Browser` interface
(`goto`, `screenshot`, `click`, `type`, `press`, `scroll`, `wait`, `url`,
`close`) and implements it in `chromeBrowser(start)` with Playwright on the
installed Chrome: a 1024 by 768 context, service workers blocked, dialogs
dismissed.

`bounds(start)` allows the start site and public addresses by the rule
`readPage` uses, and refuses private addresses, local names and every other
file. The route is on the browser context, not the page, so a click, a
redirect, an embedded image and a popup all pass the check or are blocked. The
live test starts a real server on `127.0.0.1` and proves Chrome never reaches
it.

`browse(goal, start, model, browser, { maxSteps, on })` sends the task, the
address, the actions so far and a screenshot, takes back one action through
`Output.object`, and runs it. A `goto` that fails is written into the history
as "page did not load" so the model can try another address or give up. The run
ends on `done`, on `give_up`, or at the step limit.

### The portal run

`pnpm browse --start file://$PWD/src/lib/fixtures/legacy-portal.html "Find the payment status of invoice INV-4411 and report it word for word."`

```
1. click — Focus the invoice number field so I can enter INV-4411.
   clicked 399,211
2. type — The invoice number field now has focus, so I will enter INV-4411.
   typed "INV-4411"
3. click — The invoice number INV-4411 is entered, so clicking the Look up button should show its payment status.
   clicked 593,211
4. done — The payment status panel for INV-4411 shows this exact text after the lookup.
   Paid on 2026-09-10 by ACH, reference FS-88213.

done · 4 steps · claude-haiku-5-5
```

The live test asserts the same status word for word, so a change to the fixture
or the loop shows up as a failed test.

## Reproducing

```bash
pnpm test:live src/lib/scrape.live.test.ts
pnpm test:live src/lib/browser-agent.live.test.ts

pnpm scrape https://www.tartinebakery.com/ --pages 1 --limit 1
pnpm scrape https://www.stumptowncoffee.com/pages/locations --pages 1 --limit 5
pnpm browse --start "file://$PWD/src/lib/fixtures/legacy-portal.html" \
  "Find the payment status of invoice INV-4411 and report it word for word."
```

## What it costs

Every screenshot step is one model call with an image, and the portal run used
4 of them. The scraper sends up to 12,000 characters per page, so the page cap
and `--limit` are the two knobs that bound the bill. Both commands run on the
provider's small model.
