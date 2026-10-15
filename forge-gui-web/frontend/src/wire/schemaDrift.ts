import { PROPERTY_KINDS, type PropertyName } from './generated/wire';

/** Differences between the server's runtime `hello.schema` and the types this build was generated from. */
export interface SchemaDrift {
  /** Properties the build knows but the server does not send. */
  missing: PropertyName[];
  /** Properties the server sends that the build does not know. */
  unknown: string[];
  /** Properties whose kind differs. */
  changed: { name: PropertyName; built: string; runtime: string }[];
}

const isKnown = (name: string): name is PropertyName => Object.hasOwn(PROPERTY_KINDS, name);

/** Compares a `hello.schema` with the generated PROPERTY_KINDS. Empty lists = same engine version. */
export function schemaDrift(runtime: Readonly<Record<string, string>>): SchemaDrift {
  const drift: SchemaDrift = { missing: [], unknown: [], changed: [] };
  for (const name of Object.keys(PROPERTY_KINDS) as PropertyName[]) {
    const kind = runtime[name];
    if (kind === undefined) {
      drift.missing.push(name);
    } else if (kind !== PROPERTY_KINDS[name]) {
      drift.changed.push({ name, built: PROPERTY_KINDS[name], runtime: kind });
    }
  }
  for (const name of Object.keys(runtime)) {
    if (!isKnown(name)) {
      drift.unknown.push(name);
    }
  }
  return drift;
}

export const hasDrift = (d: SchemaDrift): boolean => d.missing.length + d.unknown.length + d.changed.length > 0;
