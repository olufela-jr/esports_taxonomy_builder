import { type FormEvent, useState } from 'react';
import { Building2, Check, ExternalLink, Plus, Send, UserPlus } from 'lucide-react';
import { PLATFORMS, platformName } from '@taxo/shared';
import type { MembersService } from '@/data/members';
import type { Store, Tenant } from '@/data/store';
import { checkTenantDraft, type TenantDraft, type TenantsDirectory } from '@/data/tenants';
import { PageHeading } from './PageHeading';
import { buttonPrimary, buttonQuiet, cardClass, inputClass } from './styles';

function message(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

function parseDatasets(text: string): string[] {
  return [...new Set(text.split(',').map((item) => item.trim()).filter(Boolean))];
}

const NEW = '__new__';

type TenantsProps = {
  tenants: Tenant[];
  directory: TenantsDirectory;
  membersService: MembersService;
  viewedTenantId: string | null;
  storeKind: Store['kind'];
  onOpen: (id: string) => void;
};

// The super user's screen: every tenant, a form to create or edit one, and an
// invite for a tenant's first admin. Everything a tenant holds is reached by
// opening it, which switches the workspace the rest of the app shows.
export function Tenants({ tenants, directory, membersService, viewedTenantId, storeKind, onOpen }: TenantsProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId && selectedId !== NEW ? tenants.find((tenant) => tenant.id === selectedId) ?? null : null;

  return (
    <div>
      <PageHeading eyebrow="Super user" title="Tenants" description="Every client workspace. Open one to work in it (read only unless you are an admin there), create a new one, or invite its first admin." action={<button type="button" className={buttonPrimary} onClick={() => setSelectedId(NEW)} data-testid="button-create-tenant"><Plus className="h-4 w-4" /> New tenant</button>} />
      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="space-y-4" data-testid="list-tenants">
          {tenants.length === 0 && <p className="text-xs font-semibold text-muted-foreground" data-testid="text-no-tenants">No tenants yet. Create the first one.</p>}
          {tenants.map((tenant) => (
            <TenantCard key={tenant.id} tenant={tenant} current={tenant.id === viewedTenantId} editing={tenant.id === selectedId} membersService={membersService} storeKind={storeKind} onEdit={() => setSelectedId(tenant.id)} onOpen={() => onOpen(tenant.id)} />
          ))}
        </div>
        <section className="self-start xl:sticky xl:top-[92px]">
          {selectedId ? <TenantEditor key={selectedId} existing={selected} directory={directory} onDone={() => setSelectedId(null)} /> : <div className={`${cardClass} text-[13px] font-bold text-muted-foreground`}>Pick a tenant to edit its name, platforms and allowed datasets, or create a new one.</div>}
        </section>
      </div>
    </div>
  );
}

function TenantCard({ tenant, current, editing, membersService, storeKind, onEdit, onOpen }: { tenant: Tenant; current: boolean; editing: boolean; membersService: MembersService; storeKind: Store['kind']; onEdit: () => void; onOpen: () => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const invite = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setNotice('');
    setError('');
    try {
      const outcome = await membersService.invite(email, 'admin', tenant.id);
      setEmail('');
      setNotice(outcome.status === 'active' ? `${outcome.member.email ?? outcome.member.name} is now an admin of ${tenant.name}.` : `${outcome.invite.email} is invited as admin of ${tenant.name}; their first sign-in joins them.`);
    } catch (cause) {
      setError(message(cause, 'The invite did not go through.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`${cardClass} ${editing ? 'ring-2 ring-primary' : ''}`} data-testid={`card-tenant-${tenant.id}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-muted-foreground" /><h3 className="truncate font-display text-xl font-medium text-foreground">{tenant.name}</h3>{current && <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary" data-testid={`badge-tenant-current-${tenant.id}`}>Open now</span>}</div>
          <div className="mt-1 font-mono text-[11px] text-muted-foreground">{tenant.id}</div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" className={buttonQuiet} onClick={onEdit} data-testid={`button-edit-tenant-${tenant.id}`}>Edit</button>
          <button type="button" className={buttonPrimary} onClick={onOpen} disabled={current} data-testid={`button-open-tenant-${tenant.id}`}><ExternalLink className="h-4 w-4" /> Open</button>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-[12px]">
        <div><dt className="font-bold text-muted-foreground">Platforms</dt><dd className="mt-0.5 font-semibold text-foreground" data-testid={`text-tenant-platforms-${tenant.id}`}>{tenant.config.platforms.length ? tenant.config.platforms.map(platformName).join(', ') : 'All'}</dd></div>
        <div><dt className="font-bold text-muted-foreground">Allowed datasets</dt><dd className="mt-0.5 font-mono font-semibold text-foreground" data-testid={`text-tenant-datasets-${tenant.id}`}>{tenant.config.allowedDatasets.length ? tenant.config.allowedDatasets.join(', ') : 'None yet'}</dd></div>
      </dl>
      <form onSubmit={invite} className="mt-4 flex flex-col gap-2 border-t border-border/40 pt-4 sm:flex-row sm:items-end">
        <label className="flex-1 text-[12px] font-bold text-foreground"><span className="inline-flex items-center gap-1.5"><UserPlus className="h-3.5 w-3.5 text-muted-foreground" /> Invite an admin</span><input type="email" className={`${inputClass} mt-1.5`} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@client.com" data-testid={`input-tenant-admin-email-${tenant.id}`} /></label>
        <button type="submit" className={buttonQuiet} disabled={busy || !email.trim()} data-testid={`button-invite-tenant-admin-${tenant.id}`}><Send className="h-4 w-4" /> {busy ? 'Inviting' : 'Invite'}</button>
      </form>
      {notice && <div className="mt-3 text-[12px] font-semibold text-primary" role="status" data-testid={`text-tenant-notice-${tenant.id}`}>{notice}</div>}
      {error && <div className="mt-3 text-[12px] font-semibold text-destructive" role="alert" data-testid={`text-tenant-invite-error-${tenant.id}`}>{error}</div>}
      {storeKind === 'memory' && !notice && !error && <div className="mt-3 text-[11px] font-semibold text-muted-foreground">Local draft mode: invites are not kept.</div>}
    </div>
  );
}

function TenantEditor({ existing, directory, onDone }: { existing: Tenant | null; directory: TenantsDirectory; onDone: () => void }) {
  const isNew = existing === null;
  const [id, setId] = useState(existing?.id ?? '');
  const [name, setName] = useState(existing?.name ?? '');
  const [platforms, setPlatforms] = useState<string[]>(existing?.config.platforms ?? []);
  const [datasets, setDatasets] = useState((existing?.config.allowedDatasets ?? []).join(', '));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const draft: TenantDraft = { id: id.trim().toLowerCase(), name, config: { allowedDatasets: parseDatasets(datasets), platforms } };
  const problems = checkTenantDraft(draft);
  const togglePlatform = (platform: string) => setPlatforms((current) => (current.includes(platform) ? current.filter((item) => item !== platform) : [...current, platform]));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (problems.length > 0 || saving) return;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      if (isNew) {
        await directory.create(draft);
        onDone();
      } else {
        await directory.update(existing.id, { name: draft.name, config: draft.config });
        setSaved(true);
      }
    } catch (cause) {
      setError(message(cause, 'Saving failed.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className={cardClass} data-testid="form-tenant">
      <div className="flex items-center justify-between"><div className="font-display text-xl font-medium text-foreground">{isNew ? 'New tenant' : `Edit ${existing.name}`}</div><div className="flex items-center gap-2">{saved && <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary" data-testid="text-tenant-saved"><Check className="h-4 w-4" /> Saved</span>}<button type="button" className={buttonQuiet} onClick={onDone} data-testid="button-cancel-tenant">{isNew ? 'Cancel' : 'Close'}</button></div></div>
      <label className="mt-5 block text-[13px] font-bold text-foreground">Tenant id <span className="font-normal text-muted-foreground">(permanent: lowercase letters, digits, hyphens)</span><input className={`${inputClass} mt-2 font-mono`} value={id} onChange={(event) => setId(event.target.value)} disabled={!isNew} placeholder="north-wind" data-testid="input-tenant-id" /></label>
      <label className="mt-4 block text-[13px] font-bold text-foreground">Name<input className={`${inputClass} mt-2`} value={name} onChange={(event) => setName(event.target.value)} placeholder="North Wind Media" data-testid="input-tenant-name" /></label>
      <div className="mt-4 text-[13px] font-bold text-foreground">Platforms <span className="font-normal text-muted-foreground">(none selected means all)</span></div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">{PLATFORMS.map((platform) => <label key={platform.id} className="inline-flex items-center gap-2 text-[13px] font-semibold text-foreground"><input type="checkbox" checked={platforms.includes(platform.id)} onChange={() => togglePlatform(platform.id)} className="h-4 w-4 rounded-sm border-gray-300 text-primary focus:ring-primary" data-testid={`checkbox-tenant-platform-${platform.id}`} /> {platform.name}</label>)}</div>
      <label className="mt-4 block text-[13px] font-bold text-foreground">Allowed BigQuery datasets <span className="font-normal text-muted-foreground">(comma separated; a scan outside this list is refused)</span><input className={`${inputClass} mt-2 font-mono`} value={datasets} onChange={(event) => setDatasets(event.target.value)} placeholder="marketing, marketing_dw" data-testid="input-tenant-datasets" /></label>
      {problems.length > 0 && (id || name) && <ul className="mt-4 list-disc space-y-1 pl-5 text-xs font-semibold text-destructive" data-testid="list-tenant-problems">{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>}
      {error && <div className="mt-4 text-xs font-semibold text-destructive" role="alert" data-testid="text-tenant-error">{error}</div>}
      <button type="submit" className={`${buttonPrimary} mt-5 w-full`} disabled={saving || problems.length > 0} data-testid="button-save-tenant"><Check className="h-4 w-4" /> {saving ? 'Saving' : isNew ? 'Create tenant' : 'Save tenant'}</button>
    </form>
  );
}

// What anyone but the super user sees at /tenants.
export function TenantsSuperOnly() {
  return (
    <div>
      <PageHeading eyebrow="Super user" title="Tenants" description="Only the super user can see and manage tenants." />
    </div>
  );
}
