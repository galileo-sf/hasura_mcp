import { z } from "zod";
import { IServerTool } from "../types/IServerTool.js";
import {
  IntrospectionSchema,
  IntrospectionObjectType,
  IntrospectionInterfaceType,
  IntrospectionInputObjectType,
  IntrospectionEnumType,
  IntrospectionUnionType,
  IntrospectionField,
  IntrospectionInputValue
} from 'graphql';

export class DescribeGraphQLTypeTool implements IServerTool {
  name = "describe_graphql_type";
  description = `
Provides detailed information about a specific GraphQL type from the schema.

Parameters:
  - typeName: The exact, case-sensitive name of the GraphQL type

Returns:
  - kind: Type kind (OBJECT, INPUT_OBJECT, SCALAR, ENUM, INTERFACE, UNION)
  - name: Type name
  - description: Type description (if available)
  - fields: Array of fields with names, types, and arguments (for OBJECT/INTERFACE)
  - inputFields: Array of input fields (for INPUT_OBJECT)
  - enumValues: Array of enum values (for ENUM)
  - possibleTypes: Array of possible type names (for UNION/INTERFACE)

Supported type kinds: Object, Input Object, Scalar, Enum, Interface, Union
  `.trim();
  inputSchema = z.object({
    typeName: z.string().describe("The exact, case-sensitive name of the GraphQL type..."),
  });

  constructor(private getIntrospectionSchema: () => Promise<IntrospectionSchema>) {
    this.execute = this.execute.bind(this);
  }

  async execute(input: z.infer<typeof this.inputSchema>, _extra: any) {
    const { typeName } = input;
    console.log(`[INFO] Executing tool 'describe_graphql_type' for type: ${typeName}`);

    try {
      const schema = await this.getIntrospectionSchema();
      const typeInfo = schema.types.find(t => t.name === typeName);
      if (!typeInfo) {
        throw new Error(`Type '${typeName}' not found in the schema.`);
      }

      const formattedInfo = {
        kind: typeInfo.kind,
        name: typeInfo.name,
        description: typeInfo.description || null,
        ...(typeInfo.kind === 'OBJECT' || typeInfo.kind === 'INTERFACE' ? {
          fields: (typeInfo as IntrospectionObjectType | IntrospectionInterfaceType).fields?.map((f: IntrospectionField) => ({
            name: f.name,
            description: f.description || null,
            type: JSON.stringify(f.type),
            args: f.args?.map((a: IntrospectionInputValue) => ({ name: a.name, type: JSON.stringify(a.type) })) || []
          })) || []
        } : {}),
        ...(typeInfo.kind === 'INPUT_OBJECT' ? {
          inputFields: (typeInfo as IntrospectionInputObjectType).inputFields?.map((f: IntrospectionInputValue) => ({
            name: f.name,
            description: f.description || null,
            type: JSON.stringify(f.type),
          })) || []
        } : {}),
        ...(typeInfo.kind === 'ENUM' ? {
          enumValues: (typeInfo as IntrospectionEnumType).enumValues?.map(ev => ({ name: ev.name, description: ev.description || null })) || []
        } : {}),
        ...(typeInfo.kind === 'UNION' || typeInfo.kind === 'INTERFACE' ? {
          possibleTypes: (typeInfo as IntrospectionUnionType | IntrospectionInterfaceType).possibleTypes?.map(pt => pt.name) || []
        } : {}),
      };

      return { content: [{ type: "text" as const, text: JSON.stringify(formattedInfo, null, 2) }] };
    } catch (error: any) {
      console.error(`[ERROR] Tool 'describe_graphql_type' failed: ${error.message}`);
      throw error;
    }
  }
}
