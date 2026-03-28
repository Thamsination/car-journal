# Agent Prompt: BMW Platform Model Name Cleanup

Use this prompt to instruct an agent to replace bare series names (e.g., "3 Series") with engine-specific model names across BMW catch-all platform files.

---

## Prompt

I'm working on the car journal app at /home/thamsination/car-journal/

**Before doing anything else**, pull the latest version from git:

```bash
cd /home/thamsination/car-journal && git pull
```

### Background

Many BMW platform files use bare series names like `"3 Series"`, `"5 Series Touring"`, or `"7 Series"` in their `vehicles.models` arrays. These are invalid — every model name must identify the engine variant so the app can match a user's specific car. For example, `"320d"` is valid but `"3 Series"` is not, because "3 Series" doesn't tell the app which engine the user has.

Most of these files already have specific model names for xDrive variants (e.g., `"320i xDrive"`, `"330d xDrive Touring"`), but the **base (non-xDrive) models** are missing — they're currently represented by the bare series name.

### Your task

For each file listed below, replace every bare series name with the **full list of engine-specific model names** that were actually sold on this generation.

### Step 0: Read the reference files

Before making any changes, read these files to understand the schema and existing patterns:

1. `static/data/platforms/G30-G31-B47.json` — reference example of correct model naming (engine-specific, includes Touring and xDrive Touring variants)
2. `scripts/AGENT_PROMPT_GENERATE_PLATFORMS.md` — the full platform generation rules (especially the `vehicles` array rules section)

### Step 1: Research BEFORE writing

For each file, perform web searches to find the **complete European model lineup** for that generation:

1. **Model lineup:** "[Make] [chassis code] models complete list Europe" (e.g., "BMW E90 models complete list Europe")
2. **Body styles:** "[Make] [chassis code] sedan touring coupe convertible models" (verify which body styles exist)
3. **Cross-reference existing xDrive entries:** The files already list xDrive variants — use these as a guide for which base models should exist. If `"320d xDrive"` is listed, then `"320d"` must also be added.

Good sources:
- Wikipedia (BMW [chassis code] article — usually has a complete model/engine table)
- garage.wiki (structured tables)
- auto-abc.eu

### Step 2: Rules for model names

1. **Replace, don't append:** Remove the bare series name and add the specific models in its place. For example, replace `"3 Series"` with `"316i", "318i", "318d", "320i", "320d", "325i", "325d", "328i", "330i", "330d", "335i", "335d", "340i"` (whatever was actually sold).

2. **Keep all existing specific entries:** Do NOT remove or modify existing specific model names (xDrive variants, M models). Only remove the bare series names and add the missing base models.

3. **Mirror xDrive entries:** If `"320d xDrive"` exists, the base `"320d"` must also exist. If `"320d xDrive Touring"` exists, both `"320d Touring"` and `"320d"` must exist.

4. **Body style suffixes:** Every model sold as a Touring must have a `"... Touring"` entry. Every model sold as a Coupé must have `"... Coupé"`. Same for Convertible, Gran Coupé, Gran Turismo, Active Tourer, Gran Tourer.

5. **Only EU-market models:** Focus on European model names. Include US-market names only if they differ and are widely recognised (e.g., `"328i"` was sold in the US but not always in EU — include it if it was sold in at least some EU markets).

6. **Do NOT add models that didn't exist:** Verify every model name via web search. If unsure whether a model existed, leave it out.

7. **Preserve the `vehicles` array structure:** Keep existing `yearFrom`/`yearTo` ranges. If different model lineups existed for different year ranges (e.g., pre-LCI vs LCI), split into multiple vehicle entries with appropriate year ranges.

8. **Alphabetical order:** Sort model names alphabetically within each `models` array for consistency.

### Step 3: What NOT to change

