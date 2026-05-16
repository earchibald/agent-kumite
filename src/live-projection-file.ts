import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import type { LiveControlRoomProjection } from './projection.js';

export async function writeLiveControlRoomProjectionToFile(
  path: string,
  projection: LiveControlRoomProjection,
  pretty = false,
): Promise<string> {
  const resolvedPath = resolve(path);
  await mkdir(dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, JSON.stringify(projection, null, pretty ? 2 : undefined));
  return resolvedPath;
}
