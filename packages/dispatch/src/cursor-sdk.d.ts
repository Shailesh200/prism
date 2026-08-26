declare module "@cursor/sdk" {
  export const Agent: {
    create(options: Record<string, unknown>): Promise<{
      agentId: string;
      send(prompt: string): Promise<{
        id?: string;
        cancel?: () => Promise<void>;
        supports?: (name: string) => boolean;
      }>;
    }>;
    resume(
      agentId: string,
      options: Record<string, unknown>,
    ): Promise<{
      send(prompt: string): Promise<{
        cancel?: () => Promise<void>;
        supports?: (name: string) => boolean;
      }>;
    }>;
    listRuns?(
      agentId: string,
      options?: Record<string, unknown>,
    ): Promise<
      { items?: { status?: string; id?: string }[] } | { status?: string }[]
    >;
  };
}
