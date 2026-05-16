import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  hydrateAcpLiveRunStore,
  normalizeAcpLiveRunStoreInput,
  serializeAcpLiveRunStore,
  type AcpLiveRunStore,
} from './acp-live-run-store.js';

export async function readAcpLiveRunStoreFromFile(path: string): Promise<AcpLiveRunStore> {
  const resolvedPath = resolve(path);
  const raw = await readFile(resolvedPath, 'utf8');
  return hydrateAcpLiveRunStore(normalizeAcpLiveRunStoreInput(JSON.parse(raw) as unknown));
}

export async function writeAcpLiveRunStoreToFile(
  path: string,
  store: AcpLiveRunStore,
  pretty = false,
): Promise<string> {
  const resolvedPath = resolve(path);
  const serialized = serializeAcpLiveRunStore(store);

  await mkdir(dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, JSON.stringify(serialized, null, pretty ? 2 : undefined));
  return resolvedPath;
}
