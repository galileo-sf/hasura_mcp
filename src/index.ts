import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GraphQLClient, ClientError } from 'graphql-request';
import { RunGraphQLQueryTool } from "./tools/RunGraphQLQueryTool.js";
import { RunGraphQLMutationTool } from "./tools/RunGraphQLMutationTool.js";
import { ListTablesTool } from "./tools/ListTablesTool.js";
import { ListRootFieldsTool } from "./tools/ListRootFieldsTool.js";
import { DescribeGraphQLTypeTool } from "./tools/DescribeGraphQLTypeTool.js";
import { PreviewTableDataTool } from "./tools/PreviewTableDataTool.js";
import { AggregateDataTool } from "./tools/AggregateDataTool.js";
import { HealthCheckTool } from "./tools/HealthCheckTool.js";
import { DescribeTableTool } from "./tools/DescribeTableTool.js";
import {
    getIntrospectionQuery,
    IntrospectionQuery,
    IntrospectionSchema,
} from 'graphql';

const SERVER_NAME = "mcp-servers/hasura-advanced";
const SERVER_VERSION = "1.1.0";
const SCHEMA_RESOURCE_URI = "hasura:/schema";
const SCHEMA_RESOURCE_NAME = "Hasura GraphQL Schema (via Introspection)";
const SCHEMA_MIME_TYPE = "application/json";

const server = new McpServer({
  name: SERVER_NAME,
  version: SERVER_VERSION,
  capabilities: {
    resources: {},
    tools: {},
  },
});

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error(`Usage: node ${process.argv[1]} <HASURA_GRAPHQL_ENDPOINT> [ADMIN_SECRET]`);
  process.exit(1);
}
const HASURA_ENDPOINT = args[0];
const ADMIN_SECRET = args[1];

console.log(`[INFO] Targeting Hasura Endpoint: ${HASURA_ENDPOINT}`);
if (ADMIN_SECRET) {
  console.log("[INFO] Using Admin Secret.");
} else {
  console.warn("[WARN] No Admin Secret provided. Ensure Hasura permissions are configured for the default role.");
}

const headers: Record<string, string> = {};
if (ADMIN_SECRET) {
  headers['x-hasura-admin-secret'] = ADMIN_SECRET;
}
const gqlClient = new GraphQLClient(HASURA_ENDPOINT, { headers });

async function makeGqlRequest<
    T = any,
    V extends Record<string, any> = Record<string, any>
>(
  query: string,
  variables?: V,
  requestHeaders?: Record<string, string>
): Promise<T> {
  try {
    const combinedHeaders = { ...headers, ...requestHeaders };
    return await gqlClient.request<T>(query, variables, combinedHeaders);
  } catch (error) {
    if (error instanceof ClientError) {
      const gqlErrors = error.response?.errors?.map(e => e.message).join(', ') || 'Unknown GraphQL error';
      console.error(`[ERROR] GraphQL Request Failed: ${gqlErrors}`, error.response);
      throw new Error(`GraphQL operation failed: ${gqlErrors}`);
    }
    console.error("[ERROR] Unexpected error during GraphQL request:", error);
    throw error;
  }
}

let introspectionSchema: IntrospectionSchema | null = null;

async function getIntrospectionSchema(): Promise<IntrospectionSchema> {
    if (introspectionSchema) {
        return introspectionSchema;
    }
    console.log("[INFO] Fetching GraphQL schema via introspection...");
    const introspectionQuery = getIntrospectionQuery();
    try {
        const result = await makeGqlRequest<IntrospectionQuery>(introspectionQuery);
        if (!result.__schema) {
        throw new Error("Introspection query did not return a __schema object.");
        }
        introspectionSchema = result.__schema;
        console.log("[INFO] Introspection successful, schema cached.");
        return introspectionSchema;
    } catch (error) {
        console.error("[ERROR] Failed to fetch or cache introspection schema:", error);
        introspectionSchema = null;
        throw new Error(`Failed to get GraphQL schema: ${error instanceof Error ? error.message : String(error)}`);
    }
}

