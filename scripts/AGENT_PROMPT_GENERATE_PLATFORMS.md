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

1. `static/data/platforms/G30-G31-B47.json` — the original hand-crafted reference (BMW B47 diesel)
2. `static/data/platforms/VW-MK7.json` — a corrected batch-1 example
3. `static/data/platforms/Dacia-SANDERO-3.json` — another corrected example (Renault Group)
4. `scripts/build_platform_milestones.py` — the milestone builder script
5. `scripts/build_platform_index.py` — the index builder script

Also compare the engine-family variants for the G30/G31 5 Series to see how diesel vs petrol files differ:
6. `static/data/platforms/G30-G31-B47.json` — B47 I4 diesel (has fuel filter + timing chain, no spark plugs)
7. `static/data/platforms/G30-G31-B48.json` — B48 I4 petrol (has spark plugs, no fuel filter)
8. `static/data/platforms/G30-G31-B57.json` — B57 I6 diesel (has fuel filter + timing chain, no spark plugs)
9. `static/data/platforms/G30-G31-B58.json` — B58 I6 petrol (has spark plugs, no fuel filter)

Study these files carefully — note that every `serviceIntervals` entry has both a `km` and `months` field (one may be null). Your output must match the same schema and level of completeness.

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
- AWD/4WD drivetrains (BMW xDrive, Audi quattro, Subaru Symmetrical AWD, etc.) have transfer case and additional differential fluid services that RWD/FWD models lack

When a facelifted generation (LCI, FL, Phase 2, etc.) has **different service intervals or CBS calibrations**, create a separate platform file for it.

**AWD/4WD drivetrain handling:**

Many platforms cover models sold in both RWD/FWD and AWD variants (e.g., BMW 3 Series comes in both RWD and xDrive). Rather than creating separate files per drivetrain, include the AWD-specific service tasks (transfer case fluid, front/additional differential fluid) as `rec` entries in the platform file, with a service note clarifying they apply to AWD/4WD models only.

**However**, if a platform covers **exclusively AWD/4WD models** (e.g., BMW X5, Subaru WRX, Audi Q5), the drivetrain fluid tasks should be `mfr` if the manufacturer specifies them, or `rec` if they recommend "lifetime fill".

**Important:** The `vehicles` array must list xDrive/AWD model names explicitly when the manufacturer markets them as distinct models. For example, BMW sells `"320d"` and `"320d xDrive"` as separate models — both must appear. Similarly, Audi sells `"A4 2.0 TFSI"` and `"A4 2.0 TFSI quattro"`. Omitting the AWD variant means users with that car cannot find it in the app.

**Platform ID format:** `<MAKE>-<CHASSIS>-<ENGINE/FUEL>` for new platforms.

> **Note:** Some legacy BMW files use older naming conventions (e.g., `G30-G31-B47.json` without a `BMW-` prefix, or `BMW-E90.json` without an engine suffix). Do NOT rename existing files — use the new format for all newly created platforms only.

Examples by brand:
- BMW: `BMW-F30-N20`, `BMW-F30-B47`, `BMW-G20-B48` (use engine code)
- VW Group: `VW-MK7-TSI`, `VW-MK7-TDI`, `Skoda-OCTAVIA-3-TSI` (use engine family)
- Toyota: `Toyota-YARIS-XP210-Hybrid`, `Toyota-COROLLA-E210-2.0Hybrid` (use drivetrain)
- Renault/Dacia: `Renault-CLIO-5-TCe`, `Dacia-SANDERO-3-dCi` (use engine brand)
- Stellantis: `Peugeot-208-II-PureTech`, `Opel-CORSA-F-Diesel` (use engine brand or fuel)
- Ford: `Ford-FOCUS-4-EcoBoost`, `Ford-FOCUS-4-EcoBlue` (use engine brand)

Use whichever identifier is most recognizable for that brand's owners. BMW owners know engine codes (B47, N55). VW owners know TSI/TDI. Toyota owners know Hybrid vs non-hybrid.

