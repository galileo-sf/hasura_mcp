import { z } from "zod";
import { IServerTool, MakeGqlRequest } from "../types/IServerTool.js";

export class RunGraphQLQueryTool implements IServerTool {
  name = "run_graphql_query";
  description = `
Executes a read-only GraphQL query against the Hasura endpoint.

Parameters:
  - query: The GraphQL query string (must be a read-only operation, not a mutation)
  - variables: Object containing query variables (optional)
  - limit: Maximum number of rows to return - automatically added to query (optional)
  - offset: Number of rows to skip for pagination - automatically added to query (optional)
  - forceBigQuery: Set to true to bypass the limit safety check (optional)

Returns:
  - JSON result of the GraphQL query execution
  - If limit/offset are provided, they are automatically injected into variables

Note: This tool only supports read-only queries. Mutation operations will be rejected.
Use 'run_graphql_mutation' for insert, update, or delete operations.
Pagination parameters (limit/offset) are convenience helpers that merge into variables.

IMPORTANT: For safety, queries require a limit <= 100 to prevent performance issues.
If limit is undefined or > 100, the query will be rejected unless 'forceBigQuery: true' is set.
This safety check helps avoid fetching excessive data that could cause timeouts or memory issues.
  `.trim();
  inputSchema = z.object({
    query: z.string().describe("The GraphQL query string (must be a read-only operation)."),
    variables: z.record(z.unknown()).optional().describe("Optional. An object containing variables..."),
    limit: z.number().int().positive().optional().describe("Optional. Maximum number of rows to return. Automatically added to variables."),
    offset: z.number().int().min(0).optional().describe("Optional. Number of rows to skip for pagination. Automatically added to variables."),
    forceBigQuery: z.boolean().optional().describe("Optional. Set to true to allow queries without limit or with limit > 100."),
  });

  constructor(private makeGqlRequest: MakeGqlRequest) {
    this.execute = this.execute.bind(this);
  }

  async execute(input: z.infer<typeof this.inputSchema>, _extra: any) {
    const { query, variables, limit, offset, forceBigQuery = false } = input;
    console.log(`[INFO] Executing tool 'run_graphql_query'${limit !== undefined ? `, limit: ${limit}` : ''}${offset !== undefined ? `, offset: ${offset}` : ''}`);

    if (query.trim().toLowerCase().startsWith('mutation')) {
      throw new Error("This tool only supports read-only queries...");
    }

    // Safety check: enforce limit unless forceBigQuery is true
    if (!forceBigQuery && (limit === undefined || limit > 100)) {
      console.error(
        `[ERROR] Tool 'run_graphql_query' safety check failed: limit=${limit}\n` +
        `Queries require a limit <= 100 to prevent fetching excessive data and avoid performance issues.\n` +
        `If you intentionally need to fetch more data, set 'forceBigQuery: true' in your request.`
      );
      throw new Error("Query requires limit <= 100. Set forceBigQuery=true to bypass this safety check.");
    }

    try {
      // Merge pagination parameters into variables
      const mergedVariables = { ...variables };
      if (limit !== undefined) mergedVariables.limit = limit;
      if (offset !== undefined) mergedVariables.offset = offset;

      const result = await this.makeGqlRequest(query, mergedVariables);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (error: any) {
      console.error(`[ERROR] Tool 'run_graphql_query' failed: ${error.message}`);
      throw error;
    }
  }
}
