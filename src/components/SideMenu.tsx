/**
 * THE SIDE MENU
 * ---------------------------------------------------------------------------
 * A RECREATION OF THE STAGGERED MENU, IN NATIVE PARTS.
 *
 * The reference is `C:\Users\yusuf\orca\projects\IDEAS\components\
 * staggered-menu` — the React Bits component, recreated there as a page. It
 * is a panel that slides in from the right behind two slabs of colour, with
 * its items arriving one after another as it lands.
 *
 * WHY IT IS REBUILT RATHER THAN PORTED
 * ---------------------------------------------------------------------------
 * The reference is a DOM component: GSAP, `xPercent`, `clip-path`, CSS
 * `em`-based padding and a `backdrop-filter`. None of that exists here, and
 * the two that matter most cannot be worked around:
 *
 *   · `em` padding. The reference's panel is padded `6em 2em 2em 2em`, and
 *     `em` is relative to the element's OWN font size — so the panel's inset
 *     is decided by a font size the reference inherits from the page. This
 *     app has no page font size to inherit; its type scale is explicit, and
 *     so is the panel's padding.
 *
 *   · GSAP timelines. The reference's whole entrance is one timeline with
 *     layers at 0.07s apart, the panel at 0.65s, the items staggering in
 *     behind it at 0.1s each. That is reproducible — see THE TIMELINE.
 *
 * So the SHAPE is ported and the machinery is rebuilt: the same layers, the
 * same order, the same timings, the same easings.
 *
 * WHAT IS KEPT
 * ---------------------------------------------------------------------------
 *   · TWO COLOUR SLABS behind the panel, arriving 0.07s apart.
 *   · THE PANEL, landing 0.08s after the last slab, over 0.65s.
 *   · THE ITEMS, sliding up out of their own clipping boxes from below and
 *     straightening as they go — 140% of their height, with a 10° tilt —
 *     0.1s apart, starting 15% of the way through the panel's own travel.
 *   · THE NUMBERS, fading in behind the items, 0.08s apart.
 *   · THE TOGGLE, spinning as it changes.
 *   · CLICK AWAY TO CLOSE.
 *
 * WHAT IS THE APP'S, NOT THE REFERENCE'S
 * ---------------------------------------------------------------------------
 *   · The slab colours are the PALETTE'S accents, and the panel is the
 *     palette's own surface. The reference's demo used a white panel and
 *     two violet slabs because it has one theme; this app has fifty-two,
 *     and a white slab in the middle of a night-time palette would be a
 *     hole in the product.
 *
 *   · The type is the app's: JetBrains Mono, sharp corners, the type scale.
 *     The reference's items are a 56px proportional sans; these are 44px
 *     monospace, because a phone in one hand does better with a face that
 *     sets its own labels in a column.
 *
 *   · The toggle is a LUCIDE icon, because that is where this app's icons
 *     live now, and a 40-point square of it, because a word beside a mark
 *     is a word on a phone.
 *
 * THE TIMELINE
 * ---------------------------------------------------------------------------
 * Reanimated, not React Native's `Animated`.
 *
 * `Animated` with `useNativeDriver: true` needs the animated values to be
 * attached to a view whose props do not change, and the props of a
 * re-rendered component do change — so the native node is detached and
 * re-attached under the animation, and the drawer arrives in one frame
 * instead of over one second. The symptom is a drawer that is simply
 * THERE, with no travel at all, which is exactly what a broken native
 * driver looks like.
 *
 * Reanimated does not have that problem: the values live in shared values,
 * the styles are read from them in worklets, and the whole thing runs on the
 * UI thread — so the drawer opens on the same frame on every device, and
 * the web preview animates too.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useActiveTheme, useTheme } from "@/theme/ThemeProvider";
import { FONT, TYPE } from "@/theme/typography";
import { Icon } from "@/components/icons";
import { useAuth } from "@/auth/AuthProvider";

/**
 * THE DESTINATIONS.
 *
 * The five places the tab bar can take the reader to, in the tab bar's own
 * order, because this menu is on its way to replacing that bar and the two
 * should not disagree about what the app contains.
 *
 * The routes are written out rather than typed as expo-router's `Href`,
 * because that type is every route with every query string attached to it,
 * and a list of five destinations should say which five they are.
 */
type MenuHref = "/" | "/modules" | "/practice" | "/tutor" | "/profile";

type MenuItem = {
  readonly label: string;
  readonly href: MenuHref;
  /** The number in the corner, zero-padded the way the reference pads it. */
  readonly number: string;
};

const ITEMS: ReadonlyArray<MenuItem> = [
  { label: "Home", href: "/", number: "01" },
  { label: "Modules", href: "/modules", number: "02" },
  { label: "Practice", href: "/practice", number: "03" },
  { label: "Tutor", href: "/tutor", number: "04" },
  { label: "You", href: "/profile", number: "05" },
];

/**
 * THE FOOTER.
 *
 * The reference ends its panel with a block of social links under a small
 * accent-coloured heading, and that block is the reason the panel reads as
 * a finished page rather than a list that ran out. This app has no socials,
 * so the slot holds the three things the app can show that are not tabs.
 */
type FooterLink = {
  readonly label: string;
  readonly href: "/settings/about" | "/settings/appearance" | "/settings/provider";
};

const FOOTER: ReadonlyArray<FooterLink> = [
  { label: "About", href: "/settings/about" },
  { label: "Appearance", href: "/settings/appearance" },
  { label: "Provider", href: "/settings/provider" },
];

/* ------------------------------------------------------------------ *
 *  the timings, lifted from the reference's timeline
 * ------------------------------------------------------------------ */

/** Each slab's own travel. */
const LAYER_DURATION = 350;
/** How far apart the two slabs start. */
const LAYER_STAGGER = 70;
/** The panel's own travel. */
const PANEL_DURATION = 300;
/** The gap between the last slab and the panel. */
const PANEL_DELAY = LAYER_STAGGER + 70;
/** How long the closing travel takes. */
const CLOSE_DURATION = 320;
/** Each item's own travel. */
const ITEM_DURATION = 600;
/** How far apart the items start. */
const ITEM_STAGGER = 55;
/** Where the items start, as a fraction of the panel's travel. */
const ITEM_START_RATIO = 0.05;
/** The numbers' own travel, and how far apart they start. */
const NUMBER_DURATION = 600;
const NUMBER_STAGGER = 55;
/** How far below its own box an item starts, as a fraction of its height. */
const ITEM_TRAVEL = 1.4;

/**
 * THE EDGE.
 *
 * How far from the right of the screen a swipe has to begin to count as
 * opening the drawer.
 *
 * IT IS A FRACTION OF THE SCREEN, NOT A NUMBER OF POINTS.
 *
 * A fixed width is the wrong shape for this. A thumb reaches for the edge
 * of whatever it is holding, so the zone has to be as wide as the edge
 * FEELS on the phone in the reader's hand — and that is not the same on a
 * small phone as on a large one, nor the same on a phone as on a tablet.
 *
 * So the zone is a fraction of the width, with a floor and a ceiling: a
 * small phone still gets a zone a thumb can hit, and a tablet does not turn
 * a quarter of the screen into a swipe target.
 */
const EDGE_FRACTION = 0.18;

/** The narrowest the zone is ever, so a small phone can still hit it. */
const EDGE_MIN = 56;

/** The widest the zone is ever, so a tablet does not lose a fifth of itself to it. */
const EDGE_MAX = 96;

/**
 * How far the finger has to travel, as a fraction of the panel's width, for
 * the drag to count as a full open. Shorter than the panel, because the
 * finger only has the width of the screen to travel in.
 */
const DRAG_TRAVEL = 0.6;

/**
 * How far the drawer has to be pulled out before letting go opens it.
 */
const DRAG_THRESHOLD = 0.3;

