# Agent Prompt: Generate Platform Service Schedules

Use this prompt when instructing an agent to generate new platform config JSON files.

---

## Prompt

I'm working on the car journal app at /home/thamsination/car-journal/

Your task is to generate platform service schedule JSON files for specific car models. Each file must contain:

1. **A `vehicles` array** listing every make/model/year combination the platform covers — this is used by the app to match a user's car to the correct service schedule
2. **Verified manufacturer-specified service intervals** sourced from web searches — not from your training knowledge

### Step 0: Read the reference files

Before generating anything, read these files to understand the exact schema and quality bar:

1. `static/data/platforms/G30-G31.json` — the original hand-crafted reference
2. `static/data/platforms/VW-MK7.json` — a corrected batch-1 example
3. `static/data/platforms/Dacia-SANDERO-3.json` — another corrected example (Renault Group)
4. `scripts/build_platform_milestones.py` — the milestone builder script
5. `scripts/build_platform_index.py` — the index builder script

Study these files carefully. Your output must match the same level of completeness.

### Step 1: Research BEFORE writing

For each platform, perform **at least 4 separate web searches**:

1. **Service schedule:** "[Make] [Model] [Year] official maintenance schedule km Europe"
2. **Component intervals:** "[Make] [Model] owner's manual service intervals oil filter brake fluid spark plugs air filter"
3. **Engine-specific:** "[Make] [Model] [Engine code] service schedule diesel/petrol"
4. **Model variants:** "[Make] [Platform/generation] models variants body styles years produced"

Search #4 is critical — it tells you which specific models, body styles, and market names belong to this platform. For example, the VW MQB Golf Mk7 platform also covers Golf Variant, Golf Alltrack, Golf GTE, and Golf R. The Opel Corsa F is sold as Vauxhall Corsa in the UK.

Good sources:
- garage.wiki (structured interval tables per model year — excellent)
- stefanosgarage.com (detailed VW Group schedules)
- Official manufacturer user-manual sites (user-manual.renault.com, etc.)
- auto-abc.eu (service interval databases)
- Haynes / official dealer documentation
- Wikipedia (for model variants, production years, and market names — verify elsewhere)

### Step 2: Mandatory minimum tasks

**Every platform MUST include ALL of the following as `mfr` tasks** (with the correct manufacturer-specified km interval). If you genuinely cannot find a verified interval after thorough searching, use the most common European interval for that vehicle class — but you must note "interval estimated" in the serviceNotes.

| Task | Typical range | Notes |
|---|---|---|
| `engine oil` | 10,000–30,000 km | Every manufacturer specifies this |
| `cabin filter` | 15,000–60,000 km | Every manufacturer specifies this |
| `air filter` | 30,000–90,000 km | Every manufacturer specifies this |
| `brake fluid` | 30,000–120,000 km | Every manufacturer specifies this (often time-based: every 2–4 years) |
| `check brake pads` | 15,000–30,000 km | Every manufacturer includes brake inspection |
| `spark plugs` | 30,000–90,000 km | All petrol engines require this |

**Additional tasks to include when applicable:**

| Task | When applicable |
|---|---|
| `fuel filter` | Diesel engines (always MFR); some petrol engines too |
| `timing belt` | Belt-driven engines (MFR — failure is catastrophic) |
| `auxiliary belt` | If manufacturer specifies replacement interval |
| `coolant flush` | If manufacturer specifies (otherwise add as REC ~120,000 km) |
| `gearbox fluid` | DSG/DCT/CVT — often REC since manufacturers say "lifetime" |
| `intake carbon clean` | Direct-injection engines — REC |

### Step 3: JSON schema

```json
{
  "id": "<PLATFORM-ID>",
  "name": "<Full platform name>",
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
    { "task": "<task name>", "km": <interval>, "kind": "mfr" },
    { "task": "<task name>", "km": <interval>, "kind": "rec" }
  ],
  "serviceNotes": {
    "<task name>": "<Why this matters + platform-specific context + source>"
  },
  "milestones": []
}
```

