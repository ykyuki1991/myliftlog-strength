# Precision Strength

The tool a person who handles 150kg reaches for. Apple Watch Ultra, high-end
strength equipment, the precision of powerlifting. No muscle photography, no
flame, no neon, no showy gradients.

## Audit (2026-09-09)

Public baseline: PR #42 / 70cf64a, the Quiet Performance redesign. Measured
rather than described, because the previous pass read as a dark admin console
and adjectives had not caught why.

- Surface contrast: bg to surface was 1.10:1 and surface to surface-2 1.15:1,
  while surface to line was 1.91:1. Structure was carried by hairlines, not
  planes, so the app read as a wireframe.
- Accent saturation: OKLCH chroma was 0.058 for accent, 0.094 for ok and 0.107
  for max. Apple's system colors sit at 0.17-0.22, two to three and a half
  times higher.
- Role lightness: accent, ok, max and danger were clustered inside nine L*
  points (79-88), so four roles read as one pastel set.
- Neutral temperature: background hues ran H220-237 while text hues ran
  H178-181. Low chroma hid it individually; together they muddied.
- Type: sixteen font sizes and five weights. The recorded weight was 32px/500
  under an exercise name at 24px/600, so the number carried less visual weight
  than its label.
- Compatibility debt: fourteen legacy token aliases in :root, seventy inline
  style attributes in app.js, and five semantically different classes sharing
  one chip rule.

## Audit (2026-09-08)

Public baseline: PR #41 / 5d9386b. Reviewed Today, Log, Plan and Settings in an isolated 375px browser, plus their renderers, input handlers, session persistence, modal focus handling, timer and service worker.

- Today: repeated target weight, uniformly heavy type, nested outlined surfaces. Editing requires opening a second control before typing. A change-event rerender can remove the completion button between pointer-down and click.
- Timer: appears above the menu, moves the whole screen, and hides minus/reset on narrow phones.
- Plan: four cards inside another card, large repeated next-menu summary, custom absent from planning overview.
- Log: latest day expanded by default; history detail dominates scanning. Filters lack accessible select names.
- Settings: all sections compete; save is far from first fields; destructive actions have similar prominence to everyday actions.
- Accessibility: some interactive values, chips and rows are spans/divs without keyboard semantics. Existing modal focus trap and reduced-motion support should remain.
- View state: rerenders replace details elements and lose disclosure state; navigation has no per-screen scroll restoration.

## Principles

These are constraints with numbers, not moods. A change that cannot be checked
against them has not been made.

1. **Record first.** Direct weight/reps inputs, adjacent previous record, one
   dominant completion action.

2. **Neutrals are one family.** Every neutral token is OKLCH hue 250, with no
   exceptions, at chroma 0.003-0.012. Tokens are declared as hex and restated
   in OKLCH inside `@supports (color: oklch(...))`, because 8-bit sRGB cannot
   express hue 250 at chroma 0.008 and the hue lock has to be exact on the
   device this app is actually used on.

       --bg        L* 14   --text    L* 97
       --surface   L* 23   --text-2  L* 78
       --surface-2 L* 32   --text-3  L* 69
       --surface-3 L* 40   --line    L* 46

3. **Three surfaces, and depth is lightness.** page (`--bg`), raised
   (`--surface`), inset (`--surface-2`), at least 8 L* apart. `--surface-3` is
   the pressed/track/toast state of an inset, not a fourth plane. Every card
   variant maps onto one of the three. A 1px border is used only where two
   planes cannot be stacked -- a transparent button, and separators between
   peer rows or sections -- and those separators are drawn in `--surface-2`
   or `--surface-3`, never in `--line`.

4. **Radius is by purpose.** 16px cards, 12px controls, 999px pills. There is
   no global maximum. (This replaces the previous "8px maximum surface radius",
   which is what forced every plane to look like the same rectangle.)

