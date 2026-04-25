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
npm run import <meet id> <opl repo path> <out dir path>
```

Example:

```
npm run import 2605 ../opl-data/ ./tests/dataset/fipl/2605
```

## License

This project is released under the MIT License.