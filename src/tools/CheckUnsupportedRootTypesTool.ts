import { z } from "zod";
import { IServerTool } from "../types/IServerTool.js";
import { IntrospectionSchema } from 'graphql';

export class CheckUnsupportedRootTypesTool implements IServerTool {
  name = "check_unsupported_root_types";
  description = `
Checks the GraphQL schema for non-standard or custom root types that may not be supported.

Parameters:
  - None

Returns:
  - hasUnsupportedTypes: Boolean indicating if custom root types were detected
  - standardTypes: Object showing the standard Query/Mutation/Subscription type names
  - unsupportedTypes: Array of detected custom root type names (empty if none found)
  - recommendation: Guidance message on handling custom types

Note: Standard GraphQL schemas use Query, Mutation, and Subscription as root types.
This tool detects potential custom root types that may require special handling or indicate
schema configuration issues. Custom root types are identified by ending with "_root" suffix
but not being assigned as standard query/mutation/subscription types.
  `.trim();
  inputSchema = z.object({});

  constructor(private getIntrospectionSchema: () => Promise<IntrospectionSchema>) {
    this.execute = this.execute.bind(this);
  }

  async execute(input: z.infer<typeof this.inputSchema>, _extra: any) {
    console.log(`[INFO] Executing tool 'check_unsupported_root_types'`);

    try {
      const schema = await this.getIntrospectionSchema();
      const supportedTypes = new Set<string>();
      const unsupportedTypes: Array<{ name: string; fieldCount: number }> = [];

      // Collect standard root type names
      const standardTypes: { query?: string; mutation?: string; subscription?: string } = {};

      if (schema.queryType) {
        standardTypes.query = schema.queryType.name;
        supportedTypes.add(schema.queryType.name);
      }
      if (schema.mutationType) {
        standardTypes.mutation = schema.mutationType.name;
        supportedTypes.add(schema.mutationType.name);
      }
      if (schema.subscriptionType) {
        standardTypes.subscription = schema.subscriptionType.name;
        supportedTypes.add(schema.subscriptionType.name);
      }

      // Check for other root types that might not be standard
      // Only flag types ending with _root that aren't registered as standard root types
      const rootTypeNames = [schema.queryType?.name, schema.mutationType?.name, schema.subscriptionType?.name].filter(Boolean);
      const allRootTypes = schema.types.filter(t =>
        t.kind === 'OBJECT' &&
        t.name.endsWith('_root') &&
        !rootTypeNames.includes(t.name) &&
        !t.name.startsWith('__')
      );

      if (allRootTypes.length > 0) {
        allRootTypes.forEach(t => {
          if (!supportedTypes.has(t.name) && t.kind === 'OBJECT') {
            unsupportedTypes.push({
              name: t.name,
              fieldCount: 'fields' in t ? t.fields.length : 0
            });
          }
        });
      }

      const hasUnsupportedTypes = unsupportedTypes.length > 0;

      const result = {
        hasUnsupportedTypes,
        standardTypes,
        unsupportedTypes,
        recommendation: hasUnsupportedTypes
          ? `Found ${unsupportedTypes.length} custom root type(s). These types may indicate: 1) Custom schema configuration requiring special handling, 2) Federation or stitching setup with custom root types, or 3) Schema design patterns not following GraphQL conventions. Review these types to determine if they need to be queried through special endpoints or if the schema configuration needs adjustment.`
          : "No custom root types detected. Schema follows standard GraphQL conventions with standard Query/Mutation/Subscription types."
      };

      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (error: any) {
      console.error(`[ERROR] Tool 'check_unsupported_root_types' failed: ${error.message}`);
      throw error;
    }
  }
}
