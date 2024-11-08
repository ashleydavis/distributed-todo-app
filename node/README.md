# node

The node simulates a client and is used for testing.

The long test runner starts mulitple nodes. Each one generates random changes to its database that are exchanged with other nodes. After a certain amount of generation time the nodes stop updating their databases. The test run passes as soon as all nodes have syncrhonized to the point where they all have the exact same database content.


## Run it

```bash
pnpm start
```

## Run it in dev

```bash
pnpm run dev
```

## Run independent example nodes

```bash
pnpm run node-a
pnpm run node-b
pnpm run node-c
```

## Compiled TypeScript code

```bash
pnpm run compile
```