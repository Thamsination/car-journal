# Agent Prompt: Add Source Citations to Existing Platform Files

## Goal

129 platform files already have the correct structure (one engine per file, `displacement`/`cylinders`/`fuelType` set, proper `serviceIntervals`). They are missing `serviceSources` — the field that records where each MFR interval came from.

Your job is to:
1. Research the intervals in each file against primary sources
2. Add a `serviceSources` dict citing where each interval was verified
3. Flag any interval that doesn't match your research

You are NOT restructuring files, splitting catch-alls, or changing the schema. You are auditing and annotating existing data.

---

## Before you start

```bash
cd /home/thamsination/car-journal && git pull
```

Read these files to understand the target format:

1. `static/data/platforms/G30-G31-B47.json` — reference file WITH `serviceSources` already added
2. `static/data/platforms/G30-G31-N63.json` — another sourced reference (petrol V8)
3. `scripts/AGENT_PROMPT_GENERATE_PLATFORMS.md` — the full generation rules (source tier system, MFR/REC definitions)

---

## MFR vs REC definitions

- **MFR** = the manufacturer's published maximum service interval from the owner's manual, official service schedule, or dynamic service system ceiling. For CBS/ASSYST/Flexible Service systems, use the **maximum interval the system can display**, not the typical calculated result.
- **REC** = the specialist-consensus interval, typically shorter than MFR, based on documented engineering reasons.

---

## Source tier system

| Tier | Description | Acceptable for |
|------|-------------|----------------|
| **1** | Owner's manual PDF, manufacturer service portal (bmwtechinfo, ELSA, Renault Clip, Toyota TIS), official service bulletins (SIB/TSB) | MFR (preferred) |
| **2** | Structured interval databases with editorial oversight: garage.wiki, auto-abc.eu | MFR (acceptable) |
| **3** | Specialist documentation (Haynes, Bentley), well-established marque forums with documented consensus (Bimmerpost, TDIClub, NASIOC) | REC only |
| **Reject** | Generic blog posts, YouTube, AI-generated guides, undated articles without OEM references | Never use |

**Rule: MFR intervals require a Tier 1 or Tier 2 source.** If you can only find Tier 3 for an MFR interval, flag it as needing verification but still add the source with a note.

---

## Workflow per file

### Step 1: Read the existing file

Read the platform JSON. Note:
- The `id`, `name`, `displacement`, `cylinders`, `fuelType`
- Every MFR task and its current `km`/`months` values
- Every REC task and its current values

### Step 2: Research

For each file, perform **at least 3 web searches**:

1. **"[Make] [Model] [Year] [Engine] official maintenance schedule km Europe"**
2. **"[Make] [Model] [Engine] owner's manual service intervals oil filter brake fluid spark plugs"**
3. **"[Make] [Model] [Engine code] service schedule diesel/petrol timing chain belt"**

