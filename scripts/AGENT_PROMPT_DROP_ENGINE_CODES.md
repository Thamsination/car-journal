# Agent Prompt: Drop Engine Codes from Platform Files

## Task

Update every platform JSON file in `static/data/platforms/` to replace manufacturer engine codes with human-verifiable mechanical specifications. Also remove the static `milestones` array (it is computed at runtime and never read).

The file `G30-G31-N63.json` has already been updated and serves as the reference format.

## Changes per file

### 1. Replace `engines` with `displacement`, `cylinders`, `fuelType`

Remove the `"engines"` field (e.g. `"engines": ["B47"]`).

Add three new top-level fields:

```json
"displacement": "2.0L",
"cylinders": 4,
"fuelType": "diesel"
```

Valid `fuelType` values: `"petrol"`, `"diesel"`, `"electric"`, `"hybrid"`

### 2. Remove `engines` from `vehicles` entries

If any entry in the `"vehicles"` array has an `"engines"` field, remove it. Keep `chassisCodes` if present.

### 3. Remove the `milestones` array

Delete the entire `"milestones": [...]` field from the file. The app computes milestones at runtime from `serviceIntervals`.

### 4. Update `name` field

Replace engine codes in the `"name"` field with the displacement and cylinder description.

Examples:
- `"BMW G30/G31 5 Series (B47 2.0d)"` → `"BMW G30/G31 5 Series (2.0L 4-cyl diesel)"`
- `"BMW G30/G31 5 Series (B58 3.0i)"` → `"BMW G30/G31 5 Series (3.0L 6-cyl petrol)"`
- `"Subaru Impreza WRX / WRX / WRX STI (EJ turbo petrol: EJ205, EJ207, EJ255, EJ257)"` → `"Subaru Impreza WRX / WRX / WRX STI (2.0–2.5L 4-cyl turbo petrol)"`

For EV platforms: `"displacement": null`, `"cylinders": 0`, `"fuelType": "electric"`

For PHEV platforms: use the ICE displacement/cylinders and `"fuelType": "hybrid"`

## Research rules

For each platform file, you MUST verify the displacement and cylinder count against the models listed in the `vehicles` array:

1. Look up the models' specifications for the year range
2. Confirm displacement (in liters, one decimal place, e.g. "2.0L", "4.4L")
3. Confirm cylinder count (integer)
4. Confirm fuel type

**Cross-check**: If the file contains models with DIFFERENT displacements or cylinder counts (e.g. a 540i 3.0L I6 mixed with an M550i 4.4L V8), this is a DATA ERROR. Do NOT add displacement/cylinders — instead, flag the file for manual review.

## Self-validation checklist

Before saving each file, verify:

- [ ] `engines` field is removed from the top level
- [ ] `engines` field is removed from every `vehicles` entry
- [ ] `milestones` array is removed
- [ ] `displacement`, `cylinders`, `fuelType` are present at top level
- [ ] `displacement` value matches the known specs for all listed models
- [ ] `cylinders` value matches the known specs for all listed models
- [ ] `name` field no longer contains engine codes
- [ ] `serviceIntervals` and `serviceNotes` are preserved unchanged
- [ ] `chassisCodes`, `drivetrains`, `transmissions`, `vehicles` are preserved

## After all files are updated

Regenerate `static/data/platforms/index.json` by running:

```bash
node scripts/generate-platform-index.js
```

If the script does not exist, manually update `index.json` to match the current `vehicles` arrays across all platform files.

## Reference file

See `static/data/platforms/G30-G31-N63.json` for the completed format.

## Do NOT

- Change `serviceIntervals` (task names, km, months, kind)
- Change `serviceNotes`
- Change `chassisCodes`, `drivetrains`, `transmissions`
- Add fields not listed above
- Guess displacement/cylinders — if you cannot verify, flag for review
