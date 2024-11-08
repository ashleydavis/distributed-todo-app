# frontend

The frontend for the example todo application.

The database for the todo application is entirely stored locally in indexeddb. When the application is open in multiple browsers/tabs each one syncrhonizes their database updates via the broker.

## Serve the web page with live reload

```bash
pnpm start
```

Open a browser and navigate to [http://localhost:1234/](http://localhost:1234/).

## Build the static web page

```bash
pnpm run build
```

The static web page is output to the `dist` subdirectory.

You can test it using `live-server`:

```bash
cd dist
npm install -g live-server
live-server
```

## Build the TypeScript code

Do this if you want to check for compile errors.

```bash
pnpm run compile
```
