---
"valibot-api-contracts": patch
---

Match response content-types by media-type essence instead of substring: structured `+json`
suffixes (`application/problem+json`, `application/vnd.api+json`) now resolve as JSON, and an
over-broad declared type no longer shadows a more specific one in `anyOfResponses`. Drop non-SSE
success codes from `InferSseClientResponse` (and SSE-only success codes from
`InferNonSseClientResponse`) instead of leaving them with an unusable `body: never`. Make request
params optional when their schema input admits `undefined` (e.g. a top-level `optional(...)`).
