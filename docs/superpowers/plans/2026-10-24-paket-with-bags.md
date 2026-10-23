# Пакет с пакетами — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the approved minimalist 3D wind/tree/bag collection game with fair 60% rounds and responsive pointer control.

**Architecture:** Pure deterministic tree, cloth and round/world modules run in a module Worker. Three.js renders the same sparse physical geometry and supplies projection/picking. The main app owns accessible HUD/input, one-in-flight worker coordination, visibility pause, audio and fallback; every worker reply contains a restorable world snapshot.

**Tech Stack:** JavaScript ESM, Three.js 0.186.1, Vite 8.3.5, Node 22 tests, static Sites and GitHub Pages deployment.

---

## Chunk 1: Complete game

### Shared interfaces (freeze before parallel execution)

`src/core/tree.js` exports `generateTree(seed, {width=4,height=5,originX=.5}={})`, `treeSway(tree,time,wind)`, `hookAt(tree,hookId,time,wind)`, `treeCapsules(tree,time,wind)`. Tree is serializable `{seed,origin:[x,0,0],height,paths:[{id,points:[[x,y,z]],radii:[r],level}],hooks:[{id,pair:[[x,y,z],[x,y,z]],position:[x,y,z],branchId}]}`. All path/hook points are local to origin; hookAt returns the transformed world pair. treeSway returns a numeric Z rotation in radians; treeCapsules returns [{a:[x,y,z],b:[x,y,z],radius}] in world coordinates. hookAt returns [leftAnchor,rightAnchor]. A single small rotation about the tree origin gives wind sway for both rendering and physical hooks. At least 8 hook locations, separated in the XY projection, left-leaning S silhouette, bounded geometry.

`src/core/cloth.js` exports immutable `BAG_TEMPLATE` with `{positions:Float32Array,indices:Uint16Array,handleTips:[int,int],bodyIndices:[int],particleCount}`. Physical particles <=64, render triangles <=180. `SoftBag` constructor accepts `{id,position:[x,y,z],scale=1,seed=1}`; exposes `positions`, `previous`, `center()`, `translateTo(point)`, `step(dt,{wind,time,anchors:[point|null,point|null],grip:null|{point:[x,y,z]},capsules:[]})`, `snapshot()`, static `fromSnapshot(snapshot)`. Template includes genuine open front/back/sides and two ribbon handle loops in 3D. Snapshot contains {id,seed,scale,positions:Float32Array,previous:Float32Array} plus any required instance parameters. `translateTo` moves both current and previous positions so it does not invent velocity.

`src/core/rules.js` exports `roundConfig(round,seed)`, `makeLayout(aspect=1)`, `acceptsDrop(point,layout)`. Layout is `{aspect,viewWidth,viewHeight,treeWidth,treeX,mouth:{center:[x,y,z],width,depth},collectorScale}` and matches camera fov40, z10, camera/target y3. Mouth remains visibly bottom-left, world y~1, z=.8; tree fits crown between HUD top and collector. Use exact quota and schedules from approved spec, first round22 seconds. One shared acceptsDrop defines input acceptance and renderer glow.

`src/core/world.js` exports `World`, constructor `{seed=1,aspect=1,epoch=1}`. `advance(dt,commands=[])` advances real game clock and a bounded fixed-step physical clock. Commands `{seq,at,type,...}`: `start`, `restart` (seed,epoch), `next`, `grab` (id,point), `move` (point), `drop` (point), `cancel`, `resize` (aspect). For grab/move/drop and SoftBag.grip, point is always the TARGET BAG CENTER in world coordinates after the main app applies the initial grab offset; it is not the raw pointer or a surface vertex. The same target goes to acceptsDrop and glow. No new instance on each move; only a single held bag. Arrival steering guides physical bags from the right to planned hooks before tethers engage. `snapshot()` returns a full clone suitable for transfer/fallback; `World.fromSnapshot(state)` restores. Every visible bag has stable id, state `incoming|tethered|loose|held|capturing`, positions/previous, center, colorIndex, handles (0/1/2), remaining (0..1), and timing/control data. Snapshot root: `{epoch,seed,phase:'ready'|'playing'|'between'|'over',round,time,timeLeft,wind,total,plan,caught,missed,roundCaught,roundMissed,tree,layout,bags,collector:{positions,fill,jolt},schedule,lastCommandSeq,events}` plus required restoring fields. Counts are total-run; quota local. Snapshot collector uses BAG_TEMPLATE scaled to a larger transparent receiver, with bottom support and mouth held open. Event IDs are stable per epoch/round and include kind `collected|missed|grab|unhooked|round` and point. Root time is monotonic game time; phase/roundStart fields disambiguate round elapsed.

`src/renderer.js` exports `GameRenderer`. Constructor `(canvas)`. Methods `resize(width,height)`, `update(state,dt,{heldId,target,dropReady}={})`, `render()`, `project(point)` -> `{x,y,visible}` CSS pixels relative canvas, `pointerPoint(clientX,clientY)` -> world point on z=.8, `pick(clientX,clientY)` -> `{id,center}` or null with minimum48px reach, `getStats()` -> renderer counters, `dispose()`. Uses camera fov40/z10/y3, tree origin/sway and BAG_TEMPLATE, no score mutation. Width/height taken from the canvas rectangle. Tree and all bags are genuine meshes with depth. Physical position arrays map one-to-one to geometry particles. Mesh normals update after completed poses, not during repeated idle renders. Instancing or merged tree geometry keeps draw calls bounded; content pool <=8. Pixel ratio<=1.25 and pixel cap about1M; shadow512, no transmission/postprocessing. Fixed projected controls, visible matching mouth glow, alpha/lighting and subtle crease details.

