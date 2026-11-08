import { GZIP_COMPRESSION, MAX_DIRECTORY_BYTES, NO_COMPRESSION, PmtilesError } from './pmtiles-format.mjs';

const joinChunks = (chunks, length) => {
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
};

const readCompressedDirectory = async (reader) => {
  const chunks = [];
  let length = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) return joinChunks(chunks, length);
    length += result.value.length;
    if (length > MAX_DIRECTORY_BYTES) throw new PmtilesError('PMTiles directory is too large');
    chunks.push(result.value);
  }
};

const createGzipReader = (bytes) => new Blob([bytes]).stream()
  .pipeThrough(new DecompressionStream('gzip'))
  .getReader();

const cancelReader = async (reader) => {
  try { await reader?.cancel(); } catch { /* Release a failed gzip stream. */ }
};

export const decompressDirectory = async (bytes, compression) => {
  if (compression === NO_COMPRESSION) return bytes;
  if (compression !== GZIP_COMPRESSION) throw new PmtilesError('Unsupported PMTiles directory compression');
  let reader;
  try {
    reader = createGzipReader(bytes);
    return await readCompressedDirectory(reader);
  } catch (error) {
    await cancelReader(reader);
    if (error instanceof PmtilesError) throw error;
    throw new PmtilesError('Invalid compressed PMTiles directory');
  } finally {
    reader?.releaseLock();
  }
};
