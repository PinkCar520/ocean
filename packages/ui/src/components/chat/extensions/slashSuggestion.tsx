import { ReactRenderer } from '@tiptap/react';
import tippy from 'tippy.js';
import { SlashList } from './SlashList';

export const getSlashSuggestion = (
  itemsProvider: (query: string) => any[],
  onSelect: (item: any, editor: any, range: any) => void
) => ({
  char: '/',
  items: ({ query }: { query: string }) => {
    return itemsProvider(query);
  },
  command: ({ editor, range, props }: any) => {
    onSelect(props, editor, range);
  },
  render: () => {
    let component: ReactRenderer<any>;
    let popup: any;

    return {
      onStart: (props: any) => {
        component = new ReactRenderer(SlashList, {
          props,
          editor: props.editor,
        });

        if (!props.clientRect) {
          return;
        }

        popup = tippy('body', {
          getReferenceClientRect: props.clientRect,
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: 'manual',
          placement: 'bottom-start',
        });
      },

      onUpdate(props: any) {
        component.updateProps(props);

        if (!props.clientRect) {
          return;
        }

        popup[0].setProps({
          getReferenceClientRect: props.clientRect,
        });
      },

      onKeyDown(props: any) {
        if (props.event.key === 'Escape') {
          popup[0].hide();
          return true;
        }

        return component.ref?.onKeyDown(props);
      },

      onExit() {
        if (popup?.[0] && !popup[0].state.isDestroyed) {
          popup[0].destroy();
        }
        component.destroy();
      },
    };
  },
});
