# Agent Prompt: Generate Platform Service Schedules

Use this prompt when instructing an agent to generate new platform config JSON files.

---

## Prompt

I'm working on the car journal app at /home/thamsination/car-journal/

**Before doing anything else**, pull the latest version from git:

```bash
cd /home/thamsination/car-journal && git pull
```

Your task is to generate platform service schedule JSON files for specific car models. Each file must contain:

1. **A `vehicles` array** listing every make/model/year combination the platform covers — this is used by the app to match a user's car to the correct service schedule
2. **Verified manufacturer-specified service intervals** sourced from web searches — not from your training knowledge
3. **OEM-specific task names** using the exact terminology the manufacturer uses in their service documentation

### Step 0: Read the reference files

Before generating anything, read these files to understand the exact schema and quality bar:

1. `static/data/platforms/G30-G31-N63.json` — the primary reference file (new schema with `displacement`/`cylinders`/`fuelType`, no `engines`, no `milestones`)
2. `static/data/platforms/G30-G31-B58.json` — another example (3.0L 6-cyl petrol, new schema)
3. `static/data/platforms/VW-MK7.json` — a corrected batch-1 example (may still use old schema — adapt to new)
4. `scripts/build_platform_index.py` — the index builder script

Also compare the engine-family variants for the G30/G31 5 Series to see how diesel vs petrol files differ:
5. `static/data/platforms/G30-G31-B47.json` — I4 diesel (has fuel filter + timing chain, no spark plugs)
6. `static/data/platforms/G30-G31-B48.json` — I4 petrol (has spark plugs, no fuel filter)
7. `static/data/platforms/G30-G31-B57.json` — I6 diesel (has fuel filter + timing chain, no spark plugs)
8. `static/data/platforms/G30-G31-B58.json` — I6 petrol (has spark plugs, no fuel filter)

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

**Critical: Adding AWD model names requires BOTH:**
1. Adding the model names to the `vehicles` array
2. Adding the drivetrain service tasks (`xDrive transfer case fluid`, `differential fluids`) to `serviceIntervals`

Never add AWD model names without also adding the corresponding drivetrain service tasks. The model names tell the app *which cars match*; the service tasks tell the app *what maintenance those cars need*. One without the other is incomplete.

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

### Step 2: Research BEFORE writing — citation-first workflow

#### MFR vs REC: definitions

Before researching, understand what these labels mean in this app:

- **MFR** (Manufacturer) = the manufacturer's published maximum service interval from the owner's manual, official service schedule, or dynamic service system ceiling. For CBS/ASSYST/Flexible Service systems, use the **maximum interval the system can display** — not the typical calculated result for average driving. Example: BMW CBS may display up to 30,000 km for engine oil on a 520d under ideal conditions; that is the MFR value.
- **REC** (Recommended) = the specialist-consensus interval, typically shorter than MFR, based on documented engineering reasons. Example: independent BMW specialists recommend 10,000 km oil changes despite CBS allowing 30,000 km.

This distinction matters. MFR must reflect what the manufacturer officially publishes. REC reflects real-world best practice. Users see both cards and can decide for themselves.

#### Source tier system

Every MFR interval must be traceable to a specific source. Sources are ranked by reliability:

| Tier | Description | Acceptable for |
|------|-------------|----------------|
| **1** | Owner's manual PDF, manufacturer service portal (bmwtechinfo, ELSA, Renault Clip, Toyota TIS), official service bulletins (SIB/TSB) | MFR (preferred) |
| **2** | Structured interval databases with editorial oversight that cite OEM documentation: garage.wiki, auto-abc.eu | MFR (acceptable) |
| **3** | Specialist documentation (Haynes, Bentley manuals), well-established marque forums with documented consensus (Bimmerpost, TDIClub, NASIOC) | REC only |
| **Reject** | Generic blog posts, YouTube videos, AI-generated "maintenance guides", undated articles without OEM references, forum posts without citations | Never use |

**Rule: MFR intervals require a Tier 1 or Tier 2 source.** If you can only find Tier 3, the task should either be REC, or the interval should be inherited from a verified related platform (same engine family, different chassis) with a note in `serviceNotes`.

#### Web searches

For each platform, perform **at least 5 separate web searches**:

1. **Service schedule:** "[Make] [Model] [Year] [Engine] official maintenance schedule km Europe"
2. **Component intervals:** "[Make] [Model] [Engine] owner's manual service intervals oil filter brake fluid spark plugs air filter"
3. **Engine-specific:** "[Make] [Model] [Engine code] service schedule diesel/petrol timing chain belt"
4. **Model variants:** "[Make] [Platform/generation] models variants body styles years produced"
5. **Drivetrain variants:** "[Make] [Platform/generation] xDrive/quattro/AWD/4WD models transfer case differential fluid interval"

Search #3 is critical for engine-family files — it tells you whether the engine uses a timing chain or belt, what spark plug interval applies, whether there's a fuel filter service, etc.

Search #5 is critical for platforms covering AWD models — it tells you which models are available with AWD, and what the transfer case / differential fluid service intervals are. Many manufacturers specify these at 60,000–100,000 km.

**When evaluating search results**, prefer structured interval tables (garage.wiki) and official documentation over prose descriptions. If a source says "every 30,000 km" but another official source says "every 15,000 km", investigate the discrepancy — it often means different markets, different service regimes (long-life vs. fixed), or different engine outputs on the same platform.

Tier 1 sources:
- bmwtechinfo.bmwgroup.com (BMW CBS and SIB documents)
- Official manufacturer user-manual sites (user-manual.renault.com, etc.)
- Manufacturer service portals (ELSA, Toyota TIS, etc.)

Tier 2 sources:
- garage.wiki (structured interval tables per model year — excellent)
- auto-abc.eu (service interval databases)

Tier 3 sources (REC only):
- Haynes / official dealer documentation
- Well-established marque-specific forums (Bimmerpost, TDIClub, NASIOC, etc.)
- Wikipedia (for model variants, production years, and market names — verify elsewhere)

### Step 2b: Source table — show your work

**Before writing any JSON**, output a markdown source table for the platform. This is mandatory. It documents where every interval came from and makes errors visible before they are buried in JSON.

Format:

```markdown
#### Source table: [Platform ID]

| Task | Kind | km | months | Source | Tier |
|------|------|----|--------|--------|------|
| engine oil | mfr | 30000 | 24 | garage.wiki/BMW/G30/520d | 2 |
| engine oil | rec | 10000 | 12 | BMW specialist consensus (Bimmerpost) | 3 |
| micro filter | mfr | 30000 | null | garage.wiki/BMW/G30/520d | 2 |
| brake fluid | mfr | null | 24 | BMW owner's manual (industry standard) | 1 |
| ... | ... | ... | ... | ... | ... |
```

Rules for the source table:
- **Every MFR row must have a Tier 1 or Tier 2 source.** If you write "training knowledge" or leave the source blank, the row is invalid.
- **Every REC row must have at least a Tier 3 source.** If no source exists, the task does not belong in the file.
- If you cannot find a source for an MFR interval after thorough searching, note it as `"Inherited: [related platform ID]"` and explain in serviceNotes. Do NOT guess from the typical-range table.
- The source column should contain a URL or a specific document reference (e.g., "BMW owner's manual G30, p.247"), not vague descriptions like "various sources" or "commonly known".

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

**Every ICE platform MUST include ALL of the following as `mfr` tasks.** The km/months values must come from the source table you built in Step 2b — never from a generic range.

| Category | How to find the interval | Notes |
|---|---|---|
| Engine oil + filter | Owner's manual or service schedule. For CBS/ASSYST systems, use the system's maximum ceiling. | Every manufacturer specifies this. If you found a number in Step 2b, use it. If not, inherit from a verified related platform and note it. |
| Cabin / pollen filter | Owner's manual or service schedule | Every manufacturer specifies this |
| Air filter | Owner's manual or service schedule | Every manufacturer specifies this |
| Brake fluid | Default: `"km": null, "months": 24` (industry standard). | Always time-based, not km. Only deviate if a verified Tier 1 OEM document explicitly states a different period. |
| Brake pad inspection | Owner's manual or service schedule | Every manufacturer includes brake inspection |
| Spark plugs | Owner's manual or service schedule (petrol engines only) | Interval varies significantly by engine — do NOT copy from another engine family without verifying |
| Coolant | Owner's manual or service schedule | If the OEM specifies a replacement interval, use MFR. If "lifetime" or unspecified, add as REC at ~120,000 km. Never omit coolant. |

Use the **OEM task name** for each (see Step 3), not the generic category name in this table.

**If you cannot find a verified interval for a mandatory MFR task:**
- Do NOT invent a number from a "typical range"
- Inherit the interval from the closest verified related platform (same engine family on a different chassis, or same chassis with a closely related engine)
- Add a serviceNotes entry: `"Interval inherited from [platform ID] — not independently verified for this model"`
- Set the task's source in `serviceSources` to `"Inherited: [platform ID]"`
- This is traceable and auditable — a wrong guess is not

**Additional tasks to include when applicable:**

