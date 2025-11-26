import { z } from "zod";
import { gql } from 'graphql-request';
import { IServerTool, MakeGqlRequest } from "../types/IServerTool.js";

export class HealthCheckTool implements IServerTool {
  name = "health_check";
  description = `
Checks if the configured Hasura GraphQL endpoint is reachable and responsive.

Parameters:
  - healthEndpointUrl: A specific HTTP health check URL to test (optional)

Returns:
  - Success message with endpoint status and response details
  - Error message if the health check fails (with isError: false to avoid throwing)

Note: If no healthEndpointUrl is provided, performs a simple GraphQL introspection
query (__typename) against the configured Hasura endpoint to verify connectivity.
  `.trim();
  inputSchema = z.object({
    healthEndpointUrl: z.string().url().optional().describe("Optional. A specific HTTP health check URL...")
  });

  constructor(
    private makeGqlRequest: MakeGqlRequest,
    private hasuraEndpoint: string
  ) {
    this.execute = this.execute.bind(this);
  }

  async execute(input: z.infer<typeof this.inputSchema>, _extra: any) {
    const { healthEndpointUrl } = input;
    console.log(`[INFO] Executing tool 'health_check'...`);

    try {
      let resultText = "";
      if (healthEndpointUrl) {
        console.log(`[DEBUG] Performing HTTP GET to: ${healthEndpointUrl}`);
        const response = await fetch(healthEndpointUrl, { method: 'GET' });
        resultText = `Health endpoint ${healthEndpointUrl} status: ${response.status} ${response.statusText}`;
        if (!response.ok) throw new Error(resultText);
      } else {
        console.log(`[DEBUG] Performing GraphQL query { __typename } to: ${this.hasuraEndpoint}`);
        const query = gql`query HealthCheck { __typename }`;
        const result = await this.makeGqlRequest(query);
        resultText = `GraphQL endpoint ${this.hasuraEndpoint} is responsive. Result: ${JSON.stringify(result)}`;
      }
      return { content: [{ type: "text" as const, text: `Health check successful. ${resultText}` }] };
    } catch (error: any) {
      console.error(`[ERROR] Tool 'health_check' failed: ${error.message}`);
      return { content: [{ type: "text" as const, text: `Health check failed: ${error.message}` }], isError: false };
    }
  }
}
