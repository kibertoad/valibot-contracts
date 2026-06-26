import type { GenericSchema, InferInput } from "valibot";
import type {
  AnyOfResponses,
  ApiContract,
  ExpandStatusRangeKey,
  HttpStatusCode,
  InferSchemaInput,
  NoBodyResponse,
  RequestPathParamsSchema,
  SseSchemaByEventName,
  TypedBlobResponse,
  TypedSseResponse,
  TypedStreamResponse,
  TypedTextResponse,
  WildcardStatusCodeKey,
} from "valibot-api-contracts";

/** A single SSE event to emit, as accepted by the mock helpers before schema validation. */
export type SseMockEvent = { event: string; data: unknown };

/**
 * Type-safe SSE event union derived from a contract's `schemaByEventName` map.
 * Each event name is paired with the input type of its valibot schema.
 */
export type SseMockEventInput<S extends SseSchemaByEventName> = {
  [K in keyof S & string]: { event: K; data: InferInput<NonNullable<S[K]>> };
}[keyof S & string];

/**
 * Serializes a list of SSE events into a `text/event-stream` body. Each event becomes an
 * `event:`/`data:` pair; a blank line separates events, matching the SSE wire format.
 *
 * @example
 * formatSseResponse([{ event: 'completed', data: { totalCount: 1 } }])
 * // "event: completed\ndata: {\"totalCount\":1}\n"
 */
export function formatSseResponse(events: SseMockEvent[]): string {
  return events
    .map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n`)
    .join("\n");
}

// Maps a single responsesByStatusCode entry to the body field(s) the mock needs.
// ContractNoBody (symbol)  → no required body field
// NoBodyResponse           → no required body field
// TypedSseResponse         → { events }
// TypedTextResponse        → { responseText }
// TypedBlobResponse        → { responseBlob }
// TypedStreamResponse      → { responseStream }
// AnyOfResponses           → { responseJson?; events? } for dual-mode (SSE + JSON)
// GenericSchema (JSON)     → { responseJson }
type InferBodyParam<T> = T extends symbol
  ? { responseJson?: null }
  : T extends NoBodyResponse
    ? { responseJson?: null }
    : T extends TypedSseResponse<infer S extends SseSchemaByEventName>
      ? { events: SseMockEventInput<S>[] }
      : T extends TypedTextResponse
        ? { responseText: string }
        : T extends TypedBlobResponse
          ? { responseBlob: string }
          : T extends TypedStreamResponse
            ? { responseStream: string }
            : T extends AnyOfResponses<infer Items>
              ? AnyOfBodyParam<Items>
              : T extends GenericSchema
                ? { responseJson: InferInput<T> }
                : object;

// Combines the JSON and SSE body fields contributed by the members of an anyOfResponses entry.
// A member that is a JSON schema contributes `responseJson`; an SSE member contributes `events`.
// Members of any other kind (text/blob/stream) contribute nothing.
type AnyOfBodyParam<Items> = (Extract<Items, GenericSchema> extends never
  ? object
  : { responseJson: InferInput<Extract<Items, GenericSchema>> }) &
  ([Extract<Items, TypedSseResponse>] extends [never]
    ? object
    : Extract<Items, TypedSseResponse> extends TypedSseResponse<
          infer S extends SseSchemaByEventName
        >
      ? { events: SseMockEventInput<S>[] }
      : object);

type ExactStatusCodePairs<TContract extends ApiContract> = {
  [K in keyof TContract["responsesByStatusCode"] & HttpStatusCode]: {
    responseStatus: K;
  } & InferBodyParam<NonNullable<TContract["responsesByStatusCode"][K]>>;
}[keyof TContract["responsesByStatusCode"] & HttpStatusCode];

type RangeStatusCodePairs<TContract extends ApiContract> = {
  [K in keyof TContract["responsesByStatusCode"] & WildcardStatusCodeKey]: {
    responseStatus: Exclude<
      ExpandStatusRangeKey<K>,
      keyof TContract["responsesByStatusCode"] & HttpStatusCode
    >;
  } & InferBodyParam<NonNullable<TContract["responsesByStatusCode"][K]>>;
}[keyof TContract["responsesByStatusCode"] & WildcardStatusCodeKey];

type StatusCodeBodyPair<TContract extends ApiContract> =
  | ExactStatusCodePairs<TContract>
  | RangeStatusCodePairs<TContract>;

type PathParamsField<TContract extends ApiContract> =
  TContract["requestPathParamsSchema"] extends RequestPathParamsSchema
    ? { pathParams: InferSchemaInput<TContract["requestPathParamsSchema"]> }
    : { pathParams?: never };

/**
 * Parameters accepted by `mockResponse`, derived from a contract. A discriminated union on
 * `responseStatus`: each concrete status code (or wildcard range) carries exactly the body fields
 * its declared response kind requires.
 */
export type MockResponseParams<TContract extends ApiContract> = PathParamsField<TContract> &
  StatusCodeBodyPair<TContract>;
