import { z, type ZodObject } from "zod";

// An object schema, because the Agent SDK builds its tools from `.shape`.
export type Tool<S extends ZodObject = ZodObject> = {
  name: string;
  description: string;
  input: S;
  run(input: z.infer<S>): Promise<string>;
};

/**
 * One tool a model may call. `run` parses its input first, so the schema's
 * defaults apply whichever caller reaches it: the agent loop, the SDK, or a
 * test that calls `run` directly.
 */
export function tool<S extends ZodObject>(definition: {
  name: string;
  description: string;
  input: S;
  run: (input: z.infer<S>) => string | Promise<string>;
}): Tool<S> {
  return {
    name: definition.name,
    description: definition.description,
    input: definition.input,
    async run(input) {
      return definition.run(definition.input.parse(input));
    },
  };
}
