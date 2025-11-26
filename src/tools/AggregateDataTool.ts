import { z } from "zod";
import { gql, ClientError } from 'graphql-request';
import { IServerTool, MakeGqlRequest } from "../types/IServerTool.js";

export class AggregateDataTool implements IServerTool {
  name = "aggregate_data";
  description = `
Performs aggregation operations on a Hasura table (count, sum, avg, min, max).

Parameters:
  - tableName: The exact name of the table to aggregate
  - aggregateFunction: The aggregation function (count, sum, avg, min, max)
  - field: The field to aggregate (required for sum, avg, min, max; not used for count)
  - filter: Hasura GraphQL 'where' filter object to filter rows before aggregation (optional)

Returns:
  - Aggregation result object with the requested metric value
  - For count: { count: number }
  - For sum/avg/min/max: { [function]: { [field]: value } }

Note: The 'field' parameter is required for sum, avg, min, and max operations,
but is ignored for count operations.
  `.trim();
  inputSchema = z.object({
    tableName: z.string().describe("The exact name of the table..."),
    aggregateFunction: z.enum(["count", "sum", "avg", "min", "max"]).describe("The aggregation function..."),
    field: z.string().optional().describe("Required for 'sum', 'avg', 'min', 'max'..."),
    filter: z.record(z.unknown()).optional().describe("Optional. A Hasura GraphQL 'where' filter object..."),
  });

  constructor(private makeGqlRequest: MakeGqlRequest) {
    this.execute = this.execute.bind(this);
  }

  async execute(input: z.infer<typeof this.inputSchema>, _extra: any) {
    const { tableName, aggregateFunction, field, filter } = input;
    console.log(`[INFO] Executing tool 'aggregate_data': ${aggregateFunction} on ${tableName}...`);

    if (aggregateFunction !== 'count' && !field) {
      throw new Error(`The 'field' parameter is required for '${aggregateFunction}' aggregation.`);
    }
    if (aggregateFunction === 'count' && field) {
      console.warn(`[WARN] 'field' parameter is ignored for 'count' aggregation.`);
    }

    const aggregateTableName = `${tableName}_aggregate`;

    let aggregateSelection = '';
    if (aggregateFunction === 'count') {
      aggregateSelection = `{ count }`;
    } else if (field) {
      aggregateSelection = `{ ${aggregateFunction} { ${field} } }`;
    } else {
      throw new Error(`'field' parameter is missing for '${aggregateFunction}' aggregation.`);
    }

    const boolExpTypeName = `${tableName}_bool_exp`;
    const filterVariableDefinition = filter ? `($filter: ${boolExpTypeName}!)` : "";
    const whereClause = filter ? `where: $filter` : "";

    const query = gql`
      query AggregateData ${filterVariableDefinition} {
        ${aggregateTableName}(${whereClause}) {
          aggregate ${aggregateSelection}
        }
      }
    `;

    const variables = filter ? { filter } : {};

    try {
      const rawResult = await this.makeGqlRequest(query, variables);

      let finalResult = null;
      if (rawResult && rawResult[aggregateTableName] && rawResult[aggregateTableName].aggregate) {
        finalResult = rawResult[aggregateTableName].aggregate;
      } else {
        console.warn('[WARN] Unexpected result structure from aggregation query:', rawResult);
        finalResult = rawResult;
      }

      return { content: [{ type: "text" as const, text: JSON.stringify(finalResult, null, 2) }] };
    } catch (error: any) {
      if (error instanceof ClientError && error.response?.errors) {
        const gqlErrors = error.response.errors.map(e => e.message).join(', ');
        console.error(`[ERROR] Tool 'aggregate_data' failed: ${gqlErrors}`, error.response);
        throw new Error(`GraphQL aggregation failed: ${gqlErrors}. Check table/field names and filter syntax.`);
      }
      console.error(`[ERROR] Tool 'aggregate_data' failed: ${error.message}`);
      throw error;
    }
  }
}
