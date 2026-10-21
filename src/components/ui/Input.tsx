/**
 * THE INPUT FAMILY
 * ---------------------------------------------------------------------------
 * HeroUI's form primitives, rebuilt in this app's own idiom: `Input`,
 * `TextArea`, `TextField`, `InputGroup` and `SearchField`.
 *
 * WHAT HEROUI GOT RIGHT HERE
 * ---------------------------------------------------------------------------
 * A field is not a box. HeroUI splits it into parts that each have one
 * job — a LABEL that says what the field is, a DESCRIPTION that says what
 * it means, and an ERROR that says what is wrong — and stacks them with
 * the input itself. A field that is wrong shows all three, so the reader
 * is told what the field is, what it is for, and what went wrong,
 * without any of them having to be re-worded at the call site.
 *
 * The field is also a different shape from a button: HeroUI gives fields
 * their own radius (`--radius-field`, which is the base radius at 1.75×)
 * because a field is a surface you type INTO and a button is a thing you
 * press, and they want to be told apart by touch.
 *
 * THE APP'S OWN TYPE
 * ---------------------------------------------------------------------------
 * The label is the app's `TYPE.label` — a tiny all-caps eyebrow — rather
 * than HeroUI's sentence-case one, because that is what the app's other
 * labels already are and a form that spells its labels differently from
 * the rest of the app looks like a form that came from somewhere else.
 */