| Task | When applicable |
|---|---|
| Fuel filter | Diesel engines (always MFR); some petrol engines too |
| Timing belt | Belt-driven engines (MFR — failure is catastrophic) |
| Auxiliary / drive belt | If manufacturer specifies replacement interval |
| Gearbox / transmission fluid | DSG/DCT/CVT/manual — often REC since manufacturers say "lifetime". **Must include `transmission` tag** (see below). |
| Intake carbon clean | Direct-injection engines — REC |
| Transfer case fluid | AWD/4WD vehicles — **mandatory** if any model on the platform ships with AWD. Use MFR if the manufacturer specifies an interval, REC if "lifetime". Add a service note: "xDrive/AWD models only" if mixed RWD+AWD platform. |
| Front/rear differential fluid | AWD/4WD vehicles — same rule as transfer case. On exclusively AWD platforms (X-series, Subaru), these are standard MFR/REC tasks. On mixed platforms, add as REC with a note. |

**EV platforms** omit engine oil, air filter, spark plugs, and fuel filter — but MUST still include brake fluid, brake inspection, cabin filter, and any HV-battery / e-drive coolant service.

### Step 5: JSON schema

```json
{
  "id": "<MAKE-CHASSIS-ENGINE>",
  "name": "<Full platform name with mechanical specs, e.g. BMW G30/G31 5 Series (2.0L 4-cyl diesel)>",
  "years": "<production years as text>",
  "chassisCodes": ["<code1>", "<code2>"],
  "drivetrains": ["<FWD|RWD|AWD>"],
  "transmissions": ["<manual|automatic|dct|cvt|ev>"],
  "displacement": "<e.g. 2.0L, 4.4L, or null for EV>",
  "cylinders": "<integer, e.g. 4, 6, 8 — use 0 for EV>",
  "fuelType": "<petrol|diesel|electric|hybrid>",
  "vehicles": [
    {
      "make": "<Make>",
      "models": ["<Model1>", "<Model2>", "<Variant>"],
      "yearFrom": 2019,
      "yearTo": 2026,
      "chassisCodes": ["<optional: subset of platform chassisCodes for this era>"]
    }
  ],
  "serviceIntervals": [
    { "task": "<OEM task name>", "km": <interval>, "months": null, "kind": "mfr" },
    { "task": "<OEM task name>", "km": null, "months": <interval>, "kind": "mfr" },
    { "task": "<OEM task name>", "km": <interval>, "months": null, "kind": "rec" },
    { "task": "<OEM task name>", "km": <interval>, "months": null, "kind": "rec", "transmission": ["manual"] },
    { "task": "<OEM task name>", "km": <interval>, "months": null, "kind": "rec", "transmission": ["dct"] }
  ],
  "serviceNotes": {
    "<OEM task name>": "<Why this matters + platform/engine-specific context>"
  },
  "serviceSources": {
    "<OEM task name>": "<URL or document reference where the interval was verified>"
  }
}
```

**`serviceSources` rules:**

- Every MFR task must have a corresponding entry in `serviceSources` with a URL or specific document reference
- REC tasks should also have sources where possible, but are not required
- Acceptable formats: `"https://garage.wiki/BMW/G30/520d#service-schedule"`, `"BMW owner's manual G30 (2017), p.247"`, `"Inherited: G30-G31-B47"`
- The app ignores this field at runtime — it exists for audit and regeneration only

**Important schema changes (no `engines`, no `milestones`):**

- The `engines` field has been removed from both the platform level and from `vehicles` entries. Instead, use `displacement`, `cylinders`, and `fuelType` at the platform level.
- The `milestones` array has been removed. The app computes milestones at runtime from `serviceIntervals`. Do NOT include a `milestones` field.
- The `name` field should use human-readable mechanical specs, not engine codes. E.g. `"BMW G30/G31 5 Series (2.0L 4-cyl diesel)"` not `"BMW G30/G31 5 Series (B47 2.0d)"`.

**`displacement`, `cylinders`, `fuelType` rules:**

- `displacement`: Engine displacement as a string, e.g. `"2.0L"`, `"3.0L"`, `"4.4L"`. Use one decimal place. Set to `null` for BEV platforms.
- `cylinders`: Integer cylinder count: `4`, `6`, `8`, `12`. Use `0` for BEV platforms.
- `fuelType`: One of `"petrol"`, `"diesel"`, `"electric"`, `"hybrid"`.
- For PHEV platforms: use the ICE displacement/cylinders and `"fuelType": "hybrid"`.
- These fields MUST match the specs of every model listed in the `vehicles` array. If models on the platform have different displacements or cylinder counts, the platform file must be split — each displacement/cylinder combination gets its own file.

