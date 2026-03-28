# Agent Prompt: Add `engines` Array to All Platform Files

Use this prompt to instruct an agent to add an `engines` string array to every platform JSON file, listing the engine codes/families that the platform covers.

---

## Prompt

I'm working on the car journal app at `/home/thamsination/car-journal/`

**Before doing anything else**, pull the latest version from git:

```bash
cd /home/thamsination/car-journal && git pull
```

### Background

The app displays a vehicle info card with a tech line: `CHASSIS, ENGINE, DRIVETRAIN, TRANSMISSION`. Currently `chassisCodes`, `drivetrains`, and `transmissions` exist as arrays on every platform config, but there is no `engines` field. The engine value is only stored on individual vehicles and was set manually. We need a structured `engines` array on every platform so the Edit Vehicle UI can offer a dropdown.

### Your task

Add an `"engines"` array to every platform JSON file in `static/data/platforms/` (excluding `index.json`). The array must list the **internal engine codes** (manufacturer designations) that the platform covers.

### Step 0: Read reference files

Before making any changes, read these files:

1. `src/lib/types.ts` — understand the `PlatformConfig` interface. You will add `engines?: string[];` to it.
2. `static/data/platforms/BMW-G30-B47.json` — engine-specific platform (engine = `B47`)
3. `static/data/platforms/BMW-E90.json` — catch-all platform (covers many engines)
4. `static/data/platforms/Subaru-WRX-EJ-turbo.json` — non-BMW example
5. `static/data/platforms/Mercedes-EQ-EQE.json` — EV example

### Step 1: Update the TypeScript type

In `src/lib/types.ts`, add `engines?: string[];` to the `PlatformConfig` interface, right after `transmissions`.

### Step 2: Research and tag each file

For each platform file, determine which engine codes it covers and add the `"engines"` array. Place it in the JSON right after `"transmissions"` (or after `"drivetrains"` if no `"transmissions"` exists).

#### What goes in the `engines` array

Use the **manufacturer's internal engine code** — the same codes enthusiasts and workshops use:

| Brand | Format | Examples |
|---|---|---|
| BMW | Letter + digits | `B47`, `B48`, `B57`, `B58`, `N47`, `N55`, `S58` |
| Mercedes-Benz | OM-series (diesel), M-series (petrol) | `OM654`, `OM656`, `M264`, `M256` |
| Subaru | Family code | `EJ205`, `EJ207`, `EJ255`, `EJ257`, `FA20F`, `FA24F` |
| VW/Audi/Škoda | EA-series or marketing code | `EA211 TSI`, `EA288 TDI`, `EA888 TSI` |
| Renault/Dacia | Type code | `H5Ht`, `D4F` |
| Peugeot/Opel | PSA code or common name | `PureTech 1.2`, `BlueHDi 1.5` |
| Toyota | Series code | `M15A-FKS`, `M15A-FXE` |
| Fiat | Family | `312A2.000`, `BSG hybrid` |
| EV platforms | Use `Electric` or motor code | `Electric` |
| PHEV platforms | Petrol engine + electric | `M264 + Electric`, `OM654 + Electric` |

#### Rules

1. **Engine-specific platforms** (like `BMW-G30-B47`) — the array has one entry: `["B47"]`.
2. **Catch-all platforms** (like `BMW-E90`) — list ALL engine codes that were offered in that generation on the European market. Research via web search. Sort alphabetically.
3. **EV platforms** — use `["Electric"]`.
4. **PHEV platforms** — list the combustion engine code(s) plus `"Electric"`, e.g. `["M264", "Electric"]`.
5. **If the platform name already states the engines** (e.g., Subaru EJ turbo says "EJ205, EJ207, EJ255, EJ257"), use those exact codes.
6. **Sort alphabetically** within the array.
7. **No duplicates.**
8. **Use the most specific code available.** Prefer `B47D20` only if you're certain all variants on the platform share that exact sub-variant. Otherwise use the family code `B47`. For BMW, the 3-character family code (e.g., `B47`, `N55`) is preferred since the platform file already groups by engine family.
9. **For non-German brands**, use the most widely recognised engine code from official service documentation. If only a displacement/marketing name exists (e.g., "1.0 TSI"), use `EA211 1.0 TSI`.

