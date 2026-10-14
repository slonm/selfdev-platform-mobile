import {
  accept,
  createHistory,
  discard,
  launchStarted,
  launchSucceeded,
  propose,
  rendered,
  undo,
  type History,
} from '../history';

describe('user-layer history', () => {
  it('renders the initial content', () => {
    expect(rendered(createHistory('v1'))).toBe('v1');
  });

  it('renders a proposal as a preview without activating it', () => {
    const h = propose(createHistory('v1'), 'v2');

    expect(rendered(h)).toBe('v2');
    expect(rendered(discard(h))).toBe('v1');
  });

  it('keeps an accepted proposal after the preview ends', () => {
    const h = discard(accept(propose(createHistory('v1'), 'v2')));

    expect(rendered(h)).toBe('v2');
  });

  it('ignores accept when nothing is proposed', () => {
    const h = createHistory('v1');

    expect(accept(h)).toBe(h);
  });

  it('undoes accepted changes one at a time back to the start', () => {
    let h = createHistory('v1');
    h = accept(propose(h, 'v2'));
    h = accept(propose(h, 'v3'));

    h = undo(h);
    expect(rendered(h)).toBe('v2');
    h = undo(h);
    expect(rendered(h)).toBe('v1');
    expect(rendered(undo(h))).toBe('v1');
  });

  it('drops a pending preview on undo', () => {
    let h = accept(propose(createHistory('v1'), 'v2'));
    h = undo(propose(h, 'v3'));

    expect(rendered(h)).toBe('v1');
  });

  /** Simulates n app launches that start rendering and crash before finishing. */
  function crash<T>(h: History<T>, n: number): History<T> {
    for (let i = 0; i < n; i++) h = launchStarted(h);
    // the launch after the last crash starts too
    return launchStarted(h);
  }

  it('enters safe mode on the last good version after two crashed launches', () => {
    let h = createHistory('v1');
    h = launchSucceeded(launchStarted(h)); // v1 is known to work
    h = crash(accept(propose(h, 'v2')), 2);

    expect(h.safeMode).toBe(true);
    expect(rendered(h)).toBe('v1');
  });

  it('tolerates a single crashed launch', () => {
    let h = launchSucceeded(launchStarted(createHistory('v1')));
    h = crash(accept(propose(h, 'v2')), 1);

    expect(h.safeMode).toBe(false);
    expect(rendered(h)).toBe('v2');
  });

  it('applies the crash rule to a preview too', () => {
    let h = launchSucceeded(launchStarted(createHistory('v1')));
    h = crash(propose(h, 'v2'), 2);

    expect(rendered(h)).toBe('v1');
  });

  it('never falls back to a preview the user did not accept, even one that launched', () => {
    let h = launchSucceeded(launchStarted(createHistory('v1')));
    h = launchSucceeded(launchStarted(propose(h, 'agent draft')));
    h = accept(propose(discard(h), 'v2'));
    h = crash(h, 2);

    expect(rendered(h)).toBe('v1');
  });

  it('leaves safe mode once a change is accepted after it', () => {
    let h = launchSucceeded(launchStarted(createHistory('v1')));
    h = crash(accept(propose(h, 'v2')), 2);
    h = accept(propose(h, 'v3'));

    expect(h.safeMode).toBe(false);
    expect(rendered(h)).toBe('v3');
  });
});
