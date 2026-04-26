# openpowerlifting-tools

Set of tools to programmatically convert powerlifting meets data from source format to OpenPowerlifting CSV format.
Currently only the FIPL federation is supported.

## Development

### Run tests

Run this to test the parser on the full test dataset:

```
npm test
```

### Import entries into test dataset from OPL repo

Run:

```
npm run import <federation> <meet id>
```

If you run it without arguments, the script will show its documentation.

Example to import a FIPL meet from default repo path to default output dir:

```
npm run import fipl 2605
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

## License

This project is released under the MIT License.