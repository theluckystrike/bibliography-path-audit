import { browser, expect } from '@wdio/globals';
import type Plugin from '../../src/main';
async function setup(path: string, format = 'biblatex', schema = 'obsidian-citation-plugin', extended = false): Promise<string> {
 return browser.executeObsidian(async ({ app }, path, format, schema, extended) => {
  const a = app.vault.adapter;
  if (!await a.exists('Refs')) await a.mkdir('Refs');
  await a.write('Refs/library.bib', '@article{key, title={Test}}');
  await a.write('Refs/library.bib.md', '@article{hidden, title={Test}}');
  const root = `${app.vault.configDir}/plugins/${schema}`;
  if (!await a.exists(root)) await a.mkdir(root);
  const settings = extended ? { databases: [
   { path, type: format, sourceType: 'vault-file' },
   { path: 'credential-value', type: 'readwise', sourceType: 'readwise' },
   { path: 'api-credential-value', type: 'csl-json', sourceType: 'zotero' },
  ] } : { citationExportPath: path, citationExportFormat: format, readwiseToken: 'credential-value' };
  const text = JSON.stringify(settings);
  await a.write(root + '/data.json', text);
  const plugin = (app as unknown as { plugins: { plugins: Record<string, Plugin> } }).plugins.plugins['bibliography-path-audit']!;
  const m = plugin.openAudit();
  const schemaSelect = m.contentEl.querySelector<HTMLSelectElement>('#bpa-schema')!;
  schemaSelect.value = schema;
  schemaSelect.dispatchEvent(new Event('change'));
  await m.loadProfiles(); await m.run();
  return await a.read(root + '/data.json');
 }, path, format, schema, extended);
}
describe('local bibliography path audit', () => {
 it('shows a valid path and leaves settings unchanged', async () => {
  const text = await setup('Refs/library.bib');
  expect(JSON.parse(text).citationExportPath).toBe('Refs/library.bib');
  await expect(browser.$('.bpa-results')).toHaveAttribute('data-status','valid');
  await expect(browser.$('.bpa-sample')).toHaveText('BibTeX sample matches');
  await expect(browser.$('.bpa-candidate')).toHaveValue('Refs/library.bib');
 });
 it('shows a trailing space and trimmed candidate', async () => {
  const text = await setup('Refs/library.bib ');
  expect(JSON.parse(text).citationExportPath).toBe('Refs/library.bib ');
  await expect(browser.$('.bpa-original')).toHaveText('"Refs/library.bib "');
  await expect(browser.$('.bpa-candidate')).toHaveValue('Refs/library.bib');
 });
 it('labels an initial slash as a candidate', async () => {
  await setup('/Refs/library.bib');
  await expect(browser.$('.bpa-results')).toHaveAttribute('data-status','candidate');
  await expect(browser.$('.bpa-candidate')).toHaveValue('Refs/library.bib');
 });
 it('shows a hidden suffix without a rename', async () => {
  await setup('Refs/library.bib.md');
  const text = await browser.$('.bpa-results').getText();
  expect(text).toContain('Hidden Markdown suffix .md');
  await expect(browser.$('.bpa-candidate')).toHaveValue('Refs/library.bib.md');
 });
 it('shows a format mismatch', async () => {
  await setup('Refs/library.bib','csl-json');
  await expect(browser.$('.bpa-results')).toHaveAttribute('data-status','mismatch');
 });
 it('does not check an external path', async () => {
  await setup('/Users/other/library.bib');
  await expect(browser.$('.bpa-results')).toHaveAttribute('data-status','external');
  expect(await browser.$('.bpa-candidate').isExisting()).toBe(false);
 });
 it('skips credentials and remote sources', async () => {
  await setup('Refs/library.bib','biblatex','citation-extended',true);
  const text = await browser.$('.bpa-modal').getText();
  expect(text).toContain('2 sources skipped'); expect(text).not.toContain('credential-value');
  await expect(browser.$('.bpa-results')).toHaveAttribute('data-status','valid');
 });
 it('shows unsupported settings without raw JSON values', async () => {
  const text = await browser.executeObsidian(async ({ app }) => {
    await app.vault.adapter.write(`${app.vault.configDir}/plugins/obsidian-citation-plugin/data.json`, '{private-credential');
   const plugin = (app as unknown as { plugins: { plugins: Record<string, Plugin> } }).plugins.plugins['bibliography-path-audit']!;
   const m = plugin.openAudit(); await m.loadProfiles(); return m.contentEl.textContent;
  });
  expect(text).toContain('Unsupported settings file'); expect(text).not.toContain('private-credential');
 });
});
