# Firelight

**Survive one night in a dark room. Keep the fire alive, eat, and be careful what you let in.**

A short horror-survival game in chunky pixel art. One night lasts about seven minutes and gets worse every hour. Most first nights end in death; each death screen tells you what killed you and gives a hint. Your score is whatever you still have at dawn.

**Play:** https://firelight-topaz.vercel.app (desktop browser with keyboard or mouse, or a phone held sideways)

![Title screen](docs/title.jpg)

## How to play

| Key | Action |
| --- | --- |
| S | Stoke the fire (1 wood) |
| E | Eat: hot cooked meat warms you up; raw if that's all you have (it barely helps and makes you sick). 1.5 s cooldown |
| C | Cook up to 3 raw meat. It finishes on its own in about 6 s, as long as the fire is lit |
| G | Go out for wood (short trip) |
| H | Go out to hunt (longer trip: meat, sometimes blood) |
| F / Space | Burn her claws (1 wood, needs a fire) |
| R | Run back from a trip |
| B | Build |
| 1–4 | Dialogue choices |
| J | Journal (everything you've heard tonight) |
| M | Sound (also on the title screen; the game goes silent while the tab is in the background) |
| Esc | Menu, which pauses |

## What can kill you

Every threat has a tell and a counter. Threats arrive as the night goes on.

| From | Threat | The tell | What saves you | Death |
| --- | --- | --- | --- | --- |
| 10 pm | **The dark** | Eyes gather, a heartbeat starts, red creeps in from the edges | Keep the fire above smoldering. It burns down faster every hour | The dark comes in |
| 10 pm | **The cold** | Teeth chattering at "cold"; at "freezing" frost and ice creep in from the screen edges, and your hands and trips slow down | The snow drains your warmth while you're out and when the fire is low (or the window is bare). A good fire warms you back up, and hot cooked meat warms you fast | You freeze |
| 11 pm | **The thing in the trees** | A howl, and its amber eyes shining in the treeline outside the window. While you're out and it's close, **a grin grows beneath its eyes**: faint at first, then wider and toothier as it closes in, fast once it has howled | Don't go out while it's close. Run back when the grin starts to widen; you come home empty-handed | A full grin |
| midnight | **The mimic** | Real visitors' **footsteps crunch through the snow before they knock**. The mimic just knocks, word for word in the voice of someone you'd open for. There is only one stranger | Keep the door shut when nothing walked up | You opened the door. It was not a person |
| 1 am | **Her, at the window** | Claws drag down the glass, then it shatters, then a black shape backlit in red | Board the window beforehand. With boards up she claws through the gap to a rhythm of thuds, and you can burn her. If she outlasts you, she tears a board off and drags your wood out | Bare window: she climbs in, even while you're out. You can still nail boards up in the last seconds |
| 3 am | **The walkers** | Some mimics have learned to fake footsteps. Nothing in the text or sound gives them away | A lit **blood lantern** shows a shadow of feet under the door, or nothing | You opened the door |

**The door never opens by itself.** Every knock asks you: open it, or keep it shut. Opening for the right people matters:
- **The stranger** knocks first. Let her in and she teaches you the rules. She hasn't eaten in days, so she needs cooked meat once: she begs three times, and **the third plea is the one that counts**. Feed her earlier and she'll be starving again before dawn. Feed her raw meat and it kills her. If she starves, something starts moving under her skin. Drag her body out into the snow, which is a risky trip, and the smell keeps the hunter close for the rest of the night. Or leave her, and it gets up. Turn her away at the start and none of this happens. You can always tell her to leave when she asks for food.
- **Some nights she isn't the stranger** (about 1 in 8 of the nights you let her in). The tells: her eyes catch the firelight red; she sits too still and never shivers; she never warns you of anything; and she doesn't ask, she demands ("Feed me."). She eats raw meat and smiles. Feeding her holds her off, but the demands come faster and angrier toward dawn. Refuse her twice and she kills you. Keep her until first light and she stops pretending. The only way out is to tell her to leave.
- **A hungry kid** asks for meat and comes back later with meat and blood.
- **A woodcutter** trades meat for wood.
- **A lost traveler** leaves a few logs.
- **A fleeing man** (from midnight) pounds on the door. Let him in and he leaves you meat and blood. Leave him out and you hear him die; then whatever caught him sniffs at your door, dread jumps, and she comes for the window sooner.

Each real person you let in is worth 10 points at dawn.

**Knocks while you're out** wait at the door. You can't hear footsteps from the trees, so when you come back the snow tells you: fresh footprints leading up to the door, or none.

The mimic can wear any of their voices. Keep the door shut on a real visitor and you hear their footsteps leave. Keep it shut on the mimic and the knocking stops, but no footsteps leave.

| | |
| --- | --- |
| ![The room, with eyes in the treeline](docs/room.jpg) | ![Her claws through the boards](docs/hand.jpg) |
| ![A bare window](docs/crawler.jpg) | ![A knock, seen by the blood lantern](docs/knock.jpg) |
| ![The stranger, starving](docs/plea.jpg) | ![The grin beneath its eyes, while you're out](docs/away.jpg) |
| ![The false stranger, while you freeze](docs/false-stranger.jpg) | |

## Building

Everything you build costs score, so building is a tradeoff.

| Build | Cost | What it does |
| --- | --- | --- |
| Window boards | 8 wood | Three boards. Without them, her first visit at 1 am kills you. Repair one for 3 wood |
| Trap (up to 3) | 5 wood each | Raw meat and blood, collected on every trip. The smell keeps the thing in the trees close for longer |
| Blood lantern | 8 wood + 4 blood | Red light under the door shows whether anything is actually standing there. That's the only way to catch the walkers after 3 am. It burns a jar of blood every minute, and goes dark when you run out |

## Score

Only a night survived to dawn scores.

| Kept at dawn | Points |
| --- | --- |
| Each wood | 1 |
| Each cooked meat | 3 |
| Each raw meat | 2 |
| Each blood | 5 |
| Each level of fire | 10 |
| Each real person you let in | 10 |
| The stranger still with you | 25 |

Stockpiling is the hard part, because surviving means spending.

The resource bar uses small pixel icons: a log end, charred cooked meat, raw meat (purple, veined, with something like an eye in it) and a jar of blood.

Every ending, death or dawn, shows a **recap of your night**: people let in, mimics kept out, times you burned her back, trips, meat cooked, your closest call with the grin and your coldest moment. It also shows an **all-time tally**, for example "14 nights · 2 dawns · killed by: the mimic 6, her, at the window 3, the cold 2". The tally also appears under best nights on the title screen. The simulation's automated nights don't count toward it.

The top-10 board takes three arcade initials. It's stored in the browser on that computer, like a single arcade cabinet; a shared online board would need a server, which was left out of scope.

| | |
| --- | --- |
| ![The mimic in the doorway](docs/mimic.jpg) | ![You died](docs/died.jpg) |
| ![Dawn](docs/dawn.jpg) | ![Score](docs/score.jpg) |

## Difficulty, tuned by simulation

[tools/sim.js](tools/sim.js) plays full nights at high speed through the game's test hook. Its players only use what a person could perceive: the footsteps, the lantern, the howl, the eyes in the treeline.

- **Beginner:** keeps the fire up and eats when hungry, but opens most doors, ignores the howling, reacts to the claws half the time, rarely builds and feeds the stranger whenever she asks.
- **Learner:** plays like a beginner, but follows each of the stranger's hints once it has heard it. This models a first-time player who reads.
- **Strong:** knows every tell. It boards up before 1 am, gets the lantern before the walkers, waits out the howling, burns the claws and feeds the stranger only on her last plea. It reacts a beat late, like a person, and misreads the footsteps now and then.
- **Skilled:** the same, but with instant, perfect reactions.

Results on 2026-10-16, after the latest changes (cold instead of hunger, the false stranger, the grin tied to its eyes):

| Player | Nights | Survives | Main causes of death |
| --- | --- | --- | --- |
| Beginner | 150 | 0% | mimic 39%, her at the window 37%, the trees 23% |
| Learner | 150 | 21% | mimic 56%, her at the window 22% |
| Strong | 150 | 81% | mimic 13%, her at the window 4%, the dark 2% |

A real first-time player lands between the beginner and the learner, so the large majority of first nights end in death. The doubled lantern cost is what brought the strong player down from about 93% to 84%: it now has to work to have the lantern lit when the walkers start.

The bots need some human sense to be realistic. Beginners sometimes run from a widening grin, and readers cook their meat after the first bout of sickness.

Tuning changes along the way:
- replaced the random death roll in the trees with the visible grin;
- added a grace period after a howl;
- made door visits more frequent;
- tightened wood and hunger;
- made the lantern burn blood every 60 seconds and doubled its cost;
- trimmed trap yields;
- had 60% of late mimics fake footsteps.

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
  - The eyes, her claws, the hunter's eyes and the red under the door are drawn on that layer, so they glow out of real darkness.
- **The night** is one state object advanced in fixed 50 ms steps. Each system is a small update function, gated by the hour:
  - the fire, the cold and dread;
  - the hunter's cycle and trips;
  - the stranger's hunger and hints;
  - cooking and sickness;
  - the blood lantern's fuel;
  - her phases at the window (idle, warn, crawl or reach, then steal or retreat);
  - door scheduling.

  Dialogues pause the night, and the flames, snow and flicker drop to half speed so the pause is visible.
- **Her** is drawn at half-pixel detail on the light layer: black, with a dark-red rim, backlit by a red glow that also lifts the darkness enough to show the boards she's clawing at.
- **Sound** is generated with the Web Audio API, with no audio files:
  - fire crackle;
  - wind;
  - knocks and footsteps in snow;
  - the howl;
  - a board splintering;
  - the hiss of the burning branch;
  - glass shattering, and the rhythm of thuds as she works at the boards;
  - teeth chattering, retching, and meat sizzling on the fire;
  - a scream outside;
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

## Phones

The game runs in a phone browser, held sideways.

- **Fit:** the scene scales to fit the screen: whole-number scales when there's room, a fractional scale on small phones. It respects notches.
- **Touch:** on touch screens the buttons grow to about 40 px tall, the keyboard hints are hidden, and double-tap zoom and long-press menus are disabled.
- **Upright:** held upright, it shows a turn-sideways screen and the night waits.
- **Sound** unlocks on the first tap.
- **Fullscreen:** the button is hidden where the browser can't do it (iPhone Safari).
- **Performance:** the light layer is capped at 2× pixel density so the glow stays smooth on high-density screens.

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
- **Each threat triggered directly in a desktop browser preview,** using the test hook (`window.__firelight`). The rules behind them were checked the same way: the stranger-mimic text is identical to the real knock; she dies 22 s after an ignored third plea; feeding on the third plea lasts to dawn while feeding early needs a second meat; dragging her out sets the carcass effect; refusing the fleeing man raises dread, brings the hunter close and hurries the window; the lantern burns its blood and sputters out. Visually checked:
  - the hunter's eyes in the treeline;
  - her claws through the boards;
  - her crawling through a bare window, and the broken glass;
  - the stranger's plea;
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
- **Phones are landscape only:** held upright, the game shows a "turn your phone sideways" screen and pauses. Checked in the browser's phone emulation at 375×812 upright and at 812×375 and 568×320 sideways, not on a physical phone.
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
  - **The follow-up round:**
    - a stranger mimic indistinguishable except by knowing there's only one;
    - the stranger's hunger, the third plea, and the consequence of letting her starve;
    - her redesign as a black, red-glowing claw that shatters the glass and crawls in through a bare window, with the board-breaking rhythm;
    - more frequent, more dangerous doors, so the blood lantern and traps earn their place.
  - **The polish round:**
    - muting on the title screen and in background tabs;
    - a real hunger warning;
    - a costlier lantern and weaker traps;
    - raw and cooked meat with sickness, and icons;
    - the glass always breaking first;
    - the grin;
    - points for letting the right people in;
    - an eat cooldown;
    - a visible pause;
    - visitors waiting while you're out.
  - **The next round:**
    - cold instead of hunger, after Zach's mom pointed out nobody starves in one night;
    - the night recap and the all-time death tally;
    - the false stranger, who demands to be fed and kills you at dawn;
    - the grin tied to the creature's eyes instead of floating free.
- **Claude Code:**
  - the mechanics design within that direction;
  - the code, art, sound and writing;
  - the simulation-based tuning and testing.

The font is [VT323](https://fonts.google.com/specimen/VT323) (SIL Open Font License).

## License

No open-source license has been chosen. The code is public to read, and all rights are reserved.
