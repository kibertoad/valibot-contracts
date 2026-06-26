## Project Management

- This project uses pnpm. DO NOT use npm.
- Lint and format with oxlint and oxfmt (default settings). Type-check with `tsc`.

## Changesets

- Every PR that changes published package code needs at least ONE changeset.
- Create one changeset per logical change (not per package).
- Create manually: add `.changeset/<descriptive-name>.md` with YAML front matter listing
  `"valibot-api-contracts": patch|minor|major` and a concise summary.
- Changeset summaries should be specific ("add streamResponse body type" not "update contracts").

Example:

```md
---
"valibot-api-contracts": minor
---

One-line summary of what changed.
```
