import { sampleLayer } from '../../__fixtures__/sample-layer';
import type { UserLayer } from '../document';
import { accept, createHistory, propose, rendered } from '../history';
import { restoreHistory } from '../restore';

const v2: UserLayer = { ...sampleLayer, tabs: [{ screen: 'history', title: 'History' }] };
const usesAction: UserLayer = {
  ...sampleLayer,
  screens: { ...sampleLayer.screens, about: { title: 'About', body: [{ type: 'action', label: 'Go', action: 'gone' }] } },
};
const roundTrip = <T,>(v: T): unknown => JSON.parse(JSON.stringify(v));

describe('restoreHistory', () => {
  it('starts from the default layer when nothing was saved', () => {
    expect(restoreHistory(null, sampleLayer)).toEqual(createHistory(sampleLayer));
  });

  it.each([
    ['not an object', 42],
    ['missing fields', { versions: [] }],
    ['an accepted id past the versions', { ...createHistory(sampleLayer), accepted: [3] }],
    ['no accepted version', { ...createHistory(sampleLayer), accepted: [] }],
  ])('starts from the default layer when the saved history is %s', (_, raw) => {
    expect(restoreHistory(raw, sampleLayer)).toEqual(createHistory(sampleLayer));
  });

  it('restores a valid saved history as it was', () => {
    const saved = propose(accept(propose(createHistory(sampleLayer), v2)), sampleLayer);

    expect(restoreHistory(roundTrip(saved), sampleLayer)).toEqual(saved);
  });

  it('drops a preview that is no longer valid for this app', () => {
    const saved = propose(createHistory(sampleLayer), usesAction);

    const h = restoreHistory(roundTrip(saved), sampleLayer);

    expect(h.preview).toBeNull();
    expect(rendered(h)).toEqual(sampleLayer);
  });

  it('steps back to the newest accepted version that is still valid', () => {
    const saved = accept(propose(accept(propose(createHistory(sampleLayer), v2)), usesAction));

    expect(rendered(restoreHistory(roundTrip(saved), sampleLayer))).toEqual(v2);
  });

  it('adds the default layer as a new version when no accepted version is valid, keeping history', () => {
    const saved = createHistory(usesAction);

    const h = restoreHistory(roundTrip(saved), sampleLayer);

    expect(rendered(h)).toEqual(sampleLayer);
    expect(h.versions).toHaveLength(2);
  });
});
