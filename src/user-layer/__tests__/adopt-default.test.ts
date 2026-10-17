import { sampleLayer } from '../../__fixtures__/sample-layer';
import { adoptDefaultLayer } from '../adopt-default';
import type { UserLayer } from '../document';
import { accept, createHistory, propose, rendered } from '../history';

const oldDefault = sampleLayer;
const newDefault: UserLayer = { ...sampleLayer, tabs: [...sampleLayer.tabs, { screen: 'history', title: 'History' }] };
const custom: UserLayer = { ...sampleLayer, tabs: [{ screen: 'about', title: 'Mine' }] };

describe('adoptDefaultLayer', () => {
  it('leaves the history alone when the app default has not changed', () => {
    const h = createHistory(oldDefault);

    expect(adoptDefaultLayer(h, structuredClone(oldDefault), oldDefault)).toBe(h);
  });

  it('switches an untouched layer to the new default, keeping the old one to undo to', () => {
    const h = adoptDefaultLayer(createHistory(oldDefault), newDefault, oldDefault);

    expect(rendered(h)).toEqual(newDefault);
    expect(h.preview).toBeNull();
    expect(h.accepted).toHaveLength(2);
  });

  it('treats a single-version history as untouched when the previous default is unknown', () => {
    const h = adoptDefaultLayer(createHistory(oldDefault), newDefault, null);

    expect(rendered(h)).toEqual(newDefault);
    expect(h.preview).toBeNull();
  });

  it('offers the new default as a preview when the user changed the layer', () => {
    const changed = accept(propose(createHistory(oldDefault), custom));

    const h = adoptDefaultLayer(changed, newDefault, oldDefault);

    expect(h.preview).not.toBeNull();
    expect(rendered(h)).toEqual(newDefault);
    expect(h.accepted).toEqual(changed.accepted);
  });

  it('offers a preview when the previous default is unknown and the history has changes', () => {
    const changed = accept(propose(createHistory(oldDefault), custom));

    expect(adoptDefaultLayer(changed, newDefault, null).preview).not.toBeNull();
  });

  it('does not offer a default the history already holds when the previous default is unknown', () => {
    const changed = accept(propose(createHistory(oldDefault), custom));

    expect(adoptDefaultLayer(changed, oldDefault, null)).toBe(changed);
  });

  it('does nothing when the layer on screen already is the new default', () => {
    const h = accept(propose(createHistory(oldDefault), newDefault));

    expect(adoptDefaultLayer(h, newDefault, null)).toBe(h);
  });
});
