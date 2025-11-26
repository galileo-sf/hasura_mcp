import { z } from "zod";
import { gql } from 'graphql-request';
import { IServerTool, MakeGqlRequest } from "../types/IServerTool.js";
import { IntrospectionSchema } from 'graphql';

export class ListTablesTool implements IServerTool {
  name = "list_tables";
  description = `
Lists available data tables (or collections) managed by Hasura, organized by schema with descriptions.

Parameters:
  - schemaName: Filter by database schema name (optional)
  - filter: Case-insensitive text search on table names/descriptions (optional)
  - limit: Maximum number of tables to return per schema (default: 10)
  - offset: Number of tables to skip for pagination (default: 0)

Returns:
  - schema: Schema name
  - tables: Array of table objects with name and description
  - totalCount: Total tables in schema before filtering
  - filteredCount: Tables after filter, before pagination
  - returnedCount: Actual number of tables returned
  - offset: Current offset value
  - limit: Current limit value
  `.trim();
  inputSchema = z.object({
    schemaName: z.string().optional().describe("Optional. The database schema name to filter results. If omitted, returns tables from all schemas."),
    filter: z.string().optional().describe("Optional. Case-insensitive search filter for table names and descriptions."),
    limit: z.number().int().positive().optional().default(10).describe("Optional. Maximum number of tables to return per schema. Default: 10."),
    offset: z.number().int().min(0).optional().default(0).describe("Optional. Number of tables to skip for pagination. Default: 0.")
  });

  constructor(
    private makeGqlRequest: MakeGqlRequest,
    private getIntrospectionSchema: () => Promise<IntrospectionSchema>
  ) {
    this.execute = this.execute.bind(this);
  }

  async execute(input: z.infer<typeof this.inputSchema>, _extra: any) {
    const { schemaName, filter, limit = 10, offset = 0 } = input;
    console.log(`[INFO] Executing tool 'list_tables' for schema: ${schemaName || 'ALL'}, filter: ${filter || 'NONE'}, limit: ${limit}, offset: ${offset}`);

    try {
      const schema = await this.getIntrospectionSchema();

      const query = gql`
        query GetTablesWithDescriptions {
          __type(name: "query_root") {
            fields {
              name
              description
              type {
                name
                kind
              }
            }
          }
        }
      `;

      const result = await this.makeGqlRequest(query);

      const tablesData: Record<string, Array<{name: string, description: string | null}>> = {};

      if (result.__type && result.__type.fields) {
        const fieldEntries = result.__type.fields;

        for (const field of fieldEntries) {
          if (field.name.includes('_aggregate') ||
              field.name.includes('_by_pk') ||
              field.name.includes('_stream') ||
              field.name.includes('_mutation') ||
              field.name.startsWith('__')) {
            continue;
          }

          let currentSchema = 'public';
          if (field.description && field.description.includes('schema:')) {
            const schemaMatch = field.description.match(/schema:\s*([^\s,]+)/i);
            if (schemaMatch && schemaMatch[1]) {
              currentSchema = schemaMatch[1];
            }
          }

          if (schemaName && currentSchema !== schemaName) {
            continue;
          }

          if (!tablesData[currentSchema]) {
            tablesData[currentSchema] = [];
          }

          tablesData[currentSchema].push({
            name: field.name,
            description: field.description
          });
        }
      }

      const formattedOutput = Object.entries(tablesData)
        .map(([schema, tables]) => {
          let filteredTables = tables;

          // Apply filter if provided
          if (filter) {
            const filterLower = filter.toLowerCase();
            filteredTables = filteredTables.filter(t =>
              t.name.toLowerCase().includes(filterLower) ||
              (t.description && t.description.toLowerCase().includes(filterLower))
            );
          }

          // Sort tables
          filteredTables = filteredTables.sort((a, b) => a.name.localeCompare(b.name));

          const totalBeforePagination = filteredTables.length;

          // Apply offset and limit for pagination
          filteredTables = filteredTables.slice(offset, offset + limit);

          return {
            schema,
            tables: filteredTables,
            totalCount: tables.length,
            filteredCount: totalBeforePagination,
            returnedCount: filteredTables.length,
            offset,
            limit
          };
        })
        .filter(s => s.tables.length > 0) // Remove schemas with no matching tables
        .sort((a, b) => a.schema.localeCompare(b.schema));

      return { content: [{ type: "text" as const, text: JSON.stringify(formattedOutput, null, 2) }] };
    } catch (error: any) {
      console.error(`[ERROR] Tool 'list_tables' failed: ${error.message}`);
      throw error;
    }
  }
}
