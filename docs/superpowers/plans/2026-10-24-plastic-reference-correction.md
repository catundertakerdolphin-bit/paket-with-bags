# Объёмное дерево и мягкая плёнка — Implementation Plan

> **For agentic workers:** use subagent-driven-development. The user's correction and supplied images authorize this revision; no additional approval gate. The new references supersede the earlier thin silhouette, timed handle snapping and static collected templates.

**Goal:** Match the supplied brown low-poly trees on pure white and thin plastic bag reference, with real local deformation, contact-created snagging and physical crumpling inside a larger bag.

**Architecture:** Keep the existing deterministic World/Worker/runner and pointer command ordering. Replace the shape-preserving cloth cage with a sparse surface using stiff local edges and compliant adjacent-face hinges. Detect branch contacts on all live bags. Only contacts may create temporary pins. Keep the same cloth instance when collected; bound retained contents to eight and sleep settled meshes. Make the receiver a persistent supported SoftBag.

**Tech Stack:** Existing Three.js 0.186.1, Vite 8.3.5, Node tests, module Worker, existing Sites project and GitHub Pages.

**Latest user refinement during preview:** the bag must be an integral T-shirt carrier with deep U cut-outs and high broad side handles, explicitly excluding separate arch ribbons over a rectangle. New supplied references `codex-clipboard-47f888bb-b819-44df-a622-77e96f6d1658.png` and `codex-clipboard-6321d56e-c75b-4e94-9fdc-eb262f23d761.png` take priority. Free flight must visibly buckle and turn unevenly under spatial gusts. The leafless tree should make a graceful stronger S-wave toward the left, reminiscent of a windswept bonsai, while retaining actual 3D facets and depth. Continue the authorized correction without a new approval gate.

## Evidence and intended result

- Tree authority: `/Users/arseny/Desktop/Снимок экрана 2026-10-24 в 03.19.25.png`: brown faceted tapered trunk, broad layered bonsai arches and terminal bare forks, depth and side lighting. Plastic authority: supplied `codex-clipboard-a4b879fa-1957-420e-a6f0-e9ad1b77d186.png`: thin translucent shell, broad integral handles, visible folds.
- Current tree multiplies two dark colors, smooths facet normals, spreads branches only ±.18 in Z and arranges six horizontal shelves. Current film has distant cross-body shape links, uniform whole-object grip and scripted translations to hooks. Collected objects are deleted and replaced with static squashed templates.
- Reuse old kraft simulator `../dist/index.html`: local hand, analytical dihedral gradients/XPBD, capsule/triangle nearest geometry; do not port its high internal damping, tearing or full expensive self-contact.
- Alternatives considered: merely tuning the old spring cage cannot create local folds; importing a full softbody engine adds cost and does not resolve art direction. Selected small local XPBD surface reuses the existing bounded worker.
- Primary sources: https://mmacklin.com/xpbd.pdf ; https://mmacklin.com/smallsteps.pdf ; https://github.com/matthias-research/pages/blob/master/tenMinutePhysics/15-selfCollision.html ; https://threejs.org/docs/pages/MeshPhysicalMaterial.html . Use original local implementation ideas, not copied proprietary imagery.

## Frozen integration contracts

### Cloth (physics owner)

Keep `BAG_TEMPLATE.positions`, `indices`, `bodyIndices`, `handleTips`, `particleCount`. Redistribute particles to more body rows and integral side handles cut from the continuous upper shell, with no separately attached arch ribbons: <=100 particles, <=180 triangles. Add `rimIndices` for the open body mouth. All geometry remains a genuine open shell with depth and two handles. Existing template dimensions may change slightly; consumers derive bounds, never hardcode particle IDs.

`new SoftBag({id,position,scale,seed,shape=[1,1,1]})`: shape nonuniformly scales the rest template before constraints, preserving body-center translation semantics. `positions`, `previous`, `center()`, `translateTo()`, snapshot/fromSnapshot remain supported. Snapshot preserves shape and every state influencing continuation.