### Step 2: Research BEFORE writing

For each platform, perform **at least 5 separate web searches**:

1. **Service schedule:** "[Make] [Model] [Year] [Engine] official maintenance schedule km Europe"
2. **Component intervals:** "[Make] [Model] [Engine] owner's manual service intervals oil filter brake fluid spark plugs air filter"
3. **Engine-specific:** "[Make] [Model] [Engine code] service schedule diesel/petrol timing chain belt"
4. **Model variants:** "[Make] [Platform/generation] models variants body styles years produced"
5. **Drivetrain variants:** "[Make] [Platform/generation] xDrive/quattro/AWD/4WD models transfer case differential fluid interval"

Search #3 is critical for engine-family files — it tells you whether the engine uses a timing chain or belt, what spark plug interval applies, whether there's a fuel filter service, etc.

Search #5 is critical for platforms covering AWD models — it tells you which models are available with AWD, and what the transfer case / differential fluid service intervals are. Many manufacturers specify these at 60,000–100,000 km.

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
| Brake fluid | Time-based: 24 months (default) | Always time-based, not km. Use `"km": null, "months": 24`. Only deviate if you find a verified OEM document specifying a different period — 24 months is the industry standard. |
| Brake pad inspection | 15,000–30,000 km | Every manufacturer includes brake inspection |
| Spark plugs | 30,000–120,000 km | All petrol engines require this |
| Coolant | 80,000–200,000 km or time-based | Every engine has coolant — if the OEM specifies a replacement interval, use MFR. If "lifetime" or unspecified, add as REC at ~120,000 km. Never omit coolant. |

Use the **OEM task name** for each (see Step 3), not the generic category name in this table.

**Additional tasks to include when applicable:**

| Task | When applicable |
|---|---|
| Fuel filter | Diesel engines (always MFR); some petrol engines too |
| Timing belt | Belt-driven engines (MFR — failure is catastrophic) |
| Auxiliary / drive belt | If manufacturer specifies replacement interval |
| Gearbox / transmission fluid | DSG/DCT/CVT — often REC since manufacturers say "lifetime" |
| Intake carbon clean | Direct-injection engines — REC |
| Transfer case fluid | AWD/4WD vehicles — **mandatory** if any model on the platform ships with AWD. Use MFR if the manufacturer specifies an interval, REC if "lifetime". Add a service note: "xDrive/AWD models only" if mixed RWD+AWD platform. |
| Front/rear differential fluid | AWD/4WD vehicles — same rule as transfer case. On exclusively AWD platforms (X-series, Subaru), these are standard MFR/REC tasks. On mixed platforms, add as REC with a note. |

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
    { "task": "<OEM task name>", "km": <interval>, "months": null, "kind": "mfr" },
    { "task": "<OEM task name>", "km": null, "months": <interval>, "kind": "mfr" },
    { "task": "<OEM task name>", "km": <interval>, "months": null, "kind": "rec" }
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
- **`models`**: Every model name sold on this engine-platform combination. Include body style variants **and drivetrain variants** if they have different names (e.g., `["520d", "520d xDrive"]` for a BMW diesel platform, or `["Golf", "Golf Variant"]` for VW). Always list both the base and AWD model name when the manufacturer markets them separately (BMW: `"320i"` and `"320i xDrive"`, Audi: `"A4 2.0 TFSI"` and `"A4 2.0 TFSI quattro"`). Do NOT include chassis codes or generation numbers — users don't know those.
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

#### `serviceIntervals` field rules