#### `vehicles` array rules

This array is how the app matches a user's car to a platform. Get it right.

- **`make`**: The brand name as the user would type it. Use title case: `"Volkswagen"` not `"VW"`, `"BMW"` not `"Bmw"`.
- **`models`**: Every model name **actually sold** on this engine-platform combination. **Every entry must identify the engine variant** — bare series names like `"3 Series"`, `"5 Series"`, or `"Golf"` are NOT valid because they don't tell the app which engine the user has. Use the full model designation: `"320d"`, `"520d"`, `"Golf TDI"`, etc. Include body style variants **and drivetrain variants** if they have different market names (e.g., `["520d", "520d Touring", "520d xDrive", "520d xDrive Touring"]` for a BMW diesel platform covering sedan and wagon). Always list both the base and AWD model name when the manufacturer markets them separately (BMW: `"320i"` and `"320i xDrive"`, Audi: `"A4 2.0 TFSI"` and `"A4 2.0 TFSI quattro"`). For platforms covering both sedan and Touring/wagon body styles (BMW G30 sedan + G31 Touring, E60 sedan + E61 Touring), every model that is sold as a Touring must have a separate `"... Touring"` entry — a user with a `520d xDrive Touring` must find that exact name, not just `"520d xDrive"`. Do NOT include chassis codes or generation numbers — users don't know those. **Verify model names exist** — not every generation/chassis offered AWD. For example, BMW E39 (1995–2003) had NO xDrive/xi variants; those started with the E60. Adding fictional model names breaks user trust.
- **`yearFrom`**: First model year this engine-platform combination was produced (integer).
- **`yearTo`**: Last model year, or the current year (2026) if still in production (integer).
- **`chassisCodes`** (optional): If the platform spans multiple chassis generations, list only the chassis codes that apply to this vehicles entry's year range. The app uses this to filter the chassis dropdown. Omit if all platform-level `chassisCodes` apply to this entry.
- **Multi-brand platforms**: If the same platform is sold under different brands, add a separate entry per brand.

**When to use per-entry `chassisCodes`:**

Use these when a single platform file covers multiple chassis generations. This is common on catch-all platforms that span many years (e.g., Subaru WRX 2000–2021 covers GD, GE, and VA chassis). The app matches the user's make + model + year to a specific vehicles entry, then uses that entry's `chassisCodes` for dropdowns. If no per-entry array exists, it falls back to the platform-level array.

**Split vehicles entries by generation** when chassis codes differ. Don't cram everything into one entry spanning 20 years if the chassis changed halfway through.

**Example — BMW G30/G31 diesel (sedan + Touring, single generation):**
```json
"vehicles": [
  {
    "make": "BMW",
    "models": ["520d", "520d Touring", "520d xDrive", "520d xDrive Touring", "525d", "525d Touring", "525d xDrive", "525d xDrive Touring"],
    "yearFrom": 2017,
    "yearTo": 2020
  }
]
```
No per-entry `chassisCodes`/`engines` needed — single-engine platform with consistent chassis.

**Example — Subaru WRX/STI EJ turbo (multi-generation catch-all):**
```json
"vehicles": [
  {
    "make": "Subaru",
    "models": ["Impreza WRX", "Impreza WRX Wagon", "Impreza WRX STI", "Impreza WRX STI Wagon"],
    "yearFrom": 2000, "yearTo": 2007,
    "chassisCodes": ["GD", "GG"]
  },
  {
    "make": "Subaru",
    "models": ["WRX", "WRX STI"],
    "yearFrom": 2008, "yearTo": 2014,
    "chassisCodes": ["GE", "GH"]
  },
  {
    "make": "Subaru",
    "models": ["WRX STI"],
    "yearFrom": 2015, "yearTo": 2021,
    "chassisCodes": ["VA"]
  }
]
```
Each entry scopes chassis codes to the correct generation, so a 2016 WRX STI user only sees chassis `VA`.

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

#### `drivetrains` field rules

The `drivetrains` array declares which drivetrain layouts are available on this platform. The app uses this to show a filtered drivetrain picker when adding or editing a vehicle.

**Valid values:** `"FWD"`, `"RWD"`, `"AWD"`

**Rules:**
- List **all drivetrain types available** on this platform
- AWD-only platforms (BMW X-series, Subaru WRX): `["AWD"]`
- RWD-only platforms (BMW E39, E38, E63, E89): `["RWD"]`
- FWD-only platforms (VW Golf, Renault Clio, Toyota Yaris): `["FWD"]`
- Mixed platforms (BMW 3 Series with optional xDrive): `["RWD", "AWD"]`
- FWD-based with optional AWD (BMW F40 1 Series, F48 X1): `["FWD", "AWD"]`