`step(dt, {wind,time,anchors,pins=[],grip=null,capsules=[],containment=null})`: anchors keeps old handle-tip compatibility for isolated tests, game no longer uses it. Pins are `{index,point}` and pin only those material particles. Grip `{index,point}` pulls one particle and a small adjacent patch; **point is local grip particle's world target**. Legacy no-index grip may retain old center-target behavior for compatibility but World always supplies index. Contact detection runs after local membrane constraints and reports `bag.contacts`: bounded array `{index,point,capsuleIndex}` from actual branch contact, including face/edge contacts between sparse vertices if feasible. No snapping based on schedule or hooks. Surface collision, not full topological entanglement, is an explicit approximation.

Containment `{center:[x,y,z],halfWidth,halfDepth,floor,ceiling}` is a physical boundary volume: project particles within walls/floor/descending ceiling, permit local folding, not uniform template scaling. Defaults absent. Wind acts on surface normals plus deterministic local gust variation; preserve signed horizontal travel and bounded movement. Use 3–4 small substeps, soft hinge compliance, low internal damping and no distant front/back shape cage. Expose a local `impulse(point,delta,radius)` only if useful; root may alter previous positions for receiver impact.

### Tree/renderer (visual owner)

Keep `generateTree`, paths/radii, hooks, sway and capsules APIs; hooks become **flight lane hints**, not guaranteed pins. Generate broad layered bonsai arches and terminal bare forks, branch Z spread >=.7 and sculptural trunk radius roughly .25; <=120 capsules. Keep hook IDs stable and >=8 distinct usable projected locations. Retain camera/drag projection initially.

Renderer: pure white scene; shadow-only floor; single warm brown color source, white material multiplier, flat-shaded facets and dominant side light. Keep merged tree, pixel/shadow budgets. Plastic uses real deformed normals, subtle fine creases and fresnel/edge sheen; avoid thick glass, heavy transmission and solid pastel boxes. Add selected particle on pick: `{id,center,particle}`; ray hit chooses nearest vertex in hit face; forgiving screen pick chooses a nearby surface node.

World snapshot `collector` becomes `{positions,fill,jolt,soft:fullSoftSnapshot,contents:[{id,colorIndex,positions,previous,center,...restoreFields}]}`. Render `collector.contents` directly using these deformed positions, keyed by stable ID and bounded to8. Remove static template squashing. Dispose evicted content; do not render the same capturing bag twice.

### World/UI (root)

Keep commands' `point` as conceptual target bag-center for existing screen mapping/drop acceptance. Grab adds optional `particle`. World stores its actual `gripIndex` and initial `gripOffset = materialParticle - bodyCenter`; physical grip target is command point + gripOffset. This preserves pointer offset and shared mouth glow while deforming only the picked patch.

Incoming bags get initial velocity and seeded flight lanes through/around crown; no per-frame translateTo and no automatic incoming→tethered at attachAt. `attachAt` remains scheduling/lane hint, not physics trigger. Include intentional miss lanes and real geometry contacts on incoming/loose/held. Actual contact creates up to2 pins away from designated handle tips. Store local tree coordinates; re-evaluate world anchor under same sway. Contact age/lifetime and tension release pins in stages; held state removes all pins. Noncontacts fly past and count missed when out of bounds. All visible live bags remain catchable.

Retain 60% of spawned total, score exactly once, real deadlines, retry and persistent totals. First round must be playable and leave time to catch incoming/missed lanes. Test representative seeds for contact and pass-through; adjust flight speed/lanes based on evidence, not forced magnets.

On valid drop, score once, keep actual deformed cloth and move through receiver mouth into progressively smaller containment; no immediate scaling, reset or geometry replacement. After ~1.2s of actual physical entry, move same record to capped content pool; step fresh contents for a bounded settling period, then sleep preserving creases. Promote captures before early next-round transitions. Receiver is a SoftBag with supported rim, floor and small wind; collected impacts perturb its actual positions/velocities. Snapshot restoration preserves receiver, content states, pins and grips.

Pure white CSS backgrounds/gradients. HUD four corners, bars only attached bags, author credit and existing controls stay. Derive receiver proportions from template bounds; enlarge enough to read as a plastic bag. Describe contact/miss behavior accurately in help. No extra controls or diagnostic details in normal play.

