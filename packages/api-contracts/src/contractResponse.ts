import type { GenericSchema } from "valibot";
import type {
  HttpStatusCode,
  HttpStatusCodeRange,
  WildcardStatusCodeKey,
} from "./HttpStatusCodes.ts";
import { ContractNoBody } from "./constants.ts";

export type ResponseOptions = {
  readonly description?: string;
};

/** Spreadable `description` fragment shared by every response factory. */
const descriptionPart = (options?: ResponseOptions): { description?: string } =>
  options?.description !== undefined ? { description: options.description } : {};

/** Shared `_tag` discriminator check backing every `isX` response predicate. */
const hasTag = (value: ApiContractResponse, tag: string): boolean =>
  typeof value === "object" && value !== null && "_tag" in value && value._tag === tag;

export type TypedTextResponse = {
  readonly _tag: "TextResponse";
  readonly contentType: string;
  readonly description?: string;
};

/**
 * Declares a non-JSON response whose body the client materializes as a `string`.
 * Records the response `content-type` in the contract. Convenient for small text payloads
 * (CSV, plain text, HTML). For large payloads prefer {@link streamResponse}; for binary data
 * where a buffered handle is wanted prefer {@link blobResponse}.
 */
export const textResponse = (
  contentType: string,
  options?: ResponseOptions,
): TypedTextResponse => ({
  _tag: "TextResponse",
  contentType,
  ...descriptionPart(options),
});

export const isTextResponse = (value: ApiContractResponse): value is TypedTextResponse =>
  hasTag(value, "TextResponse");

export type TypedBlobResponse = {
  readonly _tag: "BlobResponse";
  readonly contentType: string;
  readonly description?: string;
};

/**
 * Declares a non-JSON response whose body the client materializes as a `Blob`.
 * Records the response `content-type` in the contract. The body is buffered into memory; the
 * consumer decodes it via `.text()`, `.arrayBuffer()`, or `.stream()`. For large payloads that
 * should not be buffered, prefer {@link streamResponse}.
 */
export const blobResponse = (
  contentType: string,
  options?: ResponseOptions,
): TypedBlobResponse => ({
  _tag: "BlobResponse",
  contentType,
  ...descriptionPart(options),
});

export const isBlobResponse = (value: ApiContractResponse): value is TypedBlobResponse =>
  hasTag(value, "BlobResponse");

export type TypedStreamResponse = {
  readonly _tag: "StreamResponse";
  readonly contentType: string;
  readonly description?: string;
};

/**
 * Declares a non-JSON response whose body the client exposes as a `ReadableStream<Uint8Array>`,
 * without buffering it into memory. Records the response `content-type` in the contract.
 *
 * The consumer chooses how to consume it: iterate/pipe the stream directly for large payloads,
 * or wrap it for convenience via `new Response(body).text()` / `.blob()` / `.arrayBuffer()`.
 * `ReadableStream` is the one body type both fetch-based and undici-based clients can produce
 * without materializing the whole payload first.
 */
export const streamResponse = (
  contentType: string,
  options?: ResponseOptions,
): TypedStreamResponse => ({
  _tag: "StreamResponse",
  contentType,
  ...descriptionPart(options),
});

export const isStreamResponse = (value: ApiContractResponse): value is TypedStreamResponse =>
  hasTag(value, "StreamResponse");

export type SseSchemaByEventName = Record<string, GenericSchema>;

export type TypedSseResponse<T extends SseSchemaByEventName = SseSchemaByEventName> = {
  readonly _tag: "SseResponse";
  readonly schemaByEventName: T;
  readonly description?: string;
};

export const sseResponse = <T extends SseSchemaByEventName>(
  schemaByEventName: T,
  options?: ResponseOptions,
): TypedSseResponse<T> => ({
  _tag: "SseResponse",
  schemaByEventName,
  ...descriptionPart(options),
});

