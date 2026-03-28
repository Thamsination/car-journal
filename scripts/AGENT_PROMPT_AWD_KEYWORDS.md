# Agent Prompt: Research AWD Model Name Keywords

Use this prompt to research how car manufacturers indicate AWD/4WD in their model names for the European market. The output will be used to auto-detect drivetrain from the selected model name when adding a vehicle.

---

## Prompt

You are researching how car manufacturers indicate AWD/4WD in their model names for the European market. The goal is to build a comprehensive lookup table that maps model name keywords to AWD status.

For each major European-market car brand listed below, answer these questions:

1. **What keyword(s) in the model name indicate AWD/4WD?** (e.g., BMW uses "xDrive", Audi uses "quattro")
2. **Where does the keyword appear in the model name?** (suffix, prefix, separate word?)
3. **Are there any models that are ALWAYS AWD regardless of model name?** (e.g., all Subaru WRX are AWD, all Land Rovers are AWD)
4. **Provide 2-3 real example model names** showing the pattern (e.g., "BMW 320d xDrive", "Audi A4 2.0 TFSI quattro")

Use web searches to verify — do not rely on training data alone. Search for "[Brand] AWD model naming convention Europe" or "[Brand] four wheel drive model designation" for each brand.

### Brands to research

**German:**
- BMW
- Audi
- Mercedes-Benz
- Volkswagen
- Porsche
- MINI
- Opel/Vauxhall

**Swedish:**
- Volvo
- Saab (historical, ended 2012)
- Polestar

**French:**
- Peugeot
- Citroën
- Renault
- Alpine
- DS Automobiles

**Italian:**
- Alfa Romeo
- Maserati
- Fiat

**Japanese (sold in Europe):**
- Toyota
- Lexus
- Mazda
- Honda
- Nissan
- Subaru
- Mitsubishi
- Suzuki

**Korean (sold in Europe):**
- Hyundai
- Kia
- Genesis

**British:**
- Jaguar
- Land Rover / Range Rover
- Bentley
- Rolls-Royce

**Czech:**
- Škoda

**Spanish:**
- SEAT
- Cupra

**American (sold in Europe):**
- Ford
- Tesla
- Jeep

**Chinese (entering European market):**
- BYD
- MG
- NIO

### Output format

Return a JSON array with one entry per brand:

```json
[
  {
    "brand": "BMW",
    "awdKeywords": ["xDrive"],
    "historicalKeywords": ["xi", "xd"],
    "keywordPosition": "suffix after model number",
    "caseSensitive": true,
    "alwaysAwd": false,
    "alwaysAwdModels": [],
    "examples": ["320d xDrive", "520i xDrive Touring", "X3 xDrive30d"],
    "notes": "xDrive branding used since 2003. Older E46 models used 'xi' suffix (325xi). The 'xi' and 'xd' suffixes are case-sensitive lowercase."
  },
  {
    "brand": "Subaru",
    "awdKeywords": [],
    "historicalKeywords": [],
    "keywordPosition": "n/a",
    "caseSensitive": false,
    "alwaysAwd": true,
    "alwaysAwdModels": [],
    "examples": ["WRX STI", "Impreza WRX", "Forester"],
    "notes": "All Subaru models sold in Europe use Symmetrical AWD. No keyword in the model name — AWD is implicit. Exception: some early Impreza/Legacy base models in Japan were FWD, but European-market Subarus are AWD."
  },
  {
    "brand": "Peugeot",
    "awdKeywords": ["HYBRID4"],
    "historicalKeywords": ["4x4"],
    "keywordPosition": "suffix",
    "caseSensitive": false,
    "alwaysAwd": false,
    "alwaysAwdModels": [],
    "examples": ["3008 HYBRID4", "508 HYBRID4"],
    "notes": "Most Peugeots are FWD only. HYBRID4 models have an electric rear axle providing AWD. Historically some models had '4x4' designation. Standard models have no AWD indicator — if no keyword is present, assume FWD."
  }
]
```

### Field definitions

- **`brand`**: The manufacturer name as used in the European market.
- **`awdKeywords`**: Keywords currently used in model names to indicate AWD. These will be matched against the model name string. Empty array if the brand is always AWD or never uses keywords.
- **`historicalKeywords`**: Keywords used in older models (pre-2010, pre-2000) that are no longer active but still relevant since the app covers cars from 1994 onward.
- **`keywordPosition`**: Where the keyword typically appears: `"suffix"`, `"prefix"`, `"embedded"` (part of the model number, e.g., Porsche "Carrera 4"), or `"n/a"`.
- **`caseSensitive`**: Whether the keyword matching should be case-sensitive. BMW "xDrive" starts with lowercase 'x'; Audi "quattro" is always lowercase in official use.
- **`alwaysAwd`**: `true` if the entire brand is always AWD in the European market (Subaru, Land Rover, Jeep for most models).
- **`alwaysAwdModels`**: Specific models within a non-always-AWD brand that are exclusively AWD (e.g., certain SUV models that only come in AWD configuration in EU markets). Only include models where there is genuinely no FWD/RWD option in Europe.
- **`examples`**: 2-3 real model names showing the AWD keyword in context, as they appear on the European market.
- **`notes`**: Any important context — when the keyword was introduced, exceptions, regional variations, or how AWD is indicated when there's no model name keyword.

### Important rules

- Only include keywords that appear in the **official model name** as marketed in Europe. Internal engineering codes or option package names don't count.
- If a brand has **no AWD indicator in the model name** (e.g., some brands sell AWD as an invisible option with no name change), note that clearly — these brands cannot have auto-detection and will fall back to a manual dropdown.
- Include **historical keywords** that are no longer used (e.g., BMW "xi" on E46, Audi "quattro" was lowercase before 2016 rebrand) — the app covers cars from 1994 onward.
- For **EV brands** where "Dual Motor" or "Long Range AWD" indicates AWD (Tesla, Polestar), include those keywords.
- For **Porsche**, note that AWD is indicated by the number "4" in model names (911 Carrera 4, 911 Targa 4S) — this is an embedded keyword, not a suffix.
- **Verify via web search** for each brand. Do not guess. If uncertain, note the uncertainty.
- The JSON must be valid and parseable. Use proper escaping for special characters.

### After completing the research

Save the output as `scripts/awd-keywords.json` in the repository at `/home/thamsination/car-journal/`.

Do NOT modify any other files. This is a research-only task.
