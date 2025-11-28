import { z } from "zod";
import { IServerTool, MakeGqlRequest } from "../types/IServerTool.js";

export class RunGraphQLQueryTool implements IServerTool {
  name = "run_graphql_query";
  description = `
Executes a read-only GraphQL query against the Hasura endpoint.

Parameters:
  - query: The GraphQL query string (must be a read-only operation, not a mutation)
  - variables: Object containing query variables (optional)
  - forceBigQuery: Set to true to bypass automatic result trimming (optional)

Returns:
  - JSON result of the GraphQL query execution
  - If results contain arrays with more than 100 items, they will be automatically trimmed
  - A warning will be added to the response if trimming occurred

Note: This tool only supports read-only queries. Mutation operations will be rejected.
Use 'run_graphql_mutation' for insert, update, or delete operations.

IMPORTANT: Results are automatically trimmed to 100 rows per array to prevent excessive data.
To avoid this warning and have full control, use pagination in your queries:

Hasura Pagination Pattern:
  query($limit: Int!, $offset: Int!) {
    tableName(limit: $limit, offset: $offset) {
      id
      name
    }
  }

Set 'forceBigQuery: true' to disable automatic trimming if you need all results.
  `.trim();
  inputSchema = z.object({
    query: z.string().describe("The GraphQL query string (must be a read-only operation)."),
    variables: z.record(z.unknown()).optional().describe("Optional. An object containing variables for your query."),
    forceBigQuery: z.boolean().optional().describe("Optional. Set to true to disable automatic result trimming (allows unlimited results)."),
  });

  constructor(private makeGqlRequest: MakeGqlRequest) {
    this.execute = this.execute.bind(this);
  }

  async execute(input: z.infer<typeof this.inputSchema>, _extra: any) {
    const { query, variables, forceBigQuery = false } = input;
    console.log(`[INFO] Executing tool 'run_graphql_query'${forceBigQuery ? ' (forceBigQuery enabled)' : ''}`);

    if (query.trim().toLowerCase().startsWith('mutation')) {
      throw new Error("This tool only supports read-only queries...");
    }

    try {
      const result = await this.makeGqlRequest(query, variables || {});

      // Trim results if forceBigQuery is false
      if (!forceBigQuery) {
        let trimmed = false;
        const trimmedFields: string[] = [];

        const trimResult = (obj: any, path: string = 'root'): any => {
          if (Array.isArray(obj)) {
            if (obj.length > 100) {
              trimmed = true;
              trimmedFields.push(`${path} (${obj.length} rows trimmed to 100)`);
              return obj.slice(0, 100);
            }
            return obj.map((item, idx) => trimResult(item, `${path}[${idx}]`));
          } else if (obj !== null && typeof obj === 'object') {
            const trimmedObj: any = {};
            for (const key in obj) {
              trimmedObj[key] = trimResult(obj[key], path === 'root' ? key : `${path}.${key}`);
            }
            return trimmedObj;
          }
          return obj;
        };

        const trimmedResult = trimResult(result);

        if (trimmed) {
          console.warn(
            `[WARN] Tool 'run_graphql_query' trimmed results:\n` +
            trimmedFields.map(f => `  - ${f}`).join('\n') + '\n' +
            `To avoid this, add pagination to your query: tableName(limit: $limit, offset: $offset)\n` +
            `Or set 'forceBigQuery: true' to retrieve all results.`
          );

          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                ...trimmedResult,
                _warning: `Results were automatically trimmed to 100 rows per array to prevent excessive data. Trimmed fields: ${trimmedFields.join(', ')}. Use pagination in your query (limit/offset) or set forceBigQuery=true to get all results.`
              }, null, 2)
            }]
          };
        }

        return { content: [{ type: "text" as const, text: JSON.stringify(trimmedResult, null, 2) }] };
      }

      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (error: any) {
      console.error(`[ERROR] Tool 'run_graphql_query' failed: ${error.message}`);
      throw error;
    }
  }
}
