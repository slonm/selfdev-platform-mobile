import type Anthropic from '@anthropic-ai/sdk';

import { createAnthropicProvider, type MessagesClient } from '../anthropic';
import type { CompletionRequest } from '../provider';

function message(content: unknown[], stop_reason: Anthropic.StopReason): Anthropic.Message {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5-5',
    content,
    stop_reason,
    stop_sequence: null,
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      server_tool_use: null,
      service_tier: 'standard',
    },
  } as unknown as Anthropic.Message;
}

function fakeClient(response: Anthropic.Message) {
  const sent: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const client: MessagesClient = {
    messages: {
      async create(params) {
        sent.push(params);
        return response;
      },
    },
  };
  return { client, sent };
}

const assistantRaw = [
  { type: 'thinking', thinking: '', signature: 'sig' },
  { type: 'tool_use', id: 'tu_1', name: 'read_layer', input: {} },
];

const request: CompletionRequest = {
  system: 'You edit layers.',
  tools: [{ name: 'read_layer', description: 'read', inputSchema: { type: 'object', properties: {} } }],
  messages: [
    { role: 'user', content: [{ type: 'text', text: 'add a field' }] },
    {
      role: 'assistant',
      content: [{ type: 'tool_call', id: 'tu_1', name: 'read_layer', input: {} }],
      raw: assistantRaw,
    },
    { role: 'user', content: [{ type: 'tool_result', callId: 'tu_1', content: 'bad', isError: true }] },
  ],
};

describe('Anthropic provider', () => {
  it('sends model, system, tools and messages in the Messages API shape', async () => {
    const { client, sent } = fakeClient(message([{ type: 'text', text: 'ok', citations: null }], 'end_turn'));

    await createAnthropicProvider({ client, model: 'claude-sonnet-5-5' }).complete(request);

    expect(sent[0]).toMatchObject({
      model: 'claude-sonnet-5-5',
      system: 'You edit layers.',
      tools: [{ name: 'read_layer', description: 'read', input_schema: { type: 'object', properties: {} } }],
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'add a field' }] },
        { role: 'assistant', content: assistantRaw },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: 'bad', is_error: true }] },
      ],
    });
    expect(sent[0]!.max_tokens).toBeGreaterThan(0);
  });

  it('caches the stable prefix of the conversation', async () => {
    const { client, sent } = fakeClient(message([], 'end_turn'));

    await createAnthropicProvider({ client, model: 'm' }).complete(request);

    expect(sent[0]!.cache_control).toEqual({ type: 'ephemeral' });
  });

  it('builds assistant content from neutral blocks when no raw form was kept', async () => {
    const { client, sent } = fakeClient(message([], 'end_turn'));

    await createAnthropicProvider({ client, model: 'm' }).complete({
      system: '',
      tools: [],
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'hi' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'a' }, { type: 'tool_call', id: 't', name: 'x', input: { k: 1 } }] },
      ],
    });

    expect(sent[0]!.messages[1]!.content).toEqual([
      { type: 'text', text: 'a' },
      { type: 'tool_use', id: 't', name: 'x', input: { k: 1 } },
    ]);
  });

  it('maps the reply to neutral blocks and keeps the raw content for the next request', async () => {
    const content = [
      { type: 'thinking', thinking: '', signature: 's' },
      { type: 'text', text: 'Reading.', citations: null },
      { type: 'tool_use', id: 'tu_9', name: 'read_layer', input: {} },
    ];
    const { client } = fakeClient(message(content, 'tool_use'));

    const r = await createAnthropicProvider({ client, model: 'm' }).complete(request);

    expect(r.stop).toBe('tool_calls');
    expect(r.message.content).toEqual([
      { type: 'text', text: 'Reading.' },
      { type: 'tool_call', id: 'tu_9', name: 'read_layer', input: {} },
    ]);
    expect(r.message.raw).toEqual(content);
  });

  it.each([
    ['end_turn', 'end'],
    ['stop_sequence', 'end'],
    ['tool_use', 'tool_calls'],
    ['pause_turn', 'paused'],
    ['max_tokens', 'max_tokens'],
    ['model_context_window_exceeded', 'max_tokens'],
    ['refusal', 'refusal'],
  ] as const)('maps stop reason %s to %s', async (apiStop, stop) => {
    const { client } = fakeClient(message([], apiStop));

    expect((await createAnthropicProvider({ client, model: 'm' }).complete(request)).stop).toBe(stop);
  });
});
