import { z } from "zod";
import { IServerTool } from "../types/IServerTool.js";
import { IntrospectionSchema, IntrospectionField, IntrospectionObjectType } from 'graphql';

export class ListRootFieldsTool implements IServerTool {
  name = "list_root_fields";
  description = `
Lists the available top-level query, mutation, or subscription fields from the GraphQL schema.

Parameters:
  - fieldType: Filter by QUERY, MUTATION, or SUBSCRIPTION (optional)
  - filter: Case-insensitive text search on field names/descriptions (optional)
  - limit: Maximum number of fields to return (default: 10)
  - offset: Number of fields to skip for pagination (default: 0)

Returns:
  - fields: Array of field objects with name and description
  - totalCount: Total fields before filtering
  - filteredCount: Fields after filter, before pagination
  - returnedCount: Actual number of fields returned
  - offset: Current offset value
  - limit: Current limit value
  - warning: Alert if custom root types are detected (optional)
  - unsupportedTypes: Array of custom root type names (optional)

Note: Detects and reports potential custom root types that are not standard
Query/Mutation/Subscription types, which may require additional support.
  `.trim();
  inputSchema = z.object({
    fieldType: z.enum(["QUERY", "MUTATION", "SUBSCRIPTION"]).optional().describe("Optional. Filter by field type: QUERY, MUTATION, or SUBSCRIPTION."),
    filter: z.string().optional().describe("Optional. Case-insensitive search filter for field names and descriptions."),
    limit: z.number().int().positive().optional().default(10).describe("Optional. Maximum number of fields to return. Default: 10."),
    offset: z.number().int().min(0).optional().default(0).describe("Optional. Number of fields to skip for pagination. Default: 0.")
  });

  constructor(private getIntrospectionSchema: () => Promise<IntrospectionSchema>) {
    this.execute = this.execute.bind(this);
  }

  async execute(input: z.infer<typeof this.inputSchema>, _extra: any) {
    const { fieldType, filter, limit = 10, offset = 0 } = input;
    console.log(`[INFO] Executing tool 'list_root_fields', filtering by: ${fieldType || 'ALL'}, filter: ${filter || 'NONE'}, limit: ${limit}, offset: ${offset}`);

    try {
      const schema = await this.getIntrospectionSchema();
      let fields: IntrospectionField[] = [];
      const supportedTypes = new Set<string>();
      const unsupportedTypes: string[] = [];

      if ((!fieldType || fieldType === "QUERY") && schema.queryType) {
        supportedTypes.add(schema.queryType.name);
        const queryRoot = schema.types.find(t => t.name === schema.queryType?.name) as IntrospectionObjectType | undefined;
        fields = fields.concat(queryRoot?.fields || []);
      }
      if ((!fieldType || fieldType === "MUTATION") && schema.mutationType) {
        supportedTypes.add(schema.mutationType.name);
        const mutationRoot = schema.types.find(t => t.name === schema.mutationType?.name) as IntrospectionObjectType | undefined;
        fields = fields.concat(mutationRoot?.fields || []);
      }
      if ((!fieldType || fieldType === "SUBSCRIPTION") && schema.subscriptionType) {
        supportedTypes.add(schema.subscriptionType.name);
        const subscriptionRoot = schema.types.find(t => t.name === schema.subscriptionType?.name) as IntrospectionObjectType | undefined;
        fields = fields.concat(subscriptionRoot?.fields || []);
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
          if (!supportedTypes.has(t.name)) {
            unsupportedTypes.push(t.name);
          }
        });
      }

      let fieldInfo = fields.map(f => ({
        name: f.name,
        description: f.description || "No description.",
      }));

      const totalCount = fieldInfo.length;

      // Apply filter if provided
      if (filter) {
        const filterLower = filter.toLowerCase();
        fieldInfo = fieldInfo.filter(f =>
          f.name.toLowerCase().includes(filterLower) ||
          f.description.toLowerCase().includes(filterLower)
        );
      }

      // Sort fields
      fieldInfo = fieldInfo.sort((a, b) => a.name.localeCompare(b.name));

      const filteredCount = fieldInfo.length;

      // Apply offset and limit for pagination
      fieldInfo = fieldInfo.slice(offset, offset + limit);

      const result = {
        fields: fieldInfo,
        totalCount,
        filteredCount,
        returnedCount: fieldInfo.length,
        offset,
        limit,
        ...(unsupportedTypes.length > 0 && {
          warning: `Found ${unsupportedTypes.length} potential custom root type(s) that are not standard Query/Mutation/Subscription types: ${unsupportedTypes.join(', ')}. These may require additional support to be queried.`,
          unsupportedTypes
        })
      };

      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (error: any) {
      console.error(`[ERROR] Tool 'list_root_fields' failed: ${error.message}`);
      throw error;
    }
  }
}
