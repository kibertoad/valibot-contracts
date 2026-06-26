import { number, object, string } from "valibot";
import { describe, expect, it } from "vitest";
import { ContractNoBody } from "./constants.ts";
import {
  anyOfResponses,
  blobResponse,
  isJsonResponse,
  isNoBodyResponse,
  isStreamResponse,
  noBodyResponse,
  resolveContractResponse,
  resolveResponseEntry,
  sseResponse,
  streamResponse,
  textResponse,
} from "./contractResponse.ts";

describe("isJsonResponse", () => {
  it("returns true for a valibot schema", () => {
    expect(isJsonResponse(object({ id: string() }))).toBe(true);
  });

  it("returns false for textResponse", () => {
    expect(isJsonResponse(textResponse("text/csv"))).toBe(false);
  });

  it("returns false for blobResponse", () => {
    expect(isJsonResponse(blobResponse("image/png"))).toBe(false);
  });

  it("returns false for streamResponse", () => {
    expect(isJsonResponse(streamResponse("text/csv"))).toBe(false);
  });

  it("returns false for sseResponse", () => {
    expect(isJsonResponse(sseResponse({ update: string() }))).toBe(false);
  });

  it("returns false for anyOfResponses", () => {
    expect(isJsonResponse(anyOfResponses([object({ id: string() })]))).toBe(false);
  });

  it("returns false for ContractNoBody", () => {
    expect(isJsonResponse(ContractNoBody)).toBe(false);
  });
});

describe("isStreamResponse", () => {
  it("returns true for streamResponse", () => {
    expect(isStreamResponse(streamResponse("text/csv"))).toBe(true);
  });

  it("returns false for other responses", () => {
    expect(isStreamResponse(textResponse("text/csv"))).toBe(false);
    expect(isStreamResponse(blobResponse("image/png"))).toBe(false);
    expect(isStreamResponse(object({ id: string() }))).toBe(false);
    expect(isStreamResponse(ContractNoBody)).toBe(false);
  });
});

describe("factory description option", () => {
  it("textResponse includes description when provided", () => {
    expect(textResponse("text/csv", { description: "CSV export" })).toMatchObject({
      description: "CSV export",
    });
  });

  it("textResponse omits description when not provided", () => {
    expect(textResponse("text/csv")).not.toHaveProperty("description");
  });

  it("blobResponse includes description when provided", () => {
    expect(blobResponse("image/png", { description: "PNG image" })).toMatchObject({
      description: "PNG image",
    });
  });

  it("blobResponse omits description when not provided", () => {
    expect(blobResponse("image/png")).not.toHaveProperty("description");
  });

  it("streamResponse includes description when provided", () => {
    expect(streamResponse("text/csv", { description: "CSV stream" })).toMatchObject({
      description: "CSV stream",
    });
  });

  it("streamResponse omits description when not provided", () => {
    expect(streamResponse("text/csv")).not.toHaveProperty("description");
  });

  it("sseResponse includes description when provided", () => {
    expect(sseResponse({ update: string() }, { description: "SSE stream" })).toMatchObject({
      description: "SSE stream",
    });
  });

  it("sseResponse omits description when not provided", () => {
    expect(sseResponse({ update: string() })).not.toHaveProperty("description");
  });

  it("anyOfResponses includes description when provided", () => {
    expect(
      anyOfResponses([object({ id: string() })], { description: "Multiple types" }),
    ).toMatchObject({
      description: "Multiple types",
    });
  });

  it("anyOfResponses omits description when not provided", () => {
    expect(anyOfResponses([object({ id: string() })])).not.toHaveProperty("description");
  });

  it("noBodyResponse includes description when provided", () => {
    expect(noBodyResponse({ description: "No content" })).toMatchObject({
      description: "No content",
    });
  });

  it("noBodyResponse omits description when not provided", () => {
    expect(noBodyResponse()).not.toHaveProperty("description");
  });
});