### Task 1: Scaffold and installation (owner)

**Files:** `package.json`, lockfile, `vite.config.js`, `.gitignore`, `.openai/hosting.json`, approved spec and this plan.

- [x] Create isolated new repository and copy approved design.
- [x] Pin Three/Vite and start Sites dependency helper.
- [x] Create a new private Site once and persist its exact ID.
- [ ] Confirm dependency installation succeeds.
- [ ] Commit scaffold and reviewed plan.

### Task 2: Tree + sparse 3D cloth (physics agent)

**Files:** `src/core/random.js`, `src/core/tree.js`, `src/core/cloth.js`, `tests/tree.test.js`, `tests/cloth.test.js`.

- [ ] Write failing Node tests before code: same seed produces identical bounded tree; different seeds differ; at least8 visible separated hook pairs; hookAt/capsules use same sway. Cloth template must have depth, open mouth and two actual handle loops, <=64 nodes; pinned handles remain within tolerance under wind; free/held meshes move in all3 coordinates, bounded edge stretch and finite state; snapshot restore reproduces continuing motion.
- [ ] Run `node --test tests/tree.test.js tests/cloth.test.js`; record expected missing implementation failure.
- [ ] Implement deterministic generator and fixed-step position-based membrane with distance/bending constraints, air drag/wind/gravity and candidate capsule contacts.
- [ ] Run those tests; inspect physical movement and stability, fix real failures without weakening bounds.
- [ ] Report interface details and test evidence. Owner integrates; no other files changed by agent.

### Task 3: Round rules + complete game state (gameplay agent)

**Files:** `src/core/rules.js`, `src/core/world.js`, `tests/rules.test.js`, `tests/world.test.js`.

- [ ] Write failing tests first: exactceil(.6N) over100 rounds, finite fair lifetimes, quota and persistent totals, no automatic wins, collect once, missed once, capture at deadline wins, held bag safe from wind, detach2→1→0, pause owned outsideadvance, restart generation, fullsnapshot continuation, <=22active records under zero collects/oneheld/repeatedmisses.
- [ ] Run tests to observe missing functionality; implement rules and World using shared physics interfaces.
- [ ] Validate actual physics arrival/branch attachment, wide mouth acceptance, free recapture, 22s initial round and progression to a new deterministic tree.
- [ ] Run `node --test tests/rules.test.js tests/world.test.js`; report contracts and evidence.

### Task 4: 3D rendering (visual agent)

**Files:** `src/renderer.js`, optional `src/materials.js`, `tests/renderer-contract.test.js` (only meaningful projection/budget checks).

- [ ] Implement GameRenderer against frozen snapshot, genuine tapered 3D branch tubes and dynamic bag geometry.
- [ ] Create softly lit translucent plastic with visible depth, distinct handles and folds, dark organic tree; preserve reference composition.
- [ ] Implement shared mouth glow and forgiving screen-space picking. Resource reuse/disposal, shadow/pixel limits and canvas resize.
- [ ] Verify module imports/builds with Three; report visual choices and integration notes. Do not edit main app/core/package files.

### Task 5: Worker bridge, UI and interaction (owner)

**Files:** `src/worker.js`, `src/runner.js`, `src/main.js`, `src/style.css`, `src/audio.js`, `index.html`, `tests/runner.test.js`, `tests/worker.test.js`.

- [ ] Test one-in-flight backpressure, init/run errors, late replies after restart, coalesced moves without losing grab/drop, and restored fallback commands before bridge implementation.
- [ ] Build module Worker around World, transferring copies of snapshot arrays. Keep one full confirmed state and unacknowledged commands for fallback. Tag generation and command sequence.
- [ ] Implement four-corner HUD, lightweight bars near tethered bags, intro, interlude, end result and retry; author credit; best local score with storage errors caught.
- [ ] Implement pointer capture: select visible bag, retain grab offset, soft drag point on z=.8, projected mouth glow, drop/cancel, one pointer only. Keyboard Enter/Space start/continue, R restart; accessible dialog/help and labels.
- [ ] Real game clock excludes document.hidden and help pause; blur cancels held pointer. Add quiet synthesized rustle enabled by gesture and a mute control.
- [ ] Opt-in `?debug=1` shows visible performance/counters for browser QA; default play UI contains no diagnostics.

### Task 6: Integration, browser QA and publication (owner + fresh reviewers)

**Files:** all source, tests, `README.md`, `.github/workflows/pages.yml`.

- [ ] Run `npm test` and `npm run build` and fix integration failures using targeted failing regressions.
- [ ] Request independent spec-compliance and quality reviews; resolve actual blockers.
- [ ] Launch local preview per Sites local-preview reference; test mouse drag/drop, timer, round failure/retry, successful threshold transition/new tree, real worker, falling/offscreen losses and alpha appearance.
- [ ] Use a local QA iframe harness at390×780 to verify narrow viewport inside the browser; do not call it a physical phone test.
- [ ] Measure active frame/worker times, visible triangle/node/object counts and a later round. Fix demonstrated cost; repeat only changed checks.
- [ ] Write README controls, constraints, build/deploy and physics limits. Commit final source.
- [ ] Publish new Site through source helper, exact commit/archive, preserve owner-private audience; verify terminal deployment success.
- [ ] Publish source/build to a separate GitHub repository/Pages following existing user hosting preference, attach no PR unless created. Verify successful workflow and matching deployed bytes.
- [ ] Save published screenshot, show resulting game/address, stop owned preview servers and close temporary QA tabs.
