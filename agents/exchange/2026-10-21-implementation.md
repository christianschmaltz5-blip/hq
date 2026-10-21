# Implemented exchange recommendations — October 21, 2026

Christian authorized implementing the land-lead changes from the Claude/Codex discussion. Source: October 20 AM/PM and October 21 AM exchange notes.

Implemented:
- Unknown flood and missing sale dates are displayed honestly; null/missing flood uses the same existing penalty as false.
- Preserved the +15 missing-sale-date credit; corrected its explanation without changing the scoring weight.
- Retained land/new-build lookup failures and source timestamps; future house/new-build queries retain comp APN, construction year and distance.
- Browser risk now matches Python above $800/sf.
- Added median sensitivity and shared-comp markers beside lead verdicts and in map popups, leaving second-highest pricing in place.
- Saved runs restore ADU, split and lender inputs, minimum lot and usable share.
- Both rental calculators cap permanent debt by LTV and DSCR, block missing purchase prices, and include demolition where applicable.
- Split capacity and ADU eligibility remain unconfirmed scenarios.

Validation: 25 Python tests and 49 JavaScript tests pass offline. Browser verified rental mode, default DSCR-limited loan ($542,610 versus $671,878 LTV maximum), blank-price blocking, flood-unknown display and Maps rendering after Calculator. Stored verdicts recalculated offline without inventing comp retrieval dates.

Deferred: legal-rule research, SHAPE feed migration/coverage, construction lease-up, null-geocode retry maintenance, and changes to the +15 scoring weight. No owner contacts were sent. Existing permit geocode cache and prior exchange notes were left untouched.
