import { runScript } from '../sandbox';

describe('runScript', () => {
  it('calls main with the input and returns its result', () => {
    expect(runScript('function main(input) { return input.a + 1; }', { a: 1 })).toEqual({ ok: true, value: 2 });
  });

  it('returns arrays and objects as plain data', () => {
    const r = runScript('function main(input) { return [{ x: input.n }, { y: [1, 2] }]; }', { n: 5 });

    expect(r).toEqual({ ok: true, value: [{ x: 5 }, { y: [1, 2] }] });
  });

  it('cannot change the caller input', () => {
    const input = { list: [1] };

    runScript('function main(input) { input.list.push(2); return 0; }', input);

    expect(input).toEqual({ list: [1] });
  });

  it('stops a script that runs too long', () => {
    expect(runScript('function main() { while (true) {} }', {}, { maxSteps: 10_000 })).toEqual({
      ok: false,
      error: 'timeout',
      message: expect.any(String),
    });
  });

  it('reports an exception thrown by the script', () => {
    const r = runScript('function main() { throw new Error("bad input"); }', {});

    expect(r).toEqual({ ok: false, error: 'error', message: expect.stringContaining('bad input') });
  });

  it('reports a syntax error', () => {
    expect(runScript('function main( {', {})).toMatchObject({ ok: false, error: 'error' });
  });

  it('reports a script without main', () => {
    expect(runScript('var x = 1;', {})).toMatchObject({ ok: false, error: 'error' });
  });

  it('exposes nothing of the host: no network, modules or process', () => {
    const r = runScript(
      'function main() { return [typeof fetch, typeof require, typeof process, typeof XMLHttpRequest].join(","); }',
      {}
    );

    expect(r).toEqual({ ok: true, value: 'undefined,undefined,undefined,undefined' });
  });
});
