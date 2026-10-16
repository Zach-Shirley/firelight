# Firelight

**Survive one night in a dark room. Keep the fire alive, eat, and be careful what you let in.**

A short horror-survival game in chunky pixel art. One night lasts about seven minutes and gets worse every hour. Most first nights end in death; each death screen tells you what killed you and gives a hint. Your score is whatever you still have at dawn.

**Play:** https://firelight-topaz.vercel.app (desktop browser, keyboard or mouse)

![Title screen](docs/title.jpg)

## How to play

| Key | Action |
| --- | --- |
| S | Stoke the fire (1 wood) |
| E | Eat (1 meat) |
| G | Go out for wood (short trip) |
| H | Go out to hunt (longer trip: meat, sometimes blood) |
| F / Space | Burn the hand (1 wood, needs a fire) |
| R | Run back from a trip |
| B | Build |
| 1–4 | Dialogue choices |
| J | Journal (everything you've heard tonight) |
| M | Sound |
| Esc | Menu, which pauses |

## What can kill you

Every threat has a tell and a counter. Threats arrive as the night goes on.

| From | Threat | The tell | What saves you | Death |
| --- | --- | --- | --- | --- |
| 10 pm | **The dark** | Eyes gather, a heartbeat starts, red creeps in from the edges | Keep the fire above smoldering. It burns down faster every hour | The dark comes in |
| 10 pm | **Hunger** | "your stomach aches", then "starving" (which also slows you down) | Eat. Meat comes from hunting, traps, the woodcutter and the kid | You starve |
| 11 pm | **The thing in the trees** | A howl, and amber eyes shining in the treeline outside the window | Don't go out while it's close; run back if it howls while you're out. You get a moment to run | It finds you in the trees |
| midnight | **The mimic** | Real visitors' **footsteps crunch through the snow before they knock**. The mimic just knocks. The blood lantern shows a shadow of feet under the door, or nothing | Keep the door shut when nothing walked up | You opened the door. It was not a person |
| 1 am | **The hand** | Scraping at the window, then a long gray hand reaching in | Burn it with a branch. With boards up, it tears one off and drags your wood out instead | It climbs in, even while you're out |

**The door never opens by itself.** Every knock asks you: open it, or keep it shut.
- **The stranger** knocks first. Let her in and she teaches you the rules as the night goes on.
- **A hungry kid** asks for meat and comes back later with a gift.
- **A woodcutter** trades meat for wood.
- **A lost traveler** leaves a few logs.

The mimic can wear any of their voices. Keep the door shut on a real visitor and you just hear their footsteps leave. Keep it shut on the mimic and the knocking stops, but no footsteps leave.

| | |
| --- | --- |
| ![The room, with eyes in the treeline](docs/room.jpg) | ![The hand reaching through the window](docs/hand.jpg) |
| ![A knock, seen by the blood lantern](docs/knock.jpg) | ![Out on a trip](docs/away.jpg) |

## Building

Everything you build costs score, so building is a tradeoff.

| Build | Cost | What it does |
| --- | --- | --- |
| Window boards | 8 wood | Three boards. The hand has to tear through them. Repair one for 3 wood |
| Trap (up to 3) | 5 wood each | Meat, and sometimes blood, collected on every trip. The smell keeps the thing in the trees close for longer |
| Blood lantern | 4 wood + 2 blood | Red light under the door shows whether anything is actually standing there. An easier tell for players who haven't learned the footsteps |

## Score

Only a night survived to dawn scores.

| Kept at dawn | Points |
| --- | --- |
| Each wood | 1 |
| Each meat | 3 |
| Each blood | 5 |
| Each level of fire | 10 |
| The stranger still with you | 25 |

Stockpiling is the hard part, because surviving means spending.

The top-10 board takes three arcade initials. It's stored in the browser on that computer, like a single arcade cabinet; a shared online board would need a server, which was left out of scope.

| | |
| --- | --- |
| ![The mimic in the doorway](docs/mimic.jpg) | ![You died](docs/died.jpg) |
| ![Dawn](docs/dawn.jpg) | ![Score](docs/score.jpg) |

## Difficulty, tuned by simulation

[tools/sim.js](tools/sim.js) plays full nights at high speed through the game's test hook, with three automated players:

- **Beginner:** keeps the fire up and eats when hungry, but opens most doors, ignores the howling, reacts to the hand half the time and rarely builds.
- **Learner:** plays like a beginner, but follows each of the stranger's hints once it has heard it. This models a first-time player who reads.
- **Skilled:** knows every tell. It listens for footsteps, waits out the howling, always burns the hand and keeps boards up.

Results from 120 nights each, on 2026-10-16, after tuning:

| Player | Survives | Main causes of death |
| --- | --- | --- |
| Beginner | 0% | mimic 43%, the hand 43%, the trees 15% |
| Learner | 16% | the hand through a bare window while away 57%, mimic 15% |
| Skilled | 95% | rare dark or hunter deaths, 5% total |

A real first-time player lands between the beginner and the learner, so the large majority of first nights end in death. The skilled bot has perfect reactions, so skilled humans will die somewhat more often than 5%. Tuning changes along the way:
- lowered the background risk of trips;
- added a short grace period after a howl so dying in the trees comes from staying out, not reaction time;
- spaced out the knocks;
- moved the stranger's hints earlier.

To rerun the simulation, open the game locally and run this in the browser console:

```js
const sim = await import('/tools/sim.js');
sim.report(120);
```

## How it's built

Plain HTML, CSS and JavaScript modules, with no framework, no build step and no dependencies.

- **Two-layer rendering.**
  - The room is drawn at 320×180 and scaled by a whole number, so pixels stay crisp squares.
  - A full-resolution light layer draws the darkness. It cuts soft holes for the fire, the blood lantern, the open door and dawn.
  - The eyes, the hand, the hunter's eyes and the red under the door are drawn on that layer, so they glow out of real darkness.
- **The night** is one state object advanced in fixed 50 ms steps. The fire, hunger, dread, the hunter's cycle, trips, the hand's phases (idle, warn, reach, steal or retreat) and door scheduling are each a small update function, gated by the hour. Dialogues pause the night; the hand does not.
- **Sound** is generated with the Web Audio API, with no audio files:
  - fire crackle;
  - wind;
  - knocks and footsteps in snow;
  - the howl;
  - a board splintering;
  - the hiss of the burning branch;
  - the heartbeat;
  - a death drone and a dawn chord.
- **Scoring and the leaderboard** are pure functions in [score.js](score.js), with Node unit tests. Stored entries are sanitized before use.

```
index.html          markup: canvases, HUD, actions, dialogue, panels, title and ending screens
style.css           pixel-styled UI, all sized from one --s scale variable
main.js             the night, threats, trips, doors, drawing, UI wiring
sound.js            procedural audio
score.js            scoring and leaderboard logic (pure, tested)
tests/              Node test runner tests
tools/sim.js        difficulty simulation (not deployed)
docs/               README screenshots
```

## Run locally

```bash
python -m http.server 5350 --bind 127.0.0.1
```

Then open http://127.0.0.1:5350.

```bash
npm test
```

Pushes to `main` deploy to Vercel automatically.

## Verification

Checked on 2026-10-16:

- **The simulation runs above,** about 1,000 full nights across the three players during tuning.
- **Each threat triggered directly in a desktop browser preview,** using the test hook (`window.__firelight`):
  - the hunter's eyes in the treeline;
  - the hand reaching through a bare window and through boards;
  - burning the hand;
  - the blood lantern's shadow under the door;
  - a trip, and running back;
  - the mimic death, with the figure in the doorway;
  - the death screen with cause and hint;
  - dawn, the score screen and initials.
- **9 unit tests pass,** with no console errors.
- **Screenshots** were staged with the test hook, so their numbers aren't from real play.

## Known limits

- **Untested hardware:** never tested on a Chromebook or a touch device, and nobody has listened to the sound yet.
- **The simulated players are approximations.** Real players may find a threat harder or easier than the numbers suggest, especially the footsteps tell, which is text plus a sound.
- **Per-browser leaderboard.**
- **No mobile layout.**
- **School web filters** may block `vercel.app`.

## Credits

Inspired by *A Dark Room* by Michael Townsend / Doublespeak Games. No code, text or art was copied from it.

Built with heavy AI assistance (Claude Code) under Zach Shirley's direction:

- **Zach:**
  - **Concept and look:** chose the concept and the chunky pixel style with smooth firelight.
  - **Core horror elements:** the eyes in the dark, and visitors with dialogue.
  - **This redesign:** called out that the previous version had no stakes, and set:
    - the target that most players should die;
    - one short night that escalates;
    - wood-stockpile scoring;
    - the hand at the window that breaks boards and steals wood;
    - the blood lantern as an easier tell;
    - doors that never open by themselves;
    - a hunger mechanic and dangerous hunting trips;
    - no jump scares.
- **Claude Code:**
  - the mechanics design within that direction;
  - the code, art, sound and writing;
  - the simulation-based tuning and testing.

The font is [VT323](https://fonts.google.com/specimen/VT323) (SIL Open Font License).

## License

No open-source license has been chosen. The code is public to read, and all rights are reserved.
