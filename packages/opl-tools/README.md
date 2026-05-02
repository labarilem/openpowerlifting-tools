# @labarilem/opl-tools

CLI tools to convert powerlifting meet results into OpenPowerlifting CSV format.

Currently the only supported federation is FIPL.

## Usage

Run without installing using `npx`:

```
npx @labarilem/opl-tools generate <federation> <year> <meetId> <outputDir> [--isOpenDivision <true|false>]
```

- **`federation`** (required): currently only `fipl`
- **`year`** (required): positive integer calendar year
- **`meetId`** (required): positive integer id from that year's scraped calendar
- **`outputDir`** (required): destination directory for final outputs

Optional flags:

- **`--isOpenDivision <true|false>`**: forwarded to the FIPL parser; in some cases this is needed to get the correct division for a meet.

The command scrapes the FIPL calendar for the given year, selects one meet by its calendar sequential id, downloads and merges the result PDFs in memory, parses the merged PDF, and writes the final OPL files to `outputDir`.

Output files in `outputDir`:

- `meet.csv`
- `URL`
- `entries.csv`

### Example

```
npx @labarilem/opl-tools generate fipl 2026 8 ./out
```

Generates OPL data for the meet `23° TROFEO COPPA BERTOLETTI DI PANCA ATTREZZATA MASCHILE E FEMMINILE` from the FIPL 2026 calendar and writes the output to `./out`.

## Notes

- First-run cost: this package depends on `puppeteer`, which downloads a Chromium build the first time it is installed by `npx`. Subsequent runs reuse the cached browser and are fast.
- Requires Node.js `>= 18.18`.

## Source

Development happens at [github.com/labarilem/openpowerlifting-tools](https://github.com/labarilem/openpowerlifting-tools).

## License

MIT
