import type { AgentMessage, ModelProvider, ToolResult, ToolSpec } from './provider';

/** A tool the agent may call: its spec for the model plus the implementation. */
export type AgentTool = ToolSpec & { run(input: unknown): Promise<{ content: string; isError?: boolean }> };

/** `done` the model finished; the rest mirror provider stop reasons or the step limit. */
export type AgentStop = 'done' | 'max_steps' | 'max_tokens' | 'refusal';

const DEFAULT_MAX_STEPS = 20;

/**
 * Runs the tool-use loop: ask the model, execute the tools it calls, feed results back, repeat
 * until it answers without tools, refuses, is cut off, or `maxSteps` model calls have been made.
 *
 * Tool failures never escape: an unknown tool or a thrown error becomes an error result the model
 * can react to. All results of one turn go back in a single user message, in call order.
 * Returns the full conversation including the input messages.
 */
export async function runAgent(opts: {
  provider: ModelProvider;
  system: string;
  tools: AgentTool[];
  messages: AgentMessage[];
  maxSteps?: number;
}): Promise<{ messages: AgentMessage[]; stop: AgentStop }> {
  const messages = [...opts.messages];
  const specs: ToolSpec[] = opts.tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
  const byName = new Map(opts.tools.map((t) => [t.name, t]));

  for (let step = 0; step < (opts.maxSteps ?? DEFAULT_MAX_STEPS); step++) {
    const { message, stop } = await opts.provider.complete({ system: opts.system, messages, tools: specs });
    messages.push(message);
    const calls = message.content.filter((b) => b.type === 'tool_call');
    if (stop === 'paused') continue;
    if (stop === 'refusal' || stop === 'max_tokens') {
      // Every tool call needs a result before the conversation can be continued later.
      if (calls.length) {
        messages.push({
          role: 'user',
          content: calls.map((c) => ({
            type: 'tool_result' as const,
            callId: c.id,
            content: `not run: the response ended (${stop})`,
            isError: true,
          })),
        });
      }
      return { messages, stop };
    }
    if (stop === 'end' || calls.length === 0) return { messages, stop: 'done' };

    const results: ToolResult[] = [];
    for (const call of calls) {
      results.push({ type: 'tool_result', callId: call.id, ...(await execute(byName.get(call.name), call)) });
    }
    messages.push({ role: 'user', content: results });
  }
  return { messages, stop: 'max_steps' };
}

async function execute(
  tool: AgentTool | undefined,
  call: { name: string; input: unknown }
): Promise<{ content: string; isError?: boolean }> {
  if (!tool) return { content: `unknown tool "${call.name}"`, isError: true };
  try {
    return await tool.run(call.input);
  } catch (e) {
    return { content: e instanceof Error ? e.message : String(e), isError: true };
  }
}
