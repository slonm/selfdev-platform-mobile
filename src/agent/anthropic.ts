import type Anthropic from '@anthropic-ai/sdk';

import type { AgentMessage, AssistantMessage, ModelProvider, StopReason } from './provider';

/**
 * The part of an Anthropic SDK client the provider uses. Both `new Anthropic({ apiKey })` and
 * `new AnthropicFoundry({ apiKey, resource })` (Claude in Microsoft Foundry) satisfy it, so the
 * caller picks the service and this adapter stays the same.
 */
export type MessagesClient = {
  messages: { create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> };
};

const DEFAULT_MAX_TOKENS = 16000;

const STOP: Record<Anthropic.StopReason, StopReason> = {
  end_turn: 'end',
  stop_sequence: 'end',
  tool_use: 'tool_calls',
  pause_turn: 'paused',
  max_tokens: 'max_tokens',
  model_context_window_exceeded: 'max_tokens',
  refusal: 'refusal',
};

/**
 * `ModelProvider` over the Claude Messages API (non-streaming: React Native's fetch cannot stream).
 *
 * Thinking is left at the model's default. An assistant turn produced by this adapter keeps the
 * API's own content in `raw` and is resent verbatim, so thinking blocks survive tool-use turns as
 * the API requires. The request asks for automatic prompt caching of the stable prefix.
 */
export function createAnthropicProvider(opts: {
  client: MessagesClient;
  model: string;
  maxTokens?: number;
}): ModelProvider {
  return {
    async complete(req) {
      const response = await opts.client.messages.create({
        model: opts.model,
        max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
        cache_control: { type: 'ephemeral' },
        system: req.system,
        tools: req.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
        })),
        messages: req.messages.map(toApiMessage),
      });
      const message: AssistantMessage = {
        role: 'assistant',
        content: response.content.flatMap((b): AssistantMessage['content'] => {
          if (b.type === 'text') return [{ type: 'text', text: b.text }];
          if (b.type === 'tool_use') return [{ type: 'tool_call', id: b.id, name: b.name, input: b.input }];
          return [];
        }),
        raw: response.content,
      };
      return { message, stop: (response.stop_reason && STOP[response.stop_reason]) || 'end' };
    },
  };
}

function toApiMessage(m: AgentMessage): Anthropic.MessageParam {
  if (m.role === 'assistant') {
    if (m.raw !== undefined) return { role: 'assistant', content: m.raw as Anthropic.ContentBlockParam[] };
    return {
      role: 'assistant',
      content: m.content.map((b) =>
        b.type === 'text'
          ? { type: 'text' as const, text: b.text }
          : { type: 'tool_use' as const, id: b.id, name: b.name, input: b.input }
      ),
    };
  }
  return {
    role: 'user',
    content: m.content.map((b) =>
      b.type === 'text'
        ? { type: 'text' as const, text: b.text }
        : { type: 'tool_result' as const, tool_use_id: b.callId, content: b.content, ...(b.isError ? { is_error: true } : {}) }
    ),
  };
}
