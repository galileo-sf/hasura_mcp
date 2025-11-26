import { z } from "zod";
import { gql } from 'graphql-request';
import { IServerTool, MakeGqlRequest } from "../types/IServerTool.js";
import { IntrospectionSchema, IntrospectionObjectType } from 'graphql';

export class PreviewTableDataTool implements IServerTool {
  name = "preview_table_data";
  description = `
Fetches a limited sample of rows from a specified table for preview purposes.

Parameters:
  - tableName: The exact name of the table to preview
  - limit: Maximum number of rows to fetch (default: 5)

Returns:
  - JSON object with table data containing scalar/enum fields only
  - Complex nested objects and relationships are excluded from preview

Note: Only scalar fields (String, Int, Boolean, etc.) and enum fields are included
in the preview. Use GraphQL queries directly for complex nested data.
  `.trim();
  inputSchema = z.object({
    tableName: z.string().describe("The exact name of the table..."),
    limit: z.number().int().positive().optional().default(5).describe("Optional. Maximum number of rows..."),
  });

  constructor(
    private makeGqlRequest: MakeGqlRequest,
    private getIntrospectionSchema: () => Promise<IntrospectionSchema>
  ) {
    this.execute = this.execute.bind(this);
  }

  async execute(input: z.infer<typeof this.inputSchema>, _extra: any) {
    const { tableName, limit } = input;
    console.log(`[INFO] Executing tool 'preview_table_data' for table: ${tableName}, limit: ${limit}`);

    try {
      const schema = await this.getIntrospectionSchema();
      const tableType = schema.types.find(t => t.name === tableName && t.kind === 'OBJECT') as IntrospectionObjectType | undefined;
      if (!tableType) {
        throw new Error(`Table (Object type) '${tableName}' not found in schema.`);
      }

      const scalarFields = tableType.fields
        ?.filter(f => {
          let currentType = f.type;
          while (currentType.kind === 'NON_NULL' || currentType.kind === 'LIST') currentType = currentType.ofType;
          return currentType.kind === 'SCALAR' || currentType.kind === 'ENUM';
        })
        .map(f => f.name) || [];

      if (scalarFields.length === 0) {
        console.warn(`[WARN] No scalar fields found for table ${tableName}...`);
        scalarFields.push('__typename');
      }

      const fieldsString = scalarFields.join('\n          ');
      const query = gql` query PreviewData($limit: Int!) { ${tableName}(limit: $limit) { ${fieldsString} } }`;
      const variables = { limit };
      const result = await this.makeGqlRequest(query, variables);

      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (error: any) {
      console.error(`[ERROR] Tool 'preview_table_data' failed: ${error.message}`);
      throw error;
    }
  }
}
