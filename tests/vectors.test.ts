import { describe, expect, it } from 'vitest';
import { normalizePath } from 'obsidian';
import vectors from './vectors/bibliography-path-audit.json';
import * as audit from '../src/audit';
import type { Profile, Reader } from '../src/audit';
function fixtureReader(files: Record<string, string>): Reader {
 return {
  exists: async path => path in files,
  read: async path => files[path] ?? '',
  stat: async path => path in files ? { type: 'file', size: files[path]!.length } : null,
  list: async folder => ({ files: Object.keys(files).filter(path => path.slice(0, Math.max(0, path.lastIndexOf('/'))) === folder), folders: [] }),
 };
}
describe('golden acceptance vectors', () => {
 it('contains at least 20 acceptance cases', () => expect(vectors.cases.length).toBeGreaterThanOrEqual(20));
 for (const c of vectors.cases) it(c.name, async () => {
  if (c.function === 'auditProfile') {
   const [profile, files] = c.args as [Profile, Record<string, string>];
   expect(await audit.auditProfile(profile, fixtureReader(files), normalizePath)).toEqual(c.expected);
   return;
  }
  const fn = audit[c.function as 'extractSettings' | 'inspectPath' | 'sampleFormat'] as (...args: unknown[]) => unknown;
  expect(fn(...c.args)).toEqual(c.expected);
 });
});
