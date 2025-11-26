import { z } from "zod";
import { gql } from 'graphql-request';
import { IServerTool, MakeGqlRequest } from "../types/IServerTool.js";
import { IntrospectionSchema } from 'graphql';

export class DescribeTableTool implements IServerTool {
  name = "describe_table";
  description = `
Shows the complete structure of a table including all columns with their types and descriptions.

Parameters:
  - tableName: The exact name of the table to describe
  - schemaName: The database schema name (default: 'public')

Returns:
  - table: Object containing table metadata
    - name: Table name
    - schema: Schema name
    - description: Table description (if available)
    - columns: Array of column objects with:
      - name: Column name
      - type: GraphQL type (e.g., String!, [Int], etc.)
      - description: Column description (if available)
      - args: Arguments for the field (if any)

Note: Attempts case variations if exact table name is not found.
  `.trim();
  inputSchema = z.object({
    tableName: z.string().describe("The exact name of the table to describe"),
    schemaName: z.string().optional().default('public').describe("Optional. The database schema name, defaults to 'public'")
  });

  constructor(
    private makeGqlRequest: MakeGqlRequest,
    private getIntrospectionSchema: () => Promise<IntrospectionSchema>
  ) {
    this.execute = this.execute.bind(this);
  }

  async execute(input: z.infer<typeof this.inputSchema>, _extra: any) {
    const { tableName, schemaName } = input;
    console.log(`[INFO] Executing tool 'describe_table' for table: ${tableName} in schema: ${schemaName}`);

    try {
      const schema = await this.getIntrospectionSchema();

      const tableTypeQuery = gql`
        query GetTableType($typeName: String!) {
          __type(name: $typeName) {
            name
            kind
            description
            fields {
              name
              description
              type {
                kind
                name
                ofType {
                  kind
                  name
                  ofType {
                    kind
                    name
                    ofType {
                      kind
                      name
                    }
                  }
                }
              }
              args {
                name
                description
                type {
                  kind
                  name
                  ofType {
                    kind
                    name
                  }
                }
              }
            }
          }
        }
      `;

      const tableTypeResult = await this.makeGqlRequest(tableTypeQuery, { typeName: tableName });

      if (!tableTypeResult.__type) {
        console.log(`[INFO] No direct match for table type: ${tableName}, trying case variations`);
        const pascalCaseName = tableName.charAt(0).toUpperCase() + tableName.slice(1);
        const alternativeResult = await this.makeGqlRequest(tableTypeQuery, { typeName: pascalCaseName });
        if (!alternativeResult.__type) {
          throw new Error(`Table '${tableName}' not found in schema. Check the table name and schema.`);
        }
        tableTypeResult.__type = alternativeResult.__type;
      }

      const columnsInfo = tableTypeResult.__type.fields.map((field: any) => {
        let typeInfo = field.type;
        let typeString = '';
        let isNonNull = false;
        let isList = false;

        while (typeInfo) {
          if (typeInfo.kind === 'NON_NULL') {
            isNonNull = true;
            typeInfo = typeInfo.ofType;
          } else if (typeInfo.kind === 'LIST') {
            isList = true;
            typeInfo = typeInfo.ofType;
          } else {
            typeString = typeInfo.name || 'unknown';
            break;
          }
        }

        let fullTypeString = '';
        if (isList) {
          fullTypeString = `[${typeString}]`;
        } else {
          fullTypeString = typeString;
        }
        if (isNonNull) {
          fullTypeString += '!';
        }

        return {
          name: field.name,
          type: fullTypeString,
          description: field.description || null,
          args: field.args?.length ? field.args : null
        };
      });

      const result = {
        table: {
          name: tableName,
          schema: schemaName,
          description: tableTypeResult.__type.description || null,
          columns: columnsInfo.sort((a: any, b: any) => a.name.localeCompare(b.name))
        }
      };

      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (error: any) {
      console.error(`[ERROR] Tool 'describe_table' failed: ${error.message}`);
      throw error;
    }
  }
}
