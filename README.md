# Market Evidence Site

Source-first site for role-value research. The first screen is a professional evidence brief across five benchmark families; the full 50-row public compensation ledger, evidence grades, source warnings, source audit, 176-record employer coverage register, direct source links, Google Sheets, and CSV downloads remain available behind it.

## Run locally

From `/Users/rwego/Documents/My Career`:

```bash
python3 -m http.server 4173 --directory market-evidence-site
```

Open `http://localhost:4173`.

## Included public tables

- `data/Rwego_Market_Evidence_Public_Comparison_Aug_2026_RWF.csv`
- `data/Rwego_Public_Market_Source_Audit_Aug_2026.csv`
- `data/Rwego_Employer_Coverage_Public_Comparison_Aug_2026_RWF.csv`

The site intentionally includes only public comparator records. Each compensation row keeps a clickable `Money source URL`; RWF is shown as a labeled conversion rather than a replacement for the source currency. Nairobi and other regional observations remain visibly regional and are not presented as Kigali salary equivalence.