#### `vehicles` array rules

This array is how the app matches a user's car to a platform. Get it right.

- **`make`**: The brand name as the user would type it. Use title case: `"Volkswagen"` not `"VW"`, `"BMW"` not `"Bmw"`.
- **`models`**: Every model name sold on this platform. Include body style variants if they have different names (e.g., `["Golf", "Golf Variant", "Golf Alltrack", "Golf GTE", "Golf R"]`). Do NOT include chassis codes or generation numbers — users don't know those.
- **`yearFrom`**: First model year this platform was produced (integer).
- **`yearTo`**: Last model year, or the current year (2026) if still in production (integer).
- **Multi-brand platforms**: If the same platform is sold under different brands, add a separate entry per brand. Examples:
  - Opel Corsa F / Vauxhall Corsa → two entries, one with `"make": "Opel"`, one with `"make": "Vauxhall"`
  - Škoda Octavia shares VW MQB but has its own service schedule → separate platform file, NOT combined with VW Golf

**Example — Fiat 500:**
```json
"vehicles": [
  {
    "make": "Fiat",
    "models": ["500", "500C", "500 Hybrid"],
    "yearFrom": 2015,
    "yearTo": 2026
  },
  {
    "make": "Abarth",
    "models": ["595", "695"],
    "yearFrom": 2015,
    "yearTo": 2023
  }
]
```

**Example — VW Golf Mk7:**
```json
"vehicles": [
  {
    "make": "Volkswagen",
    "models": ["Golf", "Golf Variant", "Golf Alltrack", "Golf GTE", "Golf GTI", "Golf R"],
    "yearFrom": 2012,
    "yearTo": 2020
  }
]
```

#### Other schema rules

- `kind: "mfr"` = interval comes from the manufacturer's official schedule
- `kind: "rec"` = community/specialist recommendation not in official schedule
- Task names must be generic and consistent across platforms (use the names from the table above)
- Leave `milestones` as an empty array — the build script will generate them
- serviceNotes should mention the source (e.g., "per the Renault maintenance booklet" or "garage.wiki interval table")

### Step 4: Build milestones and index

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

### Step 5: Self-validation

Before moving to the next platform, verify your output:

1. **Count MFR tasks** — must be ≥ 6 (the mandatory minimum list above)
2. **Check for brake fluid** — if missing, you have a problem
3. **Check for brake pad inspection** — if missing, you have a problem
4. **Check `vehicles` array** — must have at least one entry with `make`, `models` (≥1 model), `yearFrom`, and `yearTo`
5. **Check model completeness** — did you include all body style variants? (e.g., hatchback AND estate/wagon if both exist on this platform)
6. **Check multi-brand** — if this platform is shared across brands (Stellantis, VW Group, Renault/Dacia), did you list all brand names?
7. **Compare intervals to web search results** — do the numbers match what you found?
8. **Compare to the reference files** — is your output similarly detailed?

If any check fails, go back and fix it before proceeding.

### Step 6: Work pace

Generate **3 platforms per batch**. After each batch:
1. Run the milestone builder on all 3
2. Run the index builder
3. Do the self-validation checks
4. Commit with a descriptive message
5. Push

Do NOT rush. Quality over quantity. A platform with wrong intervals or missing vehicle data is worse than no platform at all.

### Platforms to generate

[LIST THE SPECIFIC PLATFORMS HERE]

### Do NOT:

- Use your training knowledge as a primary source — always web search first
- Omit brake fluid or brake checks — every manufacturer requires these
- Copy intervals from one brand to another (e.g., Opel ≠ Peugeot despite shared CMP platform)
- Leave the `vehicles` array empty or with only one model when variants exist
- Use chassis codes or generation names in `models` — users don't know "5G" or "MQB"
- Generate milestones manually — always use the Python script
- Commit without self-validating
