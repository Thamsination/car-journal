# Agent Prompt: Split Catch-All Platform Files

## Goal

65 platform files currently lump multiple engine families together and therefore cannot carry a verified `displacement` / `cylinders` / `fuelType` triple. Split each into per-engine files so every platform file describes exactly one mechanical configuration.

---

## Before you start

```bash
cd /home/thamsination/car-journal && git pull
```

Read these files to understand the target schema and quality bar:

1. `static/data/platforms/G30-G31-N63.json` — reference format (displacement/cylinders/fuelType, no engines, no milestones)
2. `static/data/platforms/G30-G31-B47.json` — diesel example
3. `static/data/platforms/G30-G31-B58.json` — petrol example
4. `scripts/AGENT_PROMPT_GENERATE_PLATFORMS.md` — **the full generation rules** (task naming, mandatory minimum tasks, self-validation checklist, etc.) — follow all of them

---

## What "splitting" means

Take a catch-all file like `BMW-F30.json` that covers N20, B47, B48, N55, S55, etc. and produce:

| New file | displacement | cylinders | fuelType | Models |
|---|---|---|---|---|
| `BMW-F30-N20.json` | 2.0L | 4 | petrol | 320i, 328i, 320i xDrive, … |
| `BMW-F30-B48.json` | 2.0L | 4 | petrol | 320i (LCI), 330i, 330i xDrive, … |
| `BMW-F30-N47.json` | 2.0L | 4 | diesel | 316d, 318d, 320d, 325d, … |
| `BMW-F30-B47.json` | 2.0L | 4 | diesel | 318d (LCI), 320d (LCI), … |
| `BMW-F30-N55.json` | 3.0L | 6 | petrol | 335i, 335i xDrive, … |
| `BMW-F30-B58.json` | 3.0L | 6 | petrol | 340i, 340i xDrive, … |
| `BMW-F30-N57.json` | 3.0L | 6 | diesel | 330d, 335d, … |
| `BMW-F30-S55.json` | 3.0L | 6 | petrol | M3, M3 Competition, … |

Each new file gets:
- Its own `displacement`, `cylinders`, `fuelType`
- Only the models that match that engine
- **Engine-specific `serviceIntervals`** — not a copy of the generic catch-all intervals. Diesel files need fuel filter and no spark plugs. Petrol files need spark plugs and no fuel filter. Intervals may differ between engine families (research each).
- Engine-specific `serviceNotes`

After all splits are done for a catch-all, **delete the original file**.

---

## Special cases

### Same displacement + cylinders but different engine generation

When an N20 (2012–2015) and B48 (2016–2019) are both 2.0L 4-cyl petrol, they still get separate files because:
- Service intervals may differ (the B48 has a different oil capacity, spark plug interval, etc.)
- The year ranges are different
- The model names may change (328i → 330i)

### Files already split by fuel type but not by displacement

Mercedes files like `Mercedes-E-W213-Petrol.json` already separate petrol from diesel, but they cover E 200 (2.0L I4), E 350 (3.0L I6), and E 53 AMG (3.0L I6) — different displacements and/or cylinder counts. These need further splitting:

| New file | displacement | cylinders |
|---|---|---|
| `Mercedes-E-W213-Petrol-M264.json` | 2.0L | 4 |
| `Mercedes-E-W213-Petrol-M256.json` | 3.0L | 6 |
| `Mercedes-E-W213-Petrol-M177.json` | 4.0L | 8 |

Use the Mercedes engine family code in the filename if it helps distinguish, or use displacement: `Mercedes-E-W213-2.0-Petrol.json`. Pick whichever is clearest for each brand.

### Small platforms that may only need a triple added

Some catch-alls might actually be single-engine platforms that just weren't tagged during the first migration (e.g. `Dacia-SANDERO-3.json` may only cover the 1.0L TCe). For these:
1. Verify via web search that all listed models share the same displacement/cylinders
2. If yes: just add the triple to the existing file — no split needed
3. If no: split as described above

### BMW i3 (BMW-I01.json)

The i3 comes in BEV and Range Extender (REx) variants. These have fundamentally different service needs. Split into:
- `BMW-I01-BEV.json` — displacement: null, cylinders: 0, fuelType: "electric"
- `BMW-I01-REx.json` — displacement: "0.6L", cylinders: 2, fuelType: "hybrid"

### PHEV platforms

Use the ICE displacement/cylinders and `fuelType: "hybrid"`. E.g. a BMW 330e has a 2.0L 4-cyl + electric motor → displacement: "2.0L", cylinders: 4, fuelType: "hybrid".

If the catch-all contains both pure ICE and PHEV models, the PHEV models go into their own file.

---

## Naming conventions for new files

Follow the patterns from `AGENT_PROMPT_GENERATE_PLATFORMS.md`:

| Brand | Pattern | Examples |
|---|---|---|
| BMW | `BMW-<CHASSIS>-<ENGINE_CODE>.json` | `BMW-F30-N20.json`, `BMW-G20-B48.json` |
| Mercedes | `Mercedes-<CLASS>-<GENERATION>-<FUEL>-<ENGINE>.json` or `Mercedes-<CLASS>-<GENERATION>-<DISPLACEMENT>-<FUEL>.json` | `Mercedes-E-W213-Petrol-M264.json` |
| VW | `VW-<GENERATION>-<ENGINE_FAMILY>.json` | `VW-MK7-TSI.json`, `VW-MK7-TDI.json` |
| Škoda | `Skoda-<MODEL>-<GEN>-<ENGINE_FAMILY>.json` | `Skoda-OCTAVIA-3-TSI.json` |
| Others | `<MAKE>-<MODEL>-<GEN>-<ENGINE_FAMILY>.json` | `Toyota-YARIS-XP210-Hybrid.json`, `Opel-CORSA-F-PureTech.json` |

