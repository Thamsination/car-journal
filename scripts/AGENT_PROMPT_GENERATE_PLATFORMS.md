# Agent Prompt: Generate Platform Service Schedules

Use this prompt when instructing an agent to generate new platform config JSON files.

---

## Prompt

I'm working on the car journal app at /home/thamsination/car-journal/

Your task is to generate platform service schedule JSON files for specific car models. Each file must contain:

1. **A `vehicles` array** listing every make/model/year combination the platform covers — this is used by the app to match a user's car to the correct service schedule
2. **Verified manufacturer-specified service intervals** sourced from web searches — not from your training knowledge
3. **OEM-specific task names** using the exact terminology the manufacturer uses in their service documentation

### Step 0: Read the reference files

Before generating anything, read these files to understand the exact schema and quality bar:

1. `static/data/platforms/G30-G31.json` — the original hand-crafted reference (BMW diesel)
2. `static/data/platforms/VW-MK7.json` — a corrected batch-1 example
3. `static/data/platforms/Dacia-SANDERO-3.json` — another corrected example (Renault Group)
4. `scripts/build_platform_milestones.py` — the milestone builder script
5. `scripts/build_platform_index.py` — the index builder script

Study these files carefully. Your output must match the same level of completeness.

### Step 1: One platform file per engine family

Each platform file must be **specific to an engine family / fuel type**. The same chassis generation with different engine types gets separate files because service intervals differ significantly.

**Examples:**
- `BMW-G30-B47.json` — BMW G30/G31 5 Series with B47 diesel engine (2017–2020)
- `BMW-G30-B48.json` — BMW G30/G31 5 Series with B48 petrol engine (2017–2020)
- `BMW-G30-LCI-B47.json` — BMW G30/G31 LCI with B47 diesel (2020–2023)
- `VW-MK7-TSI.json` — VW Golf Mk7 with TSI petrol engines
- `VW-MK7-TDI.json` — VW Golf Mk7 with TDI diesel engines

**Why this matters:**
- Diesel engines have fuel filters; petrol engines often don't
- Spark plug intervals differ between petrol engine types
- Timing chain vs timing belt varies by engine
- EVs have no engine oil, spark plugs, or air filter service
- Hybrid drivetrains have unique service items (e.g., HV battery coolant)

When a facelifted generation (LCI, FL, Phase 2, etc.) has **different service intervals or CBS calibrations**, create a separate platform file for it.

**Platform ID format:** `<MAKE>-<CHASSIS>-<ENGINE/FUEL>` e.g., `BMW-F30-N20`, `VW-MK7-TSI`, `Renault-CLIO-5-TCe`

### Step 2: Research BEFORE writing

For each platform, perform **at least 4 separate web searches**:

1. **Service schedule:** "[Make] [Model] [Year] [Engine] official maintenance schedule km Europe"
2. **Component intervals:** "[Make] [Model] [Engine] owner's manual service intervals oil filter brake fluid spark plugs air filter"
3. **Engine-specific:** "[Make] [Model] [Engine code] service schedule diesel/petrol timing chain belt"
4. **Model variants:** "[Make] [Platform/generation] models variants body styles years produced"

Search #3 is critical for engine-family files — it tells you whether the engine uses a timing chain or belt, what spark plug interval applies, whether there's a fuel filter service, etc.

Good sources:
- garage.wiki (structured interval tables per model year — excellent)
- stefanosgarage.com (detailed VW Group schedules)
- bmwtechinfo.bmwgroup.com (BMW CBS and SIB documents)
- Official manufacturer user-manual sites (user-manual.renault.com, etc.)
- auto-abc.eu (service interval databases)
- Haynes / official dealer documentation
- Wikipedia (for model variants, production years, and market names — verify elsewhere)

### Step 3: Task naming — use OEM language

Task names must follow the **exact terminology the manufacturer uses** in their official service documentation, not generic names.

**Examples of correct OEM naming:**

