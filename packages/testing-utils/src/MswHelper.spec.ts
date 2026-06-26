import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  deleteApiContractWithNoBodyResponse,
  dualModeApiContract,
  getApiContract,
  getApiContractWith2xxRange,
  getApiContractWithDefault,
  getApiContractWithPathParams,
  getApiContractWithQueryParams,
  postApiContract,
  sseGetApiContract,
  sseGetApiContractWithPathParams,
  streamResponseApiContract,
  textResponseApiContract,
} from "../test/testApiContracts.ts";
import { MswHelper } from "./MswHelper.ts";

const BASE_URL = "http://localhost:8080";

function url(path: string): string {
  return `${BASE_URL}${path}`;
}

function countSseEvents(body: string): number {
  return body.split("\n").filter((line) => line.startsWith("event: ")).length;
}

describe("MswHelper", () => {
  const server = setupServer();
  const helper = new MswHelper(BASE_URL);

  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  describe("mockResponse — REST contracts", () => {
    it("mocks GET without path params", () => {
      helper.mockResponse(getApiContract, server, {
        responseStatus: 200,
        responseJson: { id: "1" },
      });
      return fetch(url("/"))
        .then((r) => r.json())
        .then((body) => expect(body).toEqual({ id: "1" }));
    });

    it("strips unknown properties via the contract schema", async () => {
      helper.mockResponse(getApiContract, server, {
        responseStatus: 200,
        // @ts-expect-error wrong property on responseJson
        responseJson: { id: "1", wrong: "x" },
      });
      const response = await fetch(url("/"));
      expect(await response.json()).toEqual({ id: "1" });
    });

    it("mocks GET with path params", async () => {
      helper.mockResponse(getApiContractWithPathParams, server, {
        pathParams: { userId: "3" },
        responseStatus: 200,
        responseJson: { id: "3" },
      });
      const response = await fetch(url("/users/3"));
      expect(await response.json()).toEqual({ id: "3" });
    });

    it("mocks GET with query params", async () => {
      helper.mockResponse(getApiContractWithQueryParams, server, {
        responseStatus: 200,
        responseJson: { id: "1" },
      });
      const response = await fetch(url("/?yearFrom=2024"));
      expect(await response.json()).toEqual({ id: "1" });
    });

    it("mocks POST request", async () => {
      helper.mockResponse(postApiContract, server, {
        responseStatus: 200,
        responseJson: { id: "1" },
      });
      const response = await fetch(url("/"), {
        method: "POST",
        body: JSON.stringify({ name: "x" }),
      });
      expect(await response.json()).toEqual({ id: "1" });
    });

    it("mocks no-body response", async () => {
      helper.mockResponse(deleteApiContractWithNoBodyResponse, server, { responseStatus: 204 });
      const response = await fetch(url("/no-body"), { method: "DELETE" });
      expect(response.status).toBe(204);
      expect(await response.text()).toBe("");
    });

    it("mocks text response", async () => {
      helper.mockResponse(textResponseApiContract, server, {
        responseStatus: 200,
        responseText: "hello world",
      });
      const response = await fetch(url("/text"));
      expect(response.headers.get("content-type")).toBe("text/plain");
      expect(await response.text()).toBe("hello world");
    });

    it("mocks stream response", async () => {
      helper.mockResponse(streamResponseApiContract, server, {
        responseStatus: 200,
        responseStream: "a,b,c",
      });
      const response = await fetch(url("/stream"));
      expect(response.headers.get("content-type")).toBe("text/csv");
      expect(await response.text()).toBe("a,b,c");
    });
  });

  describe("mockResponse — range / default fallback", () => {
    it("resolves via range key", async () => {
      helper.mockResponse(getApiContractWith2xxRange, server, {
        responseStatus: 201,
        responseJson: { id: "42" },
      });
      const response = await fetch(url("/range"));
      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ id: "42" });
    });

    it("resolves via default key", async () => {
      helper.mockResponse(getApiContractWithDefault, server, {
        responseStatus: 200,
        responseJson: { id: "7" },
      });
      const response = await fetch(url("/default"));
      expect(await response.json()).toEqual({ id: "7" });
    });

    it("throws when responseStatus cannot be mapped with contract", () => {
      expect(() =>
        helper.mockResponse(getApiContract, server, {
          // @ts-expect-error testing runtime error path with status code not in contract
          responseStatus: 999,
          responseJson: { id: "x" },
        }),
      ).toThrow("Specified responseStatus cannot be mapped with contract");
    });
  });

  describe("mockResponse — SSE contracts", () => {
    it("mocks SSE-only GET response", async () => {
      helper.mockResponse(sseGetApiContract, server, {
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
      helper.mockResponse(sseGetApiContractWithPathParams, server, {
        pathParams: { userId: "5" },
        responseStatus: 200,
        events: [{ event: "completed", data: { totalCount: 5 } }],
      });
      const response = await fetch(url("/users/5/events"));
      expect(countSseEvents(await response.text())).toBe(1);
    });
  });

  describe("mockResponse — dual-mode contracts", () => {
    it("returns JSON when no SSE Accept header", async () => {
      helper.mockResponse(dualModeApiContract, server, {
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
      helper.mockResponse(dualModeApiContract, server, {
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
  });

  describe("mockSseStream", () => {
    it("emits SSE events on demand", async () => {
      const controller = helper.mockSseStream(sseGetApiContract, server);
      const response = await fetch(url("/events/stream"));

      controller.emit({ event: "item.updated", data: { items: [{ id: "1" }] } });
      controller.emit({ event: "completed", data: { totalCount: 1 } });
      controller.close();

      expect(response.headers.get("content-type")).toBe("text/event-stream");
      expect(countSseEvents(await response.text())).toBe(2);
    });

    it("emits SSE events on demand with path params", async () => {
      const controller = helper.mockSseStream(sseGetApiContractWithPathParams, server, {
        pathParams: { userId: "5" },
      });
      const response = await fetch(url("/users/5/events"));

      controller.emit({ event: "completed", data: { totalCount: 5 } });
      controller.close();

      expect(countSseEvents(await response.text())).toBe(1);
    });

    it("serves JSON for non-SSE requests on a dual-mode contract", async () => {
      helper.mockSseStream(dualModeApiContract, server, { responseJson: { id: "1" } });
      const response = await fetch(url("/events/dual"), {
        method: "POST",
        headers: { accept: "application/json" },
        body: JSON.stringify({ name: "x" }),
      });
      expect(await response.json()).toEqual({ id: "1" });
    });

    it("streams SSE for SSE requests on a dual-mode contract", async () => {
      const controller = helper.mockSseStream(dualModeApiContract, server, {
        responseJson: { id: "1" },
      });
      const response = await fetch(url("/events/dual"), {
        method: "POST",
        headers: { accept: "text/event-stream" },
        body: JSON.stringify({ name: "x" }),
      });

      controller.emit({ event: "completed", data: { totalCount: 42 } });
      controller.close();

      expect(response.headers.get("content-type")).toBe("text/event-stream");
      expect(countSseEvents(await response.text())).toBe(1);
    });
  });
});
