---
title: Swaying Meadow Canvas
category: creative-canvas
---

- **Write a single self-contained HTML file (no external dependencies, no build step, no frameworks, no CDN) that renders a full-page canvas animation of a summer meadow. Requirements:**
  - Pure vanilla JS + HTML + CSS only, inline in one file.
  - Use an HTML5 `<canvas>` element sized to fill the viewport, responsive to resize.
  - **Scene composition:**
    - **Sky:** Clear gradient from light cyan at the horizon to deeper azure overhead, with 2–4 soft white clouds drifting slowly.
    - **Meadow:** Thousands of individual grass blades rendered in perspective layers — bright vivid greens in the foreground, fading to softer muted greens and pale yellows in the distance.
    - **Wildflowers:** Vibrant poppies (red/orange), daisies (white/yellow), and lavender (purple) interspersed among the grass, swaying in sync with the breeze.
    - **Insects:** A few butterflies and dragonflies with realistically flapping wings, fluttering gently through the scene.
  - **Animation:**
    - Grass blades sway using sine-wave displacement with varied phase, speed, and amplitude to create natural rolling waves across the field.
    - Sway speed varies per blade — no two blades move identically.
    - Foreground grass is more detailed and opaque; background grass is more translucent and desaturated.
    - Butterflies/dragonflies follow gentle curved paths with alternating wing-flap speeds.
  - **Lighting:**
    - Warm sunlight with subtle moving highlights and shadows across the grass.
    - Slight color variation per blade to prevent uniformity.
  - **Mood:** Alive, peaceful, hypnotic. Animation loops naturally in real time at smooth framerate.
  - **No text, no UI elements — pure visual scene.**
