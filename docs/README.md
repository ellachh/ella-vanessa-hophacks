# docs/

Everything that is not code. Nothing here runs in the app.

| File | What it is |
|---|---|
| `CLAUDE.md` | The project brief — scope, data model, and every trap we hit. Start here. |
| `projectrational.md` | Why the project is built this way: where it came from, what we added and why, what we cut, and what it would take to be real. |
| `DEMO.md` | The three-minute demo script: setup checklist, the beats, prepared answers, and what to do when something breaks. |
| `CHEATSHEET.md` | Questions a judge is likely to ask, with the answers. Skim before judging. |
| `CHECKLIST.md` | Pre-demo verification, every feature in the order a judge hits them. |
| `DEVPOST.md` | The submission write-up, paste-ready. |
| `PLAN.md` · `PROMPTS.md` | Phases, ownership, the verification log, and how the work was split. |
| `why-spacetimedb.html` | The contested claim traced against a REST equivalent. Open it in a browser — no build step. |
| `race.svg` · `race.png` | The contested-claim diagram. |

## `why-spacetimedb.html`

Written to answer one question a judge is likely to ask: *why not just build
this with a REST API?*

It carries the argument we actually want to make — not that SpacetimeDB is
faster, but that the contested claim resolves correctly **without us writing
locking code**. It states plainly that the REST version is fixable with
`SELECT … FOR UPDATE` or a CAS loop, because conceding that ourselves is
stronger than being caught by it.

Also on the page: the polling-vs-subscription traffic comparison, the three
defensible numbers (staleness window, 2-line data layer, ~190-line backend),
a ledger of what we never had to build, and the real CLI race transcript.

**Suggested use:** pull it up if a judge asks, rather than leading with it. It
is a strong answer to a question and a weaker unprompted claim.

There is also a hosted copy at
https://claude.ai/artifact/HgGfPWDFoBYa2gRaRuBKXi — private, so it needs
sharing from that page's Share menu before anyone else can open it. The file
here is the canonical one.