## Chunk 1: Physical and visual correction

### Task 1 — sparse soft film (physics agent)

Files `src/core/cloth.js`, optional `src/core/contact.js`, `tests/cloth.test.js`.

- [x] Add meaningful failing tests for local grip vs far-node response, soft compression without uniform shrink, contact in a triangle face, snapshot continuation and bounded stretch/gust stability. Update obsolete <=64 budget to agreed <=100.
- [x] Observe intended failures, implement local edge/area/hinge solver and contact/containment/pins contracts. Keep body and handle topology open and connected.
- [x] Run cloth tests and a bounded multi-bag Node benchmark; report measured budget and API.

### Task 2 — volumetric reference rendering (visual agent)

Files `src/core/tree.js`, `src/renderer.js`, `tests/tree.test.js`, `tests/renderer-contract.test.js`.

- [x] Add failing meaningful geometry/depth/fork tests; preserve outward winding and projection tests.
- [x] Implement spatial irregular fork generator and facet lighting/material correction; remove obsolete shadow constant.
- [x] Implement plastic crease sheen, particle picking and real keyed content poses from snapshot. Do not edit CSS or physics/core World.
- [x] Run owned tests; root handles browser launch and visual fidelity review after integration.

### Task 3 — contact lifecycle and receiver (root)

Files `src/core/world.js`, `src/core/rules.js`, `src/main.js`, `src/style.css`, `index.html`, `tests/world.test.js`, relevant worker/runner tests only if contract requires.

- [x] Replace obsolete guaranteed-handle test with failing contact-created snag/miss test; add full physical capture/settling and receiver snapshot continuation tests. Preserve score/deadline/fallback invariants.
- [x] Implement flight/contact pins, local gripping, progressive capture, eight retained physical contents, supported soft receiver, complete restore.
- [x] Update point picking integration, white UI and help. Tune initial flight and lifetime using actual replayable seeds.

## Chunk 2: Evidence, review and publication

- [x] Run complete tests/build after integration; fix demonstrated failures with targeted regressions.
- [x] Browser QA against both supplied references: pure white pixels, brown faceted tree depth, fold/sway on branch, local deformation during drag, natural miss lane, actual crumpling inside moving receiver. Record before/after full-size screenshots and timings.
- [x] Narrow viewport and playable60% transition; verify score, deadline, pause/retry and worker. Functional tests do not establish visual fidelity.
- [x] Fresh independent spec and quality review; resolve concrete blockers.
- [ ] Commit and push GitHub, verify Pages workflow and exact deployed build. Package using existing Sites identity/source result and publish with preserved private audience; verify terminal success.
- [ ] Deliver links and screenshot; stop owned preview and close temporary tabs.

### Integrated verification evidence

- Old kraft analytical local grips/hinges and triangle contact informed the film implementation; no old product source modified.
- Final film has 85 vertices and 156 triangles with a single integral U-neck boundary, side handles and physical local deformation. Rigidity regressions measure changing internal distances and partial unfolding, not object translation. Still air has no artificial gust, receiver/content wind is naturally reduced.
- Indexed hand now moves kinematically at a bounded 30 world units/s; a 6-unit drag over 0.4 s follows with 0.245-unit body lag and 1.035× maximum edge stretch.
- Capture hard-clamp teleport was reproduced at 2.724 world units/frame and fixed by physical entry gating and a gradual compression volume; multiple pickup points enter continuously.
- Browser manual pointer transfers scored 4/6 before timeout. Active browser frames median 16.7 ms / P95 17.7 ms, Worker roughly 3–4 ms in the wide desktop preview.

- Final local verification: all 62 tests passed and the production build succeeded. Four manual desktop pointer transfers advanced to round 2 with the cumulative score of 4. At 390×780, a native pointer drag scored +1 and the whole crown fitted. The temporary viewport override was reset.
- Fresh film and code reviews approved the calm-air, bounded-grip and continuous-entry regressions. Independent full-size visual comparison approved the integral T-shirt cutout silhouette and faceted leafless bonsai. Fine photographic wrinkles remain approximated by broad low-poly folds and shader details.
