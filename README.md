# valibot-contracts

A pnpm + TypeScript monorepo for valibot-based API contracts.

## Packages

- [`valibot-api-contracts`](./packages/api-contracts) — contract-first API definitions
  (`defineApiContract`) with valibot schemas, shared between frontend and backend.

## Development

```sh
pnpm install
pnpm build      # build all packages
pnpm lint       # oxlint + oxfmt + tsc
pnpm test:ci    # run tests with coverage
```

This repo uses pnpm, turbo, changesets, and oxlint/oxfmt. Do not use npm.
