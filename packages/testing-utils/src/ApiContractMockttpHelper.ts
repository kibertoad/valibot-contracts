import type { Mockttp, RequestRuleBuilder } from "mockttp";
import { parse } from "valibot";
import {
  type ApiContract,
  ContractNoBody,
  isAnyOfResponses,
  isBlobResponse,
  isJsonResponse,
  isNoBodyResponse,
  isSseResponse,
  isStreamResponse,
  isTextResponse,
  mapApiContractToPath,
} from "valibot-api-contracts";
import { resolveContractEntry } from "./resolveContractEntry.ts";
import { formatSseResponse, type MockResponseParams } from "./types.ts";

type HttpMethod = "get" | "delete" | "post" | "patch" | "put";

/**
 * Mocks HTTP responses in [mockttp](https://github.com/httptoolkit/mockttp)-based tests using
 * contracts defined with `defineApiContract` from `valibot-api-contracts`. The response body is
 * validated through the contract's valibot schema before being sent.
 */
export class ApiContractMockttpHelper {
  private readonly mockServer: Mockttp;

  constructor(mockServer: Mockttp) {
    this.mockServer = mockServer;
  }

  private resolveMethodBuilder(method: HttpMethod, path: string): RequestRuleBuilder {
    switch (method) {
      case "get":
        return this.mockServer.forGet(path);
      case "delete":
        return this.mockServer.forDelete(path);
      case "post":
        return this.mockServer.forPost(path);
      case "patch":
        return this.mockServer.forPatch(path);
      case "put":
        return this.mockServer.forPut(path);
      default:
        throw new Error(`Unsupported method ${method}`);
    }
  }

  private resolvePath(contract: ApiContract, pathParams: unknown): string {
    return contract.requestPathParamsSchema && pathParams
      ? contract.pathResolver(pathParams)
      : mapApiContractToPath(contract);
  }

  async mockResponse<TContract extends ApiContract>(
    contract: TContract,
    params: MockResponseParams<TContract>,
  ): Promise<void> {
    // oxlint-disable-next-line typescript/no-explicit-any -- field access is safe; types are enforced by the public signature
    const anyParams = params as any;
    const path = this.resolvePath(contract, anyParams.pathParams);
    const statusCode = anyParams.responseStatus;
    const responseEntry = resolveContractEntry(contract.responsesByStatusCode, statusCode);

    if (!responseEntry) {
      throw new Error("Specified responseStatus cannot be mapped with contract");
    }

    const mockRule = this.resolveMethodBuilder(contract.method, path);

    if (responseEntry === ContractNoBody || isNoBodyResponse(responseEntry)) {
      await mockRule.thenReply(statusCode);
      return;
    }

    if (isTextResponse(responseEntry)) {
      await mockRule.thenReply(statusCode, anyParams.responseText, {
        "content-type": responseEntry.contentType,
      });
      return;
    }

    if (isBlobResponse(responseEntry)) {
      await mockRule.thenReply(statusCode, anyParams.responseBlob, {
        "content-type": responseEntry.contentType,
      });
      return;
    }

    if (isStreamResponse(responseEntry)) {
      await mockRule.thenReply(statusCode, anyParams.responseStream, {
        "content-type": responseEntry.contentType,
      });
      return;
    }

    if (isSseResponse(responseEntry)) {
      const body = formatSseResponse(anyParams.events);
      await mockRule.thenReply(statusCode, body, {
        "content-type": "text/event-stream",
      });
      return;
    }

    if (isAnyOfResponses(responseEntry)) {
      const sseEntry = responseEntry.responses.find(isSseResponse);
      const jsonEntry = responseEntry.responses.find(isJsonResponse);

      await mockRule.thenCallback((request) => {
        const accept = request.headers.accept ?? "";

        if (accept.includes("text/event-stream") && sseEntry) {
          return {
            statusCode,
            headers: { "content-type": "text/event-stream" },
            body: formatSseResponse(anyParams.events),
          };
        }

        if (jsonEntry) {
          return {
            statusCode,
            headers: { "content-type": "application/json" },
            body: JSON.stringify(parse(jsonEntry, anyParams.responseJson)),
          };
        }

        return { statusCode };
      });
      return;
    }

    const body = parse(responseEntry, anyParams.responseJson);
    await mockRule.thenReply(statusCode, JSON.stringify(body), {
      "content-type": "application/json",
    });
  }
}
