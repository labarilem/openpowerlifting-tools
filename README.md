# openpowerlifting-tools

Set of tools to programmatically convert powerlifting meets data from source format to OpenPowerlifting CSV format.

The published CLI interface is:

`npx @labarilem/opl-tools generate <federation> <year> <meetId> <outputDir> [...]`

The repo currently ships with the `fipl` federation adapter. Additional federations
can plug into the same interface once their adapters are implemented.

## Usage

### Generate one meet from FIPL website

This scrapes the FIPL calendar for a given year, selects one meet by calendar sequential id, downloads and merges result PDFs in memory, parses the merged PDF, and writes final OPL files to `outputDir`.

Run without installing using the published [`@labarilem/opl-tools`](https://www.npmjs.com/package/@labarilem/opl-tools) package:

```
npx @labarilem/opl-tools generate <federation> <year> <meetId> <outputDir> [--isOpenDivision <true|false>]
```

Or, from this repo as a dev workspace:

```
npm run generate <federation> <year> <meetId> <outputDir> [--isOpenDivision <true|false>]
```

- **`federation`** (required): currently `fipl`
- **`year`** (required): positive integer calendar year
- **`meetId`** (required): positive integer id from that year's scraped calendar
- **`outputDir`** (required): destination directory for final outputs

Optional flags:

- **`--isOpenDivision <true|false>`**: forwarded to the active federation parser; currently this is used by the FIPL parser.

Output files in `outputDir`:

- `meet.csv`
- `URL`
- `entries.csv`

Examples:

```
npx @labarilem/opl-tools generate fipl 2026 8 ./out
npm run generate fipl 2026 8 tests/dataset/fipl/2608
```

This will generate OPL data for the meet `3° Campionato Italiano di Powerlifting Open Classic Femminile` from the FIPL 2026 calendar, and write the output to `tests/dataset/fipl/2608`.

## Development

### Run tests

Run this to test the parser on the full test dataset:

```
npm test
```

### Import entries into test dataset from OPL repo

Run:

```
npm run import-opl-meet <federation> <meet id>
```

If you run it without arguments, the script will show its documentation.

Example to import a FIPL meet from default OPL repo path to default output dir:

```
npm run import-opl-meet fipl 2605
```

### Import one meet from the scraped calendar JSON

Run:

```
npm run import-calendar-meet <federation> <year> <meetCalendarId> <outputDir>
```

Example (calendar id `6` in `2026.json` → same sources as test meet `2607`):

```
npm run import-calendar-meet fipl 2026 6 tests/dataset/fipl/2607
```

## Format columns

Run:

```
npm run format <path to csv> <column name> <number of digits>
```

Example:

```
npm run format tests/dataset/fipl/2602/entries.csv BodyweightKg 2
```

## Compare names

Run:

```
npm run compare <federation> <meetId> [columnName]
```

Example:

```
npm run compare fipl 2601 Name
```

## Compile athletes

Build a unique list of athletes (Name + BirthYear) across all meets for one federation.

Run:

```
npm run compile-athletes <federation> [repoPath]
```

If `repoPath` is omitted, the script uses `defaultOplDataRepoPath` from `config.js`.

Example:

```
npm run compile-athletes fipl
```

Output is written to:

```
packages/opl-tools/data/<federation>/athletes.csv
```

## Update federation calendar

Run:

```
npm run update-calendar <federation> [year]
```

- **`federation`** (required): e.g. `fipl`
- **`year`** (optional): defaults to the current calendar year

Example:

```
npm run update-calendar fipl 2026
```

## Set column value

Set all values of one column in a meet `entries.csv`.

Run:

```
npm run set-column <federation> <meetId> <columnName> <columnValue>
```

Example:

```
npm run set-column fipl 2507 Division Open
```

## Release

Release the NPM package from `packages/opl-tools`.

1. Bump the package version in `packages/opl-tools/package.json` (or run `npm version <patch|minor|major>` inside `packages/opl-tools`).

2. Verify NPM auth for the publishing account:

```
npm whoami
```

Run this if not already logged in:

```
npm login
```

4. Publish:

```
npm run publish
```

5. Verify the release on NPM:

```
npm view @labarilem/opl-tools version
```

## License

This project is released under the MIT License.
