---
title: Stardrift
category: game-3d
---

You are producing one entry for a creative coding benchmark. Work fully autonomously - do not ask questions.

Deliverable: ONE single fully self-contained HTML file. All CSS and JS inline. Zero external resources: no CDNs, no web fonts, no external images, no network requests. All visuals via CSS, inline SVG, or canvas. Must work offline served from a local static server.

Quality bar: this entry will be judged side-by-side against another model's attempt at the exact same brief. Visual polish, originality, attention to detail, and flawless functionality all count. One shot - make it your best work.

TASK: Build "STARDRIFT" - a 3D space tunnel racer game using RAW WebGL (WebGL1 or WebGL2). No three.js, no libraries of any kind - you must write your own shaders, matrix math, and render pipeline from scratch. Gameplay: the player pilots a ship flying forward through a procedurally generated obstacle course in space, dodging obstacles; speed gradually increases; collision ends the run. Requirements: perspective projection camera, hand-written GLSL vertex+fragment shaders, directional + ambient lighting (or better), distance fog or equivalent depth cueing, a visible 3D player ship model (built from triangles in code), procedurally generated and endless course, collision detection, increasing difficulty, score + persistent high score via localStorage, HUD (speed, score), start screen with instructions, game-over screen with restart, keyboard controls (WASD/arrows) and optionally mouse, engine-trail or explosion particle effects, sound effects via WebAudio API, smooth 60fps. If WebGL is unavailable show a graceful error message.
