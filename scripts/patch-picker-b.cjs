const fs = require("fs");

const L = (...lines) => lines.join("\n");

function sub(text, from, to, label) {
  const a = text.includes(from) ? from : from.replace(/\n/g, "\r\n");
  const bb = text.includes(to) ? to : to.replace(/\n/g, "\r\n");
  if (!text.includes(a)) {
    console.log(`MISS: ${label}`);
    return text;
  }
  console.log(`ok: ${label}`);
  return text.replace(a, bb);
}

const f = "src/components/ui.tsx";
let b = fs.readFileSync(f, "utf8");

/* ------------------------------------------------------------------ *
 * the icon, for the chevrons
 * ------------------------------------------------------------------ */
b = sub(
  b,
  L('import { useActiveTheme } from "@/theme/ThemeProvider";'),
  L(
    'import { Icon } from "@/components/icons";',
    'import { useActiveTheme } from "@/theme/ThemeProvider";',
  ),
  "the icon import",
);

/* ------------------------------------------------------------------ *
 * the group type
 * ------------------------------------------------------------------ */
b = sub(
  b,
  L(
    "export type SelectFilter = {",
    "  /** The label on the switch. */",
    "  readonly label: string;",
    "  /** Whether the filter is on. */",
    "  readonly active: boolean;",
    "  /** Called when the switch is flipped. */",
    "  readonly onToggle: () => void;",
    "  /** Which options survive the filter when it is on. */",
    "  readonly matches: (option: SelectOption) => boolean;",
    "};",
  ),
  L(
    "export type SelectFilter = {",
    "  /** The label on the switch. */",
    "  readonly label: string;",
    "  /** Whether the filter is on. */",
    "  readonly active: boolean;",
    "  /** Called when the switch is flipped. */",
    "  readonly onToggle: () => void;",
    "  /** Which options survive the filter when it is on. */",
    "  readonly matches: (option: SelectOption) => boolean;",
    "};",
    "",
    "/**",
    " * A GROUP OF OPTIONS UNDER A HEADING.",
    " *",
    " * A picker whose options come from different sources — the models one",
    " * provider offers, say — is a list of lists, and a flat list of them loses",
    " * where each one came from. So the sheet can be given GROUPS instead of",
    " * options, and a heading opens to show what is under it.",
    " *",
    " * The heading is what the reader sees when the group is closed, so the",
    " * heading carries the group: collapsing a provider's models out of its name",
    " * leaves the provider, and nothing else.",
    " */",
    "export type SelectGroup = {",
    "  /** A stable id, so a group can be opened, closed and remembered. */",
    "  readonly id: string;",
    "  /** The heading the group is shown under. */",
    "  readonly label: string;",
    "  /** The options under it. */",
    "  readonly options: ReadonlyArray<SelectOption>;",
    "  /** A second line under the heading — \"loading\", a count, a hint. */",
    "  readonly detail?: string;",
    "};",
  ),
  "the group type",
);

/* ------------------------------------------------------------------ *
 * the component
 * ------------------------------------------------------------------ */
