# docs/

Pitch and explanation assets. Nothing here is part of the app.

| File | What it is |
|---|---|
| `why-spacetimedb.html` | The contested-claim race traced side by side against a REST equivalent, plus the three numbers we can defend. Open it in a browser — no build step, no dependencies. |

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
