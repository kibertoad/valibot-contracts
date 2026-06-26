# valibot-api-contracts

## 0.2.0

### Minor Changes

- e6f0052: Initial release: valibot port of the contract-first API contracts library. Provides
  `defineApiContract` with valibot schemas, JSON / text / blob / stream / SSE response wrappers
  (including the new `streamResponse` for zero-buffering `ReadableStream<Uint8Array>` bodies),
  wildcard and default status-code keys, and client request/response type inference.

### Patch Changes

- e6f0052: Match response content-types by media-type essence instead of substring: structured `+json`
  suffixes (`application/problem+json`, `application/vnd.api+json`) now resolve as JSON, and an
  over-broad declared type no longer shadows a more specific one in `anyOfResponses`. Drop non-SSE
  success codes from `InferSseClientResponse` (and SSE-only success codes from
  `InferNonSseClientResponse`) instead of leaving them with an unusable `body: never`. Make request
  params optional when their schema input admits `undefined` (e.g. a top-level `optional(...)`).
