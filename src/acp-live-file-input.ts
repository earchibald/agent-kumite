import { readFile } from 'node:fs/promises';

import type { AcpIngressEnvelope, RosterEntry, RunManifest } from './schema.js';
import { validateRunManifest } from './validate.js';

export interface AcpLiveFileInputPaths {
  manifestPath: string;
  rosterPath: string;
  ingressPath: string;
}

export interface AcpLiveFileInputs {
  manifest: RunManifest;
  roster: RosterEntry[];
  ingress: AcpIngressEnvelope[];
}

export async function readAcpLiveFileInputs(
  paths: AcpLiveFileInputPaths,
): Promise<AcpLiveFileInputs> {
  const [rawManifest, rawRoster, rawIngress] = await Promise.all([
    readFile(paths.manifestPath, 'utf8'),
    readFile(paths.rosterPath, 'utf8'),
    readFile(paths.ingressPath, 'utf8'),
  ]);

  const parsedManifest = JSON.parse(rawManifest) as unknown;
  const parsedRoster = JSON.parse(rawRoster) as unknown;
  const parsedIngress = JSON.parse(rawIngress) as unknown;

  const manifestErrors = validateRunManifest(parsedManifest);
  if (manifestErrors.length > 0) {
    throw new Error(`run manifest ${paths.manifestPath} is invalid: ${manifestErrors.join('; ')}`);
  }

  if (!Array.isArray(parsedRoster)) {
    throw new Error(`roster ${paths.rosterPath} must be a JSON array`);
  }

  if (!Array.isArray(parsedIngress)) {
    throw new Error(`ACP ingress ${paths.ingressPath} must be a JSON array`);
  }

  return {
    manifest: parsedManifest as RunManifest,
    roster: parsedRoster as RosterEntry[],
    ingress: parsedIngress as AcpIngressEnvelope[],
  };
}
