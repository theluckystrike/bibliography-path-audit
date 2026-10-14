import { describe, expect, it, vi } from 'vitest';
import { App } from 'obsidian-test-mocks/obsidian';
import Plugin from '../src/main';
import manifest from '../manifest.json';
import { auditProfile, extractSettings, FILE_LIMIT, type Reader } from '../src/audit';
const profile = { id: 'Citations', path: 'Refs/library.bib', format: 'biblatex' as const };
function reader(files: Record<string, string>): Reader {
 return {
 exists: vi.fn(async p => p in files), read: vi.fn(async p => files[p] ?? ''),
 stat: vi.fn(async p => p in files ? { type: 'file', size: files[p]!.length } : null),
 list: vi.fn(async () => ({ files: Object.keys(files), folders: [] })),
 };
}
describe('read-only audit', () => {
 it('accepts a local file and the BibTeX sample', async () => {
  expect(await auditProfile(profile, reader({ 'Refs/library.bib': '@article{key,' }), x => x)).toMatchObject({ status: 'valid', candidate: 'Refs/library.bib', sample: 'BibTeX sample matches' });
 });
 it('checks the trimmed candidate and preserves the saved value', async () => {
  const r = await auditProfile({ ...profile, path: 'Refs/library.bib ' }, reader({ 'Refs/library.bib': '@article{key,' }), x => x);
  expect(r.status).toBe('candidate'); expect(r.original).toBe('"Refs/library.bib "');
 });
 it('does not prove the initial slash is a valid desktop path', async () => {
  expect(await auditProfile({ ...profile, path: '/Refs/library.bib' }, reader({ 'Refs/library.bib': '@article{key,' }), x => x)).toMatchObject({ status: 'candidate', candidate: 'Refs/library.bib' });
 });
 it('offers a hidden Markdown file without a rename', async () => {
  const r = await auditProfile(profile, reader({ 'Refs/library.bib.md': '@article{key,' }), x => x);
  expect(r.status).toBe('missing'); expect(r.matches).toEqual(['Refs/library.bib.md']);
 });
 it('reports hidden suffix when the saved file exists', async () => {
  const r = await auditProfile({ ...profile, path: 'Refs/library.bib.md' }, reader({ 'Refs/library.bib.md': '@article{key,' }), x => x);
  expect(r.status).toBe('candidate'); expect(r.messages.join(' ')).toContain('Hidden Markdown suffix');
 });
 it('reports a format mismatch', async () => {
  expect((await auditProfile({ ...profile, format: 'csl-json' }, reader({ 'Refs/library.bib': '@article{key,' }), x => x)).status).toBe('mismatch');
 });
 it.each(['/Users/other/library.bib', 'C:\\Refs\\library.bib', '../library.bib', '.obsidian/library.bib'])('makes no adapter calls for %s', async path => {
  const r = reader({}); await auditProfile({ ...profile, path }, r, x => x);
  for (const fn of Object.values(r)) expect(fn).not.toHaveBeenCalled();
 });
 it('checks file type before read', async () => {
  const r = reader({ 'Refs/library.bib': '' }); r.stat = vi.fn(async () => ({ type: 'folder', size: 0 }));
  expect((await auditProfile(profile, r, x => x)).status).toBe('not-file'); expect(r.read).not.toHaveBeenCalled();
 });
 it('does not read a file above 2 MiB', async () => {
  const r = reader({ 'Refs/library.bib': '' }); r.stat = vi.fn(async () => ({ type: 'file', size: FILE_LIMIT + 1 }));
  expect((await auditProfile(profile, r, x => x)).status).toBe('sample-skipped'); expect(r.read).not.toHaveBeenCalled();
 });
 it('withholds adapter error text', async () => {
  const r = reader({}); r.exists = vi.fn(async () => { throw Error('secret-value'); });
  const result = await auditProfile(profile, r, x => x);
  expect(result.status).toBe('unreadable'); expect(JSON.stringify(result)).not.toContain('secret-value');
 });
 it('does not access a remote source path', () => {
  const result = extractSettings('citation-extended', JSON.stringify({ databases: [{ sourceType: 'readwise', type: 'readwise', path: 'credential-value' }, { sourceType: 'zotero', type: 'csl-json', path: 'api-credential' }] }));
  expect(JSON.stringify(result)).not.toMatch(/credential/); expect(result.skipped).toBe(2);
 });
 it('reads only a known settings file through configDir', async () => {
  const app = App.createConfigured__({ files: { '.obsidian/plugins/obsidian-citation-plugin/data.json': '{"citationExportPath":"Refs/library.bib","citationExportFormat":"biblatex","secret":"credential-value"}' } });
  const plugin = new Plugin(app as never, manifest as never);
  const result = await plugin.profiles('obsidian-citation-plugin');
  expect(result.profiles[0]?.path).toBe('Refs/library.bib'); expect(JSON.stringify(result)).not.toContain('credential-value');
 });
});
