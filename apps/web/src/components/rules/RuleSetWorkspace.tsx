import { type FormEvent, useEffect, useState } from 'react';
import { AlertCircle, Check, CheckCircle2, Lock, RefreshCw } from 'lucide-react';
import { checkRuleSetIssues, type Definition, type Rule } from '@taxo/shared';
import { Link } from 'wouter';
import type { RuleSet, RuleSetDraft, Store } from '@/data/store';
import { buttonPrimary, buttonQuiet } from '../styles';
import { emptyRule } from './draft';
import { RuleEditor } from './RuleEditor';
import { RuleSetPage } from './RuleSetPage';

// An unsaved Rule Set: what the admin has changed, and the stored version it
// started from. App keeps one per Rule Set, so moving between the Rule Set
// page and its Rules (or to Build and back) keeps the edits.
export type RuleSetEdit = { name: string; rules: Rule[]; baseUpdatedAt: string };

type RuleSetWorkspaceProps = {
  existing: RuleSet | null; // null: a new Rule Set, not saved yet
  ruleId: string | null;    // the Rule open in the editor; null shows the Rule Set page
  segmentId: string | null; // the segment the Rule editor selects on arrival
  edit: RuleSetEdit | undefined;
  onEdit: (edit: RuleSetEdit | null) => void; // null drops the edits
  definitions: Definition[];
  readOnly: boolean;
  storeKind: Store['kind'];
  justCreated: boolean;
  onCreate: (draft: RuleSetDraft) => Promise<RuleSet>;
  onUpdate: (id: string, draft: RuleSetDraft, baseUpdatedAt: string) => Promise<string>;
  onDelete: (id: string) => Promise<void>;
  onCreated: (id: string, ruleId: string | null) => void;
  onDeleted: () => void;
};

// The Rule Set being managed: its draft, the save bar and conflict handling,
// around either the Rule Set page or one Rule's editor. Saving always writes
// the whole Rule Set, which is one document, with the version it started from.
export function RuleSetWorkspace({ existing, ruleId, segmentId, edit, onEdit, definitions, readOnly, storeKind, justCreated, onCreate, onUpdate, onDelete, onCreated, onDeleted }: RuleSetWorkspaceProps) {
  const isNew = existing === null;
  const [saved, setSaved] = useState(justCreated);
  // A save against Firestore can take seconds on a cold connection; while one
  // is in flight Save is disabled, so a second click cannot create a duplicate.
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isNew && !edit) onEdit({ name: 'Untitled Rule Set', rules: [emptyRule(0)], baseUpdatedAt: '' });
  }, [isNew, edit, onEdit]);

  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), 2200);
    return () => window.clearTimeout(timer);
  }, [saved]);

  if (!edit && !existing) return null;
  const name = edit ? edit.name : existing!.name;
  const rules = edit ? edit.rules : existing!.rules;
  const baseUpdatedAt = edit ? edit.baseUpdatedAt : existing!.updatedAt;
  const change = (patch: { name?: string; rules?: Rule[] }) => {
    if (readOnly) return;
    onEdit({ name, rules, baseUpdatedAt, ...patch });
  };

  // `existing` keeps following the store, so a save by someone else shows up
  // as its updatedAt moving past the version these edits started from.
  const stale = !isNew && !readOnly && existing.updatedAt !== baseUpdatedAt;
  const isDirty = isNew || name !== existing.name || JSON.stringify(rules) !== JSON.stringify(existing.rules);
  // Every problem, live, grouped by Rule: the engine owns the checks.
  const draftRuleSet = { id: existing?.id ?? '', name: name.trim(), rules };
  const issues = checkRuleSetIssues(draftRuleSet, definitions);
  const hasIssues = issues.ruleSet.length > 0 || Object.keys(issues.rules).length > 0;
  const issueCount = issues.ruleSet.length + Object.values(issues.rules).reduce((total, messages) => total + messages.length, 0);
  const base = `/rules/${existing?.id ?? 'new'}`;

  const showFirstIssue = () => {
    document.querySelector('[data-testid="list-ruleset-issues"], [data-testid^="list-rule-issues-"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (readOnly || saving) return;
    if (hasIssues) {
      setError('Fix the problems listed before saving.');
      return;
    }
    const draft = { name: name.trim(), rules };
    setError('');
    setSaving(true);
    try {
      if (isNew) {
        const created = await onCreate(draft);
        onEdit(null);
        onCreated(created.id, ruleId);
        return;
      }
      const updatedAt = await onUpdate(existing.id, draft, baseUpdatedAt);
      onEdit({ name, rules, baseUpdatedAt: updatedAt });
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Saving failed.');
    } finally {
      setSaving(false);
    }
  };

  const deleteRuleSet = () => {
    if (isNew || !window.confirm('Delete this Rule Set?')) return;
    void onDelete(existing.id);
    onEdit(null);
    onDeleted();
  };

  const rule = ruleId ? rules.find((item) => item.id === ruleId) : undefined;

  return (
    <form onSubmit={onSubmit}>
      <div className="sticky top-[68px] z-10 -mx-5 -mt-8 mb-6 flex flex-wrap items-center justify-end gap-3 border-b border-border/70 bg-background/90 px-5 py-3 backdrop-blur-md sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10" data-testid="bar-ruleset-save">
        <span className="mr-auto truncate font-mono text-[10px] font-semibold uppercase tracking-wider text-primary">{isNew ? 'New Rule Set' : name || 'Rule Set'}</span>
        {readOnly ? <span className="inline-flex items-center gap-2 rounded-[4px] border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground" data-testid="text-read-only"><Lock className="h-3.5 w-3.5" /> Read only: only a workspace admin can change Rule Sets.</span> : <>
          {saved ? <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary" data-testid="text-save-confirmation"><CheckCircle2 className="h-4 w-4" /> {storeKind === 'firestore' ? 'Saved' : 'Saved locally'}</span>
            : hasIssues ? <button type="button" onClick={showFirstIssue} className="inline-flex items-center gap-1.5 text-xs font-semibold text-destructive underline-offset-2 hover:underline" data-testid="button-show-issues"><AlertCircle className="h-4 w-4" /> {issueCount} problem{issueCount === 1 ? '' : 's'} to fix: show me</button>
              : isDirty ? <span className="text-xs font-semibold text-muted-foreground" data-testid="text-unsaved">Unsaved changes: save to use them in Build</span> : null}
          <button type="submit" className={buttonPrimary} disabled={saving || hasIssues} title={hasIssues ? 'Fix the problems listed before saving.' : undefined} data-testid="button-save-ruleset"><Check className="h-4 w-4" /> {saving ? 'Saving' : 'Save Rule Set'}</button>
        </>}
      </div>
      {error && <div className="mb-6 flex items-center gap-3 rounded-[4px] border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive" role="alert" data-testid="status-ruleset-error"><AlertCircle className="h-5 w-5 shrink-0" /> {error}</div>}
      {stale && <div className="mb-6 flex flex-wrap items-center gap-3 rounded-[4px] border border-border bg-card px-4 py-3 text-sm font-medium text-foreground" role="status" data-testid="status-ruleset-stale"><RefreshCw className="h-4 w-4 shrink-0 text-muted-foreground" /> <span className="flex-1">This Rule Set changed since you started editing. Saving now will be refused.</span><button type="button" className={buttonQuiet} onClick={() => { onEdit(null); setError(''); }} data-testid="button-reload-ruleset">Reload and drop my edits</button></div>}
      <fieldset disabled={readOnly} className="min-w-0">
        {ruleId
          ? rule
            ? <RuleEditor rule={rule} ruleIndex={rules.indexOf(rule)} ruleSetName={name} base={base} segmentId={segmentId} readOnly={readOnly} rules={rules} draftRuleSet={draftRuleSet} issues={issues.rules[rule.id] ?? []} definitions={definitions} onRules={(next) => change({ rules: next })} />
            : <div className="rounded-xl border border-dashed border-border bg-card/50 px-6 py-12 text-center text-sm text-muted-foreground" data-testid="text-rule-missing">This Rule is not in the Rule Set. <Link href={base} className="font-semibold text-primary underline">Back to {name || 'the Rule Set'}</Link></div>
          : <RuleSetPage name={name} rules={rules} base={base} isNew={isNew} readOnly={readOnly} draftRuleSet={draftRuleSet} issues={issues} definitions={definitions} onName={(next) => change({ name: next })} onRules={(next) => change({ rules: next })} onDelete={deleteRuleSet} />}
      </fieldset>
    </form>
  );
}
