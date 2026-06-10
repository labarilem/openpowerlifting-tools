# @labarilem/opl-tools

CLI tools to convert powerlifting meet results into OpenPowerlifting CSV format.

This package keeps a stable CLI interface:

`npx @labarilem/opl-tools generate <federation> <year> <meetId|latest> <outputDir> [...]`

It currently ships with the `fipl` federation adapter. Additional federations can
plug into the same command shape once their adapters are implemented.

## Usage

Run without installing using `npx`:

```
npx @labarilem/opl-tools generate <federation> <year> <meetId|latest> <outputDir> [--isOpenDivision <true|false>]
```

- **`federation`** (required): currently `fipl`
- **`year`** (required): positive integer calendar year
- **`meetId`** (required): positive integer id from that year's scraped calendar, or `latest` to select the most recent meet in that year that already has published result PDFs
- **`outputDir`** (required): destination directory for final outputs

Optional flags:

- **`--isOpenDivision <true|false>`**: forwarded to the active federation parser; currently this is used by the FIPL parser.

The command resolves the requested federation adapter, scrapes that federation's
calendar for the given year, selects one meet by its calendar sequential id or by
`latest`, downloads and merges the result PDFs in memory, parses the merged PDF,
and writes the final OPL files to `outputDir`.

When `meetId` is `latest`, the command picks the meet with the most recent
calendar date among meets that already have at least one result PDF URL.

Output files in `outputDir`:

- `meet.csv`
- `URL`
- `entries.csv`

### Examples

Generate a specific meet by calendar id:

```
npx @labarilem/opl-tools generate fipl 2026 8 ./out
```

Generates OPL data for the meet `23° TROFEO COPPA BERTOLETTI DI PANCA ATTREZZATA MASCHILE E FEMMINILE` from the FIPL 2026 calendar and writes the output to `./out`.

Generate the most recent meet with published results:

```
npx @labarilem/opl-tools generate fipl 2026 latest ./out
```

The CLI resolves `latest` to the newest meet in the scraped calendar that already
has result PDFs, then generates the same output files as above.

## Notes

- First-run cost: this package depends on `puppeteer`, which downloads a Chromium build the first time it is installed by `npx`. Subsequent runs reuse the cached browser and are fast.
- Requires Node.js `>= 18.18`.

## Source

Development happens at [github.com/labarilem/openpowerlifting-tools](https://github.com/labarilem/openpowerlifting-tools).

## License

MIT
