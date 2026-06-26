import type { GenericSchema, InferOutput } from "valibot";
import type { SuccessfulHttpStatusCode } from "./HttpStatusCodes.ts";
import type { ContractNoBody } from "./constants.ts";
import type { ResponsesByStatusCode } from "./contractResponse.ts";
import type { ValueOf } from "./typeUtils.ts";

type ExtractSuccessResponses<T extends ResponsesByStatusCode> = ValueOf<
  T,
  Extract<keyof T, SuccessfulHttpStatusCode | "2xx" | "default">
>;

type UnpackAnyOf<T> = T extends { _tag: "AnyOfResponses"; responses: Array<infer Item> } ? Item : T;

type FlatSuccessResponses<T extends ResponsesByStatusCode> = UnpackAnyOf<
  ExtractSuccessResponses<T>
>;

type SseSchemaOf<T> = T extends { _tag: "SseResponse"; schemaByEventName: infer S } ? S : never;

/**
 * Extracts the merged SSE event schema map from a responsesByStatusCode map.
 * Returns the union of all `schemaByEventName` objects from TypedSseResponse entries,
 * including those nested inside AnyOfResponses.
 */
export type InferSseSuccessResponses<T extends ResponsesByStatusCode> = SseSchemaOf<
  FlatSuccessResponses<T>
>;

/**
 * Returns true if any success status code entry is a JSON valibot schema,
 * or an AnyOfResponses containing one.
 */
export type HasAnyJsonSuccessResponse<T extends ResponsesByStatusCode> =
  Extract<FlatSuccessResponses<T>, GenericSchema> extends never ? false : true;

type JsonSchemaOf<T> = T extends GenericSchema ? T : never;

/**
 * Extracts the union of JSON valibot schemas from all success responses,
 * including those nested inside AnyOfResponses. Text, Blob, Stream, and SSE responses are excluded.
 */
export type InferJsonSuccessResponses<T extends ResponsesByStatusCode> = JsonSchemaOf<
  FlatSuccessResponses<T>
>;

type NonSseBodyOf<T> = T extends { _tag: "SseResponse" }
  ? never
  : T extends { _tag: "BlobResponse" }
    ? Blob
    : T extends { _tag: "StreamResponse" }
      ? ReadableStream<Uint8Array>
      : T extends { _tag: "TextResponse" }
        ? string
        : T extends GenericSchema
          ? InferOutput<T>
          : undefined;

/**
 * Infers the TypeScript output type of all non-SSE success responses.
 * JSON schemas → InferOutput<T>. TextResponse → string. BlobResponse → Blob.
 * StreamResponse → ReadableStream<Uint8Array>. ContractNoBody and noBodyResponse() → undefined.
 * SseResponse → never (excluded). AnyOfResponses are unpacked before mapping.
 */
export type InferNonSseSuccessResponses<T extends ResponsesByStatusCode> = NonSseBodyOf<
  FlatSuccessResponses<T>
>;

/**
 * Discriminated union of SSE events inferred from a schemaByEventName map.
 * Aligns with the browser MessageEvent shape.
 */
export type SseEventOf<S> = {
  [K in keyof S]: K extends string
    ? {
        type: K;
        data: S[K] extends GenericSchema ? InferOutput<S[K]> : never;
        lastEventId: string;
        retry: number | undefined;
      }
    : never;
}[keyof S];

/**
 * Returns true if any success status code entry is TypedSseResponse,
 * or an AnyOfResponses containing a TypedSseResponse.
 */
export type HasAnySseSuccessResponse<T extends ResponsesByStatusCode> =
  Extract<FlatSuccessResponses<T>, { _tag: "SseResponse" }> extends never ? false : true;

/**
 * Returns true if any success status code entry has a non-SSE response
 * (JSON, text, blob, stream, or no-body). Mirrors HasAnySseSuccessResponse.
 */
export type HasAnyNonSseSuccessResponse<T extends ResponsesByStatusCode> =
  Exclude<FlatSuccessResponses<T>, { _tag: "SseResponse" }> extends never ? false : true;

/**
 * Classifies a contract's response mode into one of three cases:
 * - 'dual'    — SSE + non-SSE success responses; caller chooses via streaming param
 * - 'sse'     — SSE-only success responses; always streams
 * - 'non-sse' — JSON / text / blob / stream / no-body; never streams
 */
export type ContractResponseMode<T extends ResponsesByStatusCode> =
  HasAnySseSuccessResponse<T> extends true
    ? HasAnyNonSseSuccessResponse<T> extends true
      ? "dual"
      : "sse"
    : "non-sse";

/**
 * Union of response mode literals available for a given responsesByStatusCode map.
 */
export type AvailableResponseModes<T extends ResponsesByStatusCode> =
  | (HasAnyJsonSuccessResponse<T> extends true ? "json" : never)
  | (HasAnySseSuccessResponse<T> extends true ? "sse" : never)
  | (Extract<FlatSuccessResponses<T>, { _tag: "BlobResponse" }> extends never ? never : "blob")
  | (Extract<FlatSuccessResponses<T>, { _tag: "StreamResponse" }> extends never ? never : "stream")
  | (Extract<FlatSuccessResponses<T>, { _tag: "TextResponse" }> extends never ? never : "text")
  | (Extract<
      FlatSuccessResponses<T>,
      typeof ContractNoBody | { _tag: "NoBodyResponse" }
    > extends never
      ? never
      : "noContent");
