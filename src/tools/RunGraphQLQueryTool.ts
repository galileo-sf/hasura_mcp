import { z } from "zod";
import { IServerTool, MakeGqlRequest } from "../types/IServerTool.js";

export class RunGraphQLQueryTool implements IServerTool {
  name = "run_graphql_query";
  description = `
Executes a read-only GraphQL query against the Hasura endpoint.

Parameters:
  - query: The GraphQL query string (must be a read-only operation, not a mutation)
  - variables: Object containing query variables (optional)

Returns:
  - JSON result of the GraphQL query execution

Note: This tool only supports read-only queries. Mutation operations will be rejected.
Use 'run_graphql_mutation' for insert, update, or delete operations.
  `.trim();
  inputSchema = z.object({
    query: z.string().describe("The GraphQL query string (must be a read-only operation)."),
    variables: z.record(z.unknown()).optional().describe("Optional. An object containing variables..."),
  });

  constructor(private makeGqlRequest: MakeGqlRequest) {
    this.execute = this.execute.bind(this);
  }

  async execute(input: z.infer<typeof this.inputSchema>, _extra: any) {
    console.log(`[INFO] Executing tool 'run_graphql_query'`);
    const { query, variables } = input;

    if (query.trim().toLowerCase().startsWith('mutation')) {
      throw new Error("This tool only supports read-only queries...");
    }

    try {
      const result = await this.makeGqlRequest(query, variables);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (error: any) {
      console.error(`[ERROR] Tool 'run_graphql_query' failed: ${error.message}`);
      throw error;
    }
  }
}