- `kind: "mfr"` = interval comes from the manufacturer's official schedule
- `kind: "rec"` = community/specialist recommendation not in official schedule
- **`km`**: distance-based interval in kilometres. Set to `null` for time-only tasks (e.g., brake fluid)
- **`months`**: time-based interval in months. Set to `null` for distance-only tasks
- **Every entry MUST have both `km` and `months` fields** — one or both can be null, but both keys must be present
- **Brake fluid is ALWAYS time-based** — use `"km": null, "months": 24` (or the OEM-specified months). Never assign a km proxy value.
- **Any task with a manufacturer-specified time interval** should use the `months` field (brake fluid is the most common, but coolant, spark plugs, and timing belts sometimes have time limits too — e.g., "every 5 years or 120,000 km")
- Tasks with both `km` and `months` will trigger based on whichever comes first
- Tasks with only `months` (km is null) are excluded from km-based milestones and tracked by date in the app
- Leave `milestones` as an empty array — the build script will generate them (it skips time-only tasks automatically)
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

1. **Count MFR tasks** — must be ≥ 7 for ICE (oil, cabin filter, air filter, brake fluid, brake pads, spark plugs, coolant), ≥ 3 for EV
2. **Check for brake fluid** — must be present with `"km": null, "months": 24`. Only use a different months value if a verified OEM document explicitly states a non-standard period. Never use a `km` value.
3. **Check for coolant** — every ICE platform must have a coolant entry (MFR if OEM-specified, REC at ~120,000 km if not)
4. **Check for brake pad inspection** — if missing, you have a problem
5. **Check for duplicate task names** — no task should appear more than once per `kind` (mfr or rec)
6. **Check `vehicles` array** — must have at least one entry with `make`, `models` (≥1 model), `yearFrom`, and `yearTo`
7. **Check model completeness** — did you include all body style variants? (e.g., sedan AND touring/wagon if both exist)
8. **Check multi-brand** — if this platform is shared across brands, did you list all brand names?
9. **Verify engine specificity** — does the file only include tasks relevant to this engine family? (no spark plugs on diesels, no fuel filter on petrol if N/A, no engine oil on EVs)
10. **Check AWD/4WD drivetrain tasks** — if any model in the `vehicles` array is an AWD/4WD variant (xDrive, quattro, 4MATIC, etc.), verify that transfer case and differential fluid tasks are present. If the platform covers exclusively AWD models (X-series, Subaru, etc.), these should be MFR or REC. If mixed RWD+AWD, they should be REC with a service note.
11. **Check AWD model name completeness** — if the chassis is offered with optional AWD (e.g., BMW xDrive, Audi quattro), verify that both the base and AWD model names appear in the `vehicles.models` array. For example, a BMW G20 3 Series platform should list both `"320i"` and `"320i xDrive"` if both are sold.
12. **Cross-check against other files for the same chassis** — if you generated multiple variants (petrol/diesel, different generations), verify: (a) intervals differ where expected (fuel filter, spark plugs, timing), (b) shared tasks like coolant and brake fluid appear on ALL variants, (c) task names are consistent within the same brand (don't use "cabin air filter" on one and "interior ventilation filter" on another unless the OEM actually changed terminology between generations)
13. **Compare intervals to web search results** — do the numbers match what you found?
14. **Verify every `serviceIntervals` entry has both `km` and `months` fields** — one may be null, but both keys must be present in every entry

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
- Omit xDrive/quattro/AWD model names from the `vehicles` array when the manufacturer sells them as distinct models — users with AWD cars must be able to find their vehicle
- Omit transfer case and differential fluid tasks on platforms that cover AWD/4WD models — every AWD vehicle has these components and they need servicing
- Include spark plugs on diesel or EV platforms
- Include fuel filter on petrol platforms where not applicable
- Assign a `km` value to brake fluid — it is always time-based (`"km": null, "months": 24`)
- Omit coolant from any ICE platform — every engine needs coolant service
- Omit the `months` field from any `serviceIntervals` entry — every entry needs both `km` and `months` (set to null when not applicable)
- Use inconsistent task names across engine variants of the same brand — if Subaru calls it "cabin air filter" on one generation, use the same name on other generations unless the OEM verifiably changed the terminology
- Generate milestones manually — always use the Python script
- Modify or rename existing platform files unless explicitly told to
- Commit without self-validating
