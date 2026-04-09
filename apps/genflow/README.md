# Genflow

Unified Electron desktop app for generating demo websites on behalf of the Saleflow backend.

## Architecture

Runs on Douglas's Mac. When the app is open, it polls the Saleflow backend every 5 seconds for pending `GenerationJob`s, picks them up, runs the full pipeline locally (scrape → strategy → layout → parallel pages → polish → image verify → Vercel deploy), and posts the result URL back to Saleflow.

## Running in development

```
pnpm install
pnpm dev
```

## Building for production

```
pnpm build
pnpm package
```

See `docs/superpowers/specs/2026-04-09-genflow-unified-redesign.md` for the full spec.