/**
 * THE WHOLE STAGGER, IN MILLISECONDS.
 *
 * The items travel as ONE value, from 0 to 1, over this long. So a value of
 * 0.5 is the middle of the whole stagger and not the middle of one item —
 * and to work out where a given item is, that value has to be turned back
 * into milliseconds first.
 */
const ITEMS_TOTAL = ITEM_DURATION + (ITEMS.length - 1) * ITEM_STAGGER;
const NUMBERS_TOTAL = NUMBER_DURATION + (ITEMS.length - 1) * NUMBER_STAGGER;

/** `power4.out` — the reference's opening curve. */
const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
/** `power3.in` — the reference's closing curve. */
const EASE_IN = Easing.bezier(0.7, 0, 0.84, 0);

export function SideMenuProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const theme = useActiveTheme();
  const { reducedMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { status } = useAuth();
  const { width } = useWindowDimensions();

  const [open, setOpen] = useState(false);
  /**
   * Whether the drawer is on its way out.
   *
   * It is a shared value rather than a ref because the closing animation
   * needs it on the UI thread: when the panel has finished travelling, the
   * items go back where they started — unless the drawer was reopened in
   * the meantime, in which case they are left alone.
   */
  const closing = useSharedValue(0);

  /*
   * THE TIMELINE.
   *
   * One shared value per thing that travels, and the reference's stagger
   * done with delays and derived values rather than with a timeline object:
   * the slabs and the panel are their own values, and the items and the
   * numbers are ONE value each, with every item taking the slice of it
   * that belongs to its own start time.
   */
  const slabA = useSharedValue(0);
  const slabB = useSharedValue(0);
  const panelProgress = useSharedValue(0);
  const scrim = useSharedValue(0);
  const spin = useSharedValue(0);
  const itemsProgress = useSharedValue(0);
  const numbersProgress = useSharedValue(0);
  /**
   * THE SWIPE.
   *
   * How far the drawer has been dragged out by a finger, 0 to 1. It is a
   * separate value from the panel's own progress so that a drag and an
   * animation can be in the same place at once: the panel sits at whichever
   * is further along, so releasing a half-open drawer continues from where
   * the finger left it rather than snapping.
   */
  const drag = useSharedValue(0);

  /**
   * The panel's width.
   *
   * The reference is `clamp(260px, 38vw, 420px)` on a desktop and the full
   * width of the screen under 640px. A phone gets neither: 38vw of a phone
   * is 148 points, which is a sliver, and 100% is a takeover rather than a
   * side menu. So it is most of the screen, with the app still visible
   * down the left edge — a sliver of where you were, which is the whole
   * point of a drawer that slides in rather than a page that replaces one.
   */
  const panelWidth = Math.min(Math.max(width * 0.86, 260), 420);

  /**
   * THE EDGE ZONE, FOR THIS SCREEN.
   *
   * A fraction of the width, with a floor and a ceiling: wide enough for a
   * thumb to land on without aiming, narrow enough that it is still the
   * EDGE that opens the drawer rather than a fifth of the screen.
   */
  const edgeWidth = Math.min(EDGE_MAX, Math.max(EDGE_MIN, width * EDGE_FRACTION));

  /**
   * The item's size.
   *
   * The reference's items are 3.5rem of a proportional face. Monospace is
   * wider per character and this app's face is wide to begin with, so the
   * size is worked out from the panel: the longest label is eight
   * characters, and it has to fit beside the number without wrapping.
   */
  const itemSize = Math.min(44, Math.floor((panelWidth - 48 - 36) / 8 / 0.6));

  const play = useCallback(
    (to: boolean, from = 0) => {
      /*
       * REDUCED MOTION.
       *
       * The flag's documented scope is the four background engines, which
       * move constantly and are the thing a reader is asking to be spared
       * (STYLING.md §6). The drawer is not that: it is the response to a
       * tap, and a drawer that TELEPORTS is a worse experience than one
       * that slides, with or without the flag.
       *
       * So with reduced motion the drawer still travels — briefly, and
       * without the flourishes: no tilt on the items, no spin on the mark.
       * The travel stays because the travel is the answer to the tap; the
       * flourishes go because they are decoration.
       */
      const calm = reducedMotion;

      /*
       * Where the items start is a fraction of the way through the panel's
       * own travel, so it moves with the panel when the timings do.
       */
      const itemsStart = calm
        ? 40 + 260 * ITEM_START_RATIO
        : PANEL_DELAY + PANEL_DURATION * ITEM_START_RATIO;

      if (to) {
        closing.set(0);
        if (from > 0) {
          /*
           * OUT OF A DRAG.
           *
           * The finger left the panel half open, so the panel and the
           * slabs continue from there rather than starting again. The
           * reference's slab stagger is a thing of the entrance, and an
           * entrance that began with a finger does not have one.
           */
          slabA.set(from);
          slabB.set(from);
          panelProgress.set(from);
          slabA.set(withTiming(1, { duration: 260, easing: EASE_OUT }));
          slabB.set(withTiming(1, { duration: 260, easing: EASE_OUT }));
          panelProgress.set(withTiming(1, { duration: 260, easing: EASE_OUT }));
          scrim.set(withTiming(1, { duration: 260, easing: EASE_OUT }));
        } else if (calm) {
          // Reduced motion: the same shape, a third of the time.
          slabA.set(withTiming(1, { duration: 200, easing: EASE_OUT }));
          slabB.set(withDelay(30, withTiming(1, { duration: 200, easing: EASE_OUT })));
          panelProgress.set(withDelay(40, withTiming(1, { duration: 260, easing: EASE_OUT })));
          scrim.set(withTiming(1, { duration: 200, easing: EASE_OUT }));
        } else {
          slabA.set(withTiming(1, { duration: LAYER_DURATION, easing: EASE_OUT }));
          slabB.set(
            withDelay(LAYER_STAGGER, withTiming(1, { duration: LAYER_DURATION, easing: EASE_OUT })),
          );
          panelProgress.set(
            withDelay(PANEL_DELAY, withTiming(1, { duration: PANEL_DURATION, easing: EASE_OUT })),
          );
          scrim.set(withTiming(1, { duration: 350, easing: EASE_OUT }));
        }
        // The mark changes; with reduced motion it does not spin to get there.
        spin.set(calm ? 1 : withTiming(1, { duration: 800, easing: EASE_OUT }));

        /*
         * The items travel as ONE value, and each of them takes the slice
         * of it that belongs to its own start time — which is what a
         * stagger is. The value runs for the whole stagger, so the last
         * item is still travelling when the first has landed.
         */
        const itemStagger = calm ? 40 : ITEM_STAGGER;
        const numberStagger = calm ? 40 : NUMBER_STAGGER;
        itemsProgress.set(
          withDelay(
            itemsStart,
            withTiming(1, {
              duration:
                (calm ? 300 : ITEM_DURATION) + (ITEMS.length - 1) * itemStagger,
              easing: Easing.linear,
            }),
          ),
        );
        numbersProgress.set(
          withDelay(
            itemsStart + 100,
            withTiming(1, {
              duration:
                (calm ? 200 : NUMBER_DURATION) + (ITEMS.length - 1) * numberStagger,
              easing: Easing.linear,
            }),
          ),
        );
        return;
      }

      closing.set(1);
      panelProgress.set(
        withTiming(
          0,
          { duration: CLOSE_DURATION, easing: EASE_IN },
          () => {
            /*
             * The items go back where they started once the panel has
             * gone, so the next opening staggers them in again rather than
             * finding them already in place. The reference does the same at
             * the end of its closing tween.
             *
             * Unless the drawer was reopened while it was on its way out,
             * in which case they are left where they are.
             */
            if (closing.value !== 1) return;
            itemsProgress.set(0);
            numbersProgress.set(0);
          },
        ),
      );
      slabA.set(withTiming(0, { duration: CLOSE_DURATION, easing: EASE_IN }));
      slabB.set(withTiming(0, { duration: CLOSE_DURATION, easing: EASE_IN }));
      scrim.set(withTiming(0, { duration: 250, easing: EASE_IN }));
      spin.set(withTiming(0, { duration: 350, easing: EASE_OUT }));
    },
    [
      closing,
      itemsProgress,
      numbersProgress,
      panelProgress,
      reducedMotion,
      scrim,
      slabA,
      slabB,
      spin,
    ],
  );

  const show = useCallback(() => {
    setOpen(true);
    play(true);
  }, [play]);

  const hide = useCallback(() => {
    setOpen(false);
    play(false);
  }, [play]);

  /**
   * OPENING OUT OF A DRAG.
   *
   * The finger left the drawer half open, so the drawer continues from
   * there instead of starting again.
   */
  const openFromDrag = useCallback(
    (p: number) => {
      setOpen(true);
      drag.set(0);
      play(true, p);
    },
    [drag, play],
  );

  const toggle = useCallback(() => {
    if (open) hide();
    else show();
  }, [hide, open, show]);

  /**
   * THE EDGE SWIPE.
   *
   * A swipe in from the right edge opens the drawer, and the drawer FOLLOWS
   * the finger while it happens — a drawer that ignores your thumb and
   * then flies in on its own is a drawer that feels like it is being done
   * to you.
   *
   * So the gesture is caught down the right edge, the panel's position is
   * driven by the drag, and the release decides: past the threshold it
   * completes, short of it it slides back.
   *
   * It is gesture-handler rather than a `PanResponder`, and the reason is
   * worth writing down: a `PanResponder` can only have a gesture that
   * nothing else wanted. A button or a list row under the finger claims
   * the touch first and the swipe is lost, and a screen is mostly buttons
   * and list rows. Gesture-handler recognises in parallel with the app's
   * own touch handling, and cancels it only once the swipe is certain.
   */
  const edgeStart = useSharedValue(-1);

  const edgeSwipe = useMemo(
    () =>
      Gesture.Pan()
        // It is a HORIZONTAL gesture: it activates once the movement is
        // sideways, and gives up if it turns out to be a scroll.
        .activeOffsetX([-12, 12])
        .failOffsetY([-24, 24])
        .onBegin((event) => {
          /*
           * WHERE THE FINGER LANDED.
           *
           * This is asked at `onBegin` and not at `onStart`, and the
           * difference is the whole feature.
           *
           * `onStart` fires when the gesture ACTIVATES, which is after the
           * finger has already travelled the activation distance — twelve
           * points to the left. So a finger that landed on the very edge
           * had already moved out of the zone by the time anyone looked,
           * and the swipe was thrown away. The faster the swipe, the
           * further out of the zone it had already got, which is exactly
           * backwards: the reader who reaches for the edge and flicks
           * hardest was the one who could not open the menu.
           *
           * `onBegin` fires when the finger goes down, before any of that.
           * So the zone is measured where the finger actually landed, and
           * the speed of the swipe stops mattering.
           *
           * `absoluteX` and not `x`: `x` is relative to the view the
           * gesture is attached to, which is the whole screen, but on the
           * web the event is reported relative to whatever element was
           * touched — so `x` is off by the target's left edge. The
           * absolute coordinate is the same on every platform.
           */
          const landed = event.absoluteX;
          edgeStart.set(landed > width - edgeWidth ? landed : -1);
        })
        .onUpdate((event) => {
          const start = edgeStart.value;
          if (start < 0) return;
          const travelled = start - event.absoluteX;
          const p = travelled / (panelWidth * DRAG_TRAVEL);
          drag.set(p < 0 ? 0 : p > 1 ? 1 : p);
        })
        .onEnd(() => {
          const start = edgeStart.value;
          edgeStart.set(-1);
          if (start < 0) return;
          const p = drag.value;
          if (p > DRAG_THRESHOLD) {
            runOnJS(openFromDrag)(p);
            return;
          }
          // Not far enough: back where it was.
          drag.set(withTiming(0, { duration: 220, easing: EASE_OUT }));
        })
        .onFinalize(() => {
          // The gesture was cancelled mid-swipe: put the drawer back.
          if (edgeStart.value < 0) return;
          edgeStart.set(-1);
          if (drag.value <= DRAG_THRESHOLD) {
            drag.set(withTiming(0, { duration: 220, easing: EASE_OUT }));
          }
        }),
    [drag, edgeStart, edgeWidth, openFromDrag, panelWidth, width],
  );

  /**
   * GOING SOMEWHERE.
   *
   * The menu closes first and the navigation happens underneath it, so the
   * reader never watches the drawer sit open over a screen that has already
   * changed. The close animation covers the gap.
   */
  const go = useCallback(
    (href: Href) => {
      hide();
      router.navigate(href);
    },
    [hide, router],
  );

  /*
   * THE ANDROID BACK BUTTON.
   *
   * On Android the back button is the way out of a drawer, and without this
   * it would take the reader out of the app instead of out of the menu.
   */
  useEffect(() => {
    if (!open) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      hide();
      return true;
    });
    return () => subscription.remove();
  }, [hide, open]);

  /* ---- the styles, read from the shared values ---- */

  /*
   * THE DRAWER'S POSITION.
   *
   * Whichever is further along — the animation or the finger — decides
   * where the panel is. That is what lets a drag and an animation be in
   * the same place at once: a half-dragged drawer that is let go continues
   * from where the finger was, and a drawer that is opened by the button
   * is simply at the end of its own animation.
   */
  const slabAStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: panelWidth * (1 - Math.max(slabA.value, drag.value)) }],
  }));
  const slabBStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: panelWidth * (1 - Math.max(slabB.value, drag.value)) }],
  }));
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: panelWidth * (1 - Math.max(panelProgress.value, drag.value)) }],
  }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: Math.max(scrim.value, drag.value) }));

  /* The mark turns into a cross the way the reference's plus does. */
  const menuStyle = useAnimatedStyle(() => ({
    opacity: spin.value < 0.45 ? 1 - spin.value / 0.45 : 0,
    transform: [{ rotate: `${spin.value * 180}deg` }],
  }));
  const closeStyle = useAnimatedStyle(() => ({
    opacity: spin.value < 0.55 ? 0 : Math.min(1, (spin.value - 0.55) / 0.45),
    transform: [{ rotate: `${(1 - spin.value) * -180}deg` }],
  }));

  /*
   * The menu belongs to a signed-in reader; the login screen has no tabs.
   *
   * The web target is the exception, and it is the same exception the root
   * layout's gate makes: the browser has no keychain, so there is no session
   * there to have, and the gate lets the app through anyway. If the gate
   * lets the app through, the menu has to be there too — otherwise the web
   * preview of the app is an app with no way to open the drawer.
   */
  const bypass = process.env.EXPO_OS === "web";
  if (status !== "signed-in" && !bypass) {
    // No drawer, and no gesture: the app is on the login screen.
    return <>{children}</>;
  }

  return (
    <GestureDetector gesture={edgeSwipe}>
      <View style={styles.provider}>
        {children}

      {/*
        * THE DRAWER.
        *
        * Over everything, and over the tab bar that used to be here: the
        * drawer is the app's navigation now, so it covers what navigation
        * used to look like.
        */}
      <View style={styles.root} pointerEvents="box-none">
        {/* ---- the scrim: tap it to close, the way the reference does ---- */}
      <Animated.View
        style={[styles.scrim, scrimStyle]}
        pointerEvents={open ? "auto" : "none"}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={hide}
          accessibilityLabel="Close menu"
          accessibilityRole="button"
        />
      </Animated.View>

      {/* ---- the two slabs of colour, behind the panel ---- */}
      <Animated.View
        style={[styles.slab, { width: panelWidth, backgroundColor: theme.tokens.accentA }, slabAStyle]}
        pointerEvents="none"
      />
      <Animated.View
        style={[styles.slab, { width: panelWidth, backgroundColor: theme.tokens.accentB }, slabBStyle]}
        pointerEvents="none"
      />

      {/* ---- the panel ---- */}
      <Animated.View
        style={[
          styles.panel,
          {
            width: panelWidth,
            backgroundColor: theme.tokens.bg1,
            // The same neutral hairline every other bordered surface in the
            // app uses. The accent is for the things the accent is FOR, and
            // a red rim down the edge of the drawer is not one of them.
            borderLeftColor: theme.tokens.line,
          },
          panelStyle,
        ]}
        pointerEvents={open ? "auto" : "none"}
        accessibilityViewIsModal={open}
      >
        <View style={[styles.panelInner, { paddingTop: insets.top + 64 }]}>
          {/* ---- the items ---- */}
          <View style={styles.list}>
            {ITEMS.map((item, i) => (
              <DrawerItem
                key={item.href}
                index={i}
                label={item.label}
                number={item.number}
                size={itemSize}
                tilt={reducedMotion ? 0 : 10}
                itemsProgress={itemsProgress}
                numbersProgress={numbersProgress}
                onPress={() => go(item.href)}
              />
            ))}
          </View>

          {/* ---- the footer block, the reference's socials slot ---- */}
          <View style={styles.footer}>
            <Text style={[styles.footerTitle, { color: theme.tokens.accentA }]}>THE APP</Text>
            <View style={styles.footerLinks}>
              {FOOTER.map((link) => (
                <Pressable
                  key={link.href}
                  onPress={() => go(link.href)}
                  accessibilityRole="link"
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                >
                  <Text style={[styles.footerLink, { color: theme.tokens.fg }]}>{link.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </Animated.View>

      {/* ---- the toggle: above everything, and it is the way out ---- */}
      {/*
       * NO BOX.
       *
       * The button is the icon and nothing else. It used to carry a
       * filled `bg1` panel with a hairline in the accent colour, which
       * read as a little card floating in the corner of every screen — a
       * second surface competing with the app's own, and on the home
       * screen it sat on top of the terminal panel's bar.
       *
       * So the fill and the edge are gone. The icon is the button, it is
       * drawn in the page's own foreground colour, and it sits directly on
       * whatever is behind it.
       */}
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={open ? "Close menu" : "Open menu"}
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [
          styles.toggle,
          {
            /*
             * The button is a 40-point square, and the header's bar is 44
             * points tall, so `+2` puts the ICON — not the button — on the
             * bar's own centre line. The dots on the other side of the bar
             * are on the same line, and the two read as one row of chrome
             * rather than as a button hovering over a title.
             */
            top: insets.top + 2,
            right: 12,
            opacity: pressed ? 0.6 : 1,
          },
        ]}
      >
        <Animated.View style={menuStyle}>
          <Icon name="menu" size={20} color={theme.tokens.fg} />
        </Animated.View>
        <Animated.View style={[styles.closeMark, closeStyle]}>
          <Icon name="close" size={20} color={theme.tokens.fg} />
        </Animated.View>
      </Pressable>
      </View>
      </View>
    </GestureDetector>
  );
}

/**
 * ONE ITEM.
 *
 * A component of its own because each item needs its own derived value:
 * the slice of the group's progress that belongs to this item's start time.
 * That is the whole of a stagger, expressed as arithmetic.
 */
function DrawerItem({
  index,
  label,
  number,
  size,
  tilt,
  itemsProgress,
  numbersProgress,
  onPress,
}: {
  index: number;
  label: string;
  number: string;
  size: number;
  /** How far the label leans as it rises. Zero when motion is reduced. */
  tilt: number;
  itemsProgress: SharedValue<number>;
  numbersProgress: SharedValue<number>;
  onPress: () => void;
}): React.JSX.Element {
  const theme = useActiveTheme();

  /**
   * This item's own progress, out of the group's.
   *
   * The group's value is a fraction of the whole stagger, so it is turned
   * back into milliseconds before this item's slice of it is taken.
   *
   * `1 - (1 - t)^4` is `power4.out` written out, because an easing
   * function is a thing the UI thread cannot call — but four multiplications
   * are, and the shape is the reference's.
   */
  const progress = useDerivedValue(() => {
    const t = (itemsProgress.value * ITEMS_TOTAL - index * ITEM_STAGGER) / ITEM_DURATION;
    const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
    return 1 - Math.pow(1 - clamped, 4);
  });

  /** And the number's, which runs on its own clock — `power2.out`. */
  const numberOpacity = useDerivedValue(() => {
    const t = (numbersProgress.value * NUMBERS_TOTAL - index * NUMBER_STAGGER) / NUMBER_DURATION;
    const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
    return 1 - Math.pow(1 - clamped, 2);
  });

  const labelStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: size * ITEM_TRAVEL * (1 - progress.value) },
      { rotate: `${(1 - progress.value) * tilt}deg` },
    ],
  }));

  const numberStyle = useAnimatedStyle(() => ({ opacity: numberOpacity.value }));

  return (
    <View style={styles.itemWrap}>
      <Pressable
        onPress={onPress}
        accessibilityRole="link"
        accessibilityLabel={label}
        style={({ pressed }) => [styles.item, { opacity: pressed ? 0.6 : 1 }]}
      >
        <Animated.View style={[styles.itemLabelBox, labelStyle]}>
          <Text
            style={[
              styles.itemLabel,
              { fontSize: size, lineHeight: size * 1.09, color: theme.tokens.fg },
            ]}
            numberOfLines={1}
          >
            {label.toUpperCase()}
          </Text>
        </Animated.View>
        <Animated.Text style={[styles.itemNumber, { color: theme.tokens.accentA }, numberStyle]}>
          {number}
        </Animated.Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * The provider.
   *
   * It is an ANCESTOR of the app, not a sibling of it, and that is the
   * whole reason the swipe works. A strip laid over the right edge would
   * be the topmost view under the finger, so it would swallow every tap
   * along that edge and the app underneath would never hear about it. An
   * ancestor is asked LAST, after the view that was actually touched has
   * already had its chance — so a tap goes to the app, and a swipe is only
   * claimed once it is clearly a swipe.
   */
  provider: {
    flex: 1,
  },
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 50,
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0, 0, 0, 0.42)",
  },
  slab: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
  },
  panel: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    borderLeftWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  panelInner: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 28,
    justifyContent: "space-between",
  },
  list: {
    gap: 2,
  },
  /**
   * The clip.
   *
   * The reference hides each label's overflow so it can slide up from below
   * its own line rather than from below the panel. This is that clip.
   */
  itemWrap: {
    overflow: "hidden",
  },
  item: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 2,
  },
  itemLabelBox: {
    flexShrink: 1,
  },
  itemLabel: {
    fontFamily: FONT.bold,
    letterSpacing: -1.2,
    textTransform: "uppercase",
  },
  /**
   * The number.
   *
   * The reference puts it just past the end of the label rather than in a
   * column at the panel's edge, so the numbers do not line up with each
   * other — and that is the look. Twenty-eight points is the gap the
   * reference's own padding works out to.
   */
  itemNumber: {
    ...TYPE.code,
    // A number, so: Nova Mono.
    fontFamily: FONT.nova,
    fontSize: 15,
    lineHeight: 20,
    marginLeft: 28,
    paddingTop: 3,
  },
  footer: {
    paddingTop: 24,
  },
  footerTitle: {
    ...TYPE.label,
  },
  footerLinks: {
    flexDirection: "row",
    gap: 18,
    marginTop: 10,
  },
  footerLink: {
    ...TYPE.subheading,
  },
  toggle: {
    position: "absolute",
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 60,
  },
  closeMark: {
    position: "absolute",
  },
});
