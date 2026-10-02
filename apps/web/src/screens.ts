import { lazy } from 'react';

// The screens behind the actions, loaded on demand so the first paint only
// needs the shell, Home and sign-in. Each loader is kept so prefetchScreens
// can warm them all once the app is up.
const loaders = {
  builder: () => import('@/components/Builder'),
  checker: () => import('@/components/CsvChecker'),
  compliance: () => import('@/components/Compliance'),
  definitions: () => import('@/components/Definitions'),
  members: () => import('@/components/Members'),
  tenants: () => import('@/components/Tenants'),
  ruleSetList: () => import('@/components/RuleSetList'),
  ruleSetWorkspace: () => import('@/components/rules/RuleSetWorkspace'),
};

export const Builder = lazy(() => loaders.builder().then((module) => ({ default: module.Builder })));
export const CsvChecker = lazy(() => loaders.checker().then((module) => ({ default: module.CsvChecker })));
export const Compliance = lazy(() => loaders.compliance().then((module) => ({ default: module.Compliance })));
export const Definitions = lazy(() => loaders.definitions().then((module) => ({ default: module.Definitions })));
export const Members = lazy(() => loaders.members().then((module) => ({ default: module.Members })));
export const MembersAdminsOnly = lazy(() => loaders.members().then((module) => ({ default: module.MembersAdminsOnly })));
export const Tenants = lazy(() => loaders.tenants().then((module) => ({ default: module.Tenants })));
export const TenantsSuperOnly = lazy(() => loaders.tenants().then((module) => ({ default: module.TenantsSuperOnly })));
export const RuleSetList = lazy(() => loaders.ruleSetList().then((module) => ({ default: module.RuleSetList })));
export const RuleSetWorkspace = lazy(() => loaders.ruleSetWorkspace().then((module) => ({ default: module.RuleSetWorkspace })));

// Fetch every screen while the browser is idle, so moving between actions
// after the first paint never waits. A failed fetch is ignored here; the
// screen's own load retries when it is opened.
export function prefetchScreens(): void {
  const start = () => Object.values(loaders).forEach((load) => void load().catch(() => undefined));
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(start, { timeout: 3000 });
  else setTimeout(start, 1000);
}
