Run both implementations against the same inputs:

```sh
node --test tests/underwriting.test.mjs
python3 -m unittest discover -s tests -p 'test_*.py'
```

No npm packages or network access are needed. The JavaScript tests execute the
page's actual inline functions and calculator initialization in Node's `vm` with
a small DOM stub. They check the pure formulas, calculator output, agreement with
`profitFor()`, recalculation when split assumptions change, and lead autofill.
Mocked GIS responses exercise HTTP and ArcGIS failures, visible errors, and
stored-comp fallback attribution. Sourced override priority is also checked.
Browser Maps checks are separate because the stub does not render Leaflet or
external tiles.

`underwriting-fixtures.json` is shared by Python and JavaScript. Dollar amounts
are total project amounts except `C`, which is the base cost for one house.
Rates are fractions and `target` is profit divided by finished resale value.
The expected numbers were calculated independently with Python `decimal` at
40-digit precision, then rounded to JSON numbers using these formulas:

```text
C = hard × sf × (1 + soft) + site
aduCost = adu.n × (adu.sf × adu.hard × (1 + soft) + adu.site)
          [only for a one-home project]
finished = n × psf × sf × (haircut if n > 1 else 1) + eligible ADU value
base = n × C + demo + (n − 1) × splitCost + eligible aduCost
cost = (base + land) × (1 + fin)
profit = finished × (1 − sell) − cost
margin = profit / finished
maxLand = finished × (1 − sell − target) / (1 + fin) − base
```

The four-home case uses $325/sf construction, $535,000 land, $45,000 demolition,
three $25,000 split costs, and a 20% split sale discount. It must return
$6,452,314 total financed cost, $624,806 profit, and $437,061.68 supportable land
at a 10% target. Negative supportable land remains negative; it means the target
fails even with free land. The zero-offer fixture deliberately uses a simpler
site-only budget to place the 10% threshold exactly at zero. ADU fixtures check
both the single-home cost/value contribution and exclusion from split projects.

The October 21 regression checks also cover browser/Python risk parity above
$800/sf and for null flood flags, retained lookup failures, new comp provenance,
median sensitivity, complete saved-run restoration, DSCR debt sizing in both
rental calculators, demolition and blank-price blocking.
