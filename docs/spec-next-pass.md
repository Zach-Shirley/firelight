# Firelight: spec for the next pass (nights 3 and 4)

Written 2026-10-17 from Zach's notes after his night-2 playtest.

**Status (v0.22):** built.
- Everything marked IN.
- E2 option a: fur from traps, a coat and insulation.
- E3: the stove, sold by the trader, with the dimmer light.
- E4: the bone charm (7 s, one night).
- H: a 4% stumble that costs 2.5 s; no instant death.
- J: the day runs 6 am to 10 pm and sleep takes 6 hours.

Night 4 (F, G, E5) and the wood rebalance are not built. Achievements are noted for a later update.

Each item is marked:
- **IN**: Zach asked for it. Build it in the next pass.
- **DECIDE**: my recommendation is attached; Zach picks IN, LATER or CUT.
- **LATER**: agreed, but not this pass.
- **CUT**: dropped.

Rough size per item: S (under 30 min), M (30–90 min), L (90+ min).

---

## 1. The scope at a glance

| # | Item | Status | Size |
| --- | --- | --- | --- |
| A | Visitors: remove the kid, the fleeing man and the traveler | IN | M |
| B1 | Familiar voices: mimics copy the woodcutter and the trader | IN | S |
| B2 | Mimics show one or three feet under the door, never two | IN | S |
| C | People drawn at normal size | IN | L |
| D1 | Night 3: the blizzard, and the cold comes back | IN | M |
| D2 | Night 3: trips take 50% longer | IN | S |
| D3 | Night 3: wet wood, with the smoke and its sound | IN | M |
| D4 | Night 3: she gets stronger in the cold | IN | S |
| D5 | The stranger has new lines on night 3 (placeholder only) | IN | S |
| E1 | Drying rack | IN | M |
| E2 | Fur, the fur coat and insulation | DECIDE | M |
| E3 | Iron stove (cooks faster, gives more warmth) | DECIDE | M |
| E4 | Bone charm | DECIDE | S |
| E5 | Smoker add-on for the stove | LATER (night 4) | S |
| F | Night 4: two-footed mimics and a slot in the door | DECIDE (night 4) | M |
| G | Night 4's new monster | DECIDE: pick a concept | ? |
| H | Getting lost in the blizzard | DECIDE | S |
| I | Scoring for nights 3 and 4 | IN | S |
| J | Making the day's hours add up | DECIDE (small fix now, overhaul later) | S |
| — | Snow drifting against the door | CUT (it would break the feet-under-the-door tell) | — |
| — | The thing on the roof | CUT for now (one more direction to watch) | — |
| — | Trap-line bell | CUT | — |
| — | Hand mirror | CUT (replaced by the door slot, F) | — |
| — | Rebalancing how much wood you get | LATER: check after the blizzard is playable | — |
| — | The stranger's story and endings | LATER | — |
| — | The day overhaul | LATER | — |
| — | Night 5, the blood moon | LATER | — |

---

## 2. Visitors (A): IN

**Problem.** The kid, the fleeing man and the traveler hand over about one of each resource and then vanish from a house they supposedly came into. That's weak as a trade and makes no sense.

**Change**
- Remove `kid`, `kidGift`, `fleeing` and `traveler` from the knock pool, the mimic disguises, the dialogue and the drawing code.
- Real visitors become:
  - **the stranger** (night 1, once, as now);
  - **the woodcutter** (trades);
  - **the trader** (his shop).
- Nobody new stays in the house. Only the stranger does.
- The knock rate stays about the same, so most knocks are now mimics.
- **Tuning to watch:** real knocks get rarer, so fewer points come from "people you let in" (10 each). Leave the 10 as is; scoring now leans on what you hold on to anyway.
- The woodcutter can now come up to 3 times a night (was 2).
- Proposed for him: also buy meat with wood ("2 cooked for 8 wood"). That gives the door a real trade beyond the trader.

## 3. Mimic tells (B): IN

**B1. Familiar voices.**
- From **night 2**, a mimic can use the exact knock text of the woodcutter or the trader. If you've already met him, the line even refers back: "It's me again. The woodcutter."
- The only thing that tells them apart is the blood lantern, which keeps it essential.
- On night 1 mimics stay as they are now.

**B2. Feet under the door.**
- With the lantern lit, real people show **two feet**.
- Mimics now show **one foot or three**, never two. Before, they showed nothing.
- A careless player who only checks whether there are feet at all gets caught. Someone who counts survives.
- Two-footed mimics only arrive with the door slot on night 4 (F), so there's always some way to tell.

## 4. People at normal size (C): IN

**Problem.** People are drawn about 13 px tall in a doorway 61 px tall, and the trader is about 36 px. Nobody matches anybody, and the door slot (F) needs a face at a sensible height.

**Change**
- **Scale:** redraw everyone standing at about **40–44 px** tall (the door frame is 61 px). The pixels stay chunky.
- **Who gets redrawn:**
  - the stranger walking, sitting by the fire (about 26 px), dead and rising;
  - the woodcutter and the trader;
  - the person-shaped mimic in the doorway before it unfolds;
  - the death scenes that use people (the mimic, the risen stranger, the false stranger), rescaled to match.
