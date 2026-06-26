# valibot-api-contracts

API contracts are shared definitions that live in a shared package and are consumed by both the
client and the backend. The contract describes a route — its path, HTTP method, and
request/response schemas — and serves as the single source of truth for both sides.

The backend implements the route against the contract. The client uses the same contract to make
type-safe requests without duplicating configuration. This keeps documentation, validation, and
types in sync across the boundary.

Schemas are [valibot](https://valibot.dev) schemas. `valibot` is a peer dependency.

## Defining contracts

### REST routes

```ts
import { defineApiContract, noBodyResponse } from "valibot-api-contracts";
import { object, string, pipe, uuid } from "valibot";

// GET with path params
const getUser = defineApiContract({
  method: "get",
  requestPathParamsSchema: object({ userId: pipe(string(), uuid()) }),
  pathResolver: ({ userId }) => `/users/${userId}`,
  responsesByStatusCode: {
    200: object({ id: string(), name: string() }),
  },
});

// POST
const createUser = defineApiContract({
  method: "post",
  pathResolver: () => "/users",
  requestBodySchema: object({ name: string() }),
  responsesByStatusCode: {
    201: object({ id: string(), name: string() }),
  },
});

// DELETE with no response body
const deleteUser = defineApiContract({
  method: "delete",
  requestPathParamsSchema: object({ userId: pipe(string(), uuid()) }),
  pathResolver: ({ userId }) => `/users/${userId}`,
  responsesByStatusCode: {
    204: noBodyResponse(),
  },
});
```

### Non-JSON responses

For responses that are not JSON, three wrappers record the response `content-type` in the contract
and differ only in the JS type the client materializes the body into:

- `textResponse(contentType)` → `string`. Convenient for small text payloads (CSV, plain text).
- `blobResponse(contentType)` → `Blob`. Buffered; offers `.text()`, `.arrayBuffer()`, `.stream()`.
- `streamResponse(contentType)` → `ReadableStream<Uint8Array>`. Zero buffering; stream large
  payloads directly, or wrap for convenience via `new Response(body).text()` / `.blob()` /
  `.arrayBuffer()`.

```ts
import {
  defineApiContract,
  textResponse,
  blobResponse,
  streamResponse,
} from "valibot-api-contracts";

const exportCsv = defineApiContract({
  method: "get",
  pathResolver: () => "/export.csv",
  responsesByStatusCode: { 200: textResponse("text/csv") },
});

const downloadPhoto = defineApiContract({
  method: "get",
  pathResolver: () => "/photo.png",
  responsesByStatusCode: { 200: blobResponse("image/png") },
});

// large export streamed without buffering the whole body in memory
const streamExport = defineApiContract({
  method: "get",
  pathResolver: () => "/export-large.csv",
  responsesByStatusCode: { 200: streamResponse("text/csv") },
});
```

### SSE and dual-mode routes

Use `sseResponse()` inside `responsesByStatusCode` to define SSE event schemas. For endpoints that
respond with either JSON or an SSE stream depending on the `Accept` header, use `anyOfResponses()`
to declare both options on the same status code.

```ts
import { defineApiContract, sseResponse, anyOfResponses } from "valibot-api-contracts";
import { object, string } from "valibot";

// SSE-only
const notifications = defineApiContract({
  method: "get",
  pathResolver: () => "/notifications/stream",
  responsesByStatusCode: {
    200: sseResponse({
      notification: object({ id: string(), message: string() }),
    }),
  },
});

// Dual-mode: JSON response or SSE stream depending on Accept header
const chatCompletion = defineApiContract({
  method: "post",
  pathResolver: () => "/chat/completions",
  requestBodySchema: object({ message: string() }),
  responsesByStatusCode: {
    200: anyOfResponses([
      sseResponse({
        chunk: object({ delta: string() }),
        done: object({ finish_reason: string() }),
      }),
      object({ text: string() }),
    ]),
  },
});
```

### Wildcard and default response keys

In addition to exact status codes, `responsesByStatusCode` accepts OpenAPI-style range keys
(`'1xx'`–`'5xx'`) and `'default'` as fallbacks. Lookup precedence at runtime:
exact code → range key → `'default'`.

```ts
import { defineApiContract } from "valibot-api-contracts";
import { object, array, string, unknown } from "valibot";

const listItems = defineApiContract({
  method: "get",
  pathResolver: () => "/items",
  responsesByStatusCode: {
    "2xx": object({ items: array(string()) }),
    "4xx": object({ message: string() }),
  },
});

const flexible = defineApiContract({
  method: "get",
  pathResolver: () => "/data",
  responsesByStatusCode: {
    200: object({ data: unknown() }),
    default: object({ error: string() }),
  },
});
```

The `'2xx'` range key participates in SSE detection and success/error type narrowing exactly like
explicit 2xx codes. `'default'` is split into a success half (`SuccessfulHttpStatusCode`) and a
non-success half in `InferSseClientResponse` / `InferNonSseClientResponse` so error narrowing stays
correct regardless of the actual status code.

### OpenAPI response descriptions

All response factories accept an optional `ResponseOptions` object as their last argument.

```ts
import {
  defineApiContract,
  noBodyResponse,
  blobResponse,
  streamResponse,
  sseResponse,
  anyOfResponses,
} from "valibot-api-contracts";
import { object, string } from "valibot";

const contract = defineApiContract({
  method: "post",
  pathResolver: () => "/files",
  requestBodySchema: object({ name: string() }),
  responsesByStatusCode: {
    204: noBodyResponse({ description: "Deleted — no content returned" }),
    200: anyOfResponses(
      [
        object({ id: string() }),
        blobResponse("application/pdf", { description: "PDF report" }),
        streamResponse("text/csv", { description: "Streamed CSV export" }),
        sseResponse({ update: object({ id: string() }) }, { description: "Live update stream" }),
      ],
      { description: "Multiple response formats available" },
    ),
  },
});
```

### All fields

```ts
type ApiContractOptions = {
  // Required
  method: "get" | "post" | "put" | "patch" | "delete";
  pathResolver: (pathParams: Record<string, string>) => string;
  // Accepts exact codes, range keys ('1xx'–'5xx'), and a catch-all 'default'.
  // Lookup precedence at runtime: exact code → range key → 'default'.
  responsesByStatusCode: Partial<
    Record<
      HttpStatusCode | "1xx" | "2xx" | "3xx" | "4xx" | "5xx" | "default",
      | GenericSchema
      | NoBodyResponse
      | TypedTextResponse
      | TypedBlobResponse
      | TypedStreamResponse
      | TypedSseResponse
      | AnyOfResponses
    >
  >;

  // Path params — links pathResolver parameter type to the schema
  requestPathParamsSchema?: ObjectSchema;

  // Request
  requestBodySchema?: GenericSchema | ContractNoBody; // required for POST/PUT/PATCH, forbidden otherwise
  requestQuerySchema?: ObjectSchema;
  requestHeaderSchema?: ObjectSchema;

  // Response
  responseHeaderSchema?: ObjectSchema;

  // Documentation
  summary?: string;
  description?: string;
  tags?: readonly string[];
  metadata?: Record<string, unknown>;
};
```

### Header schemas

```ts
const contract = defineApiContract({
  method: "get",
  pathResolver: () => "/api/data",
  requestHeaderSchema: object({
    authorization: string(),
    "x-api-key": string(),
  }),
  responseHeaderSchema: object({
    "x-ratelimit-remaining": string(),
    "cache-control": string(),
  }),
  responsesByStatusCode: {
    200: dataSchema,
  },
});
```

## Type utilities

- `InferNonSseSuccessResponses<T>` — TypeScript output type of all non-SSE 2xx responses. JSON
  schemas → `InferOutput<T>`, `textResponse` → `string`, `blobResponse` → `Blob`, `streamResponse`
  → `ReadableStream<Uint8Array>`, `ContractNoBody`/`NoBodyResponse` → `undefined`, `sseResponse` →
  `never` (excluded). `anyOfResponses` entries are unpacked before mapping.
- `InferJsonSuccessResponses<T>` — union of valibot schema types for all JSON 2xx entries.
- `InferSseSuccessResponses<T>` — SSE event schema map type from a `responsesByStatusCode` map.
- `HasAnySseSuccessResponse<T>`, `HasAnyJsonSuccessResponse<T>`, `HasAnyNonSseSuccessResponse<T>` —
  boolean checks over 2xx entries.
- `ContractResponseMode<T>` — `'dual'` (SSE + non-SSE), `'sse'` (SSE-only), or `'non-sse'`.
- `AvailableResponseModes<T>` — union of `'json' | 'sse' | 'blob' | 'text' | 'stream' | 'noContent'`.
- `SseEventOf<S>` — discriminated union of SSE events inferred from a `schemaByEventName` map,
  aligned with the browser `MessageEvent` shape: `{ type, data, lastEventId, retry }`.

```ts
import type { InferNonSseSuccessResponses } from "valibot-api-contracts";

type UserResponse = InferNonSseSuccessResponses<(typeof getUser)["responsesByStatusCode"]>;
// { id: string; name: string }

type CsvResponse = InferNonSseSuccessResponses<(typeof streamExport)["responsesByStatusCode"]>;
// ReadableStream<Uint8Array>
```

## Client types

Primarily consumed by HTTP client implementations.

- `ClientRequestParams<TApiContract, TIsStreaming>` — infers the request parameter object
  (`pathParams`, `body`, `queryParams`, `headers`, optional `pathPrefix`, and `streaming` for
  dual-mode contracts).
- `InferSseClientResponse<TApiContract>` — discriminated union of `{ statusCode, headers, body }`
  for SSE mode. Exact 2xx codes and `'2xx'` yield `AsyncIterable<SseEventOf<...>>`.
- `InferNonSseClientResponse<TApiContract>` — same shape for non-SSE mode. Exact 2xx codes and
  `'2xx'` yield JSON / `string` / `Blob` / `ReadableStream<Uint8Array>` / `null` (SSE excluded).
- `DefaultStreaming<T>` — `true` for SSE-only contracts, `false` otherwise.

## Contract type aliases

- `ApiContract` — union of all contract variants
  (`GetApiContract | DeleteApiContract | PayloadApiContract`).
- `GetApiContract`, `DeleteApiContract`, `PayloadApiContract` — individual variants.
- `RequestPathParamsSchema`, `RequestQuerySchema`, `RequestHeaderSchema`, `ResponseHeaderSchema` —
  valibot object-schema constraints for generic helpers.

## Utility functions

- `mapApiContractToPath(contract)` — Express/Fastify-style path pattern, e.g. `"/users/:userId"`.
- `describeApiContract(contract)` — human-readable `"METHOD /path"` string.
- `hasAnySuccessSseResponse(contract)` — `true` when any 2xx entry is an SSE response (including
  inside `anyOfResponses`).
- `getSseSchemaByEventName(contract)` — extracts SSE event schemas, or `null` when none are present.
- `resolveResponseEntry(...)` / `resolveContractResponse(...)` — resolve a status code + content-type
  to a concrete `ResponseKind` (`'json' | 'text' | 'blob' | 'stream' | 'sse' | 'noContent'`).

## Module augmentation

To enforce stricter typing on `metadata`:

```ts
// file -> apiContracts.d.ts
import "valibot-api-contracts";

declare module "valibot-api-contracts" {
  interface CommonRouteDefinitionMetadata {
    myTestProp?: string[];
    mySecondTestProp?: number;
  }
}
```