b = sub(
  b,
  L(
    "export function Select({",
    "  label,",
    "  value,",
    "  options,",
    "  onChange,",
    "  placeholder = \"choose one\",",
    "  disabled = false,",
    "  filter,",
    "  style,",
    "}: {",
    "  /** The name of the thing being chosen, shown above the trigger. */",
    "  label?: string;",
    "  /** The chosen value. */",
    "  value: string | null;",
    "  readonly options: ReadonlyArray<SelectOption>;",
    "  readonly onChange: (value: string) => void;",
    "  readonly placeholder?: string;",
    "  readonly disabled?: boolean;",
    "  /** An optional filter, shown at the top of the sheet. */",
    "  readonly filter?: SelectFilter;",
    "  style?: StyleProp<ViewStyle>;",
    "}): React.JSX.Element {",
    "  const theme = useActiveTheme();",
    "  const [open, setOpen] = useState(false);",
    "",
    "  const chosen = options.find((o) => o.value === value) ?? null;",
  ),
  L(
    "export function Select({",
    "  label,",
    "  value,",
    "  options,",
    "  onChange,",
    "  placeholder = \"choose one\",",
    "  disabled = false,",
    "  filter,",
    "  triggerLabel,",
    "  chevron = true,",
    "  groups,",
    "  onGroupOpen,",
    "  style,",
    "}: {",
    "  /** The name of the thing being chosen, shown above the trigger. */",
    "  label?: string;",
    "  /** The chosen value. */",
    "  value: string | null;",
    "  readonly options: ReadonlyArray<SelectOption>;",
    "  readonly onChange: (value: string) => void;",
    "  readonly placeholder?: string;",
    "  readonly disabled?: boolean;",
    "  /** An optional filter, shown at the top of the sheet. */",
    "  readonly filter?: SelectFilter;",
    "  /**",
    "   * What the trigger says, whatever is chosen.",
    "   *",
    "   * A trigger that names the chosen thing is right for a form, where the",
    "   * field has to say what is in it. It is wrong for a control that sits in a",
    "   * row of other controls, where the name of the thing is already beside it",
    "   * and the trigger's only job is to open the list.",
    "   */",
    "  readonly triggerLabel?: string;",
    "  /** Whether the trigger carries a chevron. */",
    "  readonly chevron?: boolean;",
    "  /**",
    "   * The options, grouped under headings.",
    "   *",
    "   * When these are given they are what the sheet lists, and `options` is",
    "   * ignored. A heading opens to show what is under it.",
    "   */",
    "  readonly groups?: ReadonlyArray<SelectGroup>;",
    "  /**",
    "   * Called when a group is opened.",
    "   *",
    "   * So a group can be filled in when it is opened rather than all at once,",
    "   * which matters when its options are a network call away.",
    "   */",
    "  readonly onGroupOpen?: (group: SelectGroup) => void;",
    "  style?: StyleProp<ViewStyle>;",
    "}): React.JSX.Element {",
    "  const theme = useActiveTheme();",
    "  const [open, setOpen] = useState(false);",
    "  /** The groups the reader has opened. A group is a disclosure, not a",
    "   * navigation, so it is remembered while the sheet is open. */",
    "  const [opened, setOpened] = useState<ReadonlyArray<string>>([]);",
    "",
    "  const chosen = options.find((o) => o.value === value) ?? null;",
  ),
  "the props",
);

/* ------------------------------------------------------------------ *
 * the trigger
 * ------------------------------------------------------------------ */
b = sub(
  b,
  L(
    "        accessibilityValue={{ text: chosen?.label ?? placeholder }}",
  ),
  L(
    "        accessibilityValue={{ text: triggerLabel ?? chosen?.label ?? placeholder }}",
  ),
  "the trigger's accessible value",
);

b = sub(
  b,
  L(
    "        <Text",
    "          style={[",
    "            styles.selectValue,",
    "            { color: chosen === null ? theme.tokens.fgDim : theme.tokens.fg },",
    "          ]}",
    "          numberOfLines={1}",
    "        >",
    "          {chosen?.label ?? placeholder}",
    "        </Text>",
    "        <Text style={[styles.selectChevron, { color: theme.tokens.fgDim }]}>▾</Text>",
  ),
  L(
    "        <Text",
    "          style={[",
    "            styles.selectValue,",
    "            {",
    "              color:",
    "                triggerLabel !== undefined || chosen === null",
    "                  ? theme.tokens.fgDim",
    "                  : theme.tokens.fg,",
    "            },",
    "          ]}",
    "          numberOfLines={1}",
    "        >",
    "          {triggerLabel ?? chosen?.label ?? placeholder}",
    "        </Text>",
    "        {chevron ? (",
    "          <View style={styles.selectChevron}>",
    "            <Icon name=\"chevronDown\" size={16} tone=\"dim\" />",
    "          </View>",
    "        ) : null}",
  ),
  "the trigger",
);

fs.writeFileSync(f, b, "utf8");
console.log("ui.tsx — part one written");
