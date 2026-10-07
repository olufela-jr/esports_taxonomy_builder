import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { checkDefinition, type Definition, type Rule, type Segment } from '@taxo/shared';
import type { User } from '@/data/auth';
import type { BuildDraft, BuildDraftDraft, OptionalMode, RuleSet, ValueRequest, ValueRequestDraft } from '@/data/store';
import { MultiSelect } from './MultiSelect';
import { buttonPrimary, buttonQuiet, inputClass } from './styles';

// v3 D42 in a batch: a member who finds a value missing requests it; the
// batch's choices are saved as a draft and the segment stays locked, with
// Generate off, until an admin approves. Resuming an approved draft ticks
// the new value. Used by both BatchBuilder and ChildBatchBuilder.

// What the user and the store give a batch for requests and drafts.
export type Drafting = {
  user: User;
  definitions: Definition[];
  requests: ValueRequest[];
  drafts: BuildDraft[];
  onCreateRequest: (draft: ValueRequestDraft) => Promise<ValueRequest>;
  onCreateDraft: (draft: BuildDraftDraft) => Promise<BuildDraft>;
  onUpdateDraft: (id: string, draft: BuildDraftDraft, baseUpdatedAt: string) => Promise<string>;
  onDeleteDraft: (id: string) => Promise<void>;
};

// A batch's own choices, as both builders hold them.
export type BatchState = {
  picked: Record<string, string[]>; // enum codes ticked, by segment key
  lines: Record<string, string>;    // freeform values, one per line, by segment key
  optional: Record<string, OptionalMode>;
  parentText: string;               // a child batch's parent lines; empty otherwise
};

function draftOf(draft: BuildDraft): BuildDraftDraft {
  return { ruleSetId: draft.ruleSetId, ruleId: draft.ruleId, selections: draft.selections, parentName: draft.parentName, ...(draft.optional ? { optional: draft.optional } : {}), blockedSegmentId: draft.blockedSegmentId, blockedSegmentKey: draft.blockedSegmentKey, requestId: draft.requestId, status: draft.status };
}

function valuesOf(stored: string[] | string | undefined): string[] {
  if (stored === undefined) return [];
  return Array.isArray(stored) ? stored : [stored].filter(Boolean);
}

export function useBatchDrafts(drafting: Drafting, ruleSet: RuleSet, rule: Rule, segments: Segment[], state: BatchState, restore: (state: BatchState) => void) {
  const { user, definitions, requests, drafts, onCreateRequest, onCreateDraft, onUpdateDraft, onDeleteDraft } = drafting;
  // The draft this batch is, once a value has been requested or a draft resumed.
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  useEffect(() => { setActiveDraftId(null); }, [rule.id]);

  const activeDraft = drafts.find((draft) => draft.id === activeDraftId && draft.status !== 'done');
  const activeRequest = activeDraft ? requests.find((request) => request.id === activeDraft.requestId) : undefined;
  const blockedKey = activeDraft && activeDraft.status === 'blocked' ? activeDraft.blockedSegmentKey : null;
  const myDrafts = drafts.filter((draft) => draft.ruleId === rule.id && draft.createdBy === user.uid && draft.status !== 'done');

  // Which shared definition a segment reads, from the stored Rule (the
  // resolved one no longer says).
  const definitionFor = (segment: Segment): Definition | undefined => {
    const stored = rule.segments.find((item) => item.id === segment.id);
    const definitionId = stored && stored.kind === 'enum' ? stored.definitionId : undefined;
    return definitionId ? definitions.find((definition) => definition.id === definitionId) : undefined;
  };

  const selections: Record<string, string[]> = {};
  for (const segment of segments) {
    const values = segment.kind === 'enum' ? state.picked[segment.key] ?? [] : (state.lines[segment.key] ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
    if (values.length > 0) selections[segment.key] = values;
  }

  // Throws on failure, for the form to show.
  const send = async (segment: Segment, proposal: { label: string; code: string }, note: string) => {
    const definition = definitionFor(segment);
    if (!definition) return;
    const request = await onCreateRequest({ definitionId: definition.id, label: proposal.label, code: proposal.code, note, requestedByName: user.name, status: 'pending', reason: '' });
    const draft = await onCreateDraft({ ruleSetId: ruleSet.id, ruleId: rule.id, selections, parentName: state.parentText, optional: state.optional, blockedSegmentId: segment.id, blockedSegmentKey: segment.key, requestId: request.id, status: 'blocked' });
    setActiveDraftId(draft.id);
  };

  const resume = async (draft: BuildDraft) => {
    const request = requests.find((item) => item.id === draft.requestId);
    const picked: Record<string, string[]> = {};
    const lines: Record<string, string> = {};
    for (const segment of segments) {
      const values = valuesOf(draft.selections[segment.key]);
      if (segment.kind === 'enum') picked[segment.key] = values;
      else lines[segment.key] = values.join('\n');
    }
    if (draft.status === 'ready' && request) {
      const current = picked[draft.blockedSegmentKey] ?? [];
      picked[draft.blockedSegmentKey] = current.includes(request.code) ? current : [...current, request.code];
    }
    restore({ picked, lines, optional: draft.optional ?? {}, parentText: draft.parentName });
    if (draft.status === 'ready') {
      // The approved value is in the definition now; the draft has done its job.
      setActiveDraftId(null);
      await onUpdateDraft(draft.id, { ...draftOf(draft), status: 'done' }, draft.updatedAt);
    } else {
      setActiveDraftId(draft.id);
    }
  };

  const discard = async (draft: BuildDraft) => {
    if (!window.confirm('Discard this draft? The request stays with the admins.')) return;
    if (activeDraftId === draft.id) setActiveDraftId(null);
    await onDeleteDraft(draft.id);
  };

  return { activeDraft, activeRequest, blockedKey, myDrafts, definitionFor, send, resume, discard };
}

// The form to request a missing value, opened from a segment's dropdown with
// the typed text as the label. Only for a segment that reads a Global definition.
function RequestValue({ segment, definition, initialLabel, onSend, onClose }: { segment: Segment; definition: Definition; initialLabel: string; onSend: (segment: Segment, proposal: { label: string; code: string }, note: string) => Promise<void>; onClose: () => void }) {
  const [label, setLabel] = useState(initialLabel);
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    const proposal = { label: label.trim(), code: code.trim() };
    if (!proposal.label || !proposal.code) { setError('A label and a code are needed.'); return; }
    const collision = checkDefinition({ ...definition, entries: [...definition.entries, proposal] });
    if (collision.length > 0) { setError(collision[0]); return; }
    setBusy(true);
    setError('');
    try {
      await onSend(segment, proposal, note.trim());
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sending the request failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-border/50 bg-muted/20 p-4" data-testid={`form-request-${segment.key}`}>
      <div className="text-[12px] font-bold text-foreground">Request a value for {segment.label}</div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <input className={inputClass} value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Label, e.g. Germany" aria-label="Requested label" data-testid={`input-request-label-${segment.key}`} />
        <input className={`${inputClass} font-mono`} value={code} onChange={(event) => setCode(event.target.value)} placeholder="Code, e.g. de" aria-label="Requested code" data-testid={`input-request-code-${segment.key}`} />
      </div>
      <input className={`${inputClass} mt-2`} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Why it is needed (optional)" aria-label="Note" data-testid={`input-request-note-${segment.key}`} />
      {error && <p className="mt-2 text-[12px] font-semibold text-destructive" data-testid={`text-request-error-${segment.key}`}>{error}</p>}
      <div className="mt-3 flex gap-2"><button type="button" className={buttonPrimary} disabled={busy} onClick={() => void submit()} data-testid={`button-submit-request-${segment.key}`}>{busy ? 'Sending' : 'Send request and save draft'}</button><button type="button" className={buttonQuiet} onClick={onClose}>Cancel</button></div>
    </div>
  );
}

// One segment's controls in a batch, the same in both builders: include, omit
// or both for an optional segment; a searchable multi-select for an enum, one
// value per line for a freeform; the request form and the blocked notice.
type BatchSegmentFieldProps = {
  segment: Segment;
  picked: string[];
  onPicked: (next: string[]) => void;
  lines: string;
  onLines: (text: string) => void;
  mode: OptionalMode;
  onMode: (mode: OptionalMode) => void;
  blocked: boolean;                  // a draft waits on a value requested for this segment
  request: ValueRequest | undefined; // that request, for the notice
  definition: Definition | undefined; // the Global definition it reads, if any
  onSend: (segment: Segment, proposal: { label: string; code: string }, note: string) => Promise<void>;
  onDiscard?: () => void;
};

export function BatchSegmentField({ segment, picked, onPicked, lines, onLines, mode, onMode, blocked, request, definition, onSend, onDiscard }: BatchSegmentFieldProps) {
  // The label typed when a request was asked for; null while no form is open.
  const [requesting, setRequesting] = useState<string | null>(null);
  const canRequest = segment.kind === 'enum' && Boolean(definition) && !blocked;
  return (
    <div data-testid={`batch-segment-${segment.key}`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[13px] font-bold text-foreground">{segment.label}<span className="ml-2 font-mono text-[10px] font-normal text-muted-foreground">{segment.key}</span></span>
        {!segment.required && <div><select className={`${inputClass} h-8 w-auto`} disabled={blocked} value={mode} onChange={(event) => onMode(event.target.value as OptionalMode)} aria-label={`${segment.label}: include, omit or both`} data-testid={`select-batch-optional-${segment.key}`}><option value="include">Include</option><option value="omit">Omit</option><option value="both">Both</option></select></div>}
      </div>
      {mode === 'omit' ? (
        <p className="text-[12px] font-bold text-muted-foreground">Left out of every name.</p>
      ) : segment.kind === 'enum' ? (
        <MultiSelect
          options={segment.allowedValues.map((entry) => ({ value: entry.code, label: entry.label }))}
          selected={picked}
          onChange={onPicked}
          disabled={blocked}
          ariaLabel={segment.label}
          testId={`batch-${segment.key}`}
          onRequest={canRequest ? (typed) => setRequesting(typed) : undefined}
        />
      ) : (
        <textarea className={`${inputClass} h-24 py-2 font-mono`} value={lines} onChange={(event) => onLines(event.target.value)} placeholder="One value per line" data-testid={`textarea-batch-${segment.key}`} />
      )}
      {blocked && request && <BlockedNotice segmentKey={segment.key} request={request} onDiscard={onDiscard} />}
      {canRequest && definition && requesting !== null && <RequestValue key={requesting} segment={segment} definition={definition} initialLabel={requesting} onSend={onSend} onClose={() => setRequesting(null)} />}
    </div>
  );
}

// The notice on the segment a draft is waiting on.
function BlockedNotice({ segmentKey, request, onDiscard }: { segmentKey: string; request: ValueRequest; onDiscard?: () => void }) {
  return (
    <div className="mt-2 rounded-[4px] border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-900" data-testid={`status-build-blocked-${segmentKey}`}>
      <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {request.status === 'rejected' ? `Your request for "${request.label}" (${request.code}) was rejected${request.reason ? `: ${request.reason}` : '.'}` : `Waiting for an admin to approve "${request.label}" (${request.code}). This batch is saved as a draft.`}</span>
      {onDiscard && <button type="button" className="ml-3 underline" onClick={onDiscard} data-testid="button-discard-draft">Discard draft</button>}
    </div>
  );
}

// The user's open drafts for this Rule, with what each one holds.
export function DraftsPanel({ rule, drafts, requests, onResume, onDiscard }: { rule: Rule; drafts: BuildDraft[]; requests: ValueRequest[]; onResume: (draft: BuildDraft) => void; onDiscard: (draft: BuildDraft) => void }) {
  if (drafts.length === 0) return null;
  return (
    <div className="rounded-xl bg-card p-6 shadow-sm border border-border/30" data-testid="section-build-drafts">
      <div className="text-[13px] font-bold text-foreground">Your drafts for {rule.name}</div>
      <ul className="mt-3 flex flex-col gap-2">
        {drafts.map((draft) => {
          const request = requests.find((item) => item.id === draft.requestId);
          const label = request ? `"${request.label}" (${request.code})` : 'a value';
          const held = Object.entries(draft.selections).map(([key, stored]) => [key, valuesOf(stored)] as const).filter(([, values]) => values.length > 0);
          return (
            <li key={draft.id} className="flex flex-col gap-2 rounded-[4px] bg-muted/30 px-3 py-2 text-[12px] sm:flex-row sm:items-center sm:justify-between" data-testid={`row-draft-${draft.id}`}>
              <span className="flex flex-col gap-1 font-semibold text-foreground">
                <span className="font-mono" data-testid={`text-draft-choices-${draft.id}`}>{held.length > 0 ? held.map(([key, values]) => `${key}: ${values.join(', ')}`).join('; ') : 'Nothing chosen yet'}</span>
                <span className="font-normal text-muted-foreground" data-testid={`text-draft-status-${draft.id}`}>{draft.status === 'ready' ? `${label} approved, ready to resume` : request?.status === 'rejected' ? `${label} rejected${request.reason ? `: ${request.reason}` : ''}` : `waiting for ${label}`}</span>
              </span>
              <span className="flex gap-2"><button type="button" className={buttonQuiet} onClick={() => onResume(draft)} data-testid={`button-resume-draft-${draft.id}`}>{draft.status === 'ready' ? 'Resume' : 'Open'}</button><button type="button" className={buttonQuiet} onClick={() => onDiscard(draft)} data-testid={`button-delete-draft-${draft.id}`}>Discard</button></span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
