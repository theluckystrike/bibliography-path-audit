import { PluginSettingTab, type App, type SettingDefinitionItem } from 'obsidian';
import { fillAccountSetting } from './license/github-obsidian';
import { PRO_UI } from './pro';
import type BibliographyPathAuditPlugin from './main';

export class AuditSettingTab extends PluginSettingTab {
 constructor(app: App, private readonly owner: BibliographyPathAuditPlugin) { super(app, owner); }
 getSettingDefinitions(): SettingDefinitionItem[] {
  return [
   { name: 'Read-only path audit', render: setting => {
    setting.setDesc('Choose a citation tool and check one local bibliography profile.').addButton(button => button.setButtonText('Open audit').onClick(() => { this.owner.openAudit(); }));
   } },
   { name: 'Scope', render: setting => { setting.setDesc('Citations path and format fields; Citation extended explicit local-file and vault-file sources. No settings writes.'); } },
   { type: 'group', heading: 'Planned pro features', items: [
    { name: 'Named reports and batch checks', render: setting => { setting.setDesc(`${PRO_UI.proSummary} Payment does not add features in this version.`); } },
    { name: 'GitHub account', render: setting => { if (this.owner.pro) return fillAccountSetting(setting, this.owner.pro, PRO_UI); return undefined; } },
   ] },
  ];
 }
}