**Examples:**
```json
"drivetrains": ["AWD"]
"drivetrains": ["RWD", "AWD"]
"drivetrains": ["FWD"]
```

When a platform has only one drivetrain, the app auto-selects it. When multiple exist, the user picks from a dropdown filtered to only the valid options.

#### `transmissions` field rules

The `transmissions` array declares which transmission types are available on this platform. The app uses this to show a filtered transmission picker when adding or editing a vehicle, and to auto-select when only one option exists.

**Valid values:** `"manual"`, `"automatic"`, `"dct"`, `"cvt"`, `"ev"`

**Rules:**
- List **all transmission types available** on this platform
- Automatic-only platforms (modern BMW, Audi): `["automatic"]`
- Manual + automatic platforms (older BMW E90, VW Golf): `["manual", "automatic"]`
- Manual + DCT platforms (VW Golf DSG): `["manual", "dct"]`
- Manual + CVT platforms (Subaru WRX): `["manual", "cvt"]`
- EV platforms (BMW i3, iX): `["ev"]`
- Manual-only platforms (Subaru WRX STI): `["manual"]`

**Examples:**
```json
"transmissions": ["automatic"]
"transmissions": ["manual", "automatic"]
"transmissions": ["manual", "dct"]
"transmissions": ["ev"]
```

**How to determine the correct values:**
- If the platform covers vehicles sold with a conventional torque-converter automatic: include `"automatic"`
- If the platform covers vehicles with a dual-clutch gearbox (DSG, PDK, M-DCT, DCT): use `"dct"` not `"automatic"`
- If the platform covers vehicles with a CVT: use `"cvt"` not `"automatic"`
- If the platform is a BEV (battery EV) with a single-speed reduction gear: use `"ev"`
- PHEVs with a conventional automatic transmission: use `"automatic"` (the EV motor is integrated into the auto gearbox)

When a platform has only one transmission, the app auto-selects it. When multiple exist, the user picks from a dropdown filtered to only the valid options.

#### `serviceIntervals` field rules

- `kind: "mfr"` = interval comes from the manufacturer's official schedule. Must have a Tier 1 or Tier 2 source in `serviceSources`.
- `kind: "rec"` = specialist recommendation for a **documented wear item** not in the official schedule (see qualifying criteria below). Should have at least a Tier 3 source in `serviceSources`.
- **`km`**: distance-based interval in kilometres. Set to `null` for time-only tasks (e.g., brake fluid)
- **`months`**: time-based interval in months. Set to `null` for distance-only tasks
- **Every entry MUST have both `km` and `months` fields** — one or both can be null, but both keys must be present
- **Brake fluid is ALWAYS time-based** — use `"km": null, "months": 24` (or the OEM-specified months). Never assign a km proxy value.
- **Any task with a manufacturer-specified time interval** should use the `months` field (brake fluid is the most common, but coolant, spark plugs, and timing belts sometimes have time limits too — e.g., "every 5 years or 120,000 km")
- Tasks with both `km` and `months` will trigger based on whichever comes first
- Tasks with only `months` (km is null) are excluded from km-based milestones and tracked by date in the app
- Do NOT include a `milestones` field — milestones are computed at runtime from `serviceIntervals`
- serviceNotes should mention the source (e.g., "per BMW CBS SIB documentation" or "garage.wiki interval table")
- Each task name must appear **at most once per `kind`** — no duplicate entries

#### `rec` task qualifying criteria

A `rec` (recommended) task must meet **all three** of the following criteria:

1. **It services a physical wear item or fluid** that degrades with use or time (gearbox fluid, coolant, differential oil, timing chain, carbon deposits on intake valves).
2. **There is a documented engineering reason** for the service — not just "some people on forums do it." Valid reasons include: manufacturer labels the fluid "lifetime fill" but independent testing shows degradation; the engine design causes a known failure mode (e.g., carbon buildup on direct-injection intake valves, timing chain stretch on specific engines); the component is a known weak point with documented failure patterns.
3. **The task can be described with a specific km or month interval** based on specialist consensus, not a vague "when needed."

**What qualifies as `rec`:**
- Gearbox/transmission fluid changes on "lifetime fill" transmissions (ZF8, DSG, CVT)
- Coolant flush when manufacturer says "lifetime" but the coolant chemistry degrades
- Intake carbon clean on direct-injection engines (documented carbon buildup issue)
- Timing chain replacement on engines with known chain-stretch problems (e.g., BMW N47)
- Differential and transfer case fluids on AWD vehicles when OEM says "lifetime"
- Wet belt inspection on engines with known timing belt-in-oil issues (PureTech)
- Manual transmission oil change when OEM says "inspect only"

