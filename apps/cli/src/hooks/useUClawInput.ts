import { useState, useCallback } from 'react';
import { useInput } from 'ink';

interface UseUClawInputProps {
  initialValue?: string;
  onEnter?: (value: string) => boolean | void; // Return true to keep value (completion)
  onTab?: (value: string) => string | void; // Return new value if completed
  onUp?: () => void;
  onDown?: () => void;
}

/**
 * Custom Input Engine - Inspired by Claude Code
 * Manages text state, cursor position, and keyboard events manually.
 */
export function useUClawInput({ initialValue = '', onEnter, onTab, onUp, onDown }: UseUClawInputProps) {
  const [value, setValue] = useState(initialValue);
  const [cursorOffset, setCursorOffset] = useState(initialValue.length);

  useInput((input, key) => {
    // 1. Handle Vertical Navigation (for suggestions)
    if (key.upArrow) {
      if (onUp) onUp();
      return;
    }
    if (key.downArrow) {
      if (onDown) onDown();
      return;
    }

    // 2. Handle Backspace
    if (key.backspace || key.delete) {
      if (cursorOffset > 0) {
        const newValue = value.slice(0, cursorOffset - 1) + value.slice(cursorOffset);
        setValue(newValue);
        setCursorOffset(cursorOffset - 1);
      }
      return;
    }

    // 3. Handle Left/Right Arrows (Cursor Movement)
    if (key.leftArrow) {
      setCursorOffset(prev => Math.max(0, prev - 1));
      return;
    }
    if (key.rightArrow) {
      setCursorOffset(prev => Math.min(value.length, prev + 1));
      return;
    }

    // 4. Handle Enter
    if (key.return) {
      const keepValue = onEnter ? onEnter(value) : false;
      if (!keepValue) {
        setValue('');
        setCursorOffset(0);
      }
      return;
    }


    // 4. Handle Tab (Completion)
    if (key.tab) {
      if (onTab) {
        const completed = onTab(value);
        if (completed) {
          setValue(completed);
          setCursorOffset(completed.length);
        }
      }
      return;
    }

    // 5. Handle Regular Characters
    // Skip control characters (like Ctrl+C, handled by Ink)
    if (input && !key.ctrl && !key.meta && !key.return && !key.tab && !key.backspace && !key.delete) {
      const newValue = value.slice(0, cursorOffset) + input + value.slice(cursorOffset);
      setValue(newValue);
      setCursorOffset(cursorOffset + 1);
    }
  });

  return {
    value,
    cursorOffset,
    setValue,
    setCursorOffset,
  };
}