describe("noBodyResponse / isNoBodyResponse", () => {
  it("noBodyResponse returns correct tag", () => {
    expect(noBodyResponse()).toEqual({ _tag: "NoBodyResponse" });
  });

  it("isNoBodyResponse returns true for noBodyResponse()", () => {
    expect(isNoBodyResponse(noBodyResponse())).toBe(true);
  });

  it("isNoBodyResponse returns false for ContractNoBody symbol", () => {
    expect(isNoBodyResponse(ContractNoBody)).toBe(false);
  });

  it("isNoBodyResponse returns false for other tagged responses", () => {
    expect(isNoBodyResponse(textResponse("text/csv"))).toBe(false);
    expect(isNoBodyResponse(blobResponse("image/png"))).toBe(false);
    expect(isNoBodyResponse(streamResponse("text/csv"))).toBe(false);
    expect(isNoBodyResponse(sseResponse({ update: string() }))).toBe(false);
    expect(isNoBodyResponse(anyOfResponses([object({ id: string() })]))).toBe(false);
  });
});

describe("resolveContractResponse", () => {
  describe("ContractNoBody", () => {
    it("returns noContent regardless of content-type", () => {
      expect(resolveContractResponse(ContractNoBody, "application/json")).toEqual({
        kind: "noContent",
      });
      expect(resolveContractResponse(ContractNoBody, undefined)).toEqual({ kind: "noContent" });
    });
  });

  describe("noBodyResponse", () => {
    it("returns noContent regardless of content-type", () => {
      expect(resolveContractResponse(noBodyResponse(), "application/json")).toEqual({
        kind: "noContent",
      });
      expect(resolveContractResponse(noBodyResponse(), undefined)).toEqual({ kind: "noContent" });
    });
  });

  describe("missing content-type", () => {
    it("returns null for typed responses when content-type is absent", () => {
      expect(resolveContractResponse(object({ id: string() }), undefined)).toBeNull();
      expect(resolveContractResponse(textResponse("text/csv"), undefined)).toBeNull();
      expect(resolveContractResponse(blobResponse("image/png"), undefined)).toBeNull();
      expect(resolveContractResponse(streamResponse("text/csv"), undefined)).toBeNull();
    });
  });

  describe("JSON (valibot schema)", () => {
    it("resolves to json for application/json content-type", () => {
      const schema = object({ id: string() });
      const result = resolveContractResponse(schema, "application/json");
      expect(result).toEqual({ kind: "json", schema });
    });

    it("returns null for non-json content-type", () => {
      const schema = object({ id: string() });
      expect(resolveContractResponse(schema, "text/plain")).toBeNull();
    });

    it("resolves structured +json suffixes (problem+json, vnd.api+json)", () => {
      const schema = object({ error: string() });
      expect(resolveContractResponse(schema, "application/problem+json")).toEqual({
        kind: "json",
        schema,
      });
      expect(resolveContractResponse(schema, "application/vnd.api+json; charset=utf-8")).toEqual({
        kind: "json",
        schema,
      });
    });

    it("does not match a content-type that merely contains application/json as a substring", () => {
      const schema = object({ id: string() });
      expect(resolveContractResponse(schema, "text/html; note=application/json")).toBeNull();
    });
  });

  describe("textResponse", () => {
    it("resolves to text when content-type matches", () => {
      expect(resolveContractResponse(textResponse("text/csv"), "text/csv; charset=utf-8")).toEqual({
        kind: "text",
      });
    });

    it("returns null when content-type does not match", () => {
      expect(resolveContractResponse(textResponse("text/csv"), "application/json")).toBeNull();
    });
  });

  describe("blobResponse", () => {
    it("resolves to blob when content-type matches", () => {
      expect(resolveContractResponse(blobResponse("image/png"), "image/png")).toEqual({
        kind: "blob",
      });
    });

    it("returns null when content-type does not match", () => {
      expect(resolveContractResponse(blobResponse("image/png"), "application/json")).toBeNull();
    });
  });

  describe("streamResponse", () => {
    it("resolves to stream when content-type matches", () => {
      expect(
        resolveContractResponse(streamResponse("text/csv"), "text/csv; charset=utf-8"),
      ).toEqual({ kind: "stream" });
    });

    it("returns null when content-type does not match", () => {
      expect(resolveContractResponse(streamResponse("text/csv"), "application/json")).toBeNull();
    });
  });

  describe("sseResponse", () => {
    it("resolves to sse for text/event-stream content-type", () => {
      const schema = { update: object({ id: string() }) };
      const result = resolveContractResponse(sseResponse(schema), "text/event-stream");
      expect(result).toEqual({ kind: "sse", schemaByEventName: schema });
    });

    it("returns null for non-sse content-type", () => {
      expect(
        resolveContractResponse(sseResponse({ update: string() }), "application/json"),
      ).toBeNull();
    });
  });

  describe("strict: false", () => {
    it("resolves single json entry when content-type is absent", () => {
      const schema = object({ id: string() });
      expect(resolveContractResponse(schema, undefined, false)).toEqual({ kind: "json", schema });
    });

    it("resolves single json entry when content-type does not match", () => {
      const schema = object({ id: string() });
      expect(resolveContractResponse(schema, "text/plain", false)).toEqual({
        kind: "json",
        schema,
      });
    });

    it("resolves single text entry when content-type is absent", () => {
      expect(resolveContractResponse(textResponse("text/csv"), undefined, false)).toEqual({
        kind: "text",
      });
    });

    it("resolves single blob entry when content-type is absent", () => {
      expect(resolveContractResponse(blobResponse("image/png"), undefined, false)).toEqual({
        kind: "blob",
      });
    });

    it("resolves single stream entry when content-type is absent", () => {
      expect(resolveContractResponse(streamResponse("text/csv"), undefined, false)).toEqual({
        kind: "stream",
      });
    });

    it("resolves single sse entry when content-type is absent", () => {
      const schema = { update: object({ id: string() }) };
      expect(resolveContractResponse(sseResponse(schema), undefined, false)).toEqual({
        kind: "sse",
        schemaByEventName: schema,
      });
    });

    it("still returns null for anyOfResponses when content-type is absent", () => {
      const entry = anyOfResponses([textResponse("text/csv"), object({ id: string() })]);
      expect(resolveContractResponse(entry, undefined, false)).toBeNull();
    });

    it("still returns null for anyOfResponses when content-type does not match", () => {
      const entry = anyOfResponses([textResponse("text/csv"), blobResponse("image/png")]);
      expect(resolveContractResponse(entry, "application/json", false)).toBeNull();
    });
  });

  describe("anyOfResponses", () => {
    it("resolves to the first matching entry by content-type", () => {
      const schema = object({ id: string() });
      const entry = anyOfResponses([textResponse("text/csv"), schema]);

      expect(resolveContractResponse(entry, "text/csv")).toEqual({ kind: "text" });
      expect(resolveContractResponse(entry, "application/json")).toEqual({ kind: "json", schema });
    });

    it("resolves stream entry inside anyOfResponses", () => {
      const entry = anyOfResponses([streamResponse("text/csv"), object({ total: number() })]);
      expect(resolveContractResponse(entry, "text/csv")).toEqual({ kind: "stream" });
    });

    it("resolves SSE entry inside anyOfResponses", () => {
      const sseSchema = { tick: object({ count: number() }) };
      const entry = anyOfResponses([sseResponse(sseSchema), object({ total: number() })]);

      expect(resolveContractResponse(entry, "text/event-stream")).toEqual({
        kind: "sse",
        schemaByEventName: sseSchema,
      });
    });

    it("returns null when no entry matches content-type", () => {
      const entry = anyOfResponses([textResponse("text/csv"), blobResponse("image/png")]);
      expect(resolveContractResponse(entry, "application/json")).toBeNull();
    });

    it("does not let an earlier text entry shadow a later SSE entry by substring", () => {
      // `text/event-stream` once matched `textResponse('text/')` via substring `includes`, making the
      // SSE entry unreachable. Essence matching keeps each entry distinct regardless of order.
      const sseSchema = { tick: object({ count: number() }) };
      const entry = anyOfResponses([textResponse("text/"), sseResponse(sseSchema)]);
      expect(resolveContractResponse(entry, "text/event-stream")).toEqual({
        kind: "sse",
        schemaByEventName: sseSchema,
      });
    });
  });
});

