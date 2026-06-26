import { object, string } from "valibot";
import { describe, expect, expectTypeOf, it } from "vitest";
import { ContractNoBody } from "./constants.ts";
import {
  anyOfResponses,
  blobResponse,
  isAnyOfResponses,
  isBlobResponse,
  isSseResponse,
  isTextResponse,
  sseResponse,
  streamResponse,
  type TypedBlobResponse,
  type TypedStreamResponse,
  type TypedTextResponse,
  textResponse,
} from "./contractResponse.ts";
import {
  defineApiContract,
  describeApiContract,
  getSseSchemaByEventName,
  hasAnySuccessSseResponse,
  mapApiContractToPath,
} from "./defineApiContract.ts";
import type { InferJsonSuccessResponses } from "./inferTypes.ts";

describe("defineApiContract", () => {
  describe("type inference", () => {
    it("preserves responsesByStatusCode for success schema inference", () => {
      const schema = object({ name: string() });
      const route = defineApiContract({
        method: "get",
        pathResolver: () => "/users",
        responsesByStatusCode: { 200: schema },
      });

      type Result = InferJsonSuccessResponses<typeof route.responsesByStatusCode>;
      expectTypeOf<Result>().toEqualTypeOf<typeof schema>();
    });

    it("infers pathResolver param type from requestPathParamsSchema", () => {
      defineApiContract({
        method: "get",
        requestPathParamsSchema: object({ userId: string(), orgId: string() }),
        pathResolver: ({ userId, orgId }) => {
          expectTypeOf(userId).toEqualTypeOf<string>();
          expectTypeOf(orgId).toEqualTypeOf<string>();
          return `/orgs/${orgId}/users/${userId}`;
        },
        responsesByStatusCode: {},
      });
    });

    it("accepts pathResolver without params when no requestPathParamsSchema", () => {
      const route = defineApiContract({
        method: "get",
        pathResolver: () => "/users",
        responsesByStatusCode: {},
      });

      expect(mapApiContractToPath(route)).toBe("/users");
    });

    it("types pathResolver param as undefined when no requestPathParamsSchema", () => {
      defineApiContract({
        method: "get",
        pathResolver: (params) => {
          expectTypeOf(params).toEqualTypeOf<undefined>();
          return "/users";
        },
        responsesByStatusCode: {},
      });
    });

    it("rejects pathResolver that declares params when no requestPathParamsSchema", () => {
      defineApiContract({
        method: "get",
        // @ts-expect-error pathResolver cannot take params without requestPathParamsSchema
        pathResolver: (params: { id: string }) => `/users/${params.id}`,
        responsesByStatusCode: {},
      });
    });

    it("preserves method literal type", () => {
      const route = defineApiContract({
        method: "post",
        pathResolver: () => "/users",
        requestBodySchema: object({ name: string() }),
        responsesByStatusCode: {},
      });

      expectTypeOf(route.method).toEqualTypeOf<"post">();
    });

    it("rejects requestBodySchema on GET contracts", () => {
      // @ts-expect-error GET must not accept a request body
      defineApiContract({
        method: "get",
        pathResolver: () => "/users",
        requestBodySchema: object({ name: string() }),
        responsesByStatusCode: {},
      });
    });

    it("rejects requestBodySchema on DELETE contracts", () => {
      // @ts-expect-error DELETE must not accept a request body
      defineApiContract({
        method: "delete",
        pathResolver: () => "/users/1",
        requestBodySchema: object({ name: string() }),
        responsesByStatusCode: {},
      });
    });

    it("requires requestBodySchema on POST contracts", () => {
      // @ts-expect-error POST requires requestBodySchema
      defineApiContract({
        method: "post",
        pathResolver: () => "/users",
        responsesByStatusCode: {},
      });
    });

    it("accepts ContractNoBody as requestBodySchema on POST contracts", () => {
      const route = defineApiContract({
        method: "post",
        pathResolver: () => "/users",
        requestBodySchema: ContractNoBody,
        responsesByStatusCode: {},
      });

      expectTypeOf(route.requestBodySchema).toEqualTypeOf<typeof ContractNoBody>();
    });

    it("preserves ContractNoBody sentinel in responsesByStatusCode", () => {
      const route = defineApiContract({
        method: "delete",
        requestPathParamsSchema: object({ userId: string() }),
        pathResolver: ({ userId }) => `/users/${userId}`,
        responsesByStatusCode: { 204: ContractNoBody },
      });

      expectTypeOf(route.responsesByStatusCode["204"]).toEqualTypeOf<typeof ContractNoBody>();
    });

    it("preserves TypedTextResponse in responsesByStatusCode", () => {
      const route = defineApiContract({
        method: "get",
        pathResolver: () => "/export.csv",
        responsesByStatusCode: {
          200: textResponse("text/csv"),
        },
      });

      expectTypeOf(route.responsesByStatusCode["200"]).toEqualTypeOf<TypedTextResponse>();
    });

    it("preserves TypedBlobResponse in responsesByStatusCode", () => {
      const route = defineApiContract({
        method: "get",
        pathResolver: () => "/photo.png",
        responsesByStatusCode: {
          200: blobResponse("image/png"),
        },
      });

      expectTypeOf(route.responsesByStatusCode["200"]).toEqualTypeOf<TypedBlobResponse>();
    });

    it("preserves TypedStreamResponse in responsesByStatusCode", () => {
      const route = defineApiContract({
        method: "get",
        pathResolver: () => "/export-large.csv",
        responsesByStatusCode: {
          200: streamResponse("text/csv"),
        },
      });

      expectTypeOf(route.responsesByStatusCode["200"]).toEqualTypeOf<TypedStreamResponse>();
    });
  });
});

