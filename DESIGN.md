# Quiet Performance

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

1. Record first. Direct weight/reps inputs, adjacent previous record, one dominant completion action.
2. One surface per exercise. No decorative card within a card. Neutral graphite, mint for actions, green for completion, amber for records/caution, red only for destructive/error states.
3. Numbers are instruments: system font, tabular numerals, regular/medium weights for data, restrained bold for hierarchy.
4. Four/eight-pixel spacing; 8px maximum surface radius; 44px minimum primary touch target; no paid assets, fonts, remote runtime libraries or analytics.
5. Analysis after training: actual completed sets and volume in the finish summary; no fabricated PR or active-training duration (elapsed time may include overnight drafts).
6. Preserve all routines, custom composition, overrides, paused exercises, historical data, MAX approval and backup formats. UI state stays outside the persistent training store.

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