- **Do NOT modify `serviceIntervals`** — intervals stay exactly as they are
- **Do NOT modify `serviceNotes`** — notes stay exactly as they are
- **Do NOT modify `milestones`** — milestones stay exactly as they are (no rebuild needed since intervals didn't change)
- **Do NOT split files by engine** — keep the single-file-per-chassis structure
- **Do NOT modify the `id`, `name`, `years`, `chassisCodes`, `drivetrains`, or `transmissions` fields**
- **Do NOT modify any non-BMW platform files**

The ONLY change is to the `vehicles[].models` arrays.

### Step 4: Self-validation

After updating each file:

1. **No bare series names remain** — grep the file for "Series" and "Class"; there should be zero matches in the models arrays
2. **Every existing xDrive model has a base counterpart** — if `"320d xDrive"` exists, `"320d"` must too
3. **Body styles are complete** — if the chassis covers Touring (e.g., E91, F31, G21), every sedan model should have a Touring counterpart where applicable
4. **Model names are verified** — every name was found in at least one web source for this generation
5. **No duplicate model names** — each name appears exactly once
6. **Models are sorted alphabetically** within the array

### Step 5: Build index and commit

After each batch, rebuild the platform index and commit:

```bash
cd /home/thamsination/car-journal
python3 scripts/build_platform_index.py
```

Commit with a descriptive message and push.

### Step 6: Work pace

Update **3 files per batch**. After each batch:
1. Self-validate all 3 files
2. Rebuild the platform index
3. Commit with a descriptive message
4. Push

### Files to update

**Batch 1 (E-series, no existing specific models):**
- `BMW-E38.json` — E38 7 Series (1994–2001)
- `BMW-E39.json` — E39 5 Series / 5 Series Touring (1995–2003)
- `BMW-E46.json` — E46 3 Series / Touring / Coupé / Convertible (1998–2006)

**Batch 2 (E-series, has xDrive models already):**
- `BMW-E60.json` — E60/E61 5 Series (2003–2010)
- `BMW-E63.json` — E63/E64 6 Series (2003–2010)
- `BMW-E65.json` — E65/E66 7 Series (2001–2008)

**Batch 3 (E90-era):**
- `BMW-E90.json` — E90/E91/E92/E93 3 Series (2005–2013)
- `BMW-F01.json` — F01/F02 7 Series (2008–2015)
- `BMW-F06.json` — F06/F12/F13 6 Series (2011–2018)

**Batch 4 (F-series sedans):**
- `BMW-F10.json` — F10/F11 5 Series (2010–2017)
- `BMW-F20.json` — F20/F21 1 Series (2011–2019)
- `BMW-F22.json` — F22/F23 2 Series (2013–2021)

**Batch 5 (F-series 3/4):**
- `BMW-F30.json` — F30/F31/F34 3 Series (2012–2019)
- `BMW-F32.json` — F32/F33/F36 4 Series (2013–2020)
- `BMW-F40.json` — F40 1 Series (2019–2026)

**Batch 6 (F-series FWD + remaining):**
- `BMW-F44.json` — F44 2 Series Gran Coupé (2019–2026)
- `BMW-F45.json` — F45/F46 2 Series Active/Gran Tourer (2014–2021)
- `BMW-G11.json` — G11/G12 7 Series (2015–2022)

**Batch 7 (G-series):**
- `BMW-G14.json` — G14/G15/G16 8 Series (2018–2026)
- `BMW-G20.json` — G20/G21 3 Series (2018–2026)
- `BMW-G22.json` — G22/G23/G26 4 Series (2020–2026)

**Batch 8 (G-series remaining):**
- `BMW-G32.json` — G32 6 Series Gran Turismo (2017–2024)
- `BMW-G42.json` — G42 2 Series Coupé (2021–2026)
- `BMW-G70.json` — G70 7 Series (2022–2026)

### Do NOT:

- Use training knowledge as primary source — always web search first
- Add model names without verifying they were actually produced
- Modify anything other than the `vehicles[].models` arrays
- Change service intervals, notes, or milestones
- Split catch-all files into engine-specific files (that's a separate future task)
- Add bare series names — every entry must specify the engine (e.g., `"320d"` not `"3 Series"`)
- Forget body style suffixes — `"520d"` and `"520d Touring"` are separate entries
- Remove existing xDrive or M-car entries
