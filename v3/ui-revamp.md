# UI revamp: rule management made visual

Built 2026-10-01. Authoring used to be one long Author form: every Rule a stacked card, every
segment a stacked card, nothing showing the name a Rule produces or how Rules relate. The user
asked for a UI-only revamp to make rule management intuitive:

- a homepage with three central boxes: Manage Rules, Build, Check
- a Rule Set page showing every Rule, grouped by platform, parents and children as a tree
- a Rule editor with a sticky row of segment chips, an in-place example and a segment drawer
- a Definitions page listing Global and Local value lists together

Constraints set by the user: UI only, no change to the engine, the data model or compose and
parse; every name preview calls `compose`; one reusable `SegmentChipRow` wherever a name is
previewed. Out of scope: promoting a Local list to Global, forking a Global into a Local.

Decided with the user on 2026-10-01, before building:

- Local means an enum segment's own list (`allowedValues` with no `definitionId`). Locals
  are read off the Rule Sets for display; nothing new is stored.
- Author becomes Manage Rules (`/rules`), Dictionary becomes Definitions (`/definitions`), with
  no redirects from the old paths.
- `SegmentChipRow` is for single-name previews only. Batch, Check and Compliance tables of
  many names stay plain text.
- Standard users do not see rule management at all. The super user keeps read-only access.

Five commits, one per step, then these notes. Each step was deployed to Hosting as it landed.

## Step 1: SegmentChipRow and its helpers, used in Build (`6f01345`)

### What changed

- `components/SegmentChipRow.tsx` (new): segment chips with the delimiter as its own chip,
  inherited segments greyed and locked, Global and Local badges, a selected chip, and an
  optional add chip and drag reorder. Modes: `labels` (no name is built), `example` (sample
  values) and `values` (the caller's selections). In both value modes the chips get their
  text from `compose`: its name is split on the delimiter, which no value can contain, and
  compose skips exactly the segments with no value, so the tokens line up with the filled
  segments in order.
- `lib/examples.ts` (new): sample selections only, never a check. An enum's first code, or a
  seeded pick for shuffle; for freeform, a slug of the label without the delimiter or the
  segment's illegal characters, cut to its length.
- `lib/segment-meta.ts` (new): which segments are inherited, from which Rule, and which read a
  definition. `resolveRule` drops `definitionId` and flattens the parents, so this walks the
  stored chain with `ancestorsOf`.
- `lib/use-flip.ts` (new): FLIP reorder animation, measured relative to the container.
- `Breadcrumbs.tsx`, `Drawer.tsx`, `ScopeBadge.tsx` (new), and chip and drawer keyframes in
  `index.css`, all off under `prefers-reduced-motion`.
- `Builder.tsx`: the output, the parent-name example and draft rows as chips, replacing the
  two places that joined values on the delimiter by hand.

### Decisions not spelled out beforehand

- A `badges` switch on the chip row: a Local badge on every chip in Build was noise.
- On the user's review of the first deploy, the Build example moved to the very top of the
  page, visible before anything is chosen. It shows a whole example name, and the first value
  ticked or typed per segment replaces the sample (outlined, the samples stay greyed). This
  landed together with Build going batch only, in the user's commit `5460d8e` from another
  session; the batch builders report their first values up through `onPreview`.

## Step 2: homepage, Manage Rules and Definitions routes (`bc21115`)

### What changed

- `components/Home.tsx` (new): three boxes. Manage Rules shows for admins and the super user;
  Build and Check show the current Rule Set and Rule. `/` no longer redirects to the last
  action. `RulesAdminsOnly` answers a standard user who opens a `/rules` link.
- `App.tsx`: `/rules`, `/rules/new`, `/rules/:ruleSetId`, `/definitions`. A Rule Set opened
  by its URL becomes the persistent context; picking one in the sidebar while in Manage Rules
  opens it.
- `AppShell.tsx`: Home, Manage Rules (admins and super), Build, Check, Compliance,
  Definitions; the brand mark links home; the sidebar scrolls when taller than the window,
  which the extra item made necessary for sign-out at 720px.
- `data/ui-state.ts`: the action paths renamed. A stored `/author` or `/dictionary` falls back
  to the default; the Rule Set and Rule selection carries over.

## Step 3: the Rule Set page, and one draft per Rule Set (`d689d01`)

### What changed

- `components/rules/RuleSetPage.tsx` (new): Rules grouped by platform (the product order, then
  unknown ids, then No platform), each group a tree from `parent.ruleId`. A child whose parent
  is missing, on another platform or on a cycle shows as a root so it is never lost. Each
  node previews its segments as chips, inherited ones first.
- `components/rules/RuleSetWorkspace.tsx` (new): the save bar, the problem count with "show
  me", the conflict banner and Save, around both the Rule Set page and a Rule.
- `components/rules/draft.ts` and `RuleFields.tsx` (new): the old editor's helpers and
  controls, moved unchanged, the updates now keyed by Rule id rather than position.
- `RuleSetEditor.tsx` removed.

### Decisions not spelled out beforehand

- Unsaved edits live in `App` by Rule Set id instead of a leave confirmation. A Rule Set is
  one document, so the Rule editor works on a draft of the whole set; keeping it in `App`
  means moving between the page, its Rules and other actions never loses edits. A full page
  refresh still does, as before. Wouter has no navigation blocker, so a confirm could not
  have covered sidebar links anyway.
- The move-Rule buttons are gone: the tree decides the layout. Array order is still saved,
  and the sidebar select and Compliance still list in it.
- Add Rule opens the new Rule straight away.

## Step 4: the Rule editor's numbered chips and segment drawer (`d7b1608`)

### What changed

- `components/rules/RuleEditor.tsx`: breadcrumbs (Rule Sets, Rule Set, Rule, Segment); a
  sticky chip header under the save bar, styled like Build's example strip; Show example (off
  by default) with a shuffle and the composed name under the chips; the Rule's basics,
  parent, tracking URL and source below.
