# Clatter Lab

Prototype of a kids' Rube Goldberg game. Drag gadgets onto a voxel board, press Play, watch it go.

Two modes, switched in the menu (**☰ Menu** at the right of the top bar):

- **Levels**: puzzles that get harder as you go. Each level comes with locked pieces already on the board and a few parts in the tray (the number on each card is how many are left). Get anything to the ⭐ to win and unlock the next level. Each new gadget arrives in its own level, marked NEW in the tray. The grid button (four squares) left of the level name opens the level picker.
- **Sandbox**: every gadget, no limits, plus the Examples menu.

A hint card floats over the top of the board: the level's goal in Levels, or what the Sandbox is for. A tap anywhere on it (or its ✕, or Play) closes it; the **?** button by Home brings it back.

Level 1 is always a guided tour: its solution shows as a see-through ramp, and a blue bubble points at each next step — the ramp in the tray, the see-through spot, then ▶ (or Stop, after a miss). Any level can do this with `tour: true` in `src/levels.js`.

## Run

Open `index.html` in a browser. No build step, no server, no internet needed.

The page matches the device's light or dark setting, and switches live if it changes.

## Controls

| Action | How |
|---|---|
| Place a gadget | Drag a card from the tray onto the board. It floats freely while dragging and slides into the nearest free quarter-cell spot when you let go. The arrow keys nudge it a quarter at a time |
| More gadgets | Cards cut off at the tray edge fade out; the ‹ / › arrows (or a scroll/swipe over the tray) slide the next set into view |
| Move a gadget | Drag it. The selected gadget gets a blue outline, same as the platform builder |
| Delete | Right-click it, or select + `Delete` |
| Selected-gadget menu | Floats above the selected gadget: **Rotate**, **Size**, **Flip** and 🗑. Every gadget shows every button; ones that don't apply are greyed out |
| Rotate | The Rotate button or `R` steps clockwise through every way the gadget can turn and wraps around; `Shift+R` steps back. Skips turns that don't fit; works mid-drag too. Most gadgets turn 90° at a time; the pendulum cycles its swing (straight, out right, out left). |
| Flip | The Flip button or `F`: mirrors a ramp or conveyor left-right as it looks on screen, whatever way it's turned (a ramp slopes the other way, a conveyor runs the other way). Greyed out on other gadgets. Works mid-drag too |
| Size | The Size button or `S` steps balls, blocks, ramps, dominoes, planks, buckets and seesaws through a set of sizes and wraps around; `Shift+S` steps back. Balls go ball → bowling ball → marble; blocks go 1×1 → 2×1 → 1×2 → 2×2 → ½×½ → 1×½ → ½×1; ramps go 1×1 → 2×1 → 2×2 → 1×2; dominoes change height only, 1½ → 2 → 1; planks change length only, 3 → 4 → 2; buckets grow to fit the marble → ball → bowling ball; seesaws go 3 wide → 4 wide → 3 shifted left → 3 shifted right. It keeps its bottom-left corner, sliding left and/or down when growing into something, and skips sizes that don't fit |
| Nudge | Arrow keys: move the selected gadget ¼ cell |
| Pan | Drag empty space or scroll (mouse); two fingers (touch). The view settles onto whole cells and never goes below the ground |
| Zoom | `Ctrl`/`Cmd` + scroll, or pinch (trackpad or touch screen). The bottom of the screen stays put |
| Home | The ⌂ button in the board's top-left corner, or `H`: fit the whole contraption on screen, with at least one cell of space left, right and above it. Also happens on load, when loading an example and when the window resizes |
| Play / Stop | One button in the board's top-right corner (it turns into Stop while playing), or `Space` |
| Lock | **Lock Up and Down** in the menu, on by default: panning and scrolling only move left and right, so the view's height stays put. Turn it off to move up and down too; remembered per browser |
| Menu | **☰ Menu** at the right of the top bar slides a panel in from the right: **Levels** / **Sandbox** (the board switches behind the panel), the Level Lab account (on the website), **Sound Effects** and **Lock Up and Down**. ✕, `Escape` or a tap beside the panel closes it; while it's open, keys don't reach the game. Sound effects and the lock are remembered per browser |
| Clear | The 🗑 button next to Home. Asks "Are you sure?" first; undo brings it all back |
| Undo / Redo | Buttons next to Play, or `Cmd/Ctrl+Z` / `Shift+Cmd/Ctrl+Z` (also `Ctrl+Y`). Covers placing, moving, rotating, deleting and Clear |

