import { Modal, Notice, Plugin, normalizePath } from 'obsidian';
import type { SponsorsManager } from './license/index';
import { createGitHubSponsors } from './license/github-obsidian';
import { SPONSORS, bindPro, resetPro } from './pro';
import { AuditSettingTab } from './settings';
import { auditProfile, extractSettings, type Profile, type Report, type Schema } from './audit';
import { setupHello } from './hello/index';
import WHATS_NEW from './whats-new.json';

export default class BibliographyPathAuditPlugin extends Plugin {
 pro: SponsorsManager | null = null;
 private modals = new Set<AuditModal>();
 onload(): void {
  // First: "What's new" reads its state before the settings load (packages/hello). It does not wait.
  setupHello(this, WHATS_NEW);
  const pro = createGitHubSponsors(this.app, this.manifest.id, SPONSORS, this);
  pro.init(); this.pro = pro; bindPro(pro);
  this.addSettingTab(new AuditSettingTab(this.app, this));
  this.addCommand({ id: 'audit-path', name: 'Audit a bibliography path', callback: () => { this.openAudit(); } });
  this.app.workspace.onLayoutReady(() => {
   void pro.refresh();
   this.registerInterval(window.setInterval(() => { void pro.refresh(); }, 60 * 60 * 1000));
  });
 }
 openAudit(): AuditModal {
  this.closeAudits();
  const modal = new AuditModal(this);
  this.modals.add(modal); modal.open(); return modal;
 }
 closeAudits(): void { for (const m of [...this.modals]) m.close(); }
 forget(modal: AuditModal): void { this.modals.delete(modal); }
 onunload(): void { this.closeAudits(); resetPro(); }
 async profiles(schema: Schema): Promise<ReturnType<typeof extractSettings>> {
  const path = normalizePath(`${this.app.vault.configDir}/plugins/${schema}/data.json`);
  try { return extractSettings(schema, await this.app.vault.adapter.read(path)); }
  catch { return { status: 'unsupported', profiles: [], skipped: 0 }; }
 }
 async audit(profile: Profile): Promise<Report> {
  return auditProfile(profile, this.app.vault.adapter, normalizePath);
 }
}

export class AuditModal extends Modal {
 private schema: Schema = 'obsidian-citation-plugin';
 private profiles: Profile[] = [];
 private selected = 0;
 private generation = 0;
 constructor(private readonly plugin: BibliographyPathAuditPlugin) { super(plugin.app); }
 onOpen(): void {
  this.modalEl.addClass('bpa-modal'); this.setTitle('Bibliography path audit');
  const intro = this.contentEl.createEl('p', { text: 'Read-only check. Select one local profile. Settings and files stay unchanged.' });
  intro.addClass('bpa-intro');
  const label = this.contentEl.createEl('label', { text: 'Citation tool', attr: { for: 'bpa-schema' } });
  label.addClass('bpa-label');
  const schema = this.contentEl.createEl('select', { attr: { id: 'bpa-schema', 'aria-label': 'Citation tool' } });
  schema.createEl('option', { text: 'Citations', value: 'obsidian-citation-plugin' });
  schema.createEl('option', { text: 'Citation extended', value: 'citation-extended' });
  schema.addEventListener('change', () => { this.schema = schema.value as Schema; void this.loadProfiles(); });
  this.contentEl.createDiv({ cls: 'bpa-profiles' });
  const button = this.contentEl.createEl('button', { text: 'Check selected profile', cls: 'mod-cta bpa-check' });
  button.addEventListener('click', () => { void this.run(); });
  this.contentEl.createDiv({ cls: 'bpa-results', attr: { 'aria-live': 'polite' } });
  void this.loadProfiles();
 }
 async loadProfiles(): Promise<void> {
  const generation = ++this.generation;
  const result = await this.plugin.profiles(this.schema);
  if (generation !== this.generation) return;
  this.profiles = result.profiles; this.selected = 0;
  const box = this.contentEl.querySelector<HTMLElement>('.bpa-profiles');
  const results = this.contentEl.querySelector<HTMLElement>('.bpa-results');
  if (!box || !results) return;
  box.empty(); results.empty();
  if (result.status === 'unsupported') box.createEl('p', { text: 'Unsupported settings file. Missing file, invalid JSON, or unknown schema.' });
  else {
   box.createEl('p', { text: `${result.profiles.length} local profiles. ${result.skipped} sources skipped. Remote values are withheld.` });
   const select = box.createEl('select', { cls: 'bpa-profile', attr: { 'aria-label': 'Local profile' } });
   result.profiles.forEach((p, i) => select.createEl('option', { text: p.id, value: String(i) }));
   select.addEventListener('change', () => { this.selected = Number(select.value); this.generation++; results.empty(); });
  }
  const check = this.contentEl.querySelector<HTMLButtonElement>('.bpa-check');
  if (check) check.disabled = !result.profiles.length;
 }
 async run(): Promise<void> {
  const profile = this.profiles[this.selected];
  if (!profile) { new Notice('No supported local profile is selected.'); return; }
  const generation = ++this.generation;
  const report = await this.plugin.audit(profile);
  if (generation !== this.generation) return;
  const box = this.contentEl.querySelector<HTMLElement>('.bpa-results');
  if (!box) return;
  box.empty(); box.dataset.status = report.status;
  box.createEl('h3', { text: report.status === 'valid' ? 'Valid local bibliography path' : 'Path findings' });
  box.createEl('p', { text: `${profile.id} · ${profile.format === 'biblatex' ? 'BibTeX' : 'CSL JSON'} · ${report.status}` });
  box.createEl('p', { text: 'Saved value (quoted to show spaces)' });
  box.createEl('code', { text: report.original, cls: 'bpa-original' });
  for (const message of report.messages) box.createEl('p', { text: message });
  if (report.sample) box.createEl('p', { text: report.sample, cls: 'bpa-sample' });
  if (report.candidate) {
   box.createEl('p', { text: 'Vault-relative candidate. Select this text and copy it into the citation tool after review.' });
   box.createEl('input', { cls: 'bpa-candidate', value: report.candidate, attr: { readonly: '', 'aria-label': 'Corrected path candidate' } });
  }
  if (report.matches.length) {
   box.createEl('p', { text: 'Matching local files in the same folder' });
   const list = box.createEl('ul');
   report.matches.forEach(path => list.createEl('li').createEl('code', { text: path }));
  }
  box.createEl('p', { text: 'A sample cannot prove that the full bibliography is valid.', cls: 'bpa-limit' });
 }
 onClose(): void { this.generation++; this.contentEl.empty(); this.plugin.forget(this); }
}