### Step 3: Research BEFORE writing

For each platform, perform web searches to find the complete engine lineup:

1. **"[Make] [chassis code] engine options Europe"** — e.g., "BMW E90 engine options Europe"
2. **"[Make] [chassis code] engine codes list"** — e.g., "Mercedes W213 diesel engine codes"
3. **Cross-reference the `vehicles[].models` array** — model names often hint at engines (e.g., "320d" = diesel, "530i" = petrol inline-6)

Good sources:
- Wikipedia (usually has engine tables per generation)
- bimmercat.com / realoem.com (BMW engine codes)
- mb-wiki.com (Mercedes engine codes)
- auto-abc.eu

### Step 4: What NOT to change

- **Do NOT modify `serviceIntervals`**
- **Do NOT modify `serviceNotes`**
- **Do NOT modify `milestones`**
- **Do NOT modify `vehicles`, `chassisCodes`, `drivetrains`, `transmissions`, `id`, `name`, or `years`**
- **Do NOT remove or rename any existing fields**
- **Do NOT modify `index.json` manually** — it will be rebuilt by script

The ONLY changes are:
1. Adding the `"engines"` array to each platform JSON file (platform-level)
2. Adding per-entry `"engines"` arrays to `vehicles` entries **when a catch-all platform spans multiple generations with different engine options** (e.g., Subaru WRX EJ turbo 2000–2021 has different engines per chassis generation). Also add per-entry `"chassisCodes"` in the same case. See `Subaru-WRX-EJ-turbo.json` as a reference.
3. Adding `engines?: string[];` to the `PlatformConfig` type (already done)

### Step 5: Self-validation

After updating each file:

1. **`engines` array is present** and is a non-empty `string[]`
2. **Every entry is a real engine code** — verified via web search, not guessed
3. **Entries are sorted alphabetically**
4. **No duplicates**
5. **EV platforms use `["Electric"]`**, not an empty array
6. **PHEV platforms include both the combustion code and `"Electric"`**
7. **Catch-all platforms list ALL engine families** offered in that generation (EU market)
8. **Engine-specific platforms have exactly the engine(s) in their name/ID**
9. **The JSON is valid** — no trailing commas, correct bracket nesting

### Step 6: Work pace

Update **5 files per batch**. After each batch:

1. Self-validate all 5 files
2. Commit with a descriptive message
3. Push

After the **final batch**, also:
1. Rebuild the platform index: `python3 scripts/build_platform_index.py`
2. Commit and push the updated index

### Files to update (76 total, excluding index.json)

**Batch 1 — BMW engine-specific G30/G31:**
- `BMW-G30-B47.json` — `["B47"]`
- `BMW-G30-B48.json` — `["B48"]`
- `BMW-G30-B57.json` — `["B57"]`
- `BMW-G30-B58.json` — `["B58"]`
- `BMW-I01.json` — i3 (research: BEV + optional REx)

**Batch 2 — BMW EVs and special:**
- `BMW-I15.json` — i8 (PHEV — research engine code)
- `BMW-I20.json` — iX (BEV)
- `BMW-G09.json` — XM (PHEV — research engine code)
- `BMW-G70.json` — G70 7 Series (research all engines)
- `BMW-G29.json` — G29 Z4 (research all engines)

**Batch 3 — BMW E-series older:**
- `BMW-E38.json` — E38 7 Series
- `BMW-E39.json` — E39 5 Series
- `BMW-E46.json` — E46 3 Series
- `BMW-E53.json` — E53 X5
- `BMW-E60.json` — E60/E61 5 Series

**Batch 4 — BMW E-series newer:**
- `BMW-E63.json` — E63/E64 6 Series
- `BMW-E65.json` — E65/E66 7 Series
- `BMW-E70.json` — E70 X5
- `BMW-E71.json` — E71/E72 X6
- `BMW-E83.json` — E83 X3