**What does NOT qualify as `rec`:**
- Fuel system additives / fuel system cleanse — these are consumable products, not wear-item services
- Engine flush additives — not a maintenance task, no fixed interval
- Performance modifications (upgraded spark plugs, aftermarket filters)
- Cosmetic or comfort items (interior treatment, paint sealant)
- Generic "good practice" items that lack a specific engineering justification for the platform
- Tasks that only apply under severe/special conditions (towing, track use) unless the platform is specifically a performance model (STI, M-car, RS) where spirited driving is expected

If you are unsure whether a task qualifies, leave it out. A missing `rec` task is harmless; a spurious one creates false maintenance alerts.

#### `transmission` field rules (transmission-specific tasks)

Many platforms cover vehicles sold with different transmission types (manual, automatic, DSG/DCT, CVT). Transmission fluid service tasks differ by type — a car with a manual gearbox doesn't need CVT fluid and vice versa.

**When to use the `transmission` field:**

Any `serviceIntervals` entry for a transmission-specific fluid task MUST include a `transmission` array specifying which transmission type(s) the task applies to. The app filters tasks at runtime based on the vehicle's configured transmission.

**Valid `transmission` values:** `"manual"`, `"automatic"`, `"cvt"`, `"dct"`, `"ev"`

**Rules:**

1. **Manual gearbox fluid** → `"transmission": ["manual"]`
2. **DSG / dual-clutch fluid** → `"transmission": ["dct"]`
3. **CVT fluid** → `"transmission": ["cvt"]`
4. **Torque converter automatic transmission fluid** → `"transmission": ["automatic"]`
5. **Generic "gearbox fluid" that applies to all conventional transmissions** → omit the `transmission` field entirely (it applies to everyone). This is the case for BMW's generic "gearbox fluid" entry where the same ZF unit is used regardless of whether a manual or automatic was optioned — the task name and interval are the same.
6. **EV reduction gear / drive unit fluid** → `"transmission": ["ev"]` if only applicable to EV models; otherwise omit.
7. If a platform ONLY comes with one transmission type (e.g., all modern BMW models are automatic-only), you may omit the `transmission` field since there is no ambiguity. Only tag when the platform covers **multiple transmission types**.
8. **Tasks without a `transmission` field** apply to ALL vehicles on the platform (this is the default and applies to most tasks: oil, filters, brakes, coolant, etc.)

**Examples:**

VW Golf Mk7 (offered with manual and DSG):
```json
{ "task": "DSG gearbox fluid", "km": 60000, "months": null, "kind": "rec", "transmission": ["dct"] },
{ "task": "manual gearbox fluid", "km": 50000, "months": null, "kind": "rec", "transmission": ["manual"] }
```

Subaru WRX (offered with manual and CVT):
```json
{ "task": "CVT fluid", "km": 60000, "months": null, "kind": "rec", "transmission": ["cvt"] },
{ "task": "manual transmission oil", "km": 120000, "months": null, "kind": "rec", "transmission": ["manual"] }
```

BMW (ZF8 automatic only on modern platforms — no tag needed):
```json
{ "task": "gearbox fluid", "km": 100000, "months": null, "kind": "rec" }
```

### Step 6: Build index and validate sources

After completing a batch, rebuild the platform index and validate source coverage:

```bash
cd /home/thamsination/car-journal
node scripts/generate-platform-index.js
node scripts/validate-platform-sources.js
```

The validation script will flag:
- **RED**: MFR interval with no entry in `serviceSources`
- **YELLOW**: MFR interval with an inherited or Tier 3 source
- **GREEN**: MFR interval with a Tier 1/2 source

Fix all RED issues before committing. YELLOW issues are acceptable for initial generation but should be upgraded over time.

