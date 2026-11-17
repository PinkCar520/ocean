import { get_encoding, type Tiktoken } from 'tiktoken';
export type TokenEncoding = 'cl100k_base' | 'o200k_base';
const encoders = new Map<TokenEncoding, Tiktoken>();
export function countTextTokens(text: string, encoding: TokenEncoding = 'o200k_base'): number {
  if (encoding !== 'cl100k_base' && encoding !== 'o200k_base') throw new Error('Unsupported token encoding');
  let encoder = encoders.get(encoding);
  if (!encoder) { encoder = get_encoding(encoding); encoders.set(encoding, encoder); }
  return encoder.encode(text, [], []).length;
}