describe("resolveResponseEntry", () => {
  it("returns null when status code is not in the contract", () => {
    expect(resolveResponseEntry({}, 404, "application/json", true)).toBeNull();
  });

  it("resolves the entry when status code matches", () => {
    const schema = object({ id: string() });
    const result = resolveResponseEntry({ 200: schema }, 200, "application/json", true);
    expect(result).toEqual({ kind: "json", schema });
  });

  it("returns null when content-type is absent and strict is true", () => {
    const schema = object({ id: string() });
    expect(resolveResponseEntry({ 200: schema }, 200, undefined, true)).toBeNull();
  });

  it("falls back to entry kind when content-type is absent and strict is false", () => {
    const schema = object({ id: string() });
    const result = resolveResponseEntry({ 200: schema }, 200, undefined, false);
    expect(result).toEqual({ kind: "json", schema });
  });

  it("resolves ContractNoBody regardless of content-type", () => {
    expect(resolveResponseEntry({ 204: ContractNoBody }, 204, undefined, true)).toEqual({
      kind: "noContent",
    });
  });

  describe("getRangeKey boundaries", () => {
    const schema = object({ x: string() });
    // Use a contract with all five range keys so a mismatch (null from getRangeKey) falls to null,
    // and a match resolves to the schema with kind 'json'.
    const allRanges = {
      "1xx": schema,
      "2xx": schema,
      "3xx": schema,
      "4xx": schema,
      "5xx": schema,
    };

    it.each([
      [99, null],
      [100, { kind: "json", schema }],
      [199, { kind: "json", schema }],
      [200, { kind: "json", schema }],
      [299, { kind: "json", schema }],
      [300, { kind: "json", schema }],
      [599, { kind: "json", schema }],
      [600, null],
    ])("status %i → %s", (statusCode, expected) => {
      expect(
        resolveResponseEntry(allRanges, statusCode as number, "application/json", true),
      ).toEqual(expected);
    });
  });

  describe("range key fallback", () => {
    it("resolves via 2xx range for any success code", () => {
      const schema = object({ id: string() });
      expect(resolveResponseEntry({ "2xx": schema }, 200, "application/json", true)).toEqual({
        kind: "json",
        schema,
      });
      expect(resolveResponseEntry({ "2xx": schema }, 201, "application/json", true)).toEqual({
        kind: "json",
        schema,
      });
    });

    it("resolves via 1xx range for any informational code", () => {
      const schema = object({ info: string() });
      expect(resolveResponseEntry({ "1xx": schema }, 100, "application/json", true)).toEqual({
        kind: "json",
        schema,
      });
    });

    it("resolves via 3xx range for any redirect code", () => {
      const schema = object({ location: string() });
      expect(resolveResponseEntry({ "3xx": schema }, 301, "application/json", true)).toEqual({
        kind: "json",
        schema,
      });
    });

    it("resolves via 4xx range for any client-error code", () => {
      const schema = object({ message: string() });
      expect(resolveResponseEntry({ "4xx": schema }, 404, "application/json", true)).toEqual({
        kind: "json",
        schema,
      });
      expect(resolveResponseEntry({ "4xx": schema }, 400, "application/json", true)).toEqual({
        kind: "json",
        schema,
      });
    });

    it("resolves via 5xx range for any server-error code", () => {
      const schema = object({ error: string() });
      expect(resolveResponseEntry({ "5xx": schema }, 500, "application/json", true)).toEqual({
        kind: "json",
        schema,
      });
      expect(resolveResponseEntry({ "5xx": schema }, 503, "application/json", true)).toEqual({
        kind: "json",
        schema,
      });
    });

    it("exact code takes precedence over range key", () => {
      const exact = object({ id: string() });
      const range = object({ message: string() });
      expect(
        resolveResponseEntry({ 200: exact, "2xx": range }, 200, "application/json", true),
      ).toEqual({ kind: "json", schema: exact });
    });

    it("exact match is absolute: content-type mismatch on exact entry returns null without falling through to range", () => {
      expect(
        resolveResponseEntry(
          { 200: textResponse("text/csv"), "2xx": object({ id: string() }) },
          200,
          "application/json",
          true,
        ),
      ).toBeNull();
    });

    it("exact match is absolute: content-type mismatch on exact entry returns null without falling through to default", () => {
      expect(
        resolveResponseEntry(
          { 200: textResponse("text/csv"), default: object({ id: string() }) },
          200,
          "application/json",
          true,
        ),
      ).toBeNull();
    });

    it("range key takes precedence over default", () => {
      const range = object({ message: string() });
      const def = object({ error: string() });
      expect(
        resolveResponseEntry({ "5xx": range, default: def }, 500, "application/json", true),
      ).toEqual({ kind: "json", schema: range });
    });

    it("multiple range keys each route correctly and default is not invoked for covered codes", () => {
      const s4xx = object({ clientError: string() });
      const s5xx = object({ serverError: string() });
      const def = object({ fallback: string() });
      const contract = { "4xx": s4xx, "5xx": s5xx, default: def };
      expect(resolveResponseEntry(contract, 404, "application/json", true)).toEqual({
        kind: "json",
        schema: s4xx,
      });
      expect(resolveResponseEntry(contract, 503, "application/json", true)).toEqual({
        kind: "json",
        schema: s5xx,
      });
      expect(resolveResponseEntry(contract, 304, "application/json", true)).toEqual({
        kind: "json",
        schema: def,
      });
    });

    it("2xx range takes precedence over default for success codes", () => {
      const s2xx = object({ data: string() });
      const def = object({ fallback: string() });
      expect(
        resolveResponseEntry({ "2xx": s2xx, default: def }, 201, "application/json", true),
      ).toEqual({ kind: "json", schema: s2xx });
      expect(
        resolveResponseEntry({ "2xx": s2xx, default: def }, 404, "application/json", true),
      ).toEqual({ kind: "json", schema: def });
    });

    it("returns null when range does not cover the status code", () => {
      expect(resolveResponseEntry({ "2xx": object({}) }, 404, "application/json", true)).toBeNull();
    });

    it("falls through to default when status code is outside all ranges", () => {
      const schema = object({ error: string() });
      expect(resolveResponseEntry({ default: schema }, 0, "application/json", true)).toEqual({
        kind: "json",
        schema,
      });
    });
  });

  describe("default fallback", () => {
    it("resolves via default when no exact or range match", () => {
      const schema = object({ error: string() });
      expect(resolveResponseEntry({ default: schema }, 503, "application/json", true)).toEqual({
        kind: "json",
        schema,
      });
    });

    it("resolves via default for any status code when it is the only entry", () => {
      const schema = object({ message: string() });
      expect(resolveResponseEntry({ default: schema }, 200, "application/json", true)).toEqual({
        kind: "json",
        schema,
      });
      expect(resolveResponseEntry({ default: schema }, 404, "application/json", true)).toEqual({
        kind: "json",
        schema,
      });
    });

    it("exact code takes precedence over default", () => {
      const exact = object({ id: string() });
      const def = object({ error: string() });
      expect(
        resolveResponseEntry({ 200: exact, default: def }, 200, "application/json", true),
      ).toEqual({ kind: "json", schema: exact });
    });

    it("resolves the correct kind from a composite default anyOfResponses entry by content-type", () => {
      const jsonSchema = object({ id: string() });
      const contract = {
        default: anyOfResponses([sseResponse({ event: object({ id: string() }) }), jsonSchema]),
      };
      expect(resolveResponseEntry(contract, 500, "application/json", true)).toEqual({
        kind: "json",
        schema: jsonSchema,
      });
      expect(resolveResponseEntry(contract, 500, "text/event-stream", true)).toEqual({
        kind: "sse",
        schemaByEventName: { event: expect.any(Object) },
      });
    });
  });
});