Focus on finding **structured interval tables** (garage.wiki, auto-abc.eu) and **official documentation** (owner's manual PDFs, SIB/TSB documents).

### Step 3: Source table (mandatory)

Output a markdown source table comparing the file's current values against what you found:

```markdown
#### Source table: [Platform ID]

| Task | Kind | Current km | Current months | Verified km | Verified months | Source | Tier | Match? |
|------|------|------------|----------------|-------------|-----------------|--------|------|--------|
| engine oil | mfr | 30000 | null | 30000 | 24 | BMW SIB B000214 | 1 | km yes, months MISSING |
| micro filter | mfr | 30000 | null | 30000 | null | garage.wiki/BMW/... | 2 | yes |
| spark plugs | mfr | 60000 | null | 100000 | null | garage.wiki/BMW/... | 2 | NO — file says 60k, source says 100k |
```

The **Match?** column is critical. It tells us immediately if any interval in the file is wrong.

### Step 4: Add `serviceSources` to the file

Add the `serviceSources` dict after `serviceNotes`, using the sources from your table:

```json
"serviceSources": {
  "engine oil": "BMW SIB B000214 Attachment 2 (CBS intervals); confirmed 30,000 km CBS ceiling",
  "micro filter": "https://garage.wiki/BMW/G30/520d#service-schedule",
  "brake fluid": "BMW owner's manual G30 — 2-year interval (industry standard, DOT 4)"
}
```

Rules:
- Every MFR task must have an entry
- REC tasks should have entries where possible
- Use URLs when available, document references when not
- If a source is Tier 3 for an MFR task, prefix with `"NEEDS VERIFICATION: "`

### Step 5: Handle mismatches

If the source table shows a mismatch (the file's interval differs from what the source says):

**Option A — The source is clearly more authoritative:** Fix the interval in the file and note the change:
```
"engine oil source note: Changed from 60,000 km to 30,000 km per BMW SIB B000214"
```

**Option B — The discrepancy is ambiguous** (different markets, CBS vs fixed, etc.): Keep the current interval but add a detailed note in `serviceSources`:
```
"engine oil": "BMW SIB B000214 says 10,000 miles (US market). Current value 30,000 km reflects European CBS ceiling. Verify with EU-market owner's manual."
```

**Option C — You cannot find any source:** Add:
```
"engine oil": "NEEDS VERIFICATION: No Tier 1/2 source found. Current value inherited from [related platform or original catch-all]."
```

### Step 6: Validate

After each batch, run:

```bash
node scripts/validate-platform-sources.js
```

Check that the files you just annotated show GREEN (not RED) in the report.

---

## Work pace

**12–15 files per batch**, grouped by brand/generation. After each batch:

1. Run `node scripts/validate-platform-sources.js`
2. Fix any RED issues
3. Verify the app still builds: `npm run build`
4. Commit with a message like: `Add serviceSources to BMW E46 platform files (10 files)`
5. Push

---

## Batch groupings

Organize by brand and chassis family so web searches are efficient (same OEM documentation covers multiple engines on the same chassis):

**Important:** Only annotate files that already have `displacement`/`cylinders`/`fuelType` set. Skip catch-all files (those without `displacement`) — they need splitting first via `AGENT_PROMPT_SPLIT_CATCHALL_PLATFORMS.md`.

### BMW batches (sorted by generation)

**Batch 1: E46 (10 files)**
BMW-E46-M43-19, BMW-E46-M47, BMW-E46-M54-22, BMW-E46-M54-25, BMW-E46-M54-28, BMW-E46-M54-30, BMW-E46-M57, BMW-E46-N42-16, BMW-E46-N46-20, BMW-E46-S54

**Batch 2: E90 (9 files)**
BMW-E90-N46-16, BMW-E90-N46-20, BMW-E90-N47, BMW-E90-N52-25, BMW-E90-N52-30, BMW-E90-N54, BMW-E90-N55, BMW-E90-N57, BMW-E90-S65

**Batch 3: E39 (12 files)**
BMW-E39-25L-I6, BMW-E39-28L-I6, BMW-E39-30L-I6, BMW-E39-35L-V8, BMW-E39-44L-V8, BMW-E39-M47, BMW-E39-M51, BMW-E39-M52B20, BMW-E39-M54B22, BMW-E39-M57-25, BMW-E39-M57-30, BMW-E39-S62

**Batch 4: E60 (9 files)**
BMW-E60-25L-I6, BMW-E60-30L-I6, BMW-E60-M47, BMW-E60-M57-25, BMW-E60-M57-30, BMW-E60-N46-20, BMW-E60-N54, BMW-E60-N62-48, BMW-E60-S85

**Batch 5: F30 (11 files)**
BMW-F30-330e, BMW-F30-B38, BMW-F30-B47, BMW-F30-B48, BMW-F30-B58, BMW-F30-N13, BMW-F30-N20, BMW-F30-N47, BMW-F30-N55, BMW-F30-N57, BMW-F30-S55

**Batch 6: F10 (9 files)**
BMW-F10-30L-I6, BMW-F10-ActiveHybrid5, BMW-F10-B47, BMW-F10-N20, BMW-F10-N47, BMW-F10-N55, BMW-F10-N57, BMW-F10-N63, BMW-F10-S63

**Batch 7: F32 + G22 (12 files)**
BMW-F32-B47, BMW-F32-B48, BMW-F32-B58, BMW-F32-N20, BMW-F32-N47, BMW-F32-N55, BMW-F32-N57, BMW-F32-S55, BMW-G22-B47, BMW-G22-B48, BMW-G22-B57, BMW-G22-B58

**Batch 8: G20/G80 + G30/G31 + G14 (12 files)**
BMW-G20-B47, BMW-G20-B48, BMW-G20-B57, BMW-G20-B58, BMW-G20-330e, BMW-G80-S58, G30-G31-B48, G30-G31-B58, BMW-G14-B57, BMW-G14-B58, BMW-G14-N63, BMW-G14-S63

**Batch 9: Mercedes W210 + W211 (15 files)**
Mercedes-E-W210-Diesel-OM611, Mercedes-E-W210-Diesel-OM612, Mercedes-E-W210-Diesel-OM613, Mercedes-E-W210-Petrol-M111, Mercedes-E-W210-Petrol-M112-24, Mercedes-E-W210-Petrol-M112-28, Mercedes-E-W210-Petrol-M112-32, Mercedes-E-W210-Petrol-M113-43, Mercedes-E-W210-Petrol-M113-55K, Mercedes-E-W211-Diesel-OM628, Mercedes-E-W211-Diesel-OM642, Mercedes-E-W211-Diesel-OM646, Mercedes-E-W211-Diesel-OM647, Mercedes-E-W211-Diesel-OM648, Mercedes-E-W211-Petrol-M112-26

**Batch 10: Mercedes W211 petrol + W212 (15 files)**
Mercedes-E-W211-Petrol-M113, Mercedes-E-W211-Petrol-M156, Mercedes-E-W211-Petrol-M271, Mercedes-E-W211-Petrol-M272-25, Mercedes-E-W211-Petrol-M272-30, Mercedes-E-W211-Petrol-M272-35, Mercedes-E-W211-Petrol-M273, Mercedes-E-W212-Diesel-OM642, Mercedes-E-W212-Diesel-OM651, Mercedes-E-W212-Petrol-M156, Mercedes-E-W212-Petrol-M157, Mercedes-E-W212-Petrol-M271, Mercedes-E-W212-Petrol-M272-E300, Mercedes-E-W212-Petrol-M272-M276-E350, Mercedes-E-W212-Petrol-M273

**Batch 11: Mercedes W212 remainder + W213 + W214 + EQE (15 files)**
Mercedes-E-W212-Petrol-M276-E400, Mercedes-E-W213-Diesel-OM654, Mercedes-E-W213-Diesel-OM656, Mercedes-E-W213-Petrol-M177, Mercedes-E-W213-Petrol-M256, Mercedes-E-W213-Petrol-M264, Mercedes-E-W213-Petrol-M276, Mercedes-E-W213-PHEV-2.0, Mercedes-E-W214-Diesel-OM654, Mercedes-E-W214-Diesel-OM656, Mercedes-E-W214-Petrol-M254, Mercedes-E-W214-Petrol-M256, Mercedes-E-W214-PHEV-2.0, Mercedes-E-W214-PHEV-3.0, Mercedes-EQ-EQE

**Batch 12: Subaru (3 files)**
Subaru-WRX-EJ-turbo, Subaru-WRX-FA20DIT, Subaru-WRX-FA24DIT

Adjust groupings based on what actually exists — run `ls static/data/platforms/BMW-E46-*.json` etc. to confirm file names before starting each batch.

---

## Do NOT

- Change the file structure (id, name, vehicles, schema) — only add `serviceSources` and fix incorrect intervals
- Remove any existing `serviceNotes` — only add to them if needed
- Delete or rename files
- Add `serviceSources` without actually researching — every source must come from a real web search, not training knowledge
- Use vague sources like "commonly known", "standard practice", or "various online sources"
- Skip the source table step — it is mandatory for every batch
- Change intervals without documenting the change and the source that motivated it
- Rush — accuracy over speed. A wrong source citation is worse than no citation.

---

## Files to annotate

[LIST SPECIFIC FILES FOR THIS BATCH — e.g., "Batch 1: BMW E46 files" or list the exact filenames]
