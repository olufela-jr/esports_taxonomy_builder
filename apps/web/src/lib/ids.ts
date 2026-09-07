// Immutable identity for Rule Sets, Rules, and Segments. Separate from the
// editable `key` slug so renaming never remounts a component or breaks a reference.
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
