/**
 * THE CARD
 * ---------------------------------------------------------------------------
 * HeroUI's Card, rebuilt in this app's own idiom.
 *
 * THE ANATOMY IS THE POINT
 * ---------------------------------------------------------------------------
 * HeroUI's Card is not a box with a border. It is three PARTS — a header,
 * a content area and a footer — and the parts are optional, so a card can
 * be a title and a body, or a body and a row of actions, or all three.
 *
 * That is worth having because it is what a card on a phone actually is:
 * a title at the top, the thing in the middle, and the things you can do
 * at the bottom. A card that is one undifferentiated box makes the reader
 * guess which of those three a given row of text is.
 *
 * So this is a compound component — `Card.Header`, `Card.Content`,
 * `Card.Footer` — and the parts compose the way HeroUI's do.
 *
 * THE SURFACE IS STILL THE APP'S
 * ---------------------------------------------------------------------------
 * The fill, the grain and the hairline are `GlassPanel`, because that is
 * the app's ONE container treatment and a card that looked like anything
 * else would be a second product. What HeroUI contributes here is the
 * STRUCTURE and the SPACING: a header's title is a step above the body,
 * a footer's actions sit on a separator, and the three parts are spaced
 * the way HeroUI spaces them.
 */
import { type ReactNode, createContext, useContext } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { useSemantic } from "@/theme/semantic";
import { TYPE } from "@/theme/typography";
import { RADIUS } from "@/theme/radius";
import { GlassPanel } from "@/components/ui/GlassPanel";

type CardContextValue = {
  readonly surface: string;
  readonly muted: string;
  readonly dim: string;
  readonly separator: string;
};

const CardContext = createContext<CardContextValue | null>(null);

function useCard(): CardContextValue {
  const ctx = useContext(CardContext);
  if (ctx === null) {
    throw new Error("Card parts must be used inside a Card");
  }
  return ctx;
}

export type CardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  strength?: "soft" | "medium" | "solid";
  radius?: number;
  /** Removes the padding, for a card whose content bleeds to the edge. */
  flush?: boolean;
};

/**
 * A CARD.
 *
 * The surface is `GlassPanel` — opaque `bg1`, grain, a hairline — and
 * the parts inside it are HeroUI's.
 */
function CardRoot({
  children,
  style,
  strength = "soft",
  radius = RADIUS.panel,
  flush = false,
}: CardProps): React.JSX.Element {
  const s = useSemantic();

  return (
    <CardContext.Provider
      value={{
        surface: s.surface,
        muted: s.muted,
        dim: s.dim,
        separator: s.separator,
      }}
    >
      <GlassPanel
        strength={strength}
        padding={flush ? 0 : 16}
        radius={radius}
        style={style}
      >
        {children}
      </GlassPanel>
    </CardContext.Provider>
  );
}

/**
 * THE TOP OF A CARD.
 *
 * A title, and whatever else belongs beside it. HeroUI puts the title at
 * the size of a section heading and a description under it at body size.
 */
export function CardHeader({
  title,
  description,
  action,
  children,
  style,
}: {
  title?: string;
  description?: string;
  /** Something at the trailing edge — a badge, a button. */
  action?: ReactNode;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const c = useCard();
  return (
    <View style={[styles.header, style]}>
      <View style={styles.headerText}>
        {title !== undefined ? (
          <Text style={[styles.headerTitle, { color: c.surface }]}>{title}</Text>
        ) : null}
        {description !== undefined ? (
          <Text style={[styles.headerDescription, { color: c.muted }]}>{description}</Text>
        ) : null}
        {children}
      </View>
      {action !== undefined ? <View style={styles.headerAction}>{action}</View> : null}
    </View>
  );
}

/** The body of a card. */
export function CardContent({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  return <View style={[styles.content, style]}>{children}</View>;
}

/**
 * THE BOTTOM OF A CARD.
 *
 * Where the actions go, on a separator so they read as a footer rather
 * than as more body.
 *
 * The row is the default, because most footers are a row of two or three
 * buttons. A footer that holds ONE action wants the action to fill the
 * width — the card's width, edge to edge — and that is what `column` is
 * for: it stacks, so a full-width child is a full-width child.
 */
export function CardFooter({
  children,
  column = false,
  style,
}: {
  children: ReactNode;
  /** Stacks the footer's children instead of laying them in a row. */
  column?: boolean;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const c = useCard();
  return (
    <View
      style={[
        styles.footer,
        column ? styles.footerColumn : null,
        { borderTopColor: c.separator },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const CompoundCard = Object.assign(CardRoot, {
  Header: CardHeader,
  Content: CardContent,
  Footer: CardFooter,
});

export { CompoundCard as Card };

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  headerText: {
    flex: 1,
    gap: 3,
  },
  headerTitle: {
    ...TYPE.heading,
  },
  headerDescription: {
    ...TYPE.small,
    lineHeight: 19,
  },
  headerAction: {
    alignItems: "flex-end",
  },
  content: {
    gap: 10,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerColumn: {
    flexDirection: "column",
    alignItems: "stretch",
  },
});
