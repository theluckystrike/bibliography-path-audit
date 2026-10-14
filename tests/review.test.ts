import { describe, expect, it, vi } from 'vitest';
import { auditProfile, sampleFormat, SAMPLE_LIMIT, type Reader } from '../src/audit';
const profile = { id: 'Citations', path: 'Refs/library.bib', format: 'biblatex' as const };
function reader(files: Record<string, string>): Reader {
 return {
  exists: vi.fn(async p => p in files), read: vi.fn(async p => files[p] ?? ''),
  stat: vi.fn(async p => p in files ? { type: 'file', size: files[p]!.length } : null),
  // A real adapter rejects a list call on an absent folder.
  list: vi.fn(async folder => { if (!Object.keys(files).some(f => f.startsWith(`${folder}/`))) throw Error('ENOENT'); return { files: Object.keys(files), folders: [] }; }),
 };
}
const cslRecord = (i: number) => ({ id: `key${i}`, type: 'article-journal', title: `Title ${i}`, author: [{ family: 'Doe', given: 'Jane' }], issued: { 'date-parts': [[2020]] } });
describe('review defects', () => {
 it('reports a missing file in an absent folder as missing', async () => {
  const r = await auditProfile({ ...profile, path: 'Wrong/library.bib' }, reader({ 'Refs/library.bib': '@article{key,' }), x => x);
  expect(r.status).toBe('missing'); expect(r.messages).toEqual(['Local file not found']);
 });
 it('keeps a valid result when the folder list fails', async () => {
  const r = reader({ 'Refs/library.bib': '@article{key,' }); r.list = vi.fn(async () => { throw Error('list failed'); });
  expect((await auditProfile(profile, r, x => x)).status).toBe('valid');
 });
 it('matches a CSL JSON file larger than the sample limit', () => {
  const text = JSON.stringify(Array.from({ length: 200 }, (_, i) => cslRecord(i)), null, 2);
  expect(text.length).toBeGreaterThan(SAMPLE_LIMIT);
  expect(sampleFormat(text, 'csl-json', true)).toBe('CSL JSON sample matches');
  expect(sampleFormat(text, 'biblatex', true)).toBe('Format mismatch: CSL JSON sample, BibTeX selected');
 });
 it('keeps a truncated sample without a complete record incomplete', () => {
  expect(sampleFormat(`[{"id":"a","type":"book","title":"${'x'.repeat(SAMPLE_LIMIT)}"}]`, 'csl-json', true)).toBe('Sample incomplete; full format is unchecked');
 });
 it.each(['@thesis{key,', '@inbook{key,', '@dataset{key,', '@software{key,', '@Collection{key,'])('accepts the BibLaTeX entry %s', text => {
  expect(sampleFormat(text, 'biblatex')).toBe('BibTeX sample matches');
 });
 it('does not accept a string macro as an entry', () => {
  expect(sampleFormat('@string{jan = "January"}', 'biblatex')).toBe('Sample inconclusive; full format is unchecked');
 });
 it('matches names without letter case and lists at most eight', async () => {
  const names = ['library.BIB', 'Library.bib', 'LIBRARY.bib', 'LIBRARY.BIB', 'library.bib.md', 'Library.bib.md', 'LIBRARY.bib.MD', 'library.BIB.md', 'LiBrArY.bib', 'libRary.bib'].map(n => `Refs/${n}`);
  const r = reader({ 'Refs/library.bib': '@article{key,' }); r.list = vi.fn(async () => ({ files: [...names, 'Refs/library2.bib', 'Refs/other.bib'], folders: [] }));
  const result = await auditProfile(profile, r, x => x);
  expect(result.matches).toEqual([...names].sort().slice(0, 8));
 });
});
