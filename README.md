# distributed-todo-app

A example todo app that uses a peer-to-peer client-side and distributed database. No data is stored in the server, all data is stored on the clients in indexeddb and updates are synchronized via the broker.

Extensively tested on up to 20 nodes, each randomly generating data updates and synchronizing the updates with the other nodes.

## Pre reqs

Install Node.js: https://nodejs.org/

Install Pnpm:

```bash
npm install -g pnpm
```

## Setup

```bash
pnpm install
```

## Compile the code

```bash
pnpm run compile
```

Keep compiling (for the `sync` package) while updating the code:

```bash
pnpm run compile:watch
```

## Run the broker

```bash
pnpm run broker
```

## Run test node A

```bash
cd node
pnpm run node-a
```

## Run test node B

```bash
cd node
pnpm run node-b
```

## Run automated tests

```bash
pnpm test
```

## Long test runner

```bash
pnpm run test-runner
```

## Run a single test

```bash
pnpm run test-runner -- --test-id=ab43840f-65d3-4341-b949-7a41e21ed52a
```