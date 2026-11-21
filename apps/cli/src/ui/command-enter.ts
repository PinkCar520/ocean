export interface CommandSuggestion {
  name: string;
}

export interface CommandEnterAction {
  type: 'submit';
  value: string;
}

/**
 * Enter runs the highlighted command suggestion.
 * A partial prefix is enough, because that row is already selected.
 * Text with no suggestion is submitted as typed.
 */
export function resolveCommandEnter(
  value: string,
  matches: CommandSuggestion[],
  selectedIndex: number,
): CommandEnterAction {
  if (matches.length > 0) {
    const selected = matches[selectedIndex] ?? matches[0];
    return { type: 'submit', value: selected.name };
  }
  return { type: 'submit', value };
}