export const isSseResponse = (value: ApiContractResponse): value is TypedSseResponse =>
  hasTag(value, "SseResponse");

export type TypedJsonResponse = GenericSchema;

export const isJsonResponse = (value: ApiContractResponse): value is TypedJsonResponse =>
  typeof value === "object" && value !== null && !("_tag" in value);

export type TypedApiContractResponse =
  | TypedJsonResponse
  | TypedTextResponse
  | TypedBlobResponse
  | TypedStreamResponse
  | TypedSseResponse;

export type AnyOfResponses<T extends TypedApiContractResponse = TypedApiContractResponse> = {
  readonly _tag: "AnyOfResponses";
  readonly responses: T[];
  readonly description?: string;
};

export const anyOfResponses = <T extends TypedApiContractResponse>(
  responses: T[],
  options?: ResponseOptions,
): AnyOfResponses<T> => ({
  _tag: "AnyOfResponses",
  responses,
  ...descriptionPart(options),
});

export const isAnyOfResponses = (value: ApiContractResponse): value is AnyOfResponses =>
  hasTag(value, "AnyOfResponses");

export type NoBodyResponse = {
  readonly _tag: "NoBodyResponse";
  readonly description?: string;
};

export const noBodyResponse = (options?: ResponseOptions): NoBodyResponse => ({
  _tag: "NoBodyResponse",
  ...descriptionPart(options),
});

export const isNoBodyResponse = (value: ApiContractResponse): value is NoBodyResponse =>
  hasTag(value, "NoBodyResponse");

export type ApiContractResponse =
  | typeof ContractNoBody
  | NoBodyResponse
  | TypedApiContractResponse
  | AnyOfResponses;

export type ResponsesByStatusCode = Partial<
  Record<HttpStatusCode | WildcardStatusCodeKey, ApiContractResponse>
>;

export type ResponseKind =
  | { kind: "noContent" }
  | { kind: "text" }
  | { kind: "blob" }
  | { kind: "stream" }
  | { kind: "json"; schema: GenericSchema }
  | { kind: "sse"; schemaByEventName: SseSchemaByEventName };

/**
 * Extracts the lowercased media-type essence (the token before any `;` parameters) from a
 * content-type value, e.g. `'text/csv; charset=utf-8'` -> `'text/csv'`.
 */
const contentTypeEssence = (contentType: string): string => {
  const semicolon = contentType.indexOf(";");
  const essence = semicolon === -1 ? contentType : contentType.slice(0, semicolon);
  return essence.trim().toLowerCase();
};

/**
 * Matches the JSON media type, including structured `+json` suffixes such as
 * `application/problem+json` (RFC 7807) and `application/vnd.api+json` (JSON:API).
 */
const isJsonContentType = (essence: string): boolean =>
  essence === "application/json" || essence.endsWith("+json");

const matchTypedResponse = (
  entry: TypedApiContractResponse,
  contentType: string,
): ResponseKind | null => {
  // Compare media-type essences (token before `;`), not raw substrings. Substring matching let an
  // over-broad declared type (e.g. `text/`) shadow a more specific one (e.g. `text/event-stream`)
  // and accepted unrelated types that merely contained the declared one as a substring.
  const essence = contentTypeEssence(contentType);

  if (isTextResponse(entry)) {
    return essence === contentTypeEssence(entry.contentType) ? { kind: "text" } : null;
  }

  if (isBlobResponse(entry)) {
    return essence === contentTypeEssence(entry.contentType) ? { kind: "blob" } : null;
  }

  if (isStreamResponse(entry)) {
    return essence === contentTypeEssence(entry.contentType) ? { kind: "stream" } : null;
  }

  if (isSseResponse(entry)) {
    return essence === "text/event-stream"
      ? { kind: "sse", schemaByEventName: entry.schemaByEventName }
      : null;
  }

  if (isJsonContentType(essence)) {
    return { kind: "json", schema: entry };
  }

  return null;
};