BMW CBS terminology:
- `"engine oil"`, `"micro filter"`, `"air cleaner element"`, `"fuel filter"`
- `"check front brake pads"`, `"check rear brake pads"` (BMW separates front/rear)
- `"vehicle check"`, `"brake fluid"`
- `"ZF8 gearbox fluid"`, `"xDrive transfer case fluid"`, `"differential fluids"`

VW service book terminology:
- `"engine oil"`, `"cabin filter"`, `"air filter"`, `"spark plugs"`
- `"check brake pads"`, `"brake fluid"`
- `"DSG gearbox fluid"`

Toyota maintenance schedule terminology:
- `"engine oil"`, `"cabin filter"`, `"air filter"`, `"spark plugs"`
- `"check brake pads"`, `"brake fluid"`
- `"transaxle fluid"`

**The rule:** If BMW says `"micro filter"` and VW says `"cabin filter"` for the same component, use the respective OEM term in each platform file. The app displays these names to the user — they should match what the user reads in their owner's manual.

When in doubt about OEM terminology, default to the most common English term found in official documentation for that brand.

### Step 4: Mandatory minimum tasks

**Every ICE platform MUST include ALL of the following as `mfr` tasks** (with the correct manufacturer-specified km interval). If you genuinely cannot find a verified interval after thorough searching, use the most common European interval for that vehicle class — but you must note "interval estimated" in the serviceNotes.

| Category | Typical range | Notes |
|---|---|---|
| Engine oil + filter | 10,000–30,000 km | Every manufacturer specifies this |
| Cabin / pollen filter | 15,000–60,000 km | Every manufacturer specifies this |
| Air filter | 30,000–90,000 km | Every manufacturer specifies this |
| Brake fluid | 30,000–120,000 km | Every manufacturer specifies this (often time-based: every 2–4 years) |
| Brake pad inspection | 15,000–30,000 km | Every manufacturer includes brake inspection |
| Spark plugs | 30,000–90,000 km | All petrol engines require this |

Use the **OEM task name** for each (see Step 3), not the generic category name in this table.

**Additional tasks to include when applicable:**

| Task | When applicable |
|---|---|
| Fuel filter | Diesel engines (always MFR); some petrol engines too |
| Timing belt | Belt-driven engines (MFR — failure is catastrophic) |
| Auxiliary / drive belt | If manufacturer specifies replacement interval |
| Coolant flush | If manufacturer specifies (otherwise add as REC ~120,000 km) |
| Gearbox / transmission fluid | DSG/DCT/CVT — often REC since manufacturers say "lifetime" |
| Intake carbon clean | Direct-injection engines — REC |
| Transfer case / differential fluids | AWD/4WD vehicles |

**EV platforms** omit engine oil, air filter, spark plugs, and fuel filter — but MUST still include brake fluid, brake inspection, cabin filter, and any HV-battery / e-drive coolant service.

### Step 5: JSON schema

```json
{
  "id": "<MAKE-CHASSIS-ENGINE>",
  "name": "<Full platform name including engine>",
  "years": "<production years as text>",
  "chassisCodes": ["<code1>", "<code2>"],
  "vehicles": [
    {
      "make": "<Make>",
      "models": ["<Model1>", "<Model2>", "<Variant>"],
      "yearFrom": 2019,
      "yearTo": 2026
    }
  ],
  "serviceIntervals": [
    { "task": "<OEM task name>", "km": <interval>, "kind": "mfr" },
    { "task": "<OEM task name>", "km": <interval>, "kind": "rec" }
  ],
  "serviceNotes": {
    "<OEM task name>": "<Why this matters + platform/engine-specific context + source>"
  },
  "milestones": []
}
```

#### `vehicles` array rules

This array is how the app matches a user's car to a platform. Get it right.

- **`make`**: The brand name as the user would type it. Use title case: `"Volkswagen"` not `"VW"`, `"BMW"` not `"Bmw"`.
- **`models`**: Every model name sold on this engine-platform combination. Include body style variants if they have different names (e.g., `["520d", "520d xDrive"]` for a BMW diesel platform, or `["Golf", "Golf Variant"]` for VW). Do NOT include chassis codes or generation numbers — users don't know those.
- **`yearFrom`**: First model year this engine-platform combination was produced (integer).
- **`yearTo`**: Last model year, or the current year (2026) if still in production (integer).
- **Multi-brand platforms**: If the same platform is sold under different brands, add a separate entry per brand.