**Batch 5 — BMW E84 + F-series start:**
- `BMW-E84.json` — E84 X1
- `BMW-E89.json` — E89 Z4
- `BMW-E90.json` — E90/E91/E92/E93 3 Series
- `BMW-F01.json` — F01/F02 7 Series
- `BMW-F06.json` — F06/F12/F13 6 Series

**Batch 6 — BMW F-series mid:**
- `BMW-F10.json` — F10/F11 5 Series
- `BMW-F15.json` — F15/F85 X5
- `BMW-F16.json` — F16/F86 X6
- `BMW-F20.json` — F20/F21 1 Series
- `BMW-F22.json` — F22/F23 2 Series

**Batch 7 — BMW F-series 3/4 + X:**
- `BMW-F25.json` — F25 X3
- `BMW-F26.json` — F26 X4
- `BMW-F30.json` — F30/F31/F34 3 Series
- `BMW-F32.json` — F32/F33/F36 4 Series
- `BMW-F39.json` — F39 X2

**Batch 8 — BMW F-series FWD:**
- `BMW-F40.json` — F40 1 Series
- `BMW-F44.json` — F44 2 Series Gran Coupé
- `BMW-F45.json` — F45/F46 2 Series Active/Gran Tourer
- `BMW-F48.json` — F48 X1
- `BMW-G01.json` — G01 X3

**Batch 9 — BMW G-series SUV/mid:**
- `BMW-G02.json` — G02 X4
- `BMW-G05.json` — G05 X5
- `BMW-G06.json` — G06 X6
- `BMW-G07.json` — G07 X7
- `BMW-G11.json` — G11/G12 7 Series

**Batch 10 — BMW G-series coupe/sedan:**
- `BMW-G14.json` — G14/G15/G16 8 Series
- `BMW-G20.json` — G20/G21 3 Series
- `BMW-G22.json` — G22/G23/G26 4 Series
- `BMW-G32.json` — G32 6 Series GT
- `BMW-G42.json` — G42 2 Series Coupé

**Batch 11 — Subaru:**
- `Subaru-WRX-EJ-turbo.json` — (name says: EJ205, EJ207, EJ255, EJ257)
- `Subaru-WRX-FA20DIT.json` — (name says: FA20F)
- `Subaru-WRX-FA24DIT.json` — (name says: FA24F)

**Batch 12 — Mercedes-Benz:**
- `Mercedes-E-W210-Diesel.json`
- `Mercedes-E-W210-Petrol.json`
- `Mercedes-E-W211-Diesel.json`
- `Mercedes-E-W211-Petrol.json`
- `Mercedes-E-W212-Diesel.json`

**Batch 13 — Mercedes-Benz continued:**
- `Mercedes-E-W212-Petrol.json`
- `Mercedes-E-W213-Diesel.json`
- `Mercedes-E-W213-PHEV.json`
- `Mercedes-E-W213-Petrol.json`
- `Mercedes-E-W214-Diesel.json`

**Batch 14 — Mercedes-Benz + EV:**
- `Mercedes-E-W214-PHEV.json`
- `Mercedes-E-W214-Petrol.json`
- `Mercedes-EQ-EQE.json`

**Batch 15 — Non-German brands:**
- `Dacia-SANDERO-3.json`
- `Fiat-500-312.json`
- `Opel-CORSA-F.json`
- `Peugeot-208-II.json`
- `Renault-CLIO-5.json`

**Batch 16 — Remaining:**
- `Skoda-OCTAVIA-3.json`
- `Toyota-YARIS-XP210.json`
- `VW-MK7.json`
- `VW-MK8.json`
- `VW-Polo-AW.json`

### Do NOT:

- Use training knowledge as primary source — always web search first
- Guess engine codes — every code must be verified
- Add engine codes for models not sold in Europe
- Modify anything other than adding the `engines` array (and the one type change)
- Change service intervals, notes, milestones, vehicles, or any other existing fields
- Use displacement-only names when a proper engine code exists (prefer `B47` over `2.0 diesel`)
- Leave any platform file without an `engines` array when done
