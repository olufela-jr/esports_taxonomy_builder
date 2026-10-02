import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Plus, X } from 'lucide-react';

// A searchable multi-select for Build's enum segments, where a list can hold
// hundreds of values. The chosen values sit in the field as removable tokens;
// typing filters the list on label or code. Native elements only.

export type MultiSelectOption = { value: string; label: string }; // value is the code

type MultiSelectProps = {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  ariaLabel: string;
  testId: string;
  // Offered as the last row of the list; only for a segment that reads a Global definition.
  onRequest?: (typed: string) => void;
};

// Tokens shown before the rest collapse into "+N more".
const TOKEN_LIMIT = 8;

// The checkbox wording Build always used: the label, and the code beside it when they differ.
export function optionText(option: MultiSelectOption): string {
  return option.label === option.value ? option.label : `${option.label} (${option.value})`;
}

export function MultiSelect({ options, selected, onChange, disabled = false, ariaLabel, testId, onRequest }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  // Close on a click anywhere else, listening only while open.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const typed = query.trim();
  const needle = typed.toLowerCase();
  const shown = needle ? options.filter((option) => option.label.toLowerCase().includes(needle) || option.value.toLowerCase().includes(needle)) : options;
  const exact = options.some((option) => option.label.toLowerCase() === needle || option.value.toLowerCase() === needle);
  const chosen = options.filter((option) => selected.includes(option.value));
  const shownValues = shown.map((option) => option.value);
  const allShownChosen = shown.length > 0 && shown.every((option) => selected.includes(option.value));

  const toggle = (value: string) => onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  // Select all adds what is shown and keeps what was already chosen; Clear removes what is shown.
  const selectShown = () => onChange([...selected, ...shownValues.filter((value) => !selected.includes(value))]);
  const clearShown = () => onChange(selected.filter((value) => !shownValues.includes(value)));
  const openList = () => { if (!disabled) { setOpen(true); input.current?.focus(); } };
  const request = () => { onRequest?.(exact ? '' : typed); setOpen(false); setQuery(''); };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActive((current) => Math.min(current + 1, shown.length - 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((current) => Math.max(current - 1, 0)); }
    else if (event.key === 'Enter') { event.preventDefault(); if (open && shown[active]) toggle(shown[active].value); }
    else if (event.key === 'Escape') { setOpen(false); }
    else if (event.key === 'Backspace' && query === '' && selected.length > 0) { onChange(selected.slice(0, -1)); }
  };

  const listId = `${testId}-list`;
  const visibleTokens = chosen.slice(0, TOKEN_LIMIT);
  return (
    <div ref={root} className="relative">
      <div className={`flex min-h-9 w-full items-center gap-2 rounded-[4px] bg-[#EAE8E3] px-2 py-1.5 text-[13px] font-semibold text-gray-900 shadow-inner transition-all ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-text hover:bg-[#F2F0EB]'} ${open ? 'ring-2 ring-primary' : ''}`} onClick={openList}>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {visibleTokens.map((option) => (
          <span key={option.value} className="inline-flex max-w-[260px] items-center gap-1 rounded-[3px] bg-white px-2 py-0.5 text-[12px] shadow-sm" data-testid={`token-${testId}-${option.value}`}>
            <span className="truncate">{optionText(option)}</span>
            {!disabled && <button type="button" className="rounded-sm text-gray-500 hover:text-gray-900" onClick={(event) => { event.stopPropagation(); toggle(option.value); }} aria-label={`Remove ${option.label}`} data-testid={`button-${testId}-remove-${option.value}`}><X className="h-3 w-3" /></button>}
          </span>
        ))}
        {chosen.length > TOKEN_LIMIT && <button type="button" className="text-[12px] font-bold text-gray-600 hover:text-gray-900" onClick={(event) => { event.stopPropagation(); openList(); }} data-testid={`button-${testId}-more`}>+{chosen.length - TOKEN_LIMIT} more</button>}
        <input
          ref={input}
          className="min-w-[120px] flex-1 bg-transparent px-1 outline-none placeholder:text-gray-500 disabled:cursor-not-allowed"
          value={query}
          disabled={disabled}
          onChange={(event) => { setQuery(event.target.value); setActive(0); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={chosen.length === 0 ? `Search ${options.length.toLocaleString()} ${options.length === 1 ? 'value' : 'values'}` : ''}
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && shown[active] ? `${listId}-${shown[active].value}` : undefined}
          data-testid={`multiselect-${testId}`}
        />
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
      </div>
      {open && !disabled && (
        <div className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-[4px] border border-border bg-card shadow-lg">
          {shown.length > 0 && (
            <div className="flex items-center justify-between border-b border-border/60 px-3 py-1.5 text-[12px] font-bold">
              <span className="text-muted-foreground">{selected.length.toLocaleString()} of {options.length.toLocaleString()} chosen</span>
              <span className="flex gap-3">
                {!allShownChosen && <button type="button" className="text-primary hover:underline" onClick={selectShown} data-testid={`button-${testId}-select-all`}>{needle ? `Select all ${shown.length.toLocaleString()} matching` : 'Select all'}</button>}
                {shown.some((option) => selected.includes(option.value)) && <button type="button" className="text-muted-foreground hover:text-foreground" onClick={clearShown} data-testid={`button-${testId}-clear`}>Clear{needle ? ' matching' : ''}</button>}
              </span>
            </div>
          )}
          <ul id={listId} role="listbox" aria-multiselectable="true" aria-label={ariaLabel} className="max-h-72 overflow-y-auto py-1">
            {shown.map((option, index) => {
              const isChosen = selected.includes(option.value);
              return (
                <li
                  key={option.value}
                  id={`${listId}-${option.value}`}
                  role="option"
                  aria-selected={isChosen}
                  className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[13px] font-semibold text-foreground ${index === active ? 'bg-muted' : ''}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => toggle(option.value)}
                  data-testid={`option-${testId}-${option.value}`}
                >
                  <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border ${isChosen ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>{isChosen && <Check className="h-3 w-3" />}</span>
                  <span className="truncate">{option.label}</span>
                  {option.label !== option.value && <span className="ml-auto font-mono text-[11px] text-muted-foreground">{option.value}</span>}
                </li>
              );
            })}
            {shown.length === 0 && <li className="px-3 py-2 text-[12px] font-semibold text-muted-foreground">No value matches "{typed}".</li>}
          </ul>
          {onRequest && (
            <button type="button" className="flex w-full items-center gap-2 border-t border-border/60 px-3 py-2 text-left text-[12px] font-bold text-muted-foreground hover:bg-muted hover:text-foreground" onMouseDown={(event) => event.preventDefault()} onClick={request} data-testid={`button-${testId}-request`}>
              <Plus className="h-3.5 w-3.5" /> {typed && !exact ? `Request "${typed}"` : 'Request a new value'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
