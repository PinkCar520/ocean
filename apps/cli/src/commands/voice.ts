import type { Command } from 'commander';
import { open } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { resolveApiKey } from '../utils/auth.js';

const MAX_AUDIO_BYTES = 24 * 1024 * 1024;
const audioTypes: Record<string, string> = {
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.mp4': 'audio/mp4',
  '.webm': 'audio/webm',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
};

export function registerVoiceCommands(program: Command): void {
  program.command('voice').description('Transcribe an audio file through Ocean Gateway')
    .command('transcribe').argument('<file>').action(async (file: string) => {
      const apiKey = await resolveApiKey();
      if (!apiKey) throw new Error('Audio transcription requires authentication. Run ocean login first.');
      const type = audioTypes[extname(file).toLowerCase()];
      if (!type) throw new Error('Unsupported audio file extension.');

      const handle = await open(file, 'r');
      let data: Uint8Array<ArrayBuffer>;
      try {
        const info = await handle.stat();
        if (!info.isFile() || info.size < 1 || info.size > MAX_AUDIO_BYTES) {
          throw new Error('Audio must be a non-empty file smaller than 24 MiB.');
        }
        const buffer = new Uint8Array(info.size + 1);
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
        if (bytesRead !== info.size) throw new Error('Audio file changed while reading it.');
        data = buffer.subarray(0, bytesRead);
      } finally {
        await handle.close();
      }

      const form = new FormData();
      form.append('file', new Blob([data], { type }), basename(file));
      const gateway = (process.env.OCEAN_GATEWAY_URL || 'http://localhost:3000').replace(/\/$/, '');
      const response = await fetch(`${gateway}/api/chat/audio/transcribe`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'x-api-key': apiKey },
        body: form,
        signal: AbortSignal.timeout(90_000),
      });
      if (!response.ok) throw new Error(`Audio transcription failed: HTTP ${response.status}`);
      const result = await response.json() as { success?: boolean; text?: string };
      if (result.success !== true || typeof result.text !== 'string') throw new Error('Invalid transcription response.');
      process.stdout.write(result.text.endsWith('\n') ? result.text : `${result.text}\n`);
    });
}
