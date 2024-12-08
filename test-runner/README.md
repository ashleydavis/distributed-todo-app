# test-runner

A custom test runner that runs many variations of broker + multiple clients.

For each test, each client generates a random sequence of database updates over a random time duration. Then the test runner waits for for all clients to come into sync before passing a test.

The tests are defined in [./test-specs.json](./test-specs.json). The random seeds are captured for each test so that the random sequence of database updates is replayed for each test. New randomized tests can be generated using the script [./src/create-tests.ts](./src/create-tests.ts).

## Run the basic test

```bash
pnpm test
```

## Run the custom test runner

This runs 40 long tests and can take significant type to complete.

```bash
pnpm start
```

