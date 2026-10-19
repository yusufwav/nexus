"use client";

import { CheckIcon, ChevronDownIcon, SearchIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * CENTERED SELECT
 * ------------------------------------------------------------
 * One dropdown, used by the model picker and the feedback form, because
 * both had the same three problems with a native `<select>` and both
 * needed the same answer:
 *
 *   · it renders as the platform's own control — a grey rounded box that
 *     ignores the palette entirely;
 *   · its options cannot show two lines, and the model picker needs the
 *     slug beside the friendly name, and the feedback form needs to say
 *     what each kind means;
 *   · it renders in place, which on a phone is either off-screen or
 *     under the page chrome.
 *
 * WHY A PORTAL
 * ------------------------------------------------------------
 * The model dropdown used to be `position: absolute` inside the chat
 * header, and it rendered BEHIND the glass. That is not a z-index
 * mistake to be fixed with a bigger number: the header carries
 * `backdrop-filter`, which creates a stacking context, so the dropdown's
 * z-index was scoped to inside that context and could not lift itself
 * above anything outside it. No value of z-index fixes that.
 *
 * Rendering into <body> through a portal puts the overlay outside every
 * ancestor stacking context on the page, so "topmost" is structural
 * rather than a number that has to keep winning.
 *
 * WHY CENTRED
 * ------------------------------------------------------------
 * A dropdown anchored to a control is unusable when the control is near
 * an edge, which on a phone it always is. Opening as a centred sheet
 * puts every option in the same reachable place regardless of where the
 * trigger sits.
 *
 * WHAT A NATIVE CONTROL GAVE AWAY, AND WHAT IS EARNED BACK HERE
 * ------------------------------------------------------------
 * Keyboard navigation, Escape, focus return, type-ahead and the
 * screen-reader wiring all came free from `<select>`. This reimplements
 * them rather than assuming them:
 *
 *   · focus moves into the panel on open and returns to the trigger on
 *     close, so a keyboard user is never stranded on <body>;
 *   · arrows / Home / End move the highlighted option, Enter selects,
 *     Escape cancels, Tab dismisses without selecting;
 *   · the options live in a `role="listbox"` with `aria-activedescendant`,
 *     so it announces as a listbox and reads the highlighted option
 *     rather than "no item".
 *
 * AND THE SEARCH FIELD, WHICH IS OPT-IN
 * ------------------------------------------------------------
 * `searchable` adds a filter above the list. It is off by default
 * because the two callers do not have the same problem: the model
 * picker lists fifteen models on a quiet day and several hundred on an
 * awkward one, while the feedback form offers five kinds of message. A
 * search box over five options is furniture, and furniture in the tab
 * order is a cost paid by everyone to help one of them.
 *
 * Two details that are load-bearing rather than polish:
 *
 *   · Space is NOT swallowed. It still selects when there is no field,
 *     because that is what a listbox does; with a field open it types a
 *     space, because "gpt 4" is the single most common thing anybody
 *     types into a model list and a field that eats the space makes it
 *     unsearchable.
 *   · The field is OUTSIDE the listbox. `role="listbox"` permits options
 *     and groups and nothing else; assistive technology counts children
 *     to announce "item N of M", so a text field inside makes every
 *     index wrong and the list reads as broken rather than as filtered.
 */

export type SelectOption = {
  readonly value: string;
  readonly label: string;
  /** Second line: the slug, or a short explanation. */
  readonly hint?: string;
  /**
   * Heading this option sits under, rendered above the first option of each
   * group. Optional, and only the FIRST option of a group needs to carry it -
   * the rest inherit from the run.
   *
   * This is a flat list with headings, not nested groups, on purpose. Every
   * index in this component (`active`, `aria-activedescendant`, the id on each
   * row) is an index into one array; nesting would mean a second addressing
   * scheme and two places for the keyboard to disagree with the screen
   * reader. A heading is just another row that is not selectable.
   */
  readonly group?: string;
  /**
   * A control at the right of this row that is NOT part of choosing the
   * option — the model picker's favourite star is the reason this exists.
   *
   * The row selects on `mousedown`, which is what makes it feel immediate,
   * and that means a plain click handler on a button inside the row would
   * fire the row's own handler first and select the model as a side effect
   * of starring it. Anything rendered here must therefore carry
   * `data-sel-action`, and the row checks for it before selecting.
   */
  readonly trailing?: React.ReactNode;
  /**
   * This row's React key, when it cannot be `value`.
   *
   * `value` is the option's identity as a CHOICE — what selecting it means
   * — and it is not the same thing as its identity as a ROW. The model
   * picker lists a starred model twice on purpose: once at the top under
   * "favourites", and once in its provider's own section where it can be
   * un-starred. Both rows carry the same `value`, because choosing either
   * one has to choose the same model, and keying on `value` made React
   * warn about two children with the same key — which costs identity
   * across updates and, more visibly, means the two rows can be confused
   * for each other by anything keyed that way.
   *
   * Default is `value`, which is right for every list where an option
   * appears once. Override only where it appears twice.
   */
  readonly rowKey?: string;
};

/**
 * Rows to render: options plus the headings between them.
 *
 * Returned as a discriminated union rather than computed inline in JSX so the
 * keyboard navigation and the render agree by construction - both read the
 * same list, so there is no way for a heading to become reachable by arrow
 * key while looking unreachable on screen.
 */
type Row =
  | { readonly kind: "heading"; readonly text: string }
  | { readonly kind: "option"; readonly option: SelectOption; readonly index: number };

function buildRows(options: readonly SelectOption[]): Row[] {
  const rows: Row[] = [];
  let currentGroup: string | undefined;
  for (const [index, option] of options.entries()) {
    // A heading is emitted on a CHANGE of group, so repeating the same group
    // name across consecutive options does not print it ten times.
    if (option.group !== undefined && option.group !== currentGroup) {
      rows.push({ kind: "heading", text: option.group });
      currentGroup = option.group;
    }
    rows.push({ kind: "option", option, index });
  }
  return rows;
}
/**
 * Does this option survive what the reader typed?
 *
 * Three fields, not one, because the model picker needs all three to be
 * useful: the friendly name ("nemotron 3.5 lightning"), the slug beside
 * it ("nvidia/nemotron-3.5-lightning:free") and the provider heading it
 * sits under. Somebody who has seen the id on a provider's own page and
 * somebody who has seen the name in a blog post are looking for
 * different strings in the same list, and either should find it.
 *
 * Normalised rather than lowercased, so a pasted slug with the spacing
 * people actually type ("nemotron 3.5") matches the label's spacing
 * instead of only matching "nemotron-3.5".
 */
function matchesQuery(option: SelectOption, query: string): boolean {
  const haystack = [option.label, option.hint ?? "", option.group ?? ""]
    .join(" ")
    .toLowerCase()
    .replace(/[\s_/-]+/g, "");
  return haystack.includes(query.replace(/[\s_/-]+/g, ""));
}

export default function CenteredSelect(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  disabled?: boolean;
  /** Rendered under the trigger, e.g. "no key saved". */
  warning?: string;
  /** Accessible name for the listbox when `label` is visual-only. */
  listLabel?: string;
  /**
   * Show a filter field above the list.
   *
   * Opt-in rather than always-on because this component has two callers
   * and they do not have the same problem: the model picker lists
   * anywhere between fifteen and several hundred models depending on
   * what the provider is currently offering, while the feedback form
   * offers five kinds of message. A search box over five options is
   * furniture, and furniture that has to be tabbed past before the list
   * is a cost paid by everyone to help one of them.
   */
  searchable?: boolean;
  /** Placeholder for the filter field. */
  searchPlaceholder?: string;
}): React.JSX.Element {
  const {
    label,
    value,
    onChange,
    options,
    disabled = false,
    warning,
    listLabel,
    searchable = false,
    searchPlaceholder = "search",
  } = props;

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const searchId = useId();

  /*
    THE CURRENT VALUE IS READ FROM THE UNFILTERED LIST.

    Tempting to read it from `visible` too, and wrong: the trigger has to
    keep naming the selected option while a filter is narrowing the list,
    or the control's own label empties out the moment somebody types and
    there is no way back to what is currently chosen without closing the
    panel again.
  */
  const current = options.find((o) => o.value === value) ?? options[0];

  /*
    WHAT IS SHOWN, AND WHAT THE ARROW KEYS MOVE OVER, ARE THE SAME LIST.

    One `visible`, used by the render and by navigation together, so the
    highlighted row cannot be an option that is not on screen. Indexes
    are into `visible`, which is why `choose` reads `visible[index]` and
    not `options[index]` - the two differ as soon as anything is
    filtered, and reading the wrong one selects a different model than
    the row the reader pressed Enter on.

    Memoised because `options` is a fresh array on every parent render in
    at least one caller, and rebuilding rows is cheap but the identity
    churn would re-run the scroll-into-view effect on every unrelated
    re-render.
  */
  const visible = useMemo(
    () => (query.trim() === "" ? options : options.filter((o) => matchesQuery(o, query))),
    [options, query],
  );
  const rows = useMemo(() => buildRows(visible), [visible]);

  // Portals need a document. Guarded rather than assumed: this renders
  // on the server too.
  useEffect(() => {
    setMounted(true);
  }, []);

  const close = useCallback(
    (returnFocus = true) => {
      setOpen(false);
      // Cleared on close rather than left for the next open to find, so
      // reopening the picker starts from the whole list every time
      // instead of from whatever the reader was last grepping for.
      setQuery("");
      if (returnFocus) {
        triggerRef.current?.focus();
      }
    },
    [],
  );

  const choose = useCallback(
    (index: number) => {
      const picked = visible[index];
      if (picked) {
        onChange(picked.value);
      }
      close();
    },
    [onChange, close, visible],
  );

  // Reset the highlight to whatever is selected each time it opens, and
  // move focus into the panel - otherwise focus stays on the trigger
  // behind the overlay and the arrow keys reach nothing. With a filter
  // field open it goes to the field, because that is where typing has to
  // land for it to do anything at all; without one, the listbox itself.
  useEffect(() => {
    if (!open) {
      return;
    }
    setActive(Math.max(0, visible.findIndex((o) => o.value === value)));
    if (searchable) {
      searchRef.current?.focus();
    } else {
      listboxRef.current?.focus();
    }
  }, [open, visible, value, searchable]);

  /*
    A NEW FILTER IS A NEW LIST, so the highlight goes back to the top.

    Without this, typing one character over a list where the highlight sat
    on row 40 leaves `active` pointing at row 40 of a list that now has
    three rows - Enter selects whatever happens to be in the 40th slot of
    the new list, which is `undefined` and silently selects nothing.

    Clamped rather than reset too, so a highlight that IS still in range
    survives typing an unrelated character and the reader does not lose
    their place mid-search.
  */
  useEffect(() => {
    setActive((a) => (a >= visible.length ? 0 : a));
  }, [visible.length]);

  // Keep the highlighted option in view.
  useEffect(() => {
    if (!open) {
      return;
    }
    const el = panelRef.current?.querySelector<HTMLElement>(`#${CSS.escape(`${listId}-${active}`)}`);
    el?.scrollIntoView({ block: "nearest" });
  }, [open, active, listId]);

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        close();
        break;
      case "ArrowDown":
        e.preventDefault();
        if (visible.length > 0) {
          setActive((a) => (a + 1) % visible.length);
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        if (visible.length > 0) {
          setActive((a) => (a - 1 + visible.length) % visible.length);
        }
        break;
      case "Home":
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        e.preventDefault();
        setActive(visible.length - 1);
        break;
      case "Enter":
      case " ":
        // Only Enter commits. Space types a space into the filter field,
        // and swallowing it would make searching for "gpt 4" impossible
        // - which is the single most common thing anybody types into a
        // model list.
        if (e.key === "Enter") {
          e.preventDefault();
          choose(active);
        } else if (!searchable) {
          e.preventDefault();
          choose(active);
        }
        break;
      case "Tab":
        // Tabbing away is a dismissal, not a selection.
        close(false);
        break;
      default:
        break;
    }
  }

  return (
    <div className="nt-sel">
      <button
        type="button"
        ref={triggerRef}
        className="nt-sel__btn"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
      >
        <span className="nt-sel__lbl">{label}</span>
        <span className="nt-sel__cur">{current?.label ?? "—"}</span>
        <ChevronDownIcon className="nt-sel__chev" aria-hidden="true" />
      </button>

      {warning && (
        <span className="nt-sel__warn">{warning}</span>
      )}

      {mounted &&
        open &&
        createPortal(
          <div className="nt-sel__overlay nt-root">
            {/*
              `nt-root` ON THE OVERLAY, and it is load-bearing rather than
              decoration. The design tokens are declared on `.nt-root`
              (tokens.css), NOT on `:root`, so a node portalled to
              <body> falls outside their scope entirely: `--bg-2`,
              `--surface-bar`, `--fg` and the radii all resolve to
              nothing, and the panel renders fully transparent — options
              floating over the page with no surface and no scrim. That
              is what the first version did, and it passed every geometry
              assertion in the test, because it IS positioned correctly
              and DOES hit-test correctly; only looking at it showed the
              problem. Carrying the class puts the overlay back inside
              the token scope wherever it ends up mounted.
            */}
            {/* The scrim. Clicking it is the same as Escape: dismiss
                without selecting. */}
            <div className="nt-sel__scrim" onMouseDown={() => close(false)} />
            <div className="nt-sel__panel" ref={panelRef} onKeyDown={onKeyDown}>
              <p className="nt-sel__title">{listLabel ?? label}</p>

              {searchable && (
                <div className="nt-sel__searchwrap">
                  <SearchIcon className="nt-sel__searchicon" aria-hidden="true" />
                  <input
                    ref={searchRef}
                    id={searchId}
                    className="nt-sel__search"
                    type="text"
                    value={query}
                    /*
                      THIS ONE LINE IS THE WHOLE FEATURE.

                      It was missing. `value={query}` with no `onChange`
                      is a controlled field React renders READ-ONLY, and
                      it warns about exactly that in development — so the
                      search box looked perfect, took focus, showed the
                      right placeholder, and silently refused every
                      keystroke. The only reason it was caught is that
                      somebody opened the page and read the console
                      rather than asserting that the component renders.
                    */
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={searchPlaceholder}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-label={`Search ${listLabel ?? label}`}
                    aria-controls={listId}
                  />
                  {query !== "" && (
                    <button
                      type="button"
                      className="nt-sel__searchclear"
                      onClick={() => {
                        setQuery("");
                        searchRef.current?.focus();
                      }}
                      aria-label="Clear search"
                    >
                      <XIcon aria-hidden="true" />
                    </button>
                  )}
                </div>
              )}

              {/*
                THE LISTBOX IS ITS OWN ELEMENT, AND THE SEARCH FIELD IS
                NOT INSIDE IT.

                `role="listbox"` is a contract about what may be inside:
                options, groups, and nothing else. A text field as a
                direct child of a listbox is outside that contract, and
                the failure mode is not cosmetic - assistive technology
                counts children to announce "item N of M", so a search
                field in there makes every index wrong and turns the
                whole list into something that reads as broken rather
                than as a control with a filter on it.

                So the panel is an ordinary div that owns the keys and the
                chrome, and the listbox wraps only the rows. The panel
                stays the keyboard handler because a key press in the
                search field bubbles up to it, which is what lets typing
                and arrow-moving share one handler.
              */}
              <div
                className="nt-sel__listbox"
                role="listbox"
                id={listId}
                ref={listboxRef}
                tabIndex={-1}
                aria-label={listLabel ?? label}
                aria-activedescendant={visible.length > 0 ? `${listId}-${active}` : undefined}
              >
                {visible.length === 0 ? (
                  <p className="nt-sel__none">
                    nothing matches <b>{query.trim()}</b>
                  </p>
                ) : (
                  <ul className="nt-sel__list">
                  {rows.map((row) => {
                    /*
                     * A heading is presentation only.
                     *
                     * role="presentation" removes it from the accessibility
                     * tree, which is what stops a screen reader counting it as
                     * an option and reporting "3 of 42" where 3 is a heading.
                     * The visible text stays in the list for sighted users, so
                     * the grouping is not sighted-only.
                     */
                    if (row.kind === "heading") {
                      return (
                        <li key={`h-${row.text}`} role="presentation" className="nt-sel__group">
                          {row.text}
                        </li>
                      );
                    }

                    const { option: o, index: i } = row;
                    const selected = o.value === value;
                    return (
                      <li
                        /* `rowKey` when given, `value` otherwise - see the
                           note on SelectOption.rowKey. The value alone is
                           NOT a safe key once one option can appear in
                           two sections. */
                        key={o.rowKey ?? o.value}
                        id={`${listId}-${i}`}
                        role="option"
                        aria-selected={selected}
                        className={`nt-sel__opt${i === active ? " is-active" : ""}`}
                        // mousedown, not click: fires without waiting for
                        // mouseup, which is what makes it feel immediate.
                        onMouseDown={(e) => {
                          // A row can carry a control that is not part of
                          // choosing it (see `trailing` on SelectOption).
                          // Starring a model must not also select it.
                          if ((e.target as HTMLElement).closest("[data-sel-action]")) {
                            return;
                          }
                          e.preventDefault();
                          choose(i);
                        }}
                        onMouseEnter={() => setActive(i)}
                      >
                        <span className="nt-sel__opt-main">
                          <span className="nt-sel__opt-label">{o.label}</span>
                          {o.hint && <span className="nt-sel__opt-hint">{o.hint}</span>}
                        </span>
                        {o.trailing}
                        {/*
                          The tick always occupies its slot, visible or
                          not. Rendering it only when selected makes the
                          whole list jump sideways by one glyph every time
                          the highlight moves onto a different row, which
                          is most of the time while arrow-keying.
                        */}
                        <CheckIcon
                          className={`nt-sel__tick${selected ? "" : " nt-sel__tick--off"}`}
                          aria-hidden="true"
                        />
                      </li>
                    );
                  })}
                  </ul>
                )}
              </div>

              <p className="nt-sel__keys" aria-hidden="true">
                {searchable
                  ? "type to filter · ↑↓ move · enter select · esc cancel"
                  : "↑↓ move · enter select · esc cancel"}
              </p>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}