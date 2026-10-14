/**
 * Provider-neutral conversation model for the on-device agent. Adapters translate it to a concrete
 * API (Anthropic SDK incl. Microsoft Foundry, OpenAI-compatible, the platform proxy).
 */

export type TextBlock = { type: 'text'; text: string };
export type ToolCall = { type: 'tool_call'; id: string; name: string; input: unknown };
export type ToolResult = { type: 'tool_result'; callId: string; content: string; isError?: boolean };

export type UserMessage = { role: 'user'; content: (TextBlock | ToolResult)[] };
export type AssistantMessage = {
  role: 'assistant';
  content: (TextBlock | ToolCall)[];
  /**
   * The provider's own representation of this turn (e.g. including thinking blocks), resent
   * verbatim by the same adapter on the next request. Opaque to everything else.
   */
  raw?: unknown;
};
export type AgentMessage = UserMessage | AssistantMessage;

/** A tool as the model sees it: name, purpose and a JSON Schema for its input. */
export type ToolSpec = { name: string; description: string; inputSchema: Record<string, unknown> };

/**
 * Why a completion ended: `end` the model is done; `tool_calls` it wants tool results; `paused` the
 * provider stopped a long turn that should be resent to continue; `max_tokens` output was cut off;
 * `refusal` the provider declined.
 */
export type StopReason = 'end' | 'tool_calls' | 'paused' | 'max_tokens' | 'refusal';

export type CompletionRequest = { system: string; messages: AgentMessage[]; tools: ToolSpec[] };

export interface ModelProvider {
  complete(req: CompletionRequest): Promise<{ message: AssistantMessage; stop: StopReason }>;
}