- **Same build for everyone.** People differ by silhouette, not size:
  - the woodcutter: broad, beard, axe;
  - the trader: tall hat and long coat (the coat-opening shop stays);
  - the stranger: hood and thin build.
- **Knock-on fixes:**
  - Shadows under the door widen to match.
  - The stranger's spot by the fire may move a little so she doesn't cover the meat rack.
  - The portraits in the dialogue box stay 16×16.

## 5. Night 3: the blizzard (D): IN

Night 3 introduces the blizzard and **no new monster**. Timing stays as on night 2 (everything 2 hours early).

### D1. The cold
- **The meter.** Shown in the HUD next to hunger: "warm / cold / freezing". At "freezing" a frost-blue border closes in, the way starving does in red. At 100 you freeze to death.
- **Outside.** You get colder fast: about **+4.5 per second**. A blizzard wood trip is about 9 s, so about **+40**.
  - Two trips back to back put you at about 80, close to death. That's the "can't spam wood trips" rule.
- **Inside, by the fire.** You warm back up at a rate set by the fire:

  | Fire | Effect per second |
  | --- | --- |
  | Roaring | −4 |
  | Burning | −3 |
  | Flickering | −1.5 |
  | Smoldering | +0.3 (you get slowly colder) |
  | Out | +1 |

  A broken, unboarded window adds +0.5 per second.
- **Feel.** At about 60+ you shiver (the shiver sound already exists) and your eyes doze closed a little more often.
- **Death scene.** You freeze: frost creeps in from the screen edges, your breath shows and fades, and the fire looks farther and farther away.
- **Keep:** the existing wind and snow through a broken window.

### D2. Trips take 50% longer
- On nights 3 and 4 every trip outside takes **1.5× as long**: wood, building the shed, dragging.
- The four-second grin rule doesn't change, so longer trips mean more exposure. That's the danger.
- Snowshoes (×0.7) partly cancel it.
- For getting lost, see H.

### D3. Wet wood
- **What comes in wet.** On nights 3 and 4 every log from a trip or the woodcutter is **wet**.
- **Drying.**
  - Each wet log dries after **about 45 in-game minutes** (about 40 s) in the house.
  - Logs in the woodshed dry at the same rate. That keeps it simple, and the shed is meant to be dry storage.
  - Logs carried over from earlier nights are dry.
- **Stoking.** It uses dry wood first.
  - Stoking with only wet wood raises the fire one level, but it burns for **half as long** before dropping again. That's "half as effective".
  - It also sends up a thick plume of smoke.
- **The smoke (looks only, no game effect).**
  - It collects under the roof and thickens with each wet log.
  - It drifts slightly across the top of the window.
  - It thins out over about 30 s.
- **Sound.** Wet wood hisses and pops, with a lower, sputtering crackle instead of the dry snap.
- **What you see.**
  - Wet logs in the pile are darker with a blue-white frost edge, and dry out from the bottom of the pile up.
  - The wood count shows dry and wet, e.g. "18/25 · 6 wet".

### D4. She gets stronger in the cold
- On nights 3 and 4, her pull on a board is **about 30% faster**, so you have less time to burn her back.
- She tears a board off after 2 hooks instead of 3, if that's how it works now. Check this against the current code.

### D5. The stranger on night 3
- She gets a new set of lines for night 3, to be written later.
- For now, add a placeholder hook: a new dialogue at 11 pm that hints she knows this weather.
- The story and endings come in a later pass.

## 6. Items (E)

**E1. Drying rack: IN.**
- **Cost:** 10 wood. Build it from night 2's day, or any night.
- **Drying:** up to 8 wet logs dry **3× faster**.
- **Smoking:** it also **smokes cooked meat** at 1 per 20 s, up to 4 at once, so it never spoils, like cured meat but without salt. That leaves salt free for the salt lines against her and the hatch.
- **Score:** smoked meat counts the same as cured (5).
- **Look:** a frame by the fire with logs and meat strips hanging from it.

**E2. Fur, the fur coat and insulation: DECIDE.**
- **Option a (recommended).** Fur becomes a new trap catch from **night 2** (about 15% per trap check), shown in the top bar once you have some. It's worth **3 points** at dawn.
  - **Fur coat:** 4 fur. You get colder outside 35% slower.
  - **Insulation:** 6 fur. Stuffs the walls, so the house cools 30% slower and warms you a little faster.

  Insulation is your noob trap: it helps a little, but 6 fur is 18 points, and a pro keeps it.
- **Option b.** No fur. The trader or the woodcutter sells the coat (3 blood + 2 cured), and there's no insulation.
- I lean (a): it gives traps a third catch and a real choice between keeping and spending. (b) is quicker to build.

**E3. Iron stove: DECIDE.**
- **What it does.** An enclosed iron box with a pipe chimney replaces the open pit. It costs a lot (the trader, or 20 wood + 6 blood to build).
- **Upsides:**
  - Cooking takes about 4 s instead of 6.
  - About 30% more warmth on the cold meter.
  - The fire burns down 25% slower; that stacks with the grate, or replaces it.