- `components/rules/SegmentDrawer.tsx` (new): the segment's fields laid out for the drawer,
  with the old test ids. Inherited segments open read only with a link to their own Rule; a
  Global one shows its definition's values and links to Definitions.
- `/rules/:ruleSetId/:ruleId/segments/:segmentId` opens the drawer, the chip highlighted.
- Segments are added from the chip row (the drawer opens on the new one), reordered by drag
  or the drawer's arrows (FLIP), and removed after a 150 ms exit animation.

### Decisions not spelled out beforehand

- Numbered chips, at the user's request: each chip starts with its place in the name, counting
  inherited segments first, so "1 Campaign Type, 2 Market" reads as positions.
- The drawer starts below the save bar, so Save is never covered; the page makes room for it
  on wide screens.

## Step 5: Definitions lists Global and Local value lists together (`915934c`)

### What changed

- `components/Definitions.tsx` (was `Dictionary.tsx`): one list of Global rows (badge,
  platform tags) and Local rows (badge, Rule Set and Rule), each with its number of values and
  "Used by N Rules". Filters: search, All / Global / Local, and a platform, which includes
  unrestricted Global definitions by default. A Global opens at `/definitions/:id`, a Local
  at `/definitions/local/:ruleSetId/:segmentId`, read only with Edit in rule. A usage panel
  lists the Rules, linking admins to the segment's drawer; it replaces the editor's "Used by"
  line. The editor, the member view and requests are unchanged.
- `lib/value-lists.ts` (new): the Local lists and the usage of each list, counting Rules that
  inherit the segment at any depth through `dependentsOf`.

### Decisions not spelled out beforehand

Agreed with the user before building:

- Standard users see Local rows.
- A name search was added.
- Filters reset each visit.

Remaining "shared" wording about definitions now says Global. "Shared workspace", the
Firestore mode label, keeps its word because it means something else.

## Verification

