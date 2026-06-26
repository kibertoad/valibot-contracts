---
"valibot-api-contracts-testing": minor
---

Initial release: testing utilities for mocking contract responses. Adds `ApiContractMockttpHelper`
(mockttp) and `MswHelper` (msw) with a shared `mockResponse` that validates the body through the
contract's valibot schema, covering JSON / text / blob / stream / SSE / no-body / dual-mode
responses and exact → range → `'default'` status-code resolution. `MswHelper.mockSseStream` emits
SSE events on demand. Also exports `formatSseResponse` and the `MockResponseParams` type.
