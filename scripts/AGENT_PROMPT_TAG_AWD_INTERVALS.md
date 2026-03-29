# Agent Prompt: Tag AWD-Specific Service Intervals with Drivetrain Filter

## Goal

Platform JSON files contain service intervals for all drivetrains on a platform. When a platform supports **both RWD and AWD**, certain tasks (transfer case, front differential, etc.) only apply to AWD vehicles. The app now supports a `drivetrain` filter on `serviceIntervals` entries — identical to the existing `transmission` filter.

Your job is to add `"drivetrain": ["AWD"]` to every service interval that is **AWD-specific** on platforms that support **both RWD and AWD**.

---

## Before you start

```bash
cd /home/thamsination/car-journal && git pull
```

Read these files to understand the data model:

1. `src/lib/types.ts` — see `PlatformServiceInterval` (has `drivetrain?: DrivetrainType[] | null`)
2. Any BMW platform JSON with mixed drivetrains (e.g., `BMW-E90-N54.json`) — reference for task naming

---

## Rules

### Which platforms need attention

Only platforms whose `drivetrains` array contains **both** `"RWD"` and `"AWD"` need modification.

- **Skip** platforms with `"drivetrains": ["AWD"]` — every vehicle on these platforms is AWD, so no filter is needed.
- **Skip** platforms with `"drivetrains": ["RWD"]` — these should not have AWD-specific tasks at all. If they do, flag it as an anomaly but do NOT add a drivetrain filter.
- **Skip** Subaru platforms — all Subaru models are AWD. Their differential tasks apply to every vehicle.
- **Skip** platforms with `"drivetrains": ["FWD", "AWD"]` or any combination NOT containing `"RWD"` alongside `"AWD"` — these follow the same logic (only mixed RWD+AWD platforms need filtering).

### Which tasks are AWD-specific

These task names (case-insensitive match) indicate an AWD-only service:

| Task pattern | Why AWD-only |
|---|---|
| `xDrive transfer case fluid` | BMW xDrive transfer case — RWD models don't have one |
| `transfer case oil` / `transfer case fluid` | Transfer case exists only in AWD drivetrains |
| `front axle differential oil` / `front differential oil` | RWD cars don't have a powered front axle differential |
| `4MATIC transfer case` | Mercedes 4MATIC transfer case — RWD models don't have one |

These task names are **NOT** AWD-specific and should NOT be tagged:

| Task pattern | Why NOT AWD-specific |
|---|---|
| `differential fluids` | Applies to ALL drivetrains — RWD cars have a rear differential |
| `rear axle differential oil` / `rear differential oil` | RWD and AWD both have rear differentials |
| `automatic transmission fluid` / `manual transmission oil` | Not drivetrain-related (use `transmission` filter instead) |

### How to tag

Add `"drivetrain": ["AWD"]` to the service interval object, placed after `kind` (or after `transmission` if present):

**Before:**
```json
{ "task": "xDrive transfer case fluid", "km": 80000, "months": null, "kind": "rec" }
```

**After:**
```json
{ "task": "xDrive transfer case fluid", "km": 80000, "months": null, "kind": "rec", "drivetrain": ["AWD"] }
```

**If the interval already has a `transmission` filter:**
```json
{ "task": "transfer case oil", "km": 60000, "months": null, "kind": "rec", "transmission": ["automatic"], "drivetrain": ["AWD"] }
```

### Formatting rules

- Keep the existing JSON formatting style of each file (inline objects on one line, or multi-line — match what's already there).
- Do NOT change any other fields (km, months, kind, task name, transmission).
- Do NOT add or remove service intervals — only add the `drivetrain` field to existing ones.
- Do NOT modify `serviceNotes` or `serviceSources`.

---

## Workflow

### Step 1: Identify target files

List all platform files where `drivetrains` contains both `"RWD"` and `"AWD"`:

```bash
cd /home/thamsination/car-journal
grep -rl '"drivetrains".*"RWD".*"AWD"\|"drivetrains".*"AWD".*"RWD"' static/data/platforms/ --include='*.json'
```

### Step 2: Process each file

For each target file:

1. Read the file
2. Check `serviceIntervals` for AWD-specific tasks (see table above)
3. Add `"drivetrain": ["AWD"]` to each AWD-specific task
4. Write the file back

### Step 3: Verify

After processing all files, run:

```bash
npm run build
```

The build must succeed with no errors.

### Step 4: Spot-check

Read 3 modified files and confirm:
- AWD-specific tasks have `"drivetrain": ["AWD"]`
- `"differential fluids"` and `"rear axle differential oil"` do NOT have a drivetrain tag
- No other fields were changed

---

## Batch processing

Process files in batches by platform generation. Commit after each batch:

| Batch | Files | Description |
|---|---|---|
| 1 | `BMW-E39-*`, `BMW-E46-*`, `BMW-E60-*`, `BMW-E90-*` | Older BMW platforms |
| 2 | `BMW-F10-*`, `BMW-F30-*`, `BMW-F32-*` | F-generation BMW |
| 3 | `BMW-G14-*`, `BMW-G20-*`, `BMW-G22-*`, `BMW-G30-*`, `BMW-G80-*`, `BMW-G82-*` | G-generation BMW |
| 4 | All remaining `BMW-*` (SUVs, 1/2 Series, etc.) | Other BMW platforms |
| 5 | `Mercedes-E-W210-*`, `Mercedes-E-W211-*`, `Mercedes-E-W212-*` | Older Mercedes |
| 6 | `Mercedes-E-W213-*`, `Mercedes-E-W214-*`, `Mercedes-EQ-*` | Newer Mercedes |

### Commit message format

```
Tag AWD-specific intervals with drivetrain filter — batch N (platform range)
```

Example: `Tag AWD-specific intervals with drivetrain filter — batch 1 (E39/E46/E60/E90)`

---

## Edge cases

1. **"differential fluids" (generic)**: This task covers the rear differential on ALL drivetrains. Do NOT tag it. The `serviceNotes` may say "xDrive only" for the front portion, but the task itself applies to all vehicles because RWD cars still have a rear diff.

2. **Platforms with only AWD models listed in `vehicles`**: If a platform's `drivetrains` says `["RWD", "AWD"]` but every model in `vehicles` has "xDrive" or "4MATIC" in the name, the drivetrain array is still mixed. Tag the AWD-specific intervals. The user may add a RWD variant later.

3. **Electric vehicles (EQE, i4, etc.)**: EVs may have dual-motor AWD. If the platform has mixed drivetrains and has transfer case or differential tasks, apply the same rules.

4. **"rear axle differential oil" on Mercedes 4MATIC platforms**: Even though the note says "AWD preventive", RWD Mercedes models also have a rear differential. Do NOT tag `rear axle differential oil` with AWD — it applies to all drivetrains.

---

## Summary checklist

- [ ] Only modified files with `"drivetrains": ["RWD", "AWD"]` (or `["AWD", "RWD"]`)
- [ ] Tagged: `xDrive transfer case fluid`, `transfer case oil/fluid`, `front axle differential oil`, `front differential oil`
- [ ] NOT tagged: `differential fluids`, `rear axle differential oil`, `rear differential oil`, `automatic transmission fluid`, `manual transmission oil`
- [ ] No other fields changed
- [ ] `npm run build` passes
- [ ] Committed in batches with descriptive messages