describe("mapApiContractToPath", () => {
  it("returns static path when no requestPathParamsSchema", () => {
    const route = defineApiContract({
      method: "get",
      pathResolver: () => "/users",
      responsesByStatusCode: {},
    });

    expect(mapApiContractToPath(route)).toBe("/users");
  });

  it("replaces path params with :param placeholders", () => {
    const route = defineApiContract({
      method: "get",
      requestPathParamsSchema: object({ userId: string() }),
      pathResolver: ({ userId }) => `/users/${userId}`,
      responsesByStatusCode: {},
    });

    expect(mapApiContractToPath(route)).toBe("/users/:userId");
  });

  it("replaces multiple path params", () => {
    const route = defineApiContract({
      method: "get",
      requestPathParamsSchema: object({ orgId: string(), userId: string() }),
      pathResolver: ({ orgId, userId }) => `/orgs/${orgId}/users/${userId}`,
      responsesByStatusCode: {},
    });

    expect(mapApiContractToPath(route)).toBe("/orgs/:orgId/users/:userId");
  });
});

describe("describeApiContract", () => {
  it("returns uppercased method and path", () => {
    const route = defineApiContract({
      method: "get",
      requestPathParamsSchema: object({ userId: string() }),
      pathResolver: ({ userId }) => `/users/${userId}`,
      responsesByStatusCode: {},
    });

    expect(describeApiContract(route)).toBe("GET /users/:userId");
  });

  it("works for POST routes", () => {
    const route = defineApiContract({
      method: "post",
      pathResolver: () => "/users",
      requestBodySchema: object({ name: string() }),
      responsesByStatusCode: {},
    });

    expect(describeApiContract(route)).toBe("POST /users");
  });
});

describe("isTextResponse", () => {
  it("returns true for TypedTextResponse", () => {
    expect(isTextResponse(textResponse("text/csv"))).toBe(true);
  });

  it("returns false for a valibot schema", () => {
    expect(isTextResponse(string())).toBe(false);
  });

  it("returns false for TypedBlobResponse", () => {
    expect(isTextResponse(blobResponse("image/png"))).toBe(false);
  });

  it("returns false for ContractNoBody", () => {
    expect(isTextResponse(ContractNoBody)).toBe(false);
  });
});

describe("isBlobResponse", () => {
  it("returns true for TypedBlobResponse", () => {
    expect(isBlobResponse(blobResponse("image/png"))).toBe(true);
  });

  it("returns false for a valibot schema", () => {
    expect(isBlobResponse(string())).toBe(false);
  });

  it("returns false for TypedTextResponse", () => {
    expect(isBlobResponse(textResponse("text/csv"))).toBe(false);
  });

  it("returns false for ContractNoBody", () => {
    expect(isBlobResponse(ContractNoBody)).toBe(false);
  });
});

describe("isSseResponse", () => {
  it("returns true for TypedSseResponse", () => {
    const value = sseResponse({ chunk: object({ delta: string() }) });
    expect(isSseResponse(value)).toBe(true);
  });

  it("returns false for a valibot schema", () => {
    expect(isSseResponse(string())).toBe(false);
  });

  it("returns false for ContractNoBody", () => {
    expect(isSseResponse(ContractNoBody)).toBe(false);
  });

  it("returns false for TypedTextResponse", () => {
    expect(isSseResponse(textResponse("text/csv"))).toBe(false);
  });
});