---

## Research requirements

For every new file, perform web searches to verify:

1. **Which models used which engine** — e.g. "BMW F30 320i engine N20 or B48 by year"
2. **Displacement and cylinders** — e.g. "BMW N20 displacement cylinders"
3. **Engine-specific service intervals** — e.g. "BMW N20 service intervals oil spark plugs"
4. **Model names and body styles** — ensure sedan + Touring + Gran Turismo variants are all listed
5. **AWD variants** — ensure xDrive/quattro/4MATIC model names are listed if they exist for that engine

Do NOT copy the generic catch-all intervals into the new files. Each engine file must have researched, engine-specific intervals.

---

## Self-validation (per new file)

Run the full checklist from `AGENT_PROMPT_GENERATE_PLATFORMS.md` Step 7, plus:

1. `displacement`, `cylinders`, `fuelType` are present and verified
2. No `engines` field at platform level or in vehicles entries
3. No `milestones` array
4. All models in `vehicles` genuinely use this engine (cross-check years and model designations)
5. Diesel files have fuel filter + no spark plugs
6. Petrol files have spark plugs + no fuel filter (unless applicable)
7. PHEV files have `fuelType: "hybrid"` and include HV battery coolant if applicable
8. BEV files have `displacement: null`, `cylinders: 0`, `fuelType: "electric"`

---

## Work pace

**3 catch-all platforms per batch.** After each batch:

1. Delete the original catch-all file(s)
2. Rebuild the index: `node scripts/generate-platform-index.js`
3. Run self-validation on every new file
4. Verify the app still builds: `npm run build`
5. Commit with a message like: `Split BMW-F30 into 8 engine-specific platform files`
6. Push

Start with the platforms most likely to be used (highest model count), working down:

### Priority order

**Batch 1–5: BMW (biggest catch-alls)**
1. `BMW-F30.json` (40 models) — F30/F31/F34 3 Series
2. `BMW-E90.json` (34 models) — E90/E91/E92/E93 3 Series
3. `BMW-E46.json` (44 models) — E46 3 Series
4. `BMW-F32.json` (29 models) — F32/F33/F36 4 Series
5. `BMW-E39.json` (25 models) — E39 5 Series

**Batch 6–10: BMW continued**
6. `BMW-F10.json` (24 models) — F10/F11 5 Series
7. `BMW-E60.json` (21 models) — E60/E61 5 Series
8. `BMW-G14.json` (19 models) — G14/G15/G16 8 Series
9. `BMW-G20.json` (18 models) — G20/G21 3 Series
10. `BMW-G22.json` (18 models) — G22/G23/G26 4 Series

**Batch 11–15: Mercedes**
11. `Mercedes-E-W213-Petrol.json` (34 models)
12. `Mercedes-E-W213-Diesel.json` (28 models)
13. `Mercedes-E-W212-Petrol.json` (34 models)
14. `Mercedes-E-W212-Diesel.json` (26 models)
15. `Mercedes-E-W211-Petrol.json` (20 models)

**Batch 16–20: More BMW**
16. `BMW-E38.json`, `BMW-F22.json`, `BMW-F06.json`
17. `BMW-G11.json`, `BMW-F48.json`, `BMW-G05.json`
18. `BMW-E70.json`, `BMW-F15.json`, `BMW-F01.json`
19. `BMW-F20.json`, `BMW-E84.json`, `BMW-E65.json`
20. `BMW-F16.json`, `BMW-F25.json`, `BMW-F26.json`

**Batch 21–25: VW/Škoda/smaller brands + remaining BMW**
21. `VW-MK7.json`, `VW-MK8.json`, `Skoda-OCTAVIA-3.json`
22. `VW-Polo-AW.json`, `Fiat-500-312.json`, `Toyota-YARIS-XP210.json`
23. `Dacia-SANDERO-3.json`, `Renault-CLIO-5.json`, `Peugeot-208-II.json`, `Opel-CORSA-F.json`
24. Remaining BMW SUVs: `BMW-G01.json`, `BMW-G02.json`, `BMW-G06.json`, `BMW-G07.json`, `BMW-G32.json`, `BMW-G42.json`
25. Remaining: `BMW-F39.json`, `BMW-F40.json`, `BMW-F44.json`, `BMW-F45.json`, `BMW-G29.json`, `BMW-G70.json`, `BMW-E53.json`, `BMW-E63.json`, `BMW-E83.json`, `BMW-E89.json`, `BMW-I01.json`, `BMW-E71.json`
26. Remaining Mercedes: `Mercedes-E-W211-Diesel.json`, `Mercedes-E-W210-Petrol.json`, `Mercedes-E-W210-Diesel.json`, `Mercedes-E-W214-Petrol.json`, `Mercedes-E-W214-Diesel.json`, `Mercedes-E-W213-PHEV.json`, `Mercedes-E-W214-PHEV.json`

---

## Do NOT

- Keep the original catch-all file after splitting — delete it
- Copy generic intervals verbatim into engine-specific files — research each engine
- Mix models with different displacements/cylinders in one file
- Include an `engines` or `milestones` field in any file
- Include bare series names like "3 Series" — every model name must identify the engine variant
- Guess engine assignments — verify via web search which models used which engine in which years
- Rush — quality over speed. A wrong engine-to-model mapping is worse than not splitting at all
