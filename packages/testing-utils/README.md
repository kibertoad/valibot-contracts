# valibot-api-contracts-testing

Testing utilities for mocking HTTP responses defined with
[`valibot-api-contracts`](https://github.com/kibertoad/valibot-contracts). Two helpers register
mock rules from a contract and validate the response body through the contract's valibot schema:

| Helper                     | Backend                                           | Use case                      |
| -------------------------- | ------------------------------------------------- | ----------------------------- |
| `ApiContractMockttpHelper` | [mockttp](https://github.com/httptoolkit/mockttp) | server-side integration tests |
| `MswHelper`                | [msw](https://mswjs.io)                           | frontend tests                |

`mockttp`, `msw`, and `valibot` are optional peer dependencies; install whichever you use.

## Table of contents

- [ApiContractMockttpHelper](#apicontractmockttphelper)
  - [mockResponse](#mockresponse)
  - [Response kinds](#response-kinds)
  - [Range and wildcard status keys](#range-and-wildcard-status-keys)
  - [Type safety](#type-safety)
- [MswHelper](#mswhelper)
  - [mockResponse](#mockresponse-1)
  - [mockSseStream](#mockssestream)
- [formatSseResponse](#formatsseresponse)

## ApiContractMockttpHelper

Mock HTTP responses in mockttp-based tests.

### Setup

```ts
import { getLocal } from "mockttp";
import { ApiContractMockttpHelper } from "valibot-api-contracts-testing";

const mockServer = getLocal();
const helper = new ApiContractMockttpHelper(mockServer);

beforeEach(() => mockServer.start());
afterEach(() => mockServer.stop());
```

### mockResponse

Registers a mock rule for the given contract. `responseStatus` is the concrete numeric HTTP status
code the mock sends. It also selects which schema is used: the helper looks up the contract entry
with exact → range → `'default'` precedence, so a contract with only a `'2xx'` key accepts any
`responseStatus` in 200-299.

```ts
import { defineApiContract } from "valibot-api-contracts";
import { object, string } from "valibot";

const contract = defineApiContract({
  method: "get",
  pathResolver: () => "/users",
  responsesByStatusCode: { 200: object({ id: string() }) },
});

await helper.mockResponse(contract, {
  responseStatus: 200,
  responseJson: { id: "1" },
});
```

The body is validated and stripped through the contract's valibot schema before being sent. Path
params are required when the contract declares `requestPathParamsSchema`:

```ts
const getUser = defineApiContract({
  method: "get",
  requestPathParamsSchema: object({ userId: string() }),
  pathResolver: ({ userId }) => `/users/${userId}`,
  responsesByStatusCode: { 200: object({ id: string() }) },
});

await helper.mockResponse(getUser, {
  pathParams: { userId: "42" },
  responseStatus: 200,
  responseJson: { id: "42" },
});
```

### Response kinds

`params` is a discriminated union on `responseStatus`. The body fields required for a status code
are inferred from the contract's response entry for that code:

| Response entry                        | Required field                |
| ------------------------------------- | ----------------------------- |
| valibot schema (JSON)                 | `responseJson: InferInput<T>` |
| `sseResponse(schemas)`                | `events: { event; data }[]`   |
| `textResponse(contentType)`           | `responseText: string`        |
| `blobResponse(contentType)`           | `responseBlob: string`        |
| `streamResponse(contentType)`         | `responseStream: string`      |
| `ContractNoBody` / `noBodyResponse()` | _(none)_                      |
| `anyOfResponses([sse, json])`         | `responseJson` + `events`     |

For SSE contracts, the mock replies with a `text/event-stream` body built from `events`:

```ts
import { sseResponse } from "valibot-api-contracts";

const sse = defineApiContract({
  method: "get",
  pathResolver: () => "/events/stream",
  responsesByStatusCode: {
    200: sseResponse({ completed: object({ totalCount: number() }) }),
  },
});

await helper.mockResponse(sse, {
  responseStatus: 200,
  events: [{ event: "completed", data: { totalCount: 1 } }],
});
```

For dual-mode contracts (`anyOfResponses([sseResponse(...), schema])`), the mock routes on the
request's `Accept` header: `text/event-stream` receives the SSE stream, everything else receives
the JSON body. Both `events` and `responseJson` are required.

### Range and wildcard status keys

Contracts may use range keys (`'1xx'`-`'5xx'`) or `'default'` instead of exact codes. Pass any
concrete numeric code covered by that range as `responseStatus`; the helper resolves the entry with
the same exact → range → `'default'` precedence as the runtime client.

### Type safety

`MockResponseParams<TContract>` is exported for typing the params object separately:

```ts
import type { MockResponseParams } from "valibot-api-contracts-testing";

function mockUser(params: MockResponseParams<typeof getUserContract>) {
  return helper.mockResponse(getUserContract, params);
}
```

## MswHelper

The msw counterpart. Construct it with a base URL, then register handlers on an msw `SetupServer`.
`mockResponse` takes the same `MockResponseParams` as the mockttp helper.

```ts
import { setupServer } from "msw/node";
import { MswHelper } from "valibot-api-contracts-testing";

const server = setupServer();
const helper = new MswHelper("http://localhost:8080");

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

### mockResponse

```ts
helper.mockResponse(contract, server, {
  responseStatus: 200,
  responseJson: { id: "1" },
});
```

### mockSseStream

Returns an `SseEventController` for emitting SSE events on demand instead of all at once. Works with
SSE and dual-mode contracts; for dual-mode contracts, non-SSE requests receive `responseJson`.

```ts
const controller = helper.mockSseStream(sseContract, server);

const response = await fetch("http://localhost:8080/events/stream");

controller.emit({ event: "completed", data: { totalCount: 1 } });
controller.close();
```

Event names and data shapes are inferred from the contract's SSE schemas.

## formatSseResponse

A standalone helper for manual SSE body formatting:

```ts
import { formatSseResponse } from "valibot-api-contracts-testing";

const body = formatSseResponse([{ event: "completed", data: { totalCount: 1 } }]);
// "event: completed\ndata: {\"totalCount\":1}\n"
```