server.resource(
  SCHEMA_RESOURCE_NAME,
  SCHEMA_RESOURCE_URI,
  { mimeType: SCHEMA_MIME_TYPE },
  async () => {
    console.log(`[INFO] Handling read request for resource: ${SCHEMA_RESOURCE_URI}`);
    try {
      const schema = await getIntrospectionSchema();
      return {
        contents: [
          {
            uri: SCHEMA_RESOURCE_URI,
            text: JSON.stringify(schema, null, 2),
            mimeType: SCHEMA_MIME_TYPE
          }
        ]
      };
    } catch (error) {
      console.error(`[ERROR] Failed to provide schema resource: ${error}`);
      throw new Error(`Failed to retrieve GraphQL schema: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
);

// Register all tools
const runGraphQLQueryTool = new RunGraphQLQueryTool(makeGqlRequest);
server.tool(
  runGraphQLQueryTool.name,
  runGraphQLQueryTool.description,
  runGraphQLQueryTool.inputSchema.shape,
  runGraphQLQueryTool.execute
);

const runGraphQLMutationTool = new RunGraphQLMutationTool(makeGqlRequest);
server.tool(
  runGraphQLMutationTool.name,
  runGraphQLMutationTool.description,
  runGraphQLMutationTool.inputSchema.shape,
  runGraphQLMutationTool.execute
);

const listTablesTool = new ListTablesTool(makeGqlRequest, getIntrospectionSchema);
server.tool(
  listTablesTool.name,
  listTablesTool.description,
  listTablesTool.inputSchema.shape,
  listTablesTool.execute
);

const listRootFieldsTool = new ListRootFieldsTool(getIntrospectionSchema);
server.tool(
  listRootFieldsTool.name,
  listRootFieldsTool.description,
  listRootFieldsTool.inputSchema.shape,
  listRootFieldsTool.execute
);

const describeGraphQLTypeTool = new DescribeGraphQLTypeTool(getIntrospectionSchema);
server.tool(
  describeGraphQLTypeTool.name,
  describeGraphQLTypeTool.description,
  describeGraphQLTypeTool.inputSchema.shape,
  describeGraphQLTypeTool.execute
);

const previewTableDataTool = new PreviewTableDataTool(makeGqlRequest, getIntrospectionSchema);
server.tool(
  previewTableDataTool.name,
  previewTableDataTool.description,
  previewTableDataTool.inputSchema.shape,
  previewTableDataTool.execute
);

const aggregateDataTool = new AggregateDataTool(makeGqlRequest);
server.tool(
  aggregateDataTool.name,
  aggregateDataTool.description,
  aggregateDataTool.inputSchema.shape,
  aggregateDataTool.execute
);

const healthCheckTool = new HealthCheckTool(makeGqlRequest, HASURA_ENDPOINT);
server.tool(
  healthCheckTool.name,
  healthCheckTool.description,
  healthCheckTool.inputSchema.shape,
  healthCheckTool.execute
);

const describeTableTool = new DescribeTableTool(makeGqlRequest, getIntrospectionSchema);
server.tool(
  describeTableTool.name,
  describeTableTool.description,
  describeTableTool.inputSchema.shape,
  describeTableTool.execute
);

async function main() {
  console.log(`[INFO] Starting ${SERVER_NAME} v${SERVER_VERSION}...`);
  try {
    await getIntrospectionSchema();
  } catch (error) {
    console.warn(`[WARN] Initial schema fetch failed...: ${error}`);
  }

  const transport = new StdioServerTransport();
  console.log("[INFO] Connecting server to STDIO transport...");
  await server.connect(transport);
  console.error(`[INFO] ${SERVER_NAME} v${SERVER_VERSION} connected and running via STDIO.`);
}

main().catch((error) => {
  console.error("[FATAL] Server failed to start or crashed:", error);
  process.exit(1);
});