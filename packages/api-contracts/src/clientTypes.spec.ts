import { boolean, number, object, optional, pipe, string, transform, unknown } from "valibot";
import { describe, expectTypeOf, it } from "vitest";
import type {
  ClientErrorHttpStatusCode,
  ExpandStatusRangeKey,
  HttpStatusCode,
  SuccessfulHttpStatusCode,
} from "./HttpStatusCodes.ts";
import type {
  ClientRequestParams,
  HeadersParam,
  InferNonSseClientResponse,
  InferSseClientResponse,
} from "./clientTypes.ts";
import { ContractNoBody } from "./constants.ts";
import {
  anyOfResponses,
  blobResponse,
  noBodyResponse,
  sseResponse,
  streamResponse,
  textResponse,
} from "./contractResponse.ts";
import { defineApiContract } from "./defineApiContract.ts";

type DefaultHeaders = Record<string, string>;

describe("clientTypes", () => {
  describe("ClientRequestParams", () => {
    it("has no required fields for a minimal contract", () => {
      const contract = defineApiContract({
        method: "get",
        pathResolver: () => "/ping",
        responsesByStatusCode: { 200: unknown() },
      });
      expectTypeOf<ClientRequestParams<typeof contract, false>>().toEqualTypeOf<{
        streaming?: never;
        pathParams?: undefined;
        body?: undefined;
        queryParams?: undefined;
        headers?: undefined;
        pathPrefix?: string;
      }>();
    });

    it("requires pathParams when requestPathParamsSchema is defined", () => {
      const contract = defineApiContract({
        method: "get",
        requestPathParamsSchema: object({ id: string() }),
        pathResolver: ({ id }) => `/products/${id}`,
        responsesByStatusCode: { 200: unknown() },
      });
      expectTypeOf<ClientRequestParams<typeof contract, false>>().toEqualTypeOf<{
        streaming?: never;
        pathParams: { id: string };
        body?: undefined;
        queryParams?: undefined;
        headers?: undefined;
        pathPrefix?: string;
      }>();
    });

    it("requires body when requestBodySchema is defined", () => {
      const contract = defineApiContract({
        method: "post",
        pathResolver: () => "/products",
        requestBodySchema: object({ name: string() }),
        responsesByStatusCode: { 201: unknown() },
      });
      expectTypeOf<ClientRequestParams<typeof contract, false>>().toEqualTypeOf<{
        streaming?: never;
        pathParams?: undefined;
        body: { name: string };
        queryParams?: undefined;
        headers?: undefined;
        pathPrefix?: string;
      }>();
    });

    it("makes body optional when requestBodySchema infers undefined (top-level optional)", () => {
      const contract = defineApiContract({
        method: "post",
        pathResolver: () => "/products",
        requestBodySchema: optional(object({ name: string() })),
        responsesByStatusCode: { 201: unknown() },
      });
      expectTypeOf<ClientRequestParams<typeof contract, false>>().toEqualTypeOf<{
        streaming?: never;
        pathParams?: undefined;
        body?: { name: string } | undefined;
        queryParams?: undefined;
        headers?: undefined;
        pathPrefix?: string;
      }>();
    });

    it("requires queryParams when requestQuerySchema is defined", () => {
      const contract = defineApiContract({
        method: "get",
        pathResolver: () => "/products",
        requestQuerySchema: object({ limit: number() }),
        responsesByStatusCode: { 200: unknown() },
      });
      expectTypeOf<ClientRequestParams<typeof contract, false>>().toEqualTypeOf<{
        streaming?: never;
        pathParams?: undefined;
        body?: undefined;
        queryParams: { limit: number };
        headers?: undefined;
        pathPrefix?: string;
      }>();
    });

    it("requires headers when requestHeaderSchema is defined, accepting plain object or function", () => {
      const contract = defineApiContract({
        method: "get",
        pathResolver: () => "/products",
        requestHeaderSchema: object({ authorization: string() }),
        responsesByStatusCode: { 200: unknown() },
      });
      expectTypeOf<ClientRequestParams<typeof contract, false>>().toEqualTypeOf<{
        streaming?: never;
        pathParams?: undefined;
        body?: undefined;
        queryParams?: undefined;
        headers: HeadersParam<{ authorization: string }>;
        pathPrefix?: string;
      }>();
    });

    it("pathPrefix is always optional", () => {
      const contract = defineApiContract({
        method: "get",
        pathResolver: () => "/products",
        responsesByStatusCode: { 200: unknown() },
      });
      expectTypeOf<ClientRequestParams<typeof contract, false>["pathPrefix"]>().toEqualTypeOf<
        string | undefined
      >();
    });

    it("forbids streaming field for non-SSE contracts", () => {
      const contract = defineApiContract({
        method: "get",
        pathResolver: () => "/products",
        responsesByStatusCode: { 200: unknown() },
      });
      expectTypeOf<ClientRequestParams<typeof contract, false>["streaming"]>().toEqualTypeOf<
        never | undefined
      >();
    });

    it("forbids streaming field for SSE-only contracts", () => {
      const contract = defineApiContract({
        method: "get",
        pathResolver: () => "/events",
        responsesByStatusCode: { 200: sseResponse({ update: object({ id: string() }) }) },
      });
      expectTypeOf<ClientRequestParams<typeof contract, true>["streaming"]>().toEqualTypeOf<
        never | undefined
      >();
    });

    it("requires streaming: true for dual-mode contracts with TIsStreaming=true", () => {
      const contract = defineApiContract({
        method: "get",
        pathResolver: () => "/feed",
        responsesByStatusCode: {
          200: anyOfResponses([
            sseResponse({ update: object({ id: string() }) }),
            object({ latest: string() }),
          ]),
        },
      });
      expectTypeOf<ClientRequestParams<typeof contract, true>["streaming"]>().toEqualTypeOf<true>();
      expectTypeOf<
        ClientRequestParams<typeof contract, false>["streaming"]
      >().toEqualTypeOf<false>();
    });
  });

  describe("InferSseClientResponse", () => {
    it("maps success code to SSE body and error code to as-is body", () => {
      const contract = defineApiContract({
        method: "get",
        pathResolver: () => "/events",
        responsesByStatusCode: {
          200: sseResponse({ update: object({ id: string() }) }),
          404: object({ message: string() }),
        },
      });
      type Result = InferSseClientResponse<typeof contract>;
      expectTypeOf<Result>().toEqualTypeOf<
        | {
            statusCode: 200;
            headers: DefaultHeaders;
            body: AsyncIterable<{
              type: "update";
              data: { id: string };
              lastEventId: string;
              retry: number | undefined;
            }>;
          }
        | { statusCode: 404; headers: DefaultHeaders; body: { message: string } }
      >();
    });

    it("extracts only SSE body for dual-mode success code", () => {
      const contract = defineApiContract({
        method: "get",
        pathResolver: () => "/events",
        responsesByStatusCode: {
          200: anyOfResponses([
            sseResponse({ chunk: object({ delta: string() }) }),
            object({ text: string() }),
          ]),
        },
      });
      type Result = InferSseClientResponse<typeof contract>;
      expectTypeOf<Result>().toEqualTypeOf<{
        statusCode: 200;
        headers: DefaultHeaders;
        body: AsyncIterable<{
          type: "chunk";
          data: { delta: string };
          lastEventId: string;
          retry: number | undefined;
        }>;
      }>();
    });

    it("returns a single entry for an SSE-only contract", () => {
      const contract = defineApiContract({
        method: "get",
        pathResolver: () => "/events",
        responsesByStatusCode: {
          200: sseResponse({ tick: object({ count: number() }) }),
        },
      });
      type Result = InferSseClientResponse<typeof contract>;
      expectTypeOf<Result>().toEqualTypeOf<{
        statusCode: 200;
        headers: DefaultHeaders;
        body: AsyncIterable<{
          type: "tick";
          data: { count: number };
          lastEventId: string;
          retry: number | undefined;
        }>;
      }>();
    });

    it("includes typed headers when responseHeaderSchema is defined", () => {
      const contract = defineApiContract({
        method: "get",
        pathResolver: () => "/events",
        responsesByStatusCode: {
          200: sseResponse({ tick: object({ count: number() }) }),
        },
        responseHeaderSchema: object({ "x-request-id": string() }),
      });
      type Result = InferSseClientResponse<typeof contract>;
      expectTypeOf<Result>().toEqualTypeOf<{
        statusCode: 200;
        headers: { "x-request-id": string } & DefaultHeaders;
        body: AsyncIterable<{
          type: "tick";
          data: { count: number };
          lastEventId: string;
          retry: number | undefined;
        }>;
      }>();
    });

    it("drops a non-SSE success code instead of emitting body: never", () => {
      const contract = defineApiContract({
        method: "get",
        pathResolver: () => "/feed",
        responsesByStatusCode: {
          200: sseResponse({ tick: object({ count: number() }) }),
          201: object({ id: string() }),
        },
      });
      type Result = InferSseClientResponse<typeof contract>;
      // The 201 JSON success code carries no SSE body, so it is dropped from the SSE view rather
      // than surviving as `{ statusCode: 201; body: never }`.
      expectTypeOf<Extract<Result, { statusCode: 201 }>>().toEqualTypeOf<never>();
      expectTypeOf<Result>().toEqualTypeOf<{
        statusCode: 200;
        headers: DefaultHeaders;
        body: AsyncIterable<{
          type: "tick";
          data: { count: number };
          lastEventId: string;
          retry: number | undefined;
        }>;
      }>();
    });
  });

  describe("InferNonSseClientResponse", () => {
    it("maps success code to non-SSE body and error code to as-is body", () => {
      const contract = defineApiContract({
        method: "get",
        pathResolver: () => "/products/1",
        responsesByStatusCode: {
          200: object({ id: number() }),
          404: object({ message: string() }),
        },
      });
      type Result = InferNonSseClientResponse<typeof contract>;
      expectTypeOf<Result>().toEqualTypeOf<
        | { statusCode: 200; headers: DefaultHeaders; body: { id: number } }
        | { statusCode: 404; headers: DefaultHeaders; body: { message: string } }
      >();
    });

    it("maps dual-mode success code to non-SSE body only", () => {
      const contract = defineApiContract({
        method: "get",
        pathResolver: () => "/events",
        responsesByStatusCode: {
          200: anyOfResponses([
            sseResponse({ chunk: object({ delta: string() }) }),
            object({ text: string() }),
          ]),
        },
      });
      type Result = InferNonSseClientResponse<typeof contract>;
      expectTypeOf<Result>().toEqualTypeOf<{
        statusCode: 200;
        headers: DefaultHeaders;
        body: { text: string };
      }>();
    });

    it("drops an SSE-only success code instead of emitting body: never", () => {
      const contract = defineApiContract({
        method: "get",
        pathResolver: () => "/feed",
        responsesByStatusCode: {
          200: sseResponse({ tick: object({ count: number() }) }),
          201: object({ id: string() }),
        },
      });
      type Result = InferNonSseClientResponse<typeof contract>;
      // The 200 SSE-only success code carries no non-SSE body, so it is dropped from the non-SSE
      // view rather than surviving as `{ statusCode: 200; body: never }`.
      expectTypeOf<Extract<Result, { statusCode: 200 }>>().toEqualTypeOf<never>();
      expectTypeOf<Result>().toEqualTypeOf<{
        statusCode: 201;
        headers: DefaultHeaders;
        body: { id: string };
      }>();
    });

    it("maps ContractNoBody success to null body", () => {
      const contract = defineApiContract({
        method: "delete",
        pathResolver: () => "/products/1",
        responsesByStatusCode: { 204: ContractNoBody },
      });
      type Result = InferNonSseClientResponse<typeof contract>;
      expectTypeOf<Result>().toEqualTypeOf<{
        statusCode: 204;
        headers: DefaultHeaders;
        body: null;
      }>();
    });

    it("maps noBodyResponse() success to null body", () => {
      const contract = defineApiContract({
        method: "delete",
        pathResolver: () => "/products/1",
        responsesByStatusCode: { 204: noBodyResponse() },
      });
      type Result = InferNonSseClientResponse<typeof contract>;
      expectTypeOf<Result>().toEqualTypeOf<{
        statusCode: 204;
        headers: DefaultHeaders;
        body: null;
      }>();
    });

    it("maps text success response to string body", () => {
      const contract = defineApiContract({
        method: "get",
        pathResolver: () => "/export.csv",
        responsesByStatusCode: { 200: textResponse("text/csv") },
      });
      type Result = InferNonSseClientResponse<typeof contract>;
      expectTypeOf<Result>().toEqualTypeOf<{
        statusCode: 200;
        headers: DefaultHeaders;
        body: string;
      }>();
    });

    it("maps blob success response to Blob body", () => {
      const contract = defineApiContract({
        method: "get",
        pathResolver: () => "/photo.png",
        responsesByStatusCode: { 200: blobResponse("image/png") },
      });
      type Result = InferNonSseClientResponse<typeof contract>;
      expectTypeOf<Result>().toEqualTypeOf<{
        statusCode: 200;
        headers: DefaultHeaders;
        body: Blob;
      }>();
    });

    it("maps stream success response to ReadableStream body (stays on the non-SSE side)", () => {
      const contract = defineApiContract({
        method: "get",
        pathResolver: () => "/export-large.csv",
        responsesByStatusCode: { 200: streamResponse("text/csv") },
      });
      type Result = InferNonSseClientResponse<typeof contract>;
      expectTypeOf<Result>().toEqualTypeOf<{
        statusCode: 200;
        headers: DefaultHeaders;
        body: ReadableStream<Uint8Array>;
      }>();
    });

    it("includes typed headers when responseHeaderSchema is defined", () => {
      const contract = defineApiContract({
        method: "get",
        pathResolver: () => "/products/1",
        responsesByStatusCode: { 200: object({ id: number() }) },
        responseHeaderSchema: object({ "x-request-id": string() }),
      });
      type Result = InferNonSseClientResponse<typeof contract>;
      expectTypeOf<Result>().toEqualTypeOf<{
        statusCode: 200;
        headers: Omit<DefaultHeaders, "x-request-id"> & {
          "x-request-id": string;
        };
        body: { id: number };
      }>();
    });

    it("allows non-string transformed header types without collapsing to never", () => {
      const contract = defineApiContract({
        method: "get",
        pathResolver: () => "/products/1",
        responsesByStatusCode: { 200: object({ id: number() }) },
        responseHeaderSchema: object({
          "x-retry-count": pipe(
            string(),
            transform((value) => Number(value)),
          ),
        }),
      });
      type Result = InferNonSseClientResponse<typeof contract>;
      expectTypeOf<Result>().toEqualTypeOf<{
        statusCode: 200;
        headers: Omit<DefaultHeaders, "x-retry-count"> & {
          "x-retry-count": number;
        };
        body: { id: number };
      }>();
    });

    it("exact code takes precedence over 2xx range: narrowing by exact statusCode resolves only the exact body", () => {
      const contract = defineApiContract({
        method: "get",
        pathResolver: () => "/test",
        responsesByStatusCode: {
          "2xx": object({ id: number() }),
          201: object({ name: string() }),
        },
      });
      type Result = InferNonSseClientResponse<typeof contract>;
      type At201 = Extract<Result, { statusCode: 201 }>;
      expectTypeOf<At201>().toEqualTypeOf<{
        statusCode: 201;
        headers: DefaultHeaders;
        body: { name: string };
      }>();
      type RangeEntry = Extract<Result, { statusCode: Exclude<SuccessfulHttpStatusCode, 201> }>;
      expectTypeOf<RangeEntry>().toEqualTypeOf<{
        statusCode: Exclude<SuccessfulHttpStatusCode, 201>;
        headers: DefaultHeaders;
        body: { id: number };
      }>();
    });

    it("maps 2xx range key to SuccessfulHttpStatusCode with non-SSE body", () => {
      const contract = defineApiContract({
        method: "get",
        pathResolver: () => "/test",
        responsesByStatusCode: { "2xx": object({ id: number() }) },
      });
      type Result = InferNonSseClientResponse<typeof contract>;
      expectTypeOf<Result>().toEqualTypeOf<{
        statusCode: SuccessfulHttpStatusCode;
        headers: DefaultHeaders;
        body: { id: number };
      }>();
    });

    it("maps 4xx range key to 4xx status codes with as-is body", () => {
      const contract = defineApiContract({
        method: "get",
        pathResolver: () => "/test",
        responsesByStatusCode: {
          200: object({ id: number() }),
          "4xx": object({ message: string() }),
        },
      });
      type Result = InferNonSseClientResponse<typeof contract>;
      expectTypeOf<Result>().toEqualTypeOf<
        | { statusCode: 200; headers: DefaultHeaders; body: { id: number } }
        | {
            statusCode: ExpandStatusRangeKey<"4xx">;
            headers: DefaultHeaders;
            body: { message: string };
          }
      >();
    });

    it("maps default key to split success/non-success statusCode entries", () => {
      const contract = defineApiContract({
        method: "get",
        pathResolver: () => "/test",
        responsesByStatusCode: { default: object({ message: string() }) },
      });
      type Result = InferNonSseClientResponse<typeof contract>;
      expectTypeOf<Result>().toEqualTypeOf<
        | {
            statusCode: SuccessfulHttpStatusCode;
            headers: DefaultHeaders;
            body: { message: string };
          }
        | {
            statusCode: Exclude<HttpStatusCode, SuccessfulHttpStatusCode>;
            headers: DefaultHeaders;
            body: { message: string };
          }
      >();
    });

    it("range key takes precedence over default: range codes excluded from default statusCode", () => {
      const contract = defineApiContract({
        method: "get",
        pathResolver: () => "/test",
        responsesByStatusCode: {
          "4xx": object({ error: string() }),
          default: object({ message: string() }),
        },
      });
      type Result = InferNonSseClientResponse<typeof contract>;
      type RangeEntry = Extract<Result, { body: { error: string } }>;
      expectTypeOf<RangeEntry["statusCode"]>().toEqualTypeOf<ClientErrorHttpStatusCode>();
      type DefaultEntry = Extract<Result, { body: { message: string } }>;
      expectTypeOf<404 extends DefaultEntry["statusCode"] ? true : false>().toEqualTypeOf<false>();
    });

    it("exact code takes precedence over both range and default", () => {
      const contract = defineApiContract({
        method: "get",
        pathResolver: () => "/test",
        responsesByStatusCode: {
          404: object({ notFound: boolean() }),
          "4xx": object({ error: string() }),
          default: object({ message: string() }),
        },
      });
      type Result = InferNonSseClientResponse<typeof contract>;
      type At404 = Extract<Result, { statusCode: 404 }>;
      expectTypeOf<At404>().toEqualTypeOf<{
        statusCode: 404;
        headers: DefaultHeaders;
        body: { notFound: boolean };
      }>();
      type RangeEntry = Extract<Result, { body: { error: string } }>;
      expectTypeOf<404 extends RangeEntry["statusCode"] ? true : false>().toEqualTypeOf<false>();
      type DefaultEntry = Extract<Result, { body: { message: string } }>;
      expectTypeOf<400 extends DefaultEntry["statusCode"] ? true : false>().toEqualTypeOf<false>();
      expectTypeOf<404 extends DefaultEntry["statusCode"] ? true : false>().toEqualTypeOf<false>();
    });
  });

  describe("InferNonSseClientResponse with range keys and captureAsError", () => {
    it("2xx range response ends up in result type (extends SuccessfulHttpStatusCode)", () => {
      const contract = defineApiContract({
        method: "get",
        pathResolver: () => "/test",
        responsesByStatusCode: { "2xx": object({ ok: boolean() }) },
      });
      type Response = InferNonSseClientResponse<typeof contract>;
      type SuccessPart = Extract<Response, { statusCode: SuccessfulHttpStatusCode }>;
      expectTypeOf<SuccessPart>().not.toEqualTypeOf<never>();
    });

    it("4xx range response ends up in error type (not SuccessfulHttpStatusCode)", () => {
      const contract = defineApiContract({
        method: "get",
        pathResolver: () => "/test",
        responsesByStatusCode: { "4xx": object({ error: string() }) },
      });
      type Response = InferNonSseClientResponse<typeof contract>;
      type SuccessPart = Extract<Response, { statusCode: SuccessfulHttpStatusCode }>;
      expectTypeOf<SuccessPart>().toEqualTypeOf<never>();
    });
  });

  describe("InferSseClientResponse with range keys", () => {
    it("maps 2xx SSE range to AsyncIterable body for success codes", () => {
      const contract = defineApiContract({
        method: "get",
        pathResolver: () => "/events",
        responsesByStatusCode: {
          "2xx": sseResponse({ tick: object({ count: number() }) }),
        },
      });
      type Result = InferSseClientResponse<typeof contract>;
      expectTypeOf<Result>().toEqualTypeOf<{
        statusCode: SuccessfulHttpStatusCode;
        headers: DefaultHeaders;
        body: AsyncIterable<{
          type: "tick";
          data: { count: number };
          lastEventId: string;
          retry: number | undefined;
        }>;
      }>();
    });
  });
});
