import {
  accept,
  createHistory,
  discard,
  launchStarted,
  launchSucceeded,
  propose,
  rendered,
  undo,
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

  it('enters safe mode on the last version that launched, after two launches that never finished', () => {
    let h = createHistory('v1');
    h = launchSucceeded(launchStarted(h)); // v1 is known to work
    h = accept(propose(h, 'v2'));
    h = launchStarted(h); // crash
    h = launchStarted(h); // crash again

    expect(h.safeMode).toBe(true);
    expect(rendered(h)).toBe('v1');
  });

  it('tolerates a single unfinished launch', () => {
    let h = launchSucceeded(launchStarted(createHistory('v1')));
    h = launchStarted(accept(propose(h, 'v2')));

    expect(h.safeMode).toBe(false);
    expect(rendered(h)).toBe('v2');
  });

  it('applies the crash rule to a preview too', () => {
    let h = launchSucceeded(launchStarted(createHistory('v1')));
    h = launchStarted(launchStarted(propose(h, 'v2')));

    expect(rendered(h)).toBe('v1');
  });

  it('leaves safe mode once a change is accepted after it', () => {
    let h = launchSucceeded(launchStarted(createHistory('v1')));
    h = launchStarted(launchStarted(accept(propose(h, 'v2'))));
    h = accept(propose(h, 'v3'));

    expect(h.safeMode).toBe(false);
    expect(rendered(h)).toBe('v3');
  });
});
