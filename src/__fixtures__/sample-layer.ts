import type { UserLayer } from '../user-layer/document';

/** A small diary layer used by renderer and agent tests. */
export const sampleLayer: UserLayer = {
  schemaVersion: 1,
  collections: {
    diary: { fields: { mood: { type: 'number' }, note: { type: 'text' } } },
  },
  screens: {
    today: {
      title: 'Today',
      body: [
        { type: 'text', value: 'How was the day?' },
        {
          type: 'form',
          collection: 'diary',
          submitLabel: 'Save',
          fields: [
            { type: 'scale', field: 'mood', label: 'Mood', min: 0, max: 4 },
            { type: 'textInput', field: 'note', label: 'Note', multiline: true },
          ],
        },
        { type: 'button', label: 'History', navigate: 'history' },
      ],
    },
    history: {
      title: 'History',
      body: [
        { type: 'chart', collection: 'diary', series: ['mood'] },
        { type: 'list', collection: 'diary', fields: ['mood', 'note'] },
      ],
    },
    about: { title: 'About', body: [{ type: 'text', value: 'A diary.' }] },
  },
  tabs: [
    { screen: 'today', title: 'Today' },
    { screen: 'about', title: 'About' },
  ],
};