describe("isAnyOfResponses", () => {
  it("returns true for AnyOfResponse", () => {
    const value = anyOfResponses([sseResponse({ chunk: string() }), object({ id: string() })]);
    expect(isAnyOfResponses(value)).toBe(true);
  });

  it("returns true for AnyOfResponse containing textResponse", () => {
    const value = anyOfResponses([textResponse("text/csv")]);
    expect(isAnyOfResponses(value)).toBe(true);
  });

  it("returns true for AnyOfResponse containing blobResponse", () => {
    const value = anyOfResponses([blobResponse("image/png")]);
    expect(isAnyOfResponses(value)).toBe(true);
  });

  it("returns false for TypedSseResponse", () => {
    expect(isAnyOfResponses(sseResponse({ chunk: string() }))).toBe(false);
  });

  it("returns false for a valibot schema", () => {
    expect(isAnyOfResponses(string())).toBe(false);
  });
});

describe("hasAnySuccessSseResponse", () => {
  it("returns true for a direct sseResponse at a success code", () => {
    const route = defineApiContract({
      method: "get",
      pathResolver: () => "/stream",
      responsesByStatusCode: {
        200: sseResponse({ chunk: object({ delta: string() }) }),
      },
    });

    expect(hasAnySuccessSseResponse(route)).toBe(true);
  });

  it("returns true for sseResponse inside anyOfResponses at a success code", () => {
    const route = defineApiContract({
      method: "get",
      pathResolver: () => "/stream",
      responsesByStatusCode: {
        200: anyOfResponses([sseResponse({ chunk: string() }), object({ id: string() })]),
      },
    });

    expect(hasAnySuccessSseResponse(route)).toBe(true);
  });

  it("returns false when sseResponse is only at an error status code", () => {
    const route = defineApiContract({
      method: "get",
      pathResolver: () => "/stream",
      responsesByStatusCode: {
        200: object({ id: string() }),
        404: sseResponse({ error: string() }),
      },
    });

    expect(hasAnySuccessSseResponse(route)).toBe(false);
  });

  it("returns false when no SSE response is present", () => {
    const route = defineApiContract({
      method: "get",
      pathResolver: () => "/users",
      responsesByStatusCode: { 200: object({ id: string() }) },
    });

    expect(hasAnySuccessSseResponse(route)).toBe(false);
  });

  it("returns false for anyOfResponses with no sseResponse at a success code", () => {
    const route = defineApiContract({
      method: "get",
      pathResolver: () => "/users",
      responsesByStatusCode: {
        200: anyOfResponses([textResponse("text/csv"), object({ id: string() })]),
      },
    });

    expect(hasAnySuccessSseResponse(route)).toBe(false);
  });

  it("returns true for sseResponse under the default key", () => {
    const route = defineApiContract({
      method: "get",
      pathResolver: () => "/stream",
      responsesByStatusCode: {
        default: sseResponse({ chunk: object({ delta: string() }) }),
      },
    });

    expect(hasAnySuccessSseResponse(route)).toBe(true);
  });

  it("returns false for non-SSE response under the default key", () => {
    const route = defineApiContract({
      method: "get",
      pathResolver: () => "/users",
      responsesByStatusCode: { default: object({ message: string() }) },
    });

    expect(hasAnySuccessSseResponse(route)).toBe(false);
  });
});

describe("getSseSchemaByEventName", () => {
  it("returns null when no SSE schemas are present", () => {
    const route = defineApiContract({
      method: "get",
      pathResolver: () => "/users",
      responsesByStatusCode: { 200: object({ id: string() }) },
    });

    expect(getSseSchemaByEventName(route)).toBeNull();
  });

  it("returns null when responsesByStatusCode is not defined", () => {
    const route = defineApiContract({
      method: "get",
      pathResolver: () => "/users",
      responsesByStatusCode: {},
    });

    expect(getSseSchemaByEventName(route)).toBeNull();
  });

  it("extracts schemas from sseResponse in responsesByStatusCode", () => {
    const chunkSchema = object({ delta: string() });
    const doneSchema = object({ finish_reason: string() });
    const route = defineApiContract({
      method: "get",
      pathResolver: () => "/stream",
      responsesByStatusCode: {
        200: sseResponse({ chunk: chunkSchema, done: doneSchema }),
      },
    });

    const result = getSseSchemaByEventName(route);
    expect(result).not.toBeNull();
    expect(result?.chunk).toBe(chunkSchema);
    expect(result?.done).toBe(doneSchema);
  });

  it("extracts sseResponse schemas from inside anyOf", () => {
    const chunkSchema = object({ delta: string() });
    const route = defineApiContract({
      method: "get",
      pathResolver: () => "/stream",
      responsesByStatusCode: {
        200: anyOfResponses([sseResponse({ chunk: chunkSchema }), object({ id: string() })]),
      },
    });

    const result = getSseSchemaByEventName(route);
    expect(result).not.toBeNull();
    expect(result?.chunk).toBe(chunkSchema);
  });
});
