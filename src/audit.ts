export type Schema = 'obsidian-citation-plugin' | 'citation-extended';
export type Format = 'biblatex' | 'csl-json';
export interface Profile { id: string; path: string; format: Format }
export interface SettingsResult { status: 'supported' | 'unsupported'; profiles: Profile[]; skipped: number }
export interface Report { status: string; messages: string[]; original: string; candidate: string; matches: string[]; sample: string }
export interface Reader {
 exists(path: string): Promise<boolean>;
 read(path: string): Promise<string>;
 list(path: string): Promise<{ files: string[]; folders: string[] }>;
 stat(path: string): Promise<{ type: string; size: number } | null>;
}
const FORMATS = new Set(['biblatex', 'csl-json']);
export const SAMPLE_LIMIT = 4096;
export const FILE_LIMIT = 2 * 1024 * 1024;
export function record(value: unknown): Record<string, unknown> | null {
 return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
// Only paths with a bibliography extension can leave the settings projection.
export function localField(value: unknown): value is string {
 return typeof value === 'string' && value.length <= 1024 && !Array.from(value).some(c => c.charCodeAt(0) < 32) && !/[?#]/.test(value) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(value.trim()) && !/(?:token|secret|password|api[_-]?key|gh[opusr]_)/i.test(value) && /\.(?:bib|json)(?:\.md)?$/i.test(value.trim());
}
export function extractSettings(schema: string, text: string): SettingsResult {
 const unsupported: SettingsResult = { status: 'unsupported', profiles: [], skipped: 0 };
 let obj: Record<string, unknown> | null;
 try { obj = record(JSON.parse(text)); } catch { return unsupported; }
 if (!obj) return unsupported;
 if (schema === 'obsidian-citation-plugin') {
  if (!FORMATS.has(String(obj.citationExportFormat)) || typeof obj.citationExportPath !== 'string') return unsupported;
  if (!localField(obj.citationExportPath)) return { status: 'supported', profiles: [], skipped: 1 };
  return { status: 'supported', profiles: [{ id: 'Citations', path: obj.citationExportPath, format: obj.citationExportFormat as Format }], skipped: 0 };
 }
 if (schema !== 'citation-extended' || !Array.isArray(obj.databases)) return unsupported;
 const profiles: Profile[] = [];
 let skipped = 0;
 for (let i = 0; i < obj.databases.length; i++) {
  const db = record(obj.databases[i]);
  // Do not access path for a remote, absent or unknown transport or format.
  if (!db || (db.sourceType !== 'local-file' && db.sourceType !== 'vault-file') || !FORMATS.has(String(db.type))) { skipped++; continue; }
  if (!localField(db.path)) { skipped++; continue; }
  profiles.push({ id: `Database ${i + 1}`, path: db.path, format: db.type as Format });
 }
 return { status: 'supported', profiles, skipped };
}
export function inspectPath(path: string): { kind: string; candidate: string; messages: string[] } {
 const trimmed = path.trim();
 const messages: string[] = [];
 if (trimmed !== path) messages.push('Leading or trailing spaces');
 if (/^(?:[a-z]:|\\\\|~\/)/i.test(trimmed) || /^\/(?:Users|home|Volumes|mnt|etc|var|tmp|private|storage|sdcard|data)(?:\/|$)/i.test(trimmed)) {
  return { kind: 'external', candidate: '', messages: [...messages, 'Outside the vault; unchecked on desktop and mobile'] };
 }
 if (trimmed.startsWith('/')) messages.push('Initial slash; only the vault-relative candidate is checked');
 const candidate = trimmed.replace(/^\/+/, '').replace(/\\/g, '/').replace(/\/{2,}/g, '/').normalize('NFC');
 if (!localField(path) || candidate.split('/').some(x => x === '..' || x === '.' || x.startsWith('.')) || candidate.endsWith('/')) return { kind: 'unsafe', candidate: '', messages: ['Unsupported local path; value withheld'] };
 if (/\.(bib|json)\.md$/i.test(candidate)) messages.push('Hidden Markdown suffix .md; file is not renamed');
 return { kind: 'local', candidate, messages };
}
function firstRecord(sample: string): unknown {
 const start = sample.indexOf('{');
 if (start < 0 || sample.slice(1, start).trim()) return null;
 let depth = 0, quoted = false;
 for (let i = start; i < sample.length; i++) {
  const c = sample[i];
  if (quoted) { if (c === '\\') i++; else if (c === '"') quoted = false; continue; }
  if (c === '"') quoted = true;
  else if (c === '{') depth++;
  else if (c === '}' && --depth === 0) { try { return JSON.parse(sample.slice(start, i + 1)); } catch { return null; } }
 }
 return null;
}
export function sampleFormat(text: string, format: Format, truncated = false): string {
 const sample = text.slice(0, SAMPLE_LIMIT).replace(/^\uFEFF/, '').trim();
 if (/^\s*(?:%[^\n]*\n\s*)*@(?!(?:string|preamble|comment)\b)[a-z]+\s*[{(][^,\s]+\s*,/i.test(sample)) return format === 'biblatex' ? 'BibTeX sample matches' : 'Format mismatch: BibTeX sample, CSL JSON selected';
 if (sample.startsWith('[')) {
  let parsed: unknown;
  try { parsed = JSON.parse(sample); } catch {
   // A truncated array is checked through its first complete record.
   const first = truncated ? firstRecord(sample) : null;
   if (!first) return truncated ? 'Sample incomplete; full format is unchecked' : 'Sample inconclusive; full format is unchecked';
   parsed = [first];
  }
  if (Array.isArray(parsed) && parsed.length > 0 && parsed.some(x => { const o = record(x); return o && (typeof o.id === 'string' || typeof o.id === 'number') && typeof o.type === 'string'; })) return format === 'csl-json' ? 'CSL JSON sample matches' : 'Format mismatch: CSL JSON sample, BibTeX selected';
 }
 return 'Sample inconclusive; full format is unchecked';
}
export async function auditProfile(profile: Profile, reader: Reader, normalize: (p: string) => string): Promise<Report> {
 const path = inspectPath(profile.path);
 const report: Report = { status: path.kind, messages: path.messages, original: path.kind === 'unsafe' ? '[withheld]' : JSON.stringify(profile.path), candidate: path.candidate, matches: [], sample: '' };
 if (path.kind !== 'local') return report;
 const candidate = normalize(path.candidate);
 report.candidate = candidate;
 try {
  const exists = await reader.exists(candidate);
  if (exists) {
   const stat = await reader.stat(candidate);
   if (!stat || stat.type !== 'file') { report.status = 'not-file'; report.messages.push('Path is not a file'); return report; }
   if (stat.size > FILE_LIMIT) { report.status = 'sample-skipped'; report.sample = 'File exceeds 2 MiB; sample not read'; return report; }
   const text = await reader.read(candidate);
   report.sample = sampleFormat(text, profile.format, text.length > SAMPLE_LIMIT);
   report.status = report.sample.includes('mismatch') ? 'mismatch' : report.sample.endsWith('matches') ? (path.messages.length ? 'candidate' : 'valid') : 'inconclusive';
   report.messages.push(report.status === 'valid' ? 'Valid local path; sample matches selected format' : 'Local candidate exists; review the findings');
  } else { report.status = 'missing'; report.messages.push('Local file not found'); }
  const slash = candidate.lastIndexOf('/');
  const parent = slash < 0 ? '' : candidate.slice(0, slash);
  const base = candidate.slice(slash + 1).replace(/\.md$/i, '').toLowerCase();
  // Matches are optional. An absent or unreadable folder keeps the file result.
  const listed = await reader.list(normalize(parent)).catch(() => ({ files: [] as string[] }));
  report.matches = listed.files.filter(f => {
   const safe = inspectPath(f);
   return safe.kind === 'local' && f.split('/').pop()?.replace(/\.md$/i, '').toLowerCase() === base && f !== candidate;
  }).sort().slice(0, 8);
 } catch { report.status = 'unreadable'; report.messages.push('Cannot read the local file or folder'); }
 return report;
}
