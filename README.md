# Counting Couch

The complete portable site source lives in `dist/`. Run `python3 -m http.server 8000 --directory dist` from this folder, then open `http://localhost:8000/`. Deploy the contents of `dist/` as the root of any static web host. Update the public Open Graph URLs if you move the domain.

Start with **Claude Project Handoff.txt** for orientation. **claude-project/Website Source.txt** bundles the editable HTML, CSS, JavaScript and app metadata into a single text file for Claude Projects. Claude Code can open this folder directly. The datasets and media are already built.

## Data sources and regeneration

The historical import takes one folder of inputs. Run `python3 scripts/import-history.py /path/to/raw`. It rebuilds the yearly JSON files and the coverage index.

| Input | Source |
| --- | --- |
| `house.tsv` | [MIT Election Data and Science Lab U.S. House](https://doi.org/10.7910/DVN/IG0UN2). The pinned CSV bytes can be obtained from the [ConRep mirror](https://crproject.org/data/jsoncsv/mit-1976-2024-house.csv). The script checks the Harvard Dataverse MD5. |
| `senate.tsv` | [MEDSL U.S. Senate](https://doi.org/10.7910/DVN/PEJ5QU), [Dataverse datafile 13887039](https://dataverse.harvard.edu/api/access/datafile/13887039). |
| `president.csv` | [MEDSL U.S. President](https://doi.org/10.7910/DVN/42MVDX), [Dataverse datafile 13887042](https://dataverse.harvard.edu/api/access/datafile/13887042). |
| `president-history.csv` | [The American Vote, State results in U.S. presidential elections, 1789–2024](https://theamericanvote.com/data), [CSV download](https://theamericanvote.com/data/state-results-1789-2024.csv). Adapted for display under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). |
| `house-parties.html` | [House History, Art & Archives, Party Divisions](https://history.house.gov/Institution/Party-Divisions/Party-Divisions/). National initial-election seat counts are distinct from the archive’s district records. |
| `governor-xx.json` | [Election Wrld data archive](https://www.electionwrld.com/data) per-state Governor export at `/api/v1/datasets/governor?state=xx`, compiled from state canvasses and [Cha, Kuriwaki and Snyder](https://doi.org/10.7910/DVN/DGDRDT). The Election Wrld compilation is credited and its [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) terms apply to its contributions. |

The National Archives [Electoral College results](https://www.archives.gov/electoral-college/results) are the authority for the national electoral tally. For official historical federal vote reports, see the [House Clerk's election statistics](https://history.house.gov/Institution/Election-Statistics/Election-Statistics/). See `dist/map-license.txt` for the map attribution.

## County map data

The 3D county map (`dist/county.js`, opened from a state's race detail or with `index.html?county=MS`) reads `dist/counties/XX.json`. The **County map data** GitHub Action builds those files with `python3 scripts/import-counties.py RAW_DIR --fetch`, which downloads the shapes and reads the committed returns:

| Input | Source |
| --- | --- |
| `countypres.csv` | [MIT Election Data and Science Lab, County Presidential Election Returns 2000–2024](https://doi.org/10.7910/DVN/VOQCHQ). The Election Lab requires a short guestbook form, so a person downloads `countypres_2000-2024.csv` once and commits it to `data/`. |
| `counties.zip` | [Census cartographic boundary counties, 1:5,000,000](https://www.census.gov/geographies/mapping-files/time-series/geo/carto-boundary-file.html) for the same year. Public domain. |

Run it from the Actions tab, or it runs when the importer or workflow changes. Every county file is labeled `historical` with its year, office and sources. Counties whose shapes have no matching returns (Alaska's boroughs, some Connecticut regions) stay in the file as gaps and draw as dashed outlines. 2026 county returns are not wired in yet.

## Operational notes

- For archive queries use `elections.html?year=1924&office=President&state=WI`.
- For comparisons use `elections.html?view=compare&office=President&a=1924&b=2024&state=WI`.
- For local results use `elections.html?view=local&region=los-angeles&race=182171`.
- For future elections use `elections.html?view=outlook&event=us-2028`.
- After changing static assets, update the cache version in `dist/sw.js`. Build artifacts are already present.
- Browser feeds depend on public provider availability and CORS. Data import never requires site hosting credentials.
- The Story videos are dated promotional materials. The longer cut captures an earlier version of the site and remains a reusable promo asset.

## Rebuild the local snapshot

Run `python3 scripts/import-local.py /path/to/local-inputs`. The input folder contains:

- `sd.html` from the [official San Diego County November 2026 results portal](https://www.livevoterturnout.com/ENR/sandiegocaenr/25/en/Index_25.html). The importer uses the county's displayed publication timestamp and vote totals.
- `local-Los-Angeles.json` and `local-Orange-County.json` from the [civicAPI race search](https://civicapi.org/api-documentation). Request the election date 2026-11-03, country US, province CA, limit 100, and query Los Angeles or Orange County.

The San Diego County portal does not expose a cross-origin browser feed, so the local desk shows a dated snapshot and an official results button for San Diego and La Mesa. Los Angeles and the other featured provider searches refresh on the open page.
