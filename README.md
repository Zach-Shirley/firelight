# Firelight

A small, visual take on the idea behind *A Dark Room*: a single firelit room drawn in chunky pixel art, where the fire is the whole game. Keep it burning and the room stays warm and visible. Let it die and the dark fills with eyes.

Working title. Made by Zach as a game for his sister; not public.

## What the MVP does

- **The fire.** It has five states (dead, smoldering, flickering, burning, roaring) and drops one level every 30 seconds. Stoking costs 1 wood and has a 6-second cooldown.
- **Light.** The pool of light around the fire grows and shrinks with its level. The scene is 320×180 pixel art scaled up crisply, and the glow and darkness are drawn at full screen resolution so the light stays smooth.
- **Eyes in the dark.** At smoldering or below, pairs of eyes open outside the light, blink, and multiply over time. If the fire stays dead, they creep closer, and something starts dragging logs out of the light. Even a flickering fire sometimes gets a peek through the window.
- **Wood.** Gathering adds 2–4 wood (12-second cooldown) and unlocks after the first fire. The wood pile is drawn on screen and grows with the count.
- **One event: the stranger.** After about 40 seconds of a decent fire, someone knocks. The door opens on snow and moonlight, and a dialogue box asks whether to let her in.
  - Let her in: she walks to the fire and sits. Later she speaks and offers to bring in wood, and after that she adds a log every 15 seconds while the fire is at flickering or better.
  - Shut the door: she comes back once. Shut it again and she's gone for good, and the dark gets more crowded.
- **No scrolling log.** One line fades in and out at the bottom. The **journal** button (J) shows the history when wanted.
- **Saves** automatically in the browser (localStorage). **Restart** wipes the save.
- **Keys:** S stoke, G gather, 1/2 dialogue choices, J journal, Esc close.

## Run it

It's a plain static site with no build step.

```bash
python -m http.server 5350 --bind 127.0.0.1
```

Then open http://127.0.0.1:5350. Any static host, including Vercel, can serve the folder as-is.

## Verification so far (2026-10-15)

Checked in a desktop browser preview using a test hook (`window.__firelight.step(seconds)`) that advances game time:

- Lighting the fire, stoking, gathering
- The fire burning down through every level
- The stranger knocking and the door opening with her in the doorway
- Let in → walk → sit → talk → bringing wood
- Shut out → return → gone
- Eyes appearing, blinking and approaching in the dark
- Wood being stolen in a long darkness
- Journal, saving

No console errors. Not yet tested on an actual Chromebook. The balance numbers are first guesses.

## Credits and honesty

Inspired by *A Dark Room* by Michael Townsend / Doublespeak Games. No code, text or art was copied from it; the scene, sprites and dialogue here are original. Built with heavy AI assistance (Claude Code) under Zach's direction: he chose the concept, visual style and MVP scope, and the implementation was AI-written. The font is VT323 from Google Fonts (SIL Open Font License).