**Example — BMW G30/G31 diesel:**
```json
"vehicles": [
  {
    "make": "BMW",
    "models": ["520d", "520d xDrive", "525d", "525d xDrive", "530d", "530d xDrive"],
    "yearFrom": 2017,
    "yearTo": 2020
  }
]
```

**Example — VW Golf Mk7 TDI:**
```json
"vehicles": [
  {
    "make": "Volkswagen",
    "models": ["Golf TDI", "Golf Variant TDI", "Golf GTD"],
    "yearFrom": 2012,
    "yearTo": 2020
  }
]
```

#### Other schema rules

- `kind: "mfr"` = interval comes from the manufacturer's official schedule
- `kind: "rec"` = community/specialist recommendation not in official schedule
- Leave `milestones` as an empty array — the build script will generate them
- serviceNotes should mention the source (e.g., "per BMW CBS SIB documentation" or "garage.wiki interval table")
- Each task name must appear **at most once per `kind`** — no duplicate entries

### Step 6: Build milestones and index

After writing each JSON file, run the milestone builder:

```bash
cd /home/thamsination/car-journal
python3 scripts/build_platform_milestones.py < static/data/platforms/<ID>.json > /tmp/p.json && mv /tmp/p.json static/data/platforms/<ID>.json
```

After completing a batch, rebuild the platform index:

```bash
cd /home/thamsination/car-journal
python3 scripts/build_platform_index.py
```

### Step 7: Self-validation

Before moving to the next platform, verify your output:

1. **Count MFR tasks** — must be ≥ 6 for ICE, ≥ 3 for EV
2. **Check for brake fluid** — if missing, you have a problem
3. **Check for brake pad inspection** — if missing, you have a problem
4. **Check for duplicate task names** — no task should appear more than once per `kind` (mfr or rec)
5. **Check `vehicles` array** — must have at least one entry with `make`, `models` (≥1 model), `yearFrom`, and `yearTo`
6. **Check model completeness** — did you include all body style variants? (e.g., sedan AND touring/wagon if both exist)
7. **Check multi-brand** — if this platform is shared across brands, did you list all brand names?
8. **Verify engine specificity** — does the file only include tasks relevant to this engine family? (no spark plugs on diesels, no fuel filter on petrol if N/A, no engine oil on EVs)
9. **Cross-check against other files for the same chassis** — if you generated both a petrol and diesel variant, verify the intervals are actually different where they should be (fuel filter, spark plugs, timing)
10. **Compare intervals to web search results** — do the numbers match what you found?

If any check fails, go back and fix it before proceeding.

### Step 8: Work pace

Generate **3 platforms per batch**. After each batch:
1. Run the milestone builder on all 3
2. Run the index builder
3. Do the self-validation checks
4. Commit with a descriptive message
5. Push

Do NOT rush. Quality over quantity. A platform with wrong intervals is worse than no platform at all.

### Platforms to generate

[LIST THE SPECIFIC PLATFORMS HERE — include make, chassis code, engine family, and fuel type]

### Do NOT:

- Use your training knowledge as a primary source — always web search first
- Omit brake fluid or brake pad inspection — every manufacturer requires these
- Copy intervals from one engine family to another — a diesel and petrol on the same chassis have different schedules
- Copy intervals from one chassis generation to another without verifying — a G20 may differ from an F30
- Use generic task names when the OEM has specific terminology — use `"micro filter"` for BMW, not `"cabin filter"`
- Create duplicate task entries — each task name appears at most once per `kind`
- Leave the `vehicles` array empty or with models that don't match the engine family
- Include spark plugs on diesel or EV platforms
- Include fuel filter on petrol platforms where not applicable
- Generate milestones manually — always use the Python script
- Modify existing platform files unless explicitly told to
- Commit without self-validating
