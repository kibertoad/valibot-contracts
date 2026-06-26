import type {
  ApiContractResponse,
  HttpStatusCode,
  HttpStatusCodeRange,
  ResponsesByStatusCode,
} from "valibot-api-contracts";

function getRangeKey(statusCode: HttpStatusCode): HttpStatusCodeRange | undefined {
  if (statusCode >= 100 && statusCode < 200) return "1xx";
  if (statusCode >= 200 && statusCode < 300) return "2xx";
  if (statusCode >= 300 && statusCode < 400) return "3xx";
  if (statusCode >= 400 && statusCode < 500) return "4xx";
  if (statusCode >= 500 && statusCode < 600) return "5xx";
  return undefined;
}

/**
 * Resolves the contract response entry for a concrete status code using the same
 * exact → range → `'default'` precedence as the runtime client.
 */
export function resolveContractEntry(
  responsesByStatusCode: ResponsesByStatusCode,
  statusCode: HttpStatusCode,
): ApiContractResponse | undefined {
  const rangeKey = getRangeKey(statusCode);

  return (
    responsesByStatusCode[statusCode] ??
    (rangeKey ? responsesByStatusCode[rangeKey] : undefined) ??
    responsesByStatusCode.default
  );
}