import { type ReactNode, forwardRef, useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";

import { useSemantic } from "@/theme/semantic";
import { TYPE } from "@/theme/typography";
import { RADIUS } from "@/theme/radius";

/* ------------------------------------------------------------------ *
 *  the field's parts
 * ------------------------------------------------------------------ */

/** The name of the field. */
export function FieldLabel({
  children,
  required = false,
}: {
  children: ReactNode;
  required?: boolean;
}): React.JSX.Element {
  const s = useSemantic();
  return (
    <Text style={[styles.fieldLabel, { color: s.dim }]}>
      {children}
      {required ? <Text style={{ color: s.danger }}> *</Text> : null}
    </Text>
  );
}

/** What the field means, in a sentence under it. */
export function FieldDescription({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  const s = useSemantic();
  return <Text style={[styles.fieldDescription, { color: s.dim }]}>{children}</Text>;
}

/** What went wrong. */
export function FieldError({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  const s = useSemantic();
  return <Text style={[styles.fieldError, { color: s.danger }]}>{children}</Text>;
}

/* ------------------------------------------------------------------ *
 *  the input
 * ------------------------------------------------------------------ */

export type InputProps = TextInputProps & {
  /** A prefix inside the field, an icon or a unit. */
  startContent?: ReactNode;
  /** A suffix inside the field. */
  endContent?: ReactNode;
  /** The field's own height. */
  minHeight?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * A TEXT FIELD.
 *
 * The box, the border and the focus ring are HeroUI's: a flat field
 * surface, a hairline border, and the border picking up the accent when
 * the field has focus.
 */
export const Input = forwardRef<React.ComponentRef<typeof TextInput>, InputProps>(
  function Input(
    {
      startContent,
      endContent,
      minHeight = 48,
      style,
      onFocus,
      onBlur,
      ...rest
    },
    ref,
  ) {
    const s = useSemantic();
    const [focused, setFocused] = useState(false);

    return (
      <View
        style={[
          styles.inputRow,
          {
            minHeight,
            backgroundColor: s.field,
            borderColor: focused ? s.focus : s.fieldBorder,
            borderRadius: RADIUS.field,
          },
          style,
        ]}
      >
        {startContent !== undefined ? (
          <View style={styles.inputAffix}>{startContent}</View>
        ) : null}

        <TextInput
          {...rest}
          ref={ref}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          placeholderTextColor={s.dim}
          style={[styles.input, { color: s.fieldForeground }]}
        />

        {endContent !== undefined ? (
          <View style={styles.inputAffix}>{endContent}</View>
        ) : null}
      </View>
    );
  },
);

/**
 * A MULTILINE FIELD.
 *
 * The same box as `Input`, taller, and it grows with what is typed into it
 * rather than scrolling a fixed height.
 */
export function TextArea({
  minHeight = 96,
  style,
  onFocus,
  onBlur,
  ...rest
}: TextInputProps & { minHeight?: number; style?: StyleProp<ViewStyle> }): React.JSX.Element {
  const s = useSemantic();
  const [focused, setFocused] = useState(false);

  return (
    <View
      style={[
        styles.inputRow,
        styles.textAreaRow,
        {
          minHeight,
          backgroundColor: s.field,
          borderColor: focused ? s.focus : s.fieldBorder,
          borderRadius: RADIUS.field,
        },
        style,
      ]}
    >
      <TextInput
        {...rest}
        multiline
        textAlignVertical="top"
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        placeholderTextColor={s.dim}
        style={[styles.input, styles.textArea, { color: s.fieldForeground }]}
      />
    </View>
  );
}

/**
 * A LABEL, A FIELD AND WHATEVER ELSE GOES WITH THEM.
 *
 * The composition HeroUI recommends, and the one that stops each call
 * site from having to remember the order the parts go in.
 */
export function TextField({
  label,
  description,
  error,
  required = false,
  children,
  style,
}: {
  label?: string;
  description?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  return (
    <View style={[styles.field, style]}>
      {label !== undefined ? <FieldLabel required={required}>{label}</FieldLabel> : null}
      {children}
      {error !== undefined ? (
        <FieldError>{error}</FieldError>
      ) : description !== undefined ? (
        <FieldDescription>{description}</FieldDescription>
      ) : null}
    </View>
  );
}

/**
 * A FIELD WITH THINGS INSIDE IT.
 *
 * HeroUI's `InputGroup`: a prefix or a suffix that lives INSIDE the
 * field's border, so a currency symbol or a search icon is part of the
 * field rather than next to it.
 */
export function InputGroup({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  return <View style={[styles.inputGroup, style]}>{children}</View>;
}

/**
 * A SEARCH FIELD.
 *
 * An input with a magnifier in it and a button that clears it.
 */
export function SearchField({
  value,
  onChangeText,
  placeholder = "Search",
  onSubmit,
  style,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const s = useSemantic();
  return (
    <Input
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      onSubmitEditing={onSubmit}
      returnKeyType="search"
      clearButtonMode="never"
      startContent={<Text style={[styles.searchGlyph, { color: s.dim }]}>⌕</Text>}
      endContent={
        value.length > 0 ? (
          <Text
            accessibilityRole="button"
            accessibilityLabel="Clear"
            onPress={() => onChangeText("")}
            style={[styles.searchClear, { color: s.dim }]}
          >
            ✕
          </Text>
        ) : undefined
      }
      style={style}
    />
  );
}

const styles = StyleSheet.create({
  field: {
    gap: 6,
    /**
     * The space to the NEXT field.
     *
     * A field is a block, and a block that butts up against the next
     * block reads as one long group rather than as several questions. So
     * there is room between them — but only below, because the label
     * above a field belongs to that field, and the space above the
     * label is what tells the reader a new one has started.
     */
    marginBottom: 18,
  },
  fieldLabel: {
    ...TYPE.label,
  },
  fieldDescription: {
    ...TYPE.small,
  },
  fieldError: {
    ...TYPE.small,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  textAreaRow: {
    alignItems: "flex-start",
    paddingVertical: 10,
  },
  input: {
    ...TYPE.body,
    flex: 1,
    paddingVertical: 0,
    // The box's own height does the work, so the text is centred in it
    // rather than in a line of its own.
    height: "100%",
    minHeight: 46,
  },
  textArea: {
    minHeight: 76,
    height: "auto",
  },
  inputAffix: {
    alignItems: "center",
    justifyContent: "center",
  },
  inputGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchGlyph: {
    ...TYPE.body,
    fontSize: 16,
  },
  searchClear: {
    ...TYPE.small,
    fontSize: 14,
    padding: 2,
  },
});