const resolveByKind = (entry: TypedApiContractResponse): ResponseKind => {
  if (isTextResponse(entry)) {
    return { kind: "text" };
  }
  if (isBlobResponse(entry)) {
    return { kind: "blob" };
  }
  if (isStreamResponse(entry)) {
    return { kind: "stream" };
  }
  if (isSseResponse(entry)) {
    return { kind: "sse", schemaByEventName: entry.schemaByEventName };
  }
  return { kind: "json", schema: entry };
};

/**
 * Resolves a contract's response entry for a given status code into a concrete `ResponseKind`,
 * taking the response `content-type` into account.
 *
 * Returns `null` when the content-type cannot be matched to any entry in the contract,
 * indicating the response is unexpected and should be treated as an error by the caller.
 *
 * @param schemaEntry - The contract entry for the matched status code (`ContractNoBody`,
 *   a valibot schema, `textResponse`, `blobResponse`, `streamResponse`, `sseResponse`, or
 *   `anyOfResponses`).
 * @param contentType - The `content-type` header value from the actual HTTP response,
 *   or `undefined` when the header is absent.
 * @param strict - When `true` (default), returns `null` if the `content-type` is absent or does
 *   not match the contract entry. When `false`, falls back to the entry's declared kind instead of
 *   returning `null` — only applies to single-entry responses; `anyOfResponses` always requires a
 *   content-type to disambiguate regardless of this flag.
 */
export const resolveContractResponse = (
  schemaEntry: ApiContractResponse,
  contentType: string | undefined,
  strict = true,
): ResponseKind | null => {
  if (schemaEntry === ContractNoBody || isNoBodyResponse(schemaEntry)) {
    return { kind: "noContent" };
  }

  if (isAnyOfResponses(schemaEntry)) {
    // AnyOfResponses always requires content-type to disambiguate — strict mode has no effect here
    if (!contentType) {
      return null;
    }

    for (const item of schemaEntry.responses) {
      const resolved = matchTypedResponse(item, contentType);
      if (resolved) {
        return resolved;
      }
    }
    return null;
  }

  if (!contentType) {
    return strict ? null : resolveByKind(schemaEntry);
  }

  const matched = matchTypedResponse(schemaEntry, contentType);

  return matched ?? (strict ? null : resolveByKind(schemaEntry));
};

function getRangeKey(statusCode: number): HttpStatusCodeRange | null {
  if (statusCode >= 100 && statusCode < 200) return "1xx";
  if (statusCode >= 200 && statusCode < 300) return "2xx";
  if (statusCode >= 300 && statusCode < 400) return "3xx";
  if (statusCode >= 400 && statusCode < 500) return "4xx";
  if (statusCode >= 500 && statusCode < 600) return "5xx";
  return null;
}

/**
 * Combines status-code lookup and content-type resolution into a single call.
 * Lookup precedence: exact code → range key (e.g. `'4xx'`) → `'default'`.
 * Returns `null` when no entry matches or the content-type cannot be matched.
 */
export function resolveResponseEntry(
  responsesByStatusCode: ResponsesByStatusCode,
  statusCode: number,
  contentType: string | undefined,
  strictContentType: boolean,
): ResponseKind | null {
  const exactEntry = responsesByStatusCode[statusCode as HttpStatusCode];
  if (exactEntry) {
    return resolveContractResponse(exactEntry, contentType, strictContentType);
  }

  const rangeKey = getRangeKey(statusCode);
  if (rangeKey) {
    const rangeEntry = responsesByStatusCode[rangeKey];
    if (rangeEntry) {
      return resolveContractResponse(rangeEntry, contentType, strictContentType);
    }
  }

  const defaultEntry = responsesByStatusCode.default;
  if (defaultEntry) {
    return resolveContractResponse(defaultEntry, contentType, strictContentType);
  }

  return null;
}