Hit the ⭐ Star with anything to win. In a level, the level's own pieces can't be moved (the cursor shows a no-entry sign over them; tapping one shakes it and shows a 🔒 "Can't Move" tag), and **Clear** only takes back the parts you placed.

Everything is saved in the browser (localStorage) as you work and comes back when you reopen the page: the Sandbox board, view and example, and for Levels the open level, the levels you've beaten and the parts you'd placed in each one.

### Level Lab accounts and sharing

On the website, Clatter Lab uses [Level Lab Studio](../../platform/docs/STUDIO.md) for accounts. Share (at the right of the top bar) and the Account part of the menu only appear once Level Lab answers:

- **Sign In** (in the menu) opens Level Lab's sign-in over the game; the game stays put. Signed in, the menu shows the account's email and **Sign Out**. It's the same account as Level Lab. If Level Lab can't be reached, a note says so. Signed in, the levels you've beaten, the parts you placed in each level and the Sandbox board are saved to your account and follow you to any computer. Levels beaten add up across computers; for boards, the copy changed last wins. The view and the scroll lock stay on each computer.
- **Share** (Sandbox only) saves a copy of the board and copies a link to it. The link opens that board in anyone's Sandbox, signed in or not, and Undo brings back the board they had. Sharing needs you to sign in. Each share is its own copy; past 100, the oldest one is removed.
- On a shared computer, the browser save remembers whose it is. A guest's progress joins the first account that signs in; another player's never does: signing in swaps it for that player's own. Signing out saves anything not sent yet, then starts the computer fresh for the next player. If someone is already signed in to Level Lab in that browser, the sign-in asks "Are you …?" first.
- Guests, the phone app and copies opened from disk play exactly as before, with the browser save.

Which Level Lab it talks to comes from `?studio=` in the address: release (levellab.com) by default, or `?studio=dev` / `?studio=stage` for testing (sign in to that test site in the same browser first). Sign-in only works on studio.levellab.com.

The **Examples** menu in the top bar loads ready-made contraptions (Domino Run, Seesaw Launch, Fan Elevator, Wrecking Ball, Bounce Alley, Launch & Catch, Plank Bridge, Bell Ringer). They live in `src/examples.js` as plain lists of `[type, x, y, rot]`.

## Gadgets

| Gadget | Size | What it does |
|---|---|---|
| Ball | ½×½, 1×1 or 2×2 (Size) | Rolls and falls. One tray card, starting as the medium ball; Size steps it ball (1, medium) → bowling ball (2, heavy) → marble (½, light), staying centered across with its bottom where it was. Each size snaps to the center of its cell. In a level, a ball part can be any size |
| Domino | ¼×1½ (Size: 2 or 1 tall) | Tips over and takes the next one with it |
| Ramp | 1×1 (Size cycles it) | Static slope. Flip it to slope the other way, Rotate for all four orientations, and Size makes it long (2×1), steep (1×2) or big (2×2) |
| Block | 1×1 (Size cycles it) | Solid block to build on |
| Seesaw | 3×¾ (Size: 4 wide, or 3 wide shifted half a cell left or right) | Plank on a hinge. Drop something on one end to fling the other. A shifted plank has a long end and a short end and starts tipped with the long end resting on the ground; the fulcrum stays put when you change its size |
| Bouncer | 1×½ | Springy pad; marbles bounce off it |
| Fan | 1×1 | Pushes anything up to 3 cells in the direction it faces. Rotate to aim it |
| Pendulum | 1×3¼ | Heavy ball on a rope. Swings when hit. Rotate swings the ball out 1½ across, left or right, to start it off |
| Plank | 3×¼ (Size: 4 or 2 long) | Loose board — bridges gaps, falls when pushed |
| Bucket | 1×½ (Size: 1½×¾, 2½×1¼) | Catches a ball. Walls and floor are ¼ thick, and the inside is exactly a ball wide: ½ for the marble (the default), then 1 for the ball and 2 for the bowling ball as Size steps it up, with arms half the ball's height, growing evenly around its cavity so the cavity stays lined up under the ball. The inside stays free to drop things into |
| Conveyor | 2×½ | Carries whatever sits on it, the way the arrow on its front points. Flip it to run the other way; Rotate to turn it |
| Launcher | 1×½ | Fires whatever is on it shortly after Play, in the direction it faces |
| Bell | 1×1 | Rings and swings when hit |
| Star | 1×1 | The goal |

