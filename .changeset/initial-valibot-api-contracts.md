---
"valibot-api-contracts": minor
---

Initial release: valibot port of the contract-first API contracts library. Provides
`defineApiContract` with valibot schemas, JSON / text / blob / stream / SSE response wrappers
(including the new `streamResponse` for zero-buffering `ReadableStream<Uint8Array>` bodies),
wildcard and default status-code keys, and client request/response type inference.
