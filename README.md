# Firelight

A small, visual take on the idea behind *A Dark Room*: a single firelit room drawn in chunky pixel art, where the fire is the whole game. Keep it burning and the room stays warm and visible. Let it die and the dark fills with eyes.

Play it: https://firelight-topaz.vercel.app (desktop browser, keyboard or mouse).

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

## Round 2 (2026-10-15): building, visitors, sound

The game grew past the MVP, still inside the one room.

- **The stranger builds.** After her "deal" line, a **build** menu (B) opens up. Each item shows up in the room:
  - **trap** (up to 6; the wood cost rises each time). Adds a **check traps** action (T, 25-second cooldown) that brings in fur, meat and teeth.
  - **cart:** gathering brings in twice the wood.
  - **window boards:** nothing appears in the window anymore, and no window events happen.
  - **fur rug:** the fire burns down slower (40 seconds per level instead of 30).
  - **lantern:** a second pool of light by the door that eyes won't enter.
- **New materials:** fur, meat and teeth. They show in the top-left once you have traps.
- **Visitors and events** arrive every minute or so after the stranger's deal, sooner in the dark:
  - **Nomad:** trades wood, fur, teeth and meat.
  - **Hungry kid:** give 2 meat and they come back later with furs and teeth.
  - **Tapping on the window** (dark only): "look" shows a pale face pressed to the glass, with a sound sting and a screen shake. Afterwards it leaves teeth on the sill.
  - **Scratching at the door** (dark only): open it and your meat disappears. Throw a log on the fire and it stops. Or wait it out.
- **Sound** is generated live in the browser, with no audio files: fire crackle and roar, gusting wind (louder in the dark and with the door open), knocks, taps, scratches, a scare sting, and a chime when something is built. Toggle it with the sound button or M.
- The message line only queues a couple of lines; everything is still in the journal.

If the stranger is shut out for good, visitors still come but nothing can be built.

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

Round 2 was checked the same way:

- The build panel; building every item and seeing it drawn in the room
- Lantern light keeping eyes away
- Traps producing materials
- The nomad trade
- The kid's meat-for-gift loop
- The window face scare and its teeth reward
- Scratch → open door → meat stolen
- Visitors arriving on their own schedule

Sound starts without errors after the first click, but nobody has listened to it yet.

Deployed: https://firelight-topaz.vercel.app (Vercel project `firelight` under Zach's account, deployed with Zach's approval on 2026-10-15).

## Credits and honesty

Inspired by *A Dark Room* by Michael Townsend / Doublespeak Games. No code, text or art was copied from it; the scene, sprites and dialogue here are original. Built with heavy AI assistance (Claude Code) under Zach's direction: he chose the concept, visual style and MVP scope, and the implementation was AI-written. The font is VT323 from Google Fonts (SIL Open Font License).

## License

No open-source license has been chosen yet. The code is public to read, and all rights are reserved.
