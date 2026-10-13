"use client";

import { CheckIcon, ChevronDownIcon } from "lucide-react";
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
 *   · the panel is `role="listbox"` with `aria-activedescendant`, so it
 *     announces as a listbox and reads the highlighted option rather
 *     than "no item".
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
}): React.JSX.Element {
  const {
    label,
    value,
    onChange,
    options,
    disabled = false,
    warning,
    listLabel,
  } = props;

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const current = options.find((o) => o.value === value) ?? options[0];

  /*
   * Headings and options, in render order.
   *
   * Memoised because `options` is a fresh array on every parent render in at
   * least one caller, and rebuilding rows is cheap but the identity churn
   * would re-run the scroll-into-view effect on every unrelated re-render.
   *
   * Note what navigation still uses: `options`, not `rows`. The arrow keys
   * move an index into the options array, so a heading has no index to be
   * moved onto. Grouping cannot become keyboard-reachable by accident.
   */
  const rows = useMemo(() => buildRows(options), [options]);

  // Portals need a document. Guarded rather than assumed: this renders
  // on the server too.
  useEffect(() => {
    setMounted(true);
  }, []);

  const close = useCallback(
    (returnFocus = true) => {
      setOpen(false);
      if (returnFocus) {
        triggerRef.current?.focus();
      }
    },
    [],
  );

  const choose = useCallback(
    (index: number) => {
      const picked = options[index];
      if (picked) {
        onChange(picked.value);
      }
      close();
    },
    [onChange, close, options],
  );

  // Reset the highlight to whatever is selected each time it opens, and
  // move focus into the panel — otherwise focus stays on the trigger
  // behind the overlay and the arrow keys reach nothing.
  useEffect(() => {
    if (!open) {
      return;
    }
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    panelRef.current?.focus();
  }, [open, options, value]);

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
        setActive((a) => (a + 1) % options.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((a) => (a - 1 + options.length) % options.length);
        break;
      case "Home":
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        e.preventDefault();
        setActive(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        choose(active);
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
            <div
              className="nt-sel__panel"
              ref={panelRef}
              role="listbox"
              id={listId}
              tabIndex={-1}
              aria-label={listLabel ?? label}
              aria-activedescendant={`${listId}-${active}`}
              onKeyDown={onKeyDown}
            >
              <p className="nt-sel__title">{listLabel ?? label}</p>
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
                      key={o.value}
                      id={`${listId}-${i}`}
                      role="option"
                      aria-selected={selected}
                      className={`nt-sel__opt${i === active ? " is-active" : ""}`}
                      // mousedown, not click: fires without waiting for
                      // mouseup, which is what makes it feel immediate.
                      onMouseDown={(e) => {
                        e.preventDefault();
                        choose(i);
                      }}
                      onMouseEnter={() => setActive(i)}
                    >
                      <span className="nt-sel__opt-main">
                        <span className="nt-sel__opt-label">{o.label}</span>
                        {o.hint && <span className="nt-sel__opt-hint">{o.hint}</span>}
                      </span>
                      {selected && <CheckIcon className="nt-sel__tick" aria-hidden="true" />}
                    </li>
                  );
                })}
              </ul>
              <p className="nt-sel__keys" aria-hidden="true">
                ↑↓ move · enter select · esc cancel
              </p>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}