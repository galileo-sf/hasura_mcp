import { z } from "zod";
import { IServerTool, MakeGqlRequest } from "../types/IServerTool.js";

export class RunGraphQLMutationTool implements IServerTool {
  name = "run_graphql_mutation";
  description = `
Executes a GraphQL mutation to insert, update, or delete data in the Hasura database.

Parameters:
  - mutation: The GraphQL mutation string (must start with 'mutation')
  - variables: Object containing mutation variables (optional)

Returns:
  - JSON result of the GraphQL mutation execution

Note: This tool only accepts mutation operations. The mutation string must begin with
the 'mutation' keyword. For read-only operations, use 'run_graphql_query'.
  `.trim();
  inputSchema = z.object({
    mutation: z.string().describe("The GraphQL mutation string."),
    variables: z.record(z.unknown()).optional().describe("Optional. An object containing variables..."),
  });

  constructor(private makeGqlRequest: MakeGqlRequest) {
    this.execute = this.execute.bind(this);
  }

  async execute(input: z.infer<typeof this.inputSchema>, _extra: any) {
    console.log(`[INFO] Executing tool 'run_graphql_mutation'`);
    const { mutation, variables } = input;

    if (!mutation.trim().toLowerCase().startsWith('mutation')) {
      throw new Error("The provided string does not appear to be a mutation...");
    }

    try {
      const result = await this.makeGqlRequest(mutation, variables);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (error: any) {
      console.error(`[ERROR] Tool 'run_graphql_mutation' failed: ${error.message}`);
      throw error;
    }
  }
}
