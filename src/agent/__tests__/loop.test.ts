import { runAgent, type AgentTool } from '../loop';
import type { AssistantMessage, CompletionRequest, ModelProvider, StopReason } from '../provider';

/** A provider that answers from a script and keeps every request it received. */
function scriptedProvider(script: ((req: CompletionRequest) => { message: AssistantMessage; stop: StopReason })[]) {
  const requests: CompletionRequest[] = [];
  const provider: ModelProvider = {
    async complete(req) {
      requests.push(structuredClone(req));
      const step = script[requests.length - 1];
      if (!step) throw new Error(`no scripted response for call ${requests.length}`);
      return step(req);
    },
  };
  return { provider, requests };
}

const say = (text: string) => () => ({
  message: { role: 'assistant' as const, content: [{ type: 'text' as const, text }] },
  stop: 'end' as const,
});
const call = (...calls: [id: string, name: string, input: unknown][]) => () => ({
  message: {
    role: 'assistant' as const,
    content: calls.map(([id, name, input]) => ({ type: 'tool_call' as const, id, name, input })),
  },
  stop: 'tool_calls' as const,
});

function tool(name: string, run: AgentTool['run']): AgentTool {
  return { name, description: name, inputSchema: { type: 'object' }, run };
}

const user = (text: string) => [{ role: 'user' as const, content: [{ type: 'text' as const, text }] }];

describe('runAgent', () => {
  it('finishes when the model answers without calling tools', async () => {
    const { provider } = scriptedProvider([say('done')]);

    const r = await runAgent({ provider, system: 's', tools: [], messages: user('hi') });

    expect(r.stop).toBe('done');
    expect(r.messages.at(-1)).toEqual({ role: 'assistant', content: [{ type: 'text', text: 'done' }] });
  });

  it('runs a requested tool and returns its result to the model', async () => {
    const { provider, requests } = scriptedProvider([call(['c1', 'echo', { v: 7 }]), say('ok')]);
    const echo = tool('echo', async (input) => ({ content: JSON.stringify(input) }));

    const r = await runAgent({ provider, system: 's', tools: [echo], messages: user('go') });

    expect(r.stop).toBe('done');
    expect(requests[1].messages.at(-1)).toEqual({
      role: 'user',
      content: [{ type: 'tool_result', callId: 'c1', content: '{"v":7}' }],
    });
  });

  it('answers several calls of one turn in a single message, in call order', async () => {
    const { provider, requests } = scriptedProvider([call(['a', 'echo', 1], ['b', 'echo', 2]), say('ok')]);
    const echo = tool('echo', async (input) => ({ content: String(input) }));

    await runAgent({ provider, system: 's', tools: [echo], messages: user('go') });

    const last = requests[1].messages.at(-1)!;
    expect(last.content.map((b) => (b.type === 'tool_result' ? b.callId : b.type))).toEqual(['a', 'b']);
  });

  it('reports an unknown tool to the model as an error and carries on', async () => {
    const { provider, requests } = scriptedProvider([call(['c1', 'nope', {}]), say('ok')]);

    const r = await runAgent({ provider, system: 's', tools: [], messages: user('go') });

    expect(r.stop).toBe('done');
    expect(requests[1].messages.at(-1)!.content[0]).toMatchObject({ type: 'tool_result', callId: 'c1', isError: true });
  });

  it('turns a throwing tool into an error result carrying the message', async () => {
    const { provider, requests } = scriptedProvider([call(['c1', 'boom', {}]), say('ok')]);
    const boom = tool('boom', async () => {
      throw new Error('disk full');
    });

    await runAgent({ provider, system: 's', tools: [boom], messages: user('go') });

    expect(requests[1].messages.at(-1)!.content[0]).toEqual({
      type: 'tool_result',
      callId: 'c1',
      content: 'disk full',
      isError: true,
    });
  });

  it('stops after the step limit even if the model keeps calling tools', async () => {
    const forever = Array.from({ length: 10 }, (_, i) => call([`c${i}`, 'echo', i]));
    const { provider, requests } = scriptedProvider(forever);
    const echo = tool('echo', async () => ({ content: '' }));

    const r = await runAgent({ provider, system: 's', tools: [echo], messages: user('go'), maxSteps: 3 });

    expect(r.stop).toBe('max_steps');
    expect(requests).toHaveLength(3);
  });

  it('stops on a refusal', async () => {
    const { provider } = scriptedProvider([
      () => ({ message: { role: 'assistant', content: [] }, stop: 'refusal' }),
    ]);

    expect((await runAgent({ provider, system: 's', tools: [], messages: user('go') })).stop).toBe('refusal');
  });

  it('continues a paused turn without inventing a user message', async () => {
    const { provider, requests } = scriptedProvider([
      () => ({ message: { role: 'assistant', content: [{ type: 'text', text: 'part' }] }, stop: 'paused' }),
      say('rest'),
    ]);

    await runAgent({ provider, system: 's', tools: [], messages: user('go') });

    expect(requests[1].messages.at(-1)!.role).toBe('assistant');
  });

  it('offers the tool specifications to the model without their implementations', async () => {
    const { provider, requests } = scriptedProvider([say('ok')]);
    const echo = tool('echo', async () => ({ content: '' }));

    await runAgent({ provider, system: 'sys', tools: [echo], messages: user('go') });

    expect(requests[0].system).toBe('sys');
    expect(requests[0].tools).toEqual([{ name: 'echo', description: 'echo', inputSchema: { type: 'object' } }]);
  });
});
