import React from 'react';
import { Text } from 'ink';

type SpanProps = {
  color?: string;
  backgroundColor?: string;
  bold?: boolean;
  dimColor?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  inverse?: boolean;
};

type Span = { text: string; props: SpanProps };

const NAMED_COLORS = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];
const BRIGHT_COLORS = ['blackBright', 'redBright', 'greenBright', 'yellowBright', 'blueBright', 'magentaBright', 'cyanBright', 'whiteBright'];

/**
 * 与 restored-src/src/ink/Ansi.tsx 等价的简化实现：
 * 解析 ANSI SGR 转义序列，并映射成 Ink <Text> 的样式属性。
 */
export const Ansi = React.memo(function Ansi({ children }: { children: string }) {
  if (!children) return null;
  const spans = parseSpans(children);
  if (spans.length === 0) return null;
  return (
    <Text>
      {spans.map((span, index) =>
        hasAnyProps(span.props)
          ? <Text key={index} {...toInkProps(span.props)}>{span.text}</Text>
          : span.text,
      )}
    </Text>
  );
});

function parseSpans(input: string): Span[] {
  const spans: Span[] = [];
  const pattern = /\x1b\[([0-9;]*)m/g;
  let current: SpanProps = {};
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const push = (text: string) => {
    if (!text) return;
    const previous = spans[spans.length - 1];
    if (previous && propsEqual(previous.props, current)) previous.text += text;
    else spans.push({ text, props: { ...current } });
  };

  while ((match = pattern.exec(input)) !== null) {
    push(input.slice(lastIndex, match.index));
    current = applyCodes(current, match[1] ? match[1].split(';').map(Number) : [0]);
    lastIndex = pattern.lastIndex;
  }
  push(input.slice(lastIndex));
  return spans;
}

function applyCodes(current: SpanProps, codes: number[]): SpanProps {
  let next = { ...current };
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i]!;
    if (code === 0) next = {};
    else if (code === 1) next.bold = true;
    else if (code === 2) next.dimColor = true;
    else if (code === 3) next.italic = true;
    else if (code === 4) next.underline = true;
    else if (code === 7) next.inverse = true;
    else if (code === 9) next.strikethrough = true;
    else if (code === 22) { next.bold = false; next.dimColor = false; }
    else if (code === 23) next.italic = false;
    else if (code === 24) next.underline = false;
    else if (code === 27) next.inverse = false;
    else if (code === 29) next.strikethrough = false;
    else if (code >= 30 && code <= 37) next.color = NAMED_COLORS[code - 30];
    else if (code === 39) next.color = undefined;
    else if (code >= 40 && code <= 47) next.backgroundColor = NAMED_COLORS[code - 40];
    else if (code === 49) next.backgroundColor = undefined;
    else if (code >= 90 && code <= 97) next.color = BRIGHT_COLORS[code - 90];
    else if (code >= 100 && code <= 107) next.backgroundColor = BRIGHT_COLORS[code - 100];
    else if (code === 38 || code === 48) {
      const target = code === 38 ? 'color' : 'backgroundColor';
      const mode = codes[i + 1];
      if (mode === 5) {
        next[target] = `ansi256(${codes[i + 2]})`;
        i += 2;
      } else if (mode === 2) {
        next[target] = `rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]})`;
        i += 4;
      }
    }
  }
  return next;
}

function toInkProps(props: SpanProps): SpanProps {
  const { dimColor, ...rest } = props;
  return dimColor ? { ...rest, dimColor: true } : rest;
}

function propsEqual(a: SpanProps, b: SpanProps): boolean {
  return a.color === b.color
    && a.backgroundColor === b.backgroundColor
    && a.bold === b.bold
    && a.dimColor === b.dimColor
    && a.italic === b.italic
    && a.underline === b.underline
    && a.strikethrough === b.strikethrough
    && a.inverse === b.inverse;
}

function hasAnyProps(props: SpanProps): boolean {
  return props.color !== undefined
    || props.backgroundColor !== undefined
    || props.bold === true
    || props.dimColor === true
    || props.italic === true
    || props.underline === true
    || props.strikethrough === true
    || props.inverse === true;
}