After every step: `pnpm typecheck`, `pnpm test` and the full Playwright suite, all green. At
the end: engine 77 tests, Functions 44, scripts 22, Playwright 75 (60 at the start). The
engine is untouched by the revamp: none of the five commits changes `packages/` (the only
engine change in that range is `checkBaseUrl`, exported by the batch-only commit). New specs:
`ruleset-page.spec.ts`, `rule-editor.spec.ts`, `definitions.spec.ts`; specs that edit Rules
now open them through `openRule`, `openSegment` and `backToRuleSet` in `fixtures.ts`.

Deployed to Hosting after each step (`firebase deploy --only hosting`), with the live bundle
checked against the build each time; the last is `index-DWM2HQAN.js`.

## Left over, worth knowing

- Locals have no identity of their own: the same codes typed into two Rules show as two rows,
  and they are edited only in their Rule. Promote and fork stay out of scope.
- Saving still writes the whole Rule Set: two admins editing different Rules of one set will
  conflict on `updatedAt`, refused safely with Reload offered.
- `ui.lastAction` is still recorded but no longer drives a redirect from `/`.
- The chip header offset assumes the 68px app header and the save bar height
  (`BELOW_SAVE_BAR` in `RuleEditor.tsx`); change them together.
- Reordering by keyboard is through each segment's up and down arrows; drag is mouse only.
- Bundle split, 2026-10-02: the single 995 kB file (292 kB gzipped) is now an app entry of
  23 kB gzipped, vendor files for Firebase (163 kB), React (63 kB) and icons (4 kB), and one
  2 to 11 kB file per screen, loaded on demand and prefetched when idle. The warning limit is
  600 kB because Firebase alone is 549 kB raw. A tab opened before a deploy reloads once if a
  screen file is gone. The full Playwright suite passes against `vite preview` of the
  production build as well as the dev server.

## Follow-up, 2026-10-02: a Rule Set table, segments listed, Global-only badge

On the user's review: the Rule Set page should just find a Rule, and segments should be listed
on the Rule's page rather than clicked into.

- `RuleSetPage.tsx`: the platform groups, trees and chip previews are replaced by one table
  (Rule, Platform, Entity type, Parent, Segments, Problems, remove) with a "Find a Rule"
  filter over name, key, platform and entity type. A row opens the Rule at its own URL.
- `RuleEditor.tsx` and `SegmentCard.tsx` (was `SegmentDrawer.tsx`): every segment, inherited
  ones first, is a card under the sticky chips. Clicking a chip selects and scrolls to its
  card; clicking or typing in a card selects it and lights its chip. Selection is page state,
  so it adds no history; `.../segments/:segmentId` still seeds it, for the Definitions links.
  Adding a segment scrolls to it and focuses its label. `Drawer.tsx` and its CSS are gone.
- `GlobalBadge.tsx` (was `ScopeBadge.tsx`): only Global is tagged, on chips, segments and
  Definitions. No badge means Local. The Definitions scope filter keeps its Local option.
- Playwright: 77 passing; `ruleset-page`, `rule-editor`, `author-hierarchy`, `definitions` and
  `editor-typing` updated for the table, the listed segments and the renamed test ids.

## Build: searchable multi-select for enum values (2026-10-02)

On the user's review: checkboxes do not scale on Build, where a Global definition can hold
hundreds of values.

- `MultiSelect.tsx` (new): a native combobox. Chosen values sit in the field as removable
  tokens ("+N more" past eight); typing filters on label or code; the list offers Select all
  (or Select all N matching) and Clear; Up, Down and Enter pick, Escape closes, Backspace in
  an empty field removes the last token.
- `BatchSegmentField` in `BatchDrafts.tsx`: one segment control for both batch builders
  (optional mode, multi-select or freeform lines, blocked notice, request form), replacing the
  block each carried.
- Requests move inside the dropdown: a Global definition's segment ends its list with
  "Request a new value", or `Request "xyz"` when the typed text matches nothing, which opens
  the request form with the label prefilled. Local lists offer no request, as before.
- The child batch's per-parent narrowing uses the same dropdown, offering only the shared choices.
- Playwright: 79 passing; `pickValues`, `selectAllValues` and `openRequest` in `fixtures.ts`
  drive the dropdown, and two new `batch` cases cover filtering, Backspace and the request row.
