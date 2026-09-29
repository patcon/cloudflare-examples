import type {
  Transcriber,
  TranscriberSession,
  TranscriberSessionOptions
} from "agents/voice";

const SAMPLE_RATE = 16000;
// Flush to storage about every 2 seconds of audio.
const FLUSH_BYTES = SAMPLE_RATE * 2 * 2;
// Stop recording after 10 minutes, about 19MB.
const MAX_BYTES = SAMPLE_RATE * 2 * 600;

/**
 * Keeps the most recent session's audio in the Durable Object's SQLite, in
 * chunks, so it survives the object going to sleep after a call.
 */
export class AudioRecorder {
  #sql: SqlStorage;

  constructor(sql: SqlStorage) {
    this.#sql = sql;
    sql.exec(
      "CREATE TABLE IF NOT EXISTS last_audio (seq INTEGER PRIMARY KEY, pcm BLOB NOT NULL)"
    );
  }

  /** Wraps a transcriber so every session it creates is recorded. */
  wrap(inner: Transcriber): Transcriber {
    return {
      createSession: (options?: TranscriberSessionOptions) =>
        this.#record(inner.createSession(options))
    };
  }

  /** The last recording as a 16kHz mono WAV, or null if there isn't one. */
  wav(): Uint8Array<ArrayBuffer> | null {
    const chunks = this.#sql
      .exec<{ pcm: ArrayBuffer }>("SELECT pcm FROM last_audio ORDER BY seq")
      .toArray()
      .map((row) => new Uint8Array(row.pcm));
    if (chunks.length === 0) return null;
    return toWav(chunks);
  }

  #record(session: TranscriberSession): TranscriberSession {
    // A new session replaces the last recording.
    this.#sql.exec("DELETE FROM last_audio");
    let seq = 0;
    let total = 0;
    let pending: Uint8Array[] = [];
    let pendingBytes = 0;

    const flush = () => {
      if (pendingBytes === 0) return;
      const pcm = new Uint8Array(pendingBytes);
      let offset = 0;
      for (const chunk of pending) {
        pcm.set(chunk, offset);
        offset += chunk.byteLength;
      }
      this.#sql.exec(
        "INSERT INTO last_audio (seq, pcm) VALUES (?, ?)",
        seq++,
        pcm.buffer
      );
      pending = [];
      pendingBytes = 0;
    };

    return {
      feed(chunk) {
        if (total + chunk.byteLength <= MAX_BYTES) {
          pending.push(new Uint8Array(chunk.slice(0)));
          pendingBytes += chunk.byteLength;
          total += chunk.byteLength;
          if (pendingBytes >= FLUSH_BYTES) flush();
        }
        session.feed(chunk);
      },
      waitUntilReady: session.waitUntilReady?.bind(session),
      updateAgentContext: session.updateAgentContext?.bind(session),
      close() {
        flush();
        session.close();
      }
    };
  }
}

function toWav(chunks: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const dataBytes = chunks.reduce((n, c) => n + c.byteLength, 0);
  const wav = new Uint8Array(44 + dataBytes);
  const view = new DataView(wav.buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++)
      view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true); // bytes per second
  view.setUint16(32, 2, true); // bytes per sample
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, dataBytes, true);
  let offset = 44;
  for (const chunk of chunks) {
    wav.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return wav;
}
