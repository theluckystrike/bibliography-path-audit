import { browser, expect } from '@wdio/globals';
import { pluginId, reloadPlugin } from './load';
describe(`${pluginId} load`, () => {
 it('is enabled and reloads without errors', async () => {
  expect(await reloadPlugin(pluginId)).toEqual({ enabled: true, reloaded: true, errors: [] });
 });
 it('registers and opens the audit command', async () => {
  await browser.executeObsidianCommand(`${pluginId}:audit-path`);
  await expect(browser.$('.bpa-modal')).toBeDisplayed();
  await browser.executeObsidian(({ app }) => { (app as unknown as { plugins: { plugins: Record<string, { closeAudits(): void }> } }).plugins.plugins['bibliography-path-audit']!.closeAudits(); });
 });
});
