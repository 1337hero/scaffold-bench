---
title: Castle Keeper
category: game
---

You are producing one entry for a creative coding benchmark. Work fully autonomously - do not ask questions.

Deliverable: ONE single fully self-contained HTML file. All CSS and JS inline. Zero external resources: no CDNs, no web fonts, no external images, no network requests. All visuals via CSS, inline SVG, or canvas. Must work offline served from a local static server.

Quality bar: this entry will be judged side-by-side against another model's attempt at the exact same brief. Visual polish, originality, attention to detail, and flawless functionality all count. One shot - make it your best work.

TASK: Build "CASTLE KEEPER" - a Defend-Your-Castle-style game on canvas. Enemies march from the right toward your castle on the left; you defend by GRABBING them with the mouse and FLINGING them into the air - fall damage kills them with a satisfying splat. Requirements: mouse grab-and-fling as the core verb: click-hold an enemy to pick it up (it flails - animate limbs procedurally, simple stick-figure ragdoll feel), drag and release to throw with the drag velocity; throw height determines fall damage - small drops just stun, big throws splat; flung enemies can also damage others they land on; castle has HP - enemies that reach it chip away (sappers explode for big damage); waves escalate in size and introduce enemy types: basic walker, fast runner, heavy brute (needs a really high throw or two), sapper (bomb carrier - fling it back at the crowd to detonate among enemies), armored knight (immune to throws every Nth wave? your design - but must force tactic change); between waves: spend souls/coins earned per kill on upgrades: castle repair, max HP, auto-archers that pick off walkers, a slow-down aura, splat bonus, and ONE castle visual upgrade tier per few waves so progress is visible on the castle itself; wave counter, HP bar, money, kill stats; blood/splat particles (cartoony, not gory), screen shake on big splats, flailing scream + splat sounds via WebAudio; game over screen with stats, wave-N-reached high score in localStorage; pacing: waves should have breathing room, with a clear START NEXT WAVE button. The grab-fling physics must feel responsive and darkly funny - that interaction carries the whole game.
