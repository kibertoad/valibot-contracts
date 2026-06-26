import type { GenericSchema, InferInput, InferOutput } from "valibot";

/**
 * Infers the input type of a valibot schema (the type accepted before transforms run),
 * or `undefined` when no schema is provided.
 */
export type InferSchemaInput<T extends GenericSchema | undefined> = T extends GenericSchema
  ? InferInput<T>
  : T extends undefined
    ? undefined
    : never;

/**
 * Infers the output type of a valibot schema (the type produced after parsing),
 * or `undefined` when no schema is provided.
 */
export type InferSchemaOutput<T extends GenericSchema | undefined> = T extends GenericSchema
  ? InferOutput<T>
  : T extends undefined
    ? undefined
    : never;

export type RoutePathResolver<PathParams> = (pathParams: PathParams) => string;

// biome-ignore lint/suspicious/noEmptyInterface: augmentation target — consumers extend it via module augmentation
export interface CommonRouteDefinitionMetadata extends Record<string, unknown> {}