**Do NOT include a `milestones` array in the JSON files.** Milestones are computed at runtime from `serviceIntervals`.

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
12. **Verify model names are historically accurate** — confirm via web search that every model name in the `vehicles` array was actually produced for this generation. AWD availability varies by generation: BMW xDrive was not available on E39 5 Series, E38 7 Series, or E63 6 Series. Adding models that never existed is worse than omitting real ones. If unsure, leave it out.
13. **Cross-check against other files for the same chassis** — if you generated multiple variants (petrol/diesel, different generations), verify: (a) intervals differ where expected (fuel filter, spark plugs, timing), (b) shared tasks like coolant and brake fluid appear on ALL variants, (c) task names are consistent within the same brand (don't use "cabin air filter" on one and "interior ventilation filter" on another unless the OEM actually changed terminology between generations)
14. **Compare intervals to web search results** — do the numbers match what you found?
15. **Verify every `serviceIntervals` entry has both `km` and `months` fields** — one may be null, but both keys must be present in every entry
16. **Check that model names belong to this platform** — no models from other platforms (e.g., i4 belongs to G26, not G20; M5 belongs to F10/G30 M, not the standard chassis file)
17. **Check transmission-specific tasks** — if the platform covers vehicles with multiple transmission types (manual + automatic, manual + CVT, etc.), verify that each transmission-specific fluid task has a `"transmission"` array tag. If the platform only comes with one transmission type, the tag may be omitted. Never include both `CVT fluid` and `manual transmission oil` without tagging each with the appropriate `transmission` value.
18. **Check `drivetrains` array** — must be present and contain at least one of `"FWD"`, `"RWD"`, `"AWD"`. If the platform includes AWD models (xDrive, quattro, etc.), `"AWD"` must be in the array. If the platform is exclusively AWD (X-series, Subaru), it should be `["AWD"]` only. FWD-based platforms with optional AWD should be `["FWD", "AWD"]`, not `["RWD", "AWD"]`.
19. **Validate every `rec` task against the qualifying criteria** — each `rec` entry must (a) service a physical wear item or fluid, (b) have a documented engineering reason specific to this platform/engine, and (c) have a specific km or month interval from specialist consensus. If any `rec` task is an additive, consumable product, or "nice to have" without a documented failure mode, remove it.
20. **Check model names identify the engine variant** — no bare series names like `"3 Series"`, `"5 Series"`, `"Golf"`. Every model entry must include the engine designation (e.g., `"320d"`, `"520i xDrive"`, `"Golf TDI"`). If a user cannot tell from the model name alone which engine it refers to, the entry is invalid.
21. **Check body style completeness** — if the platform covers multiple body styles (sedan + Touring/wagon, coupé + convertible), verify that every engine/drivetrain model name has a variant for each body style. For example, a G30/G31 platform must list both `"520d"` (sedan) and `"520d Touring"` (wagon), not just `"520d"`.
22. **Check `transmissions` array** — must be present and contain at least one of `"manual"`, `"automatic"`, `"dct"`, `"cvt"`, `"ev"`. Use `"dct"` for dual-clutch (DSG, PDK), `"cvt"` for CVT, `"ev"` for BEV single-speed, `"automatic"` for conventional torque-converter auto. BEV platforms should be `["ev"]`, not `["automatic"]`.
23. **Check `displacement`, `cylinders`, `fuelType`** — all three must be present at the platform level (use `null`/`0` for EV). Verify that the displacement and cylinder count match the specs for ALL models listed in the `vehicles` array. If models have different specs, the file must be split.
24. **Cross-check displacement/cylinders against models** — if displacement is `"4.4L"` and cylinders is `8`, the platform should NOT contain models known to have I6 engines, and vice versa. If displacement is `"2.0L"` and cylinders is `4`, no V6 or V8 models should be listed.
25. **Check per-entry `chassisCodes` on vehicles entries** — if the platform spans multiple chassis generations (e.g., different chassis codes for different year ranges), each `vehicles` entry must have per-entry `chassisCodes` arrays scoped to that entry's year range. A 2016 WRX STI user should only see chassis `VA`, not all codes from 2000–2021. Per-entry arrays must be subsets of the platform-level arrays.
26. **No `engines` field** — verify there is no `engines` field at platform level or in any `vehicles` entry. This field has been replaced by `displacement`/`cylinders`/`fuelType`.
27. **No `milestones` field** — verify there is no `milestones` array. Milestones are computed at runtime.
28. **Check `serviceSources` exists** — the file must have a `serviceSources` object. Every MFR task in `serviceIntervals` must have a matching key in `serviceSources` with a non-empty value (URL or document reference).
29. **Check source quality** — every MFR source must be Tier 1 or Tier 2 (official documentation or structured interval database). If any MFR source says "Inherited: ...", verify the inherited platform actually exists and is itself verified. No MFR source may be blank, "training knowledge", "commonly known", or a generic blog URL.
30. **Cross-check intervals against the source table** — the km/months values in the JSON must exactly match the values in the source table from Step 2b. If they differ, something was changed without updating the source.
31. **Check for missing sources** — every REC task should ideally have a source too. If a REC task has no source entry in `serviceSources`, add one or remove the task.

If any check fails, go back and fix it before proceeding.

### Step 8: Work pace

Generate **3 platforms per batch**. After each batch:
1. Run the index builder
2. Do the self-validation checks
3. Commit with a descriptive message
4. Push

Do NOT rush. Quality over quantity. A platform with wrong intervals is worse than no platform at all.

### Platforms to generate

[LIST THE SPECIFIC PLATFORMS HERE — include make, chassis code, engine family, and fuel type]

### Do NOT:

- Use your training knowledge as a primary source for MFR intervals — every MFR value must come from a Tier 1 or Tier 2 source found via web search
- Guess MFR intervals from "typical range" tables — if you cannot find a verified source, inherit from a related verified platform and document it
- Omit the source table (Step 2b) — it is mandatory for every platform and must be output before the JSON
- Omit `serviceSources` from the JSON — every platform file must include this field
- Use vague sources like "various online sources", "commonly known", or "standard practice" — cite specific URLs or documents
- Omit brake fluid or brake pad inspection — every manufacturer requires these
- Copy intervals from one engine family to another — a diesel and petrol on the same chassis have different schedules
- Copy intervals from one chassis generation to another without verifying — a G20 may differ from an F30
- Use generic task names when the OEM has specific terminology — use `"micro filter"` for BMW, not `"cabin filter"`
- Create duplicate task entries — each task name appears at most once per `kind`
- Use bare series names (`"3 Series"`, `"5 Series"`, `"Golf"`, `"Clio"`) as model entries — every model name must identify the specific engine variant (e.g., `"320d"`, `"Golf TDI"`)
- Omit body style suffixes when the platform covers multiple body styles — if the chassis includes a Touring/wagon (G31, E61, F11), every model sold as a Touring must have a `"... Touring"` entry alongside the sedan entry
- Leave the `vehicles` array empty or with models that don't match the platform's displacement/cylinders
- Omit xDrive/quattro/AWD model names from the `vehicles` array when the manufacturer sells them as distinct models — users with AWD cars must be able to find their vehicle
- Omit transfer case and differential fluid tasks on platforms that cover AWD/4WD models — every AWD vehicle has these components and they need servicing
- Add AWD model names to the `vehicles` array without also adding drivetrain service tasks to `serviceIntervals` — model names without matching tasks means missing maintenance reminders
- Invent model names that never existed — verify via web search that each AWD variant was actually produced for this generation (e.g., BMW E39 never had xDrive; E46 xi was petrol-only, no xd diesel AWD)
- Add models from a different platform to the wrong file — the i4 belongs to G26/G22, not G20; keep model lists accurate to the chassis
- Include spark plugs on diesel or EV platforms
- Include fuel filter on petrol platforms where not applicable
- Assign a `km` value to brake fluid — it is always time-based (`"km": null, "months": 24`)
- Omit coolant from any ICE platform — every engine needs coolant service
- Omit the `months` field from any `serviceIntervals` entry — every entry needs both `km` and `months` (set to null when not applicable)
- Use inconsistent task names across engine variants of the same brand — if Subaru calls it "cabin air filter" on one generation, use the same name on other generations unless the OEM verifiably changed the terminology
- Include transmission-specific fluid tasks (CVT fluid, DSG fluid, manual gearbox fluid) without a `"transmission"` tag when the platform covers multiple transmission types — a manual-only owner should not see CVT fluid reminders and vice versa
- Omit the `"transmission"` tag on transmission fluid tasks when the platform covers both manual and automatic/CVT/DCT variants
- Omit the `drivetrains` array — every platform must declare its available drivetrain layouts
- Omit the `transmissions` array — every platform must declare its available transmission types
- Use `"automatic"` for dual-clutch (DSG, PDK, M-DCT) — use `"dct"` instead
- Use `"automatic"` for CVT — use `"cvt"` instead
- Use `"automatic"` for BEV single-speed reduction gear — use `"ev"` instead
- Use `"RWD"` for FWD-based platforms — BMW F40/F44/F45/F48/F39 are FWD-based (UKL/FAAR), not RWD. VW, Renault, Toyota, etc. are FWD.
- Add fuel system additives, engine flush, or any consumable product as a `rec` task — these are not wear-item services and do not belong in a maintenance schedule
- Add `rec` tasks based on generic forum advice without a documented engineering justification specific to the engine/platform — "some people recommend it" is not sufficient
- Include an `engines` field at platform level or in `vehicles` entries — this field has been replaced by `displacement`/`cylinders`/`fuelType`
- Include a `milestones` array — milestones are computed at runtime from `serviceIntervals`
- Mix models with different displacements/cylinder counts in the same file — each displacement/cylinder combination gets its own platform file
- Modify or rename existing platform files unless explicitly told to
- Commit without self-validating
