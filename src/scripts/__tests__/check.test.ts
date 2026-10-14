import { checkScripts } from '../check';

const layerWith = (source: string, expect: unknown) =>
  ({
    scripts: { avg: { source, tests: [{ name: 'one', input: { n: 2 }, expect }] } },
  }) as any;

describe('checkScripts', () => {
  it('passes when every test reproduces its expected output', () => {
    expect(checkScripts(layerWith('function main(i) { return { d: i.n * 2 }; }', { d: 4 }))).toEqual([]);
  });

  it('reports a wrong result at the test, with what the script returned', () => {
    const errors = checkScripts(layerWith('function main(i) { return { d: i.n * 3 }; }', { d: 4 }));

    expect(errors).toEqual([{ path: ['scripts', 'avg', 'tests', 0], message: expect.stringContaining('{"d":6}') }]);
  });

  it('reports a script failure at the test', () => {
    const errors = checkScripts(layerWith('function main() { throw new Error("nope"); }', 1));

    expect(errors).toEqual([{ path: ['scripts', 'avg', 'tests', 0], message: expect.stringContaining('nope') }]);
  });

  it('compares object results regardless of key order', () => {
    expect(checkScripts(layerWith('function main() { return { b: 2, a: 1 }; }', { a: 1, b: 2 }))).toEqual([]);
  });

  it('has nothing to check in a layer without scripts', () => {
    expect(checkScripts({} as any)).toEqual([]);
  });
});
