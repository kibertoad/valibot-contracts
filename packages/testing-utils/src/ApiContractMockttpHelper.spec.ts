import { getLocal } from "mockttp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  anyOfTextResponsesApiContract,
  blobResponseApiContract,
  deleteApiContractWithNoBodyResponse,
  dualModeApiContract,
  dualModeApiContractWithPathParams,
  getApiContract,
  getApiContractWith2xxRange,
  getApiContractWith4xxRange,
  getApiContractWith5xxRange,
  getApiContractWithDefault,
  getApiContractWithExactAndRange,
  getApiContractWithPathAndQueryParams,
  getApiContractWithPathParams,
  getApiContractWithQueryParams,
  noBodyApiContract,
  patchApiContract,
  postApiContract,
  postApiContractWithPathParams,
  putApiContract,
  sseGetApiContract,
  sseGetApiContractWithPathParams,
  sseGetApiContractWithQueryParams,
  streamResponseApiContract,
  textResponseApiContract,
} from "../test/testApiContracts.ts";
import { ApiContractMockttpHelper } from "./ApiContractMockttpHelper.ts";

function countSseEvents(body: string): number {
  return body.split("\n").filter((line) => line.startsWith("event: ")).length;
}

describe("ApiContractMockttpHelper", () => {
  const mockServer = getLocal();
  const helper = new ApiContractMockttpHelper(mockServer);

  beforeEach(async () => {
    await mockServer.start();
  });
  afterEach(() => mockServer.stop());

  const url = (path: string) => `${mockServer.url}${path}`;

  describe("mockResponse — REST contracts", () => {
    it("mocks GET without path params", async () => {
      await helper.mockResponse(getApiContract, { responseStatus: 200, responseJson: { id: "1" } });
      const response = await fetch(url("/"));
      expect(await response.json()).toEqual({ id: "1" });
    });

    it("enforces GET contract schema (strips unknown properties)", async () => {
      await helper.mockResponse(getApiContract, {
        responseStatus: 200,
        // @ts-expect-error wrong property on responseJson
        responseJson: { id: "1", wrong: "x" },
      });
      const response = await fetch(url("/"));
      expect(await response.json()).toEqual({ id: "1" });
    });

    it("mocks GET with path params", async () => {
      await helper.mockResponse(getApiContractWithPathParams, {
        pathParams: { userId: "3" },
        responseStatus: 200,
        responseJson: { id: "3" },
      });
      const response = await fetch(url("/users/3"));
      expect(await response.json()).toEqual({ id: "3" });
    });

    it("mocks GET with query params", async () => {
      await helper.mockResponse(getApiContractWithQueryParams, {
        responseStatus: 200,
        responseJson: { id: "1" },
      });
      const response = await fetch(url("/?yearFrom=2024"));
      expect(await response.json()).toEqual({ id: "1" });
    });

    it("mocks GET with path and query params", async () => {
      await helper.mockResponse(getApiContractWithPathAndQueryParams, {
        pathParams: { userId: "3" },
        responseStatus: 200,
        responseJson: { id: "3" },
      });
      const response = await fetch(url("/users/3?yearFrom=2024"));
      expect(await response.json()).toEqual({ id: "3" });
    });

    it("mocks POST without path params", async () => {
      await helper.mockResponse(postApiContract, {
        responseStatus: 200,
        responseJson: { id: "1" },
      });
      const response = await fetch(url("/"), {
        method: "POST",
        body: JSON.stringify({ name: "x" }),
      });
      expect(await response.json()).toEqual({ id: "1" });
    });

    it("mocks POST with path params", async () => {
      await helper.mockResponse(postApiContractWithPathParams, {
        pathParams: { userId: "3" },
        responseStatus: 200,
        responseJson: { id: "2" },
      });
      const response = await fetch(url("/users/3"), {
        method: "POST",
        body: JSON.stringify({ name: "x" }),
      });
      expect(await response.json()).toEqual({ id: "2" });
    });

    it("mocks no-body DELETE response (204)", async () => {
      await helper.mockResponse(noBodyApiContract, {
        pathParams: { userId: "1" },
        responseStatus: 204,
      });
      const response = await fetch(url("/users/1"), { method: "DELETE" });
      expect(response.status).toBe(204);
      expect(await response.text()).toBe("");
    });
  });

  describe("mockResponse — SSE contracts", () => {
    it("mocks SSE-only GET response", async () => {
      await helper.mockResponse(sseGetApiContract, {
        responseStatus: 200,
        events: [
          { event: "item.updated", data: { items: [{ id: "1" }] } },
          { event: "completed", data: { totalCount: 1 } },
        ],
      });
      const response = await fetch(url("/events/stream"));
      expect(response.headers.get("content-type")).toBe("text/event-stream");
      expect(countSseEvents(await response.text())).toBe(2);
    });

    it("mocks SSE with path params", async () => {
      await helper.mockResponse(sseGetApiContractWithPathParams, {
        pathParams: { userId: "5" },
        responseStatus: 200,
        events: [{ event: "completed", data: { totalCount: 5 } }],
      });
      const response = await fetch(url("/users/5/events"));
      expect(countSseEvents(await response.text())).toBe(1);
    });

    it("mocks SSE with query params", async () => {
      await helper.mockResponse(sseGetApiContractWithQueryParams, {
        responseStatus: 200,
        events: [{ event: "completed", data: { totalCount: 3 } }],
      });
      const response = await fetch(url("/events/stream?yearFrom=2024"));
      expect(countSseEvents(await response.text())).toBe(1);
    });
  });

  describe("mockResponse — dual-mode contracts", () => {
    it("returns JSON when no SSE Accept header", async () => {
      await helper.mockResponse(dualModeApiContract, {
        responseStatus: 200,
        responseJson: { id: "1" },
        events: [{ event: "completed", data: { totalCount: 1 } }],
      });
      const response = await fetch(url("/events/dual"), {
        method: "POST",
        body: JSON.stringify({ name: "x" }),
      });
      expect(await response.json()).toEqual({ id: "1" });
    });

    it("returns SSE when Accept: text/event-stream", async () => {
      await helper.mockResponse(dualModeApiContract, {
        responseStatus: 200,
        responseJson: { id: "1" },
        events: [{ event: "completed", data: { totalCount: 1 } }],
      });
      const response = await fetch(url("/events/dual"), {
        method: "POST",
        headers: { accept: "text/event-stream" },
        body: JSON.stringify({ name: "x" }),
      });
      expect(response.headers.get("content-type")).toBe("text/event-stream");
      expect(countSseEvents(await response.text())).toBe(1);
    });

    it("mocks dual-mode with path params", async () => {
      await helper.mockResponse(dualModeApiContractWithPathParams, {
        pathParams: { userId: "2" },
        responseStatus: 200,
        responseJson: { id: "2" },
        events: [{ event: "completed", data: { totalCount: 2 } }],
      });
      const response = await fetch(url("/users/2/events/dual"), {
        method: "POST",
        body: JSON.stringify({ name: "x" }),
      });
      expect(await response.json()).toEqual({ id: "2" });
    });
  });

  describe("mockResponse — range / wildcard status key fallback", () => {
    it("resolves response entry via range key when exact code is absent", async () => {
      await helper.mockResponse(getApiContractWith2xxRange, {
        responseStatus: 201,
        responseJson: { id: "42" },
      });
      const response = await fetch(url("/range"));
      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ id: "42" });
    });

    it("resolves response entry via default key when no exact or range key matches", async () => {
      await helper.mockResponse(getApiContractWithDefault, {
        responseStatus: 200,
        responseJson: { id: "7" },
      });
      const response = await fetch(url("/default"));
      expect(await response.json()).toEqual({ id: "7" });
    });

    it("exact key takes priority over range key", async () => {
      await helper.mockResponse(getApiContractWithExactAndRange, {
        responseStatus: 200,
        responseJson: { id: "exact" },
      });
      const response = await fetch(url("/exact-and-range"));
      expect(await response.json()).toEqual({ id: "exact" });
    });

    it("range key is used when exact code is absent but range matches", async () => {
      await helper.mockResponse(getApiContractWithExactAndRange, {
        responseStatus: 201,
        responseJson: { id: "range", created: true },
      });
      const response = await fetch(url("/exact-and-range"));
      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ id: "range", created: true });
    });
  });

  describe("mockResponse — NoBodyResponse", () => {
    it("replies with no body for noBodyResponse() entry", async () => {
      await helper.mockResponse(deleteApiContractWithNoBodyResponse, { responseStatus: 204 });
      const response = await fetch(url("/no-body"), { method: "DELETE" });
      expect(response.status).toBe(204);
    });
  });

  describe("mockResponse — HTTP methods", () => {
    it("mocks PATCH request", async () => {
      await helper.mockResponse(patchApiContract, {
        responseStatus: 200,
        responseJson: { id: "1" },
      });
      const response = await fetch(url("/patch"), {
        method: "PATCH",
        body: JSON.stringify({ name: "x" }),
      });
      expect(await response.json()).toEqual({ id: "1" });
    });

    it("mocks PUT request", async () => {
      await helper.mockResponse(putApiContract, { responseStatus: 200, responseJson: { id: "2" } });
      const response = await fetch(url("/put"), {
        method: "PUT",
        body: JSON.stringify({ name: "x" }),
      });
      expect(await response.json()).toEqual({ id: "2" });
    });
  });

  describe("mockResponse — non-JSON response types", () => {
    it("mocks text response", async () => {
      await helper.mockResponse(textResponseApiContract, {
        responseStatus: 200,
        responseText: "hello world",
      });
      const response = await fetch(url("/text"));
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/plain");
      expect(await response.text()).toBe("hello world");
    });

    it("mocks blob response", async () => {
      await helper.mockResponse(blobResponseApiContract, {
        responseStatus: 200,
        responseBlob: "binary-data",
      });
      const response = await fetch(url("/blob"));
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/octet-stream");
    });

    it("mocks stream response", async () => {
      await helper.mockResponse(streamResponseApiContract, {
        responseStatus: 200,
        responseStream: "a,b,c",
      });
      const response = await fetch(url("/stream"));
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/csv");
      expect(await response.text()).toBe("a,b,c");
    });

    it("replies with status only when anyOfResponses has no SSE or JSON entry", async () => {
      await helper.mockResponse(anyOfTextResponsesApiContract, { responseStatus: 200 });
      const response = await fetch(url("/any-of-text"));
      expect(response.status).toBe(200);
    });
  });

  describe("mockResponse — error handling", () => {
    it("throws when responseStatus cannot be mapped with contract", async () => {
      await expect(
        // @ts-expect-error testing runtime error path with status code not in contract
        helper.mockResponse(getApiContract, { responseStatus: 999, responseJson: { id: "x" } }),
      ).rejects.toThrow("Specified responseStatus cannot be mapped with contract");
    });
  });

  describe("mockResponse — extended range / wildcard status key fallback", () => {
    it("resolves response entry via 4xx range key", async () => {
      await helper.mockResponse(getApiContractWith4xxRange, {
        responseStatus: 404,
        responseJson: { id: "not-found" },
      });
      const response = await fetch(url("/not-found"));
      expect(response.status).toBe(404);
    });

    it("resolves response entry via 5xx range key", async () => {
      await helper.mockResponse(getApiContractWith5xxRange, {
        responseStatus: 503,
        responseJson: { id: "error" },
      });
      const response = await fetch(url("/server-error"));
      expect(response.status).toBe(503);
    });
  });
});
