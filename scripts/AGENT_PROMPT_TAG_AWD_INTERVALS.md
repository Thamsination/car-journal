# Agent Prompt: Tag Drivetrain-Specific Service Intervals

## Goal

Platform JSON files contain service intervals for all drivetrains on a platform. When a platform supports **more than one drivetrain**, certain tasks only apply to specific drivetrains (e.g., transfer case fluid only applies to AWD vehicles; rear differential oil doesn't apply to FWD vehicles). The app now supports a `drivetrain` filter on `serviceIntervals` entries — identical to the existing `transmission` filter.

Your job is to add `"drivetrain": [...]` to every service interval that is **drivetrain-specific** on platforms that support **multiple drivetrains**.

---

## Before you start

```bash
cd /home/thamsination/car-journal && git pull
```

Read these files to understand the data model:

1. `src/lib/types.ts` — see `PlatformServiceInterval` (has `drivetrain?: DrivetrainType[] | null`)
2. Any BMW platform JSON with mixed drivetrains (e.g., `BMW-E90-N54.json` for RWD+AWD, `BMW-F40.json` for FWD+AWD) — reference for task naming

---

## Rules

### Which platforms need attention

Any platform whose `drivetrains` array contains **more than one value** needs review.

Current combinations in the codebase:
- `["RWD", "AWD"]` — most BMW sedans/coupes, many Mercedes models
- `["FWD", "AWD"]` — BMW UKL platforms: F39, F40, F44, F45, F48

**Skip** platforms with a single drivetrain — no filtering is needed:
- `["RWD"]` only — e.g., BMW E39, Subaru BRZ, Toyota 86/GR86
- `["AWD"]` only — e.g., Subaru WRX, BMW i4 M50, certain Mercedes AMG/performance models
- `["FWD"]` only — if any exist

If a single-drivetrain platform has tasks that seem misplaced (e.g., "xDrive transfer case fluid" on a RWD-only platform), flag it as an anomaly in the commit message but do NOT add a drivetrain filter — the task itself shouldn't be there.

### Drivetrain-specific tasks by platform type

The key insight: **what counts as drivetrain-specific depends on which drivetrains the platform supports.**

#### On `["RWD", "AWD"]` platforms

| Task pattern | Tag with | Reasoning |
|---|---|---|
| `xDrive transfer case fluid` | `["AWD"]` | Transfer case only exists in AWD drivetrain |
| `transfer case oil` / `transfer case fluid` | `["AWD"]` | Transfer case only exists in AWD drivetrain |
| `front axle differential oil` / `front differential oil` | `["AWD"]` | RWD cars have no powered front axle |
| `4MATIC transfer case` | `["AWD"]` | Mercedes 4MATIC transfer case — RWD models don't have one |
| `differential fluids` | **No tag** | RWD cars have a rear differential — this task applies to all |
| `rear axle differential oil` / `rear differential oil` | **No tag** | Both RWD and AWD have rear differentials |

#### On `["FWD", "AWD"]` platforms

| Task pattern | Tag with | Reasoning |
|---|---|---|
| `xDrive transfer case fluid` | `["AWD"]` | Transfer case only exists in AWD drivetrain |
| `transfer case oil` / `transfer case fluid` | `["AWD"]` | Transfer case only exists in AWD drivetrain |
| `front axle differential oil` / `front differential oil` | `["AWD"]` | FWD diff is inside the transaxle — this task refers to a separate AWD front diff unit |
| `differential fluids` | `["AWD"]` | FWD cars have no separate differential — their diff is inside the transaxle (serviced via transmission fluid). This task is AWD-specific on FWD+AWD platforms |
| `rear axle differential oil` / `rear differential oil` | `["AWD"]` | FWD cars have no rear axle. Any rear differential task is AWD-specific |

#### Universal (never tag, on any platform)

| Task pattern | Reasoning |
|---|---|
| `automatic transmission fluid` / `manual transmission oil` | Transmission, not drivetrain. Use `transmission` filter instead |
| `engine oil`, `brake fluid`, `coolant`, etc. | Applies to all drivetrains |

### How to verify the correct tag

Read the platform's `serviceNotes` — they often explicitly state which drivetrain a task applies to (e.g., "xDrive models only", "4MATIC only", "Does not apply to rear-wheel drive models"). Use this as confirmation. If a note says a task is drivetrain-specific but the task name doesn't match the patterns above, use your judgment and tag it.

### How to tag

Add `"drivetrain": [...]` to the service interval object, placed after `kind` (or after `transmission` if present):

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

List all platform files with more than one drivetrain:

```bash
cd /home/thamsination/car-journal

# RWD + AWD platforms
grep -rl '"RWD"' static/data/platforms/ --include='*.json' | xargs grep -l '"AWD"'

# FWD + AWD platforms
grep -rl '"FWD"' static/data/platforms/ --include='*.json' | xargs grep -l '"AWD"'
```

### Step 2: Process each file

For each target file:

1. Read the file
2. Note the platform's drivetrain combination (`["RWD", "AWD"]` vs `["FWD", "AWD"]`)
3. Check `serviceIntervals` for drivetrain-specific tasks using the correct table above
4. Read `serviceNotes` for any additional drivetrain notes on tasks not in the tables
5. Add the appropriate `"drivetrain": [...]` to each drivetrain-specific task
6. Write the file back

### Step 3: Verify

After processing all files, run:

```bash
npm run build
```

The build must succeed with no errors.

### Step 4: Spot-check

Read 3 modified RWD+AWD files and 2 modified FWD+AWD files. Confirm:
- AWD-specific tasks have `"drivetrain": ["AWD"]`
- On RWD+AWD platforms: `"differential fluids"` and `"rear axle differential oil"` do NOT have a drivetrain tag
- On FWD+AWD platforms: `"differential fluids"` and `"rear axle differential oil"` DO have `"drivetrain": ["AWD"]`
- No other fields were changed

---

## Batch processing

Process files in batches by platform generation. Commit after each batch:

| Batch | Files | Drivetrain combo | Description |
|---|---|---|---|
| 1 | `BMW-E39-*`, `BMW-E46-*`, `BMW-E60-*`, `BMW-E90-*` | RWD+AWD | Older BMW sedans/coupes |
| 2 | `BMW-F10-*`, `BMW-F30-*`, `BMW-F32-*` | RWD+AWD | F-generation BMW sedans/coupes |
| 3 | `BMW-G14-*`, `BMW-G20-*`, `BMW-G22-*`, `BMW-G30-*`, `BMW-G80-*`, `BMW-G82-*` | RWD+AWD | G-generation BMW sedans/coupes |
| 4 | `BMW-F39.json`, `BMW-F40.json`, `BMW-F44.json`, `BMW-F45.json`, `BMW-F48.json` | FWD+AWD | BMW UKL platforms (1/2 Series, X1, X2) |
| 5 | All remaining `BMW-*` with mixed drivetrains (SUVs, 6/7 GT, etc.) | RWD+AWD | Other BMW platforms |
| 6 | `Mercedes-E-W210-*`, `Mercedes-E-W211-*`, `Mercedes-E-W212-*` | RWD+AWD | Older Mercedes |
| 7 | `Mercedes-E-W213-*`, `Mercedes-E-W214-*`, `Mercedes-EQ-*` | RWD+AWD | Newer Mercedes |

**Important**: Batch 4 (FWD+AWD) uses different tagging rules than the other batches. Pay close attention to the table for FWD+AWD platforms — `"differential fluids"` and `"rear differential oil"` ARE tagged on these platforms but NOT on RWD+AWD platforms.

### Commit message format

```
Tag drivetrain-specific intervals — batch N (platform range, drivetrain combo)
```

Example: `Tag drivetrain-specific intervals — batch 4 (F39/F40/F44/F45/F48, FWD+AWD)`

---

## Edge cases

1. **"differential fluids" (generic) on RWD+AWD platforms**: This task covers the rear differential, which exists on ALL RWD and AWD drivetrains. Do NOT tag it. The `serviceNotes` may say "xDrive only" for the front portion, but the task applies to all vehicles because RWD cars still have a rear diff.

2. **"differential fluids" on FWD+AWD platforms**: FWD cars do NOT have a separate differential — their diff is inside the transaxle and serviced via transmission fluid. On FWD+AWD platforms, "differential fluids" is AWD-specific. Tag it with `["AWD"]`.

3. **Platforms with only one drivetrain's models listed in `vehicles`**: If a platform's `drivetrains` says `["RWD", "AWD"]` but every model in `vehicles` has "xDrive" or "4MATIC" in the name, the drivetrain array is still mixed. Tag the drivetrain-specific intervals. The user may add a different variant later.

4. **Electric vehicles (EQE, i4, etc.)**: EVs may have dual-motor AWD. If the platform has mixed drivetrains and has transfer case or differential tasks, apply the same rules.

5. **"rear axle differential oil" on Mercedes 4MATIC platforms (RWD+AWD)**: Even though the note says "AWD preventive", RWD Mercedes models also have a rear differential. Do NOT tag `rear axle differential oil` on RWD+AWD platforms — it applies to all drivetrains.

6. **"rear axle differential oil" on FWD+AWD platforms**: FWD cars have no rear axle. If this task appears on a FWD+AWD platform, tag it `["AWD"]`.

---

## Summary checklist

- [ ] Processed ALL mixed-drivetrain platforms (both RWD+AWD and FWD+AWD)
- [ ] On RWD+AWD: tagged transfer case and front differential tasks with `["AWD"]`
- [ ] On RWD+AWD: did NOT tag `differential fluids` or `rear axle/rear differential oil`
- [ ] On FWD+AWD: tagged transfer case, front differential, rear differential, AND `differential fluids` with `["AWD"]`
- [ ] Did not tag universal tasks (transmission fluid, engine oil, brake fluid, etc.)
- [ ] No other fields changed
- [ ] `npm run build` passes
- [ ] Committed in batches with descriptive messages
