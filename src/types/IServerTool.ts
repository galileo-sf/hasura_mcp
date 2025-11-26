import { z } from "zod";
import { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";

export type MakeGqlRequest = <T = any, V extends Record<string, any> = Record<string, any>>(
  query: string,
  variables?: V,
  requestHeaders?: Record<string, string>
) => Promise<T>;

export interface IServerTool<T extends z.ZodRawShape = any> {
  name: string;
  description: string;
  inputSchema: z.ZodObject<T>;
  execute(
    input: z.infer<z.ZodObject<T>>,
    extra: RequestHandlerExtra
  ): Promise<{
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
  }>;
}
