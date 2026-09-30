# benchy

Benchmark scores for every Anthropic, Google and OpenAI model, past and present, pulled from the [Artificial Analysis](https://artificialanalysis.ai) data API and shown on a dashboard I control.

No dependencies: Node 22+ for the scripts, plain HTML/CSS/JS with hand-drawn SVG for the site.

## Setup

1. Get a free API key from Artificial Analysis.
2. `cp .env.example .env` and paste the key in.
3. `npm run fetch` pulls every model and writes:
   - `data/snapshots/YYYY-MM-DD.json`: the raw API response, all creators, one file per day. Scores and index versions change over time, so these add up to a history.
   - `site/data/models.json`: Anthropic, Google and OpenAI models only, normalized for the site.
4. `npm run serve` and open http://localhost:8000.

The free tier allows roughly 100 requests a day, and one fetch uses one request per page of 200 models.

## The dashboard

- **Metric picker** covering whatever the API returns: the Intelligence, Coding and Agentic indices, individual benchmarks, price and speed. Fields the fetch script doesn't know about still show up with a generated label.
- **Best per provider**: each provider's top model on the chosen metric, plus which provider leads.
- **Timeline**: every model plotted at its release date, with a step line tracking each provider's best so far. Prices use a log scale.
- **Table**: every model and metric, sortable by any column.
- **Filters** for provider, release window and name search. They apply to everything on the page and are saved in the URL, so a view can be bookmarked.

To add more model creators, edit `CREATORS` in `scripts/fetch.mjs`, and `PROVIDERS`/`SHAPES` in `site/app.js` plus a color token in `site/styles.css`.

Data © Artificial Analysis, which requires attribution when using its free API. The site footer links back to it.
