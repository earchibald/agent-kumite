import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { AcpIngressEnvelope } from './schema.js';

export async function readAcpIngressEnvelopeListFromFile(path: string): Promise<AcpIngressEnvelope[]> {
  const resolvedPath = resolve(path);
  const raw = await readFile(resolvedPath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`ACP ingress ${resolvedPath} must be a JSON array`);
  }

  return parsed as AcpIngressEnvelope[];
}