- **The catch:** with the fire boxed in, the **pool of light shrinks a step**, so the eyes come closer sooner. A pro might buy it and keep stoking higher. Without the catch it's just a straight upgrade.
- **Fit:** the smoker (E5) bolts onto it on night 4.

**E4. Bone charm: DECIDE.**
- **What it does.** Sold by the trader: 3 blood + 2 cured. For the rest of that night, the grin takes **7 seconds** instead of 4.
  - That's enough to finish a normal wood trip after it gets close, but not a blizzard trip.
- **Uses:** one night, then it crumbles.
- **Optional:** while you carry it, the grin draws with a cracked tooth.

**E5. Smoker add-on: LATER (night 4).** It needs the stove. It smokes meat faster than the drying rack and gives off more warmth.

## 7. Night 4 (F, G): DECIDE, design only for now

**F. Two-footed mimics and the door slot.**
- **The change.** From night 4, some mimics stand on **two feet**, so the lantern alone can't tell anymore.
- **New build: a slot in the door** (6 wood + 2 salt).
  - **Opening it** at a knock shows a face, drawn at the new people size:
    - a real visitor looks normal;
    - a mimic's face is subtly wrong: eyes too far apart, or no whites, or a mouth that's too long, or it blinks sideways.
  - **The risk:** open the slot on a mimic and there's a chance fingers come through and grab something (2 logs or 1 meat) before you can slam it shut. A slam timer like the hatch's makes that a skill moment too.
- **Why it works:** it keeps feet → lantern → slot as an escalating set of tells, one per night.

**G. Night 4's new monster.** Quick ideas, not fleshed out. Pick one or two to develop:
1. **The guest who never knocks.** After you open the door for anyone, there's a chance something slipped in. A second shadow sits across the fire when you look back from a trip, and food or blood goes missing.
2. **Lights in the trees.** Lanterns approach through the blizzard like a rescue party and call your name to come out. Going out to them is death. Ignoring them makes the cold worse while they watch.
3. **The thing in the smoke.** When the wet-wood smoke is thick, a face forms in it and breathes on the fire, knocking it down a level. You clear it by opening the door, which lets the cold in. This makes the smoke matter on night 4 only.
4. **The echo.** It repeats sounds back a few seconds late (knocks, footsteps, the howl), so you start doubting the cues you've learned.
5. **The one that wears you.** If you get too cold, too tired or too hungry, you start losing moments. You find yourself at the door with your hand on the latch and have to pull back.
6. **The frozen one in the treeline.** A still figure outside the window. While it's there, the cold climbs faster indoors, until you board or cover the window.

## 8. Getting lost (H): DECIDE

**My recommendation:** use the flat 50% longer trips (D2) as the main penalty, plus a rare, non-fatal stumble.
- Each blizzard trip has about a **4% chance**, rolled once per trip, of an extra **2–3 s**.
- The message reads "you lose the path for a moment in the white."
- A muffled call or thump plays as an audio cue, so it never feels like a silent penalty.
- No instant-death roll: dying to an invisible 1% roll after a great run would feel awful. If you want the joke, it could be a 1-in-500 rare death with its own funny-grim death text. That would be off by default and easy to remove.

## 9. Scoring (I): IN

- **Bonuses:** third dawn +100, fourth dawn +100.
- **Each blizzard night:** "what you held on to" ×1.25 for that night, since keeping a stockpile through a blizzard is harder.
- **New items:** fur 3 (if E2a), smoked meat 5.
- **Leaderboard:** the `nights` field goes from 1–2 to 1–4. Update `sanitizeBoard` and the tests.

## 10. Day hours (J): DECIDE (small fix now, overhaul later)

**Problem.** The night runs 10 pm to 6 am (8 hours) and the day gives you 8 hours, so 8 hours of every 24 are missing.

**Small fix (recommended now)**
- The day runs **6 am to 10 pm: 16 hours**.
- Sleeping costs **6 hours** (was 3).
- Each day action shows the clock time it ends at, e.g. "chop wood · 2 h → 10 am".
- Action lengths and yields stay as they are, so you get about 10 waking hours, slightly more than now. The day gets a little more generous; check this against the wood rebalance later.

**Later:** the full day overhaul. Trips that make sense in hours, a real village to explore, and fixing scavenging, which pays too little now.

---

## 11. Order to build it in (the next pass)

1. People at normal size (C), first, since the door slot and every visitor depend on it.
2. Visitors (A), familiar voices (B1) and the one- or three-foot mimics (B2).
3. Night 3, the blizzard (D1–D5), and the drying rack (E1).
4. Whatever Zach marks IN from E2–E4, H and J.
5. Scoring for nights 3 and 4 (I), the leaderboard and the tests.
6. Tuning with the simulated players (they need to handle cold and wet wood). Check whether a well-stocked player survives night 3. If not, that's the wood rebalance, flagged for afterwards.

Night 4 (F, G, E5) is the pass after this one, once a monster concept is picked.
