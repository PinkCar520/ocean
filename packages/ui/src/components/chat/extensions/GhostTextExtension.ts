import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const GhostTextExtension = Extension.create({
  name: 'ghostText',

  addOptions() {
    return {
      text: '',
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('ghostText'),
        props: {
          decorations: (state) => {
            const { text } = this.options;
            if (!text) {
              return DecorationSet.empty;
            }

            const dec = Decoration.widget(state.doc.content.size, () => {
              const wrapper = document.createElement('span');
              wrapper.style.display = 'inline-flex';
              wrapper.style.alignItems = 'center';
              wrapper.style.gap = '6px';
              wrapper.style.marginLeft = '2px';
              wrapper.className = 'select-none pointer-events-none';

              const span = document.createElement('span');
              span.style.color = 'rgba(168, 164, 161, 0.6)';
              span.textContent = text;
              
              wrapper.appendChild(span);
              return wrapper;
            });

            return DecorationSet.create(state.doc, [dec]);
          },
        },
      }),
    ];
  },
});
