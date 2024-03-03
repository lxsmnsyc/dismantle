import type { Options, Output } from 'use-server-directive/compiler';

export interface ManifestRecord {
  files: Output['files'];
  entries: Set<string>;
}

export type Manifest = Record<Options['mode'], ManifestRecord>;

export function createManifest(): Manifest {
  return {
    server: {
      files: new Map(),
      entries: new Set(),
    },
    client: {
      files: new Map(),
      entries: new Set(),
    },
  };
}

export function mergeManifestRecord(
  source: ManifestRecord,
  target: ManifestRecord,
): { invalidePreload: boolean; invalidated: string[] } {
  const invalidated: string[] = [];
  for (const [file, content] of target.files) {
    if (source.files.has(file)) {
      invalidated.push(file);
    }
    source.files.set(file, content);
  }

  const current = source.entries.size;
  for (const entry of target.entries) {
    source.entries.add(entry);
  }
  return {
    invalidePreload: current !== source.entries.size,
    invalidated,
  };
}
