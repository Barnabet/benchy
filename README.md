# benchy

Benchmark scores for every Anthropic, Google and OpenAI model, past and present, pulled from [Epoch AI's benchmarking hub](https://epoch.ai/benchmarks) and shown on a dashboard I control.

No dependencies: Node 22+ for the scripts, plain HTML/CSS/JS with hand-drawn SVG for the site.

## Setup

1. `npm run fetch` downloads Epoch's export (`benchmark_data.zip`, no key needed) and writes `site/data/models.json`: Anthropic, Google and OpenAI models only, normalized for the site.
2. `npm run serve` and open http://localhost:8000.
3. `npm test` runs the tests for the CSV and zip readers and the normalizing step.

Epoch's export already holds every past model and score, so there are no local snapshots; run the fetch again to pick up new models.

## The data

- **One row per setting.** Epoch scores each reasoning setting on its own, so "Claude Sonnet 5.5 (max)" and "Claude Sonnet 5.5 (low)" are separate rows. When Epoch has scored a setting more than once (different scaffolds, reruns), the best run counts.
- **ECI**, the Epoch Capabilities Index, is the default metric. Epoch computes it per model rather than per setting, so every setting of a model shows the same value.
- **Benchmarks** come from Epoch's `benchmark_metadata.csv`, which names each benchmark's file, score column and scale; scores are shown as percentages. Benchmarks Epoch has replaced with a newer version are grouped under "Superseded".

## The dashboard

- **Metric picker**: ECI and every benchmark with at least one Anthropic, Google or OpenAI score, most widely run first.
- **Best per provider**: each provider's top model on the chosen metric, plus which provider leads.
- **Timeline**: every model plotted at its release date, with a step line tracking each provider's best so far.
- **Table**: every model and metric, sortable by any column.
- **Filters** for provider, release window and name search. They apply to everything on the page and are saved in the URL, so a view can be bookmarked.

To add more model creators, edit `CREATORS` in `scripts/lib/epoch.mjs`, and `PROVIDERS`/`SHAPES` in `site/app.js` plus a color token in `site/styles.css`.

Data: Epoch AI, ‘Capabilities & benchmarking’, published at epoch.ai under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The site footer credits it.