5. **Role colors are saturated, separated and exclusive.** OKLCH chroma at or
   above 0.15 where the sRGB gamut allows, and at least 6 L* between roles. No
   role color is borrowed for another purpose.

       --accent  #006ef4  L* 57  current / in progress / primary action
       --ok      #20c45f  L* 72  completion only
       --max     #ffb225  L* 82  PR / personal best / caution only
       --danger  #ef4747  L* 64  destructive action / error only

   `--accent` at L*57 is a fill, not a text color: filled blue buttons carry
   white text, and thin blue text on a dark plane uses `--accent-bright`.
   `--danger-bright` plays the same role for red. Body text, `--text-2` and
   `--text-3` clear 4.5:1 on every surface they are used on.

6. **Numbers are instruments.** Seven sizes -- 11/13/15/17/22/34/56 -- and two
   weights, 400 and 600. `letter-spacing: -0.02em` at 22px and up, and no
   explicit `letter-spacing: 0` anywhere. The recorded weight is at least 2.2x
   every other string that can appear on the same screen; the exercise name is
   17/400/`--text-2`. System font, tabular numerals.

7. **Four/eight-pixel spacing**; 44px minimum touch target; no paid assets,
   fonts, remote runtime libraries or analytics. Dark only: `color-scheme: dark`
   stays, and there is no light mode.

8. **No compatibility layer.** No aliased tokens kept alive to avoid rewriting
   the rules that use them, no inline `style` attributes in `app.js`, and no
   single rule serving classes that mean different things. Character glyphs
   used as icons are inline SVG in the same shape as the nav icons.

9. **Analysis after training:** actual completed sets and volume in the finish
   summary; no fabricated PR or active-training duration (elapsed time may
   include overnight drafts).

10. **Preserve all data.** Routines, custom composition, overrides, paused
    exercises, historical data, MAX approval and backup formats are preserved,
    and UI state stays outside the persistent training store. This is a
    guarantee about stored data and behaviour only -- it does not preserve any
    particular visual treatment, and it is not a reason to keep an existing
    style. (This replaces the previous principle 6, which read as a mandate to
    preserve the UI as well.)

## Research

- [Apple accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility/): target sizes, contrast and non-color state cues.
- [Apple text fields](https://developer.apple.com/design/human-interface-guidelines/text-fields): task-appropriate keyboards and direct entry.
- [Hevy previous performance](https://www.hevyapp.com/features/track-exercises/): previous workout alongside current data reduces context switching.
- [Hevy workout logging](https://www.hevyapp.com/features/track-workouts/): completion and automatic rest form one repeated interaction.
- [MacroFactor logging](https://help.macrofactorapp.com/en/articles/310-how-to-log-a-workout): previous performance and next exercise progression support recording focus.
- [Liftin'](https://www.liftinapp.co/), [Strong](https://www.strong.app/), [SmartGym](https://smartgymapp.com/features): reviewed product positioning. Do not copy proprietary layouts or add their social/AI features to this app.

## Verification Contract

Protect existing unit tests, add DOM interaction tests for direct editing/completion, RPE, disclosure/scroll state, all five menus, custom progression independence, same-day sessions and restart persistence. Check 320/375/390/430/768/1280px, short viewport, keyboard focus, reduced motion, timer/nav separation, light/dark browser preference, offline reload and old-service-worker upgrade. Public asset bytes must match release after Pages deployment. Actual iPhone hardware remains a user-device check, not something Chromium simulation can certify.

## Browser Tests

`node test_ui.js` uses an independently installed Playwright and a disposable browser profile, not live user data. Set `CHROME_PATH` for a local Chrome executable, or `UI_BROWSER=webkit` with `PLAYWRIGHT_BROWSERS_PATH` for Playwright WebKit. `NODE_PATH` can point to the bundled Playwright modules. No browser testing dependency is loaded by the production app.

The suite checks 134 assertions locally, including all four log views and narrow edit sheets. Chromium uses protocol-level offline mode; local WebKit tests disconnect the HTTP origin because protocol-level offline navigation fails inside the WebKit test runtime. Both exercise service-worker fallback and the v23-to-v24 cache upgrade. `UI_PUBLIC_URL` runs the same isolated regression against the published site in Chromium (excluding the local old-version upgrade fixture).