## How it's built

- **Plain HTML/CSS/JS.** Three.js and cannon-es are bundled once into `vendor/libs.js` (see `vendor/README.md` to upgrade them). Game code is classic `<script>` files, no modules, no bundler.
- The world is a true 3D voxel grid (`x`, `y`, one cell deep in `z`). The view is a side-on perspective camera (30° lens), so pieces show a little depth.
- The board is infinite. Ground is at `y = 0`; nothing can go below it.
- Physics runs only while playing. Bodies are created from placed items on Play and thrown away on Stop. Dynamic bodies are locked to the X/Y plane.

### Files

| File | What |
|---|---|
| `vendor/libs.js` | Three.js + cannon-es, exposed as `THREE` and `CANNON` globals. |
| `src/gadgets.js` | Gadget registry (code still says "gadget"). Each gadget has `makeMesh()` (looks), `makeBody()` (physics), a footprint box (`w`,`h`, multiples of ¼; an optional `footprint()` lists just the quarter cells it really fills) and an `offset` inside that box. Multi-part gadgets (seesaw, fan, pendulum) use `makeBodies(group)` to return several bodies plus constraints, and optional `onStep` / `onFrame` hooks. |
| `src/main.js` | Scene, cameras, board state, drag/drop, play loop, sounds, Levels / Sandbox modes. |
| `src/studio.js` | Level Lab sign-in, saving progress to the account, and share links (Studio). Loaded after `main.js`; `main.js` calls its `cloudSaved()` after each save. |
| `src/levels.js` | The levels, easiest first: name, goal line, parts on offer, locked pieces, and one known solution (used only by the checker). |
| `src/examples.js` | Sandbox examples. |
| `tools/check-levels.cjs` | Plays every level and example in Node with the game's own physics (`buildWorld` in `src/gadgets.js`). A level passes when its solution reaches the star and its locked pieces alone don't. `node tools/check-levels.cjs [level] [--trace / --free]`. |
| `assets/sounds.js` | Four short sound effects, base64-embedded (see `assets/README.md`). |
| `src/style.css` | Chrome, on the [Level Lab design system](https://levellab.com/style): dark theme, Roboto, 5px grid, `.button` / `.button-accent` / `.button-icon`. Tokens are copied in so the page still works offline. |

### Swapping in real 3D assets

Each gadget's `makeMesh()` returns any `THREE.Object3D`. Replace the placeholder geometry with a loaded GLTF (scaled to fit the footprint, origin at the cell center + `offset`) and nothing else needs to change. `makeBody()` stays as the simple collision shape. Sounds play on impacts (tap / thud / boing by what hit what) and on winning.

## Native app (Capacitor)

The same files ship as an iOS / Android app through [Capacitor](https://capacitorjs.com).
`tools/build-www.cjs` copies the runtime files into `www/` (gitignored), and
`npx cap sync` puts them into the native projects in `ios/` and `android/`.

```sh
npm install          # once
npm run ios          # copy, sync, open Xcode, then press Run
npm run android      # same for Android Studio (needs Android Studio's Java)
npm run sync         # copy + sync both, without opening anything
```

Run `npm run sync` again after changing the game, before building the app.
App id: `com.levellab.clatterlab` (in `capacitor.config.json`).
