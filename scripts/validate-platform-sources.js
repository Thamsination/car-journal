#!/usr/bin/env node
/**
 * Validate source coverage for all platform files.
 *
 * Reads every platform JSON under static/data/platforms/ and checks that
 * each MFR service interval has a corresponding entry in `serviceSources`.
 *
 * Output:
 *   RED    — MFR interval with no entry in serviceSources
 *   YELLOW — MFR interval with an inherited or Tier 3 source (no URL)
 *   GREEN  — MFR interval with a Tier 1/2 source (contains a URL or owner's manual ref)
 *
 * Exit code 0 if no RED issues, 1 if any RED issues found.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLATFORMS_DIR = join(__dirname, "../static/data/platforms");

const INHERITED_RE = /^inherited/i;
const URL_RE = /https?:\/\//i;
const MANUAL_RE = /owner's manual|service manual|SIB|TSB|TIS|ELSA|bmwtechinfo/i;

function classifySource(source) {
	if (!source || source.trim() === "") return "RED";
	if (INHERITED_RE.test(source)) return "YELLOW";
	if (URL_RE.test(source) || MANUAL_RE.test(source)) return "GREEN";
	return "YELLOW";
}

let totalFiles = 0;
let filesWithSources = 0;
let filesWithoutSources = 0;
let totalMfr = 0;
let greenCount = 0;
let yellowCount = 0;
let redCount = 0;

const redIssues = [];
const yellowIssues = [];

for (const name of readdirSync(PLATFORMS_DIR).sort()) {
	if (!name.endsWith(".json") || name === "index.json") continue;
	totalFiles++;

	const path = join(PLATFORMS_DIR, name);
	const data = JSON.parse(readFileSync(path, "utf8"));

	const intervals = data.serviceIntervals || [];
	const sources = data.serviceSources || {};
	const mfrTasks = intervals.filter((i) => i.kind === "mfr");

	if (Object.keys(sources).length > 0) {
		filesWithSources++;
	} else if (mfrTasks.length > 0) {
		filesWithoutSources++;
	}

	for (const task of mfrTasks) {
		totalMfr++;
		const source = sources[task.task];
		const status = classifySource(source);

		if (status === "RED") {
			redCount++;
			redIssues.push({ file: name, task: task.task, km: task.km, months: task.months });
		} else if (status === "YELLOW") {
			yellowCount++;
			yellowIssues.push({
				file: name,
				task: task.task,
				source: source || "(empty)",
			});
		} else {
			greenCount++;
		}
	}
}

console.log("=== Platform Source Validation Report ===\n");
console.log(`Files scanned:    ${totalFiles}`);
console.log(`With sources:     ${filesWithSources}`);
console.log(`Without sources:  ${filesWithoutSources}`);
console.log(`Total MFR tasks:  ${totalMfr}`);
console.log();
console.log(
	`  GREEN  (Tier 1/2 source): ${greenCount}  (${totalMfr ? ((greenCount / totalMfr) * 100).toFixed(1) : 0}%)`
);
console.log(
	`  YELLOW (inherited/T3):    ${yellowCount}  (${totalMfr ? ((yellowCount / totalMfr) * 100).toFixed(1) : 0}%)`
);
console.log(
	`  RED    (no source):       ${redCount}  (${totalMfr ? ((redCount / totalMfr) * 100).toFixed(1) : 0}%)`
);
console.log();

if (redIssues.length > 0) {
	console.log(`--- RED issues (${redIssues.length}) — MFR intervals missing sources ---\n`);
	const grouped = {};
	for (const issue of redIssues) {
		if (!grouped[issue.file]) grouped[issue.file] = [];
		grouped[issue.file].push(issue);
	}
	for (const [file, issues] of Object.entries(grouped)) {
		console.log(`  ${file}:`);
		for (const i of issues) {
			const interval = i.km ? `${i.km} km` : i.months ? `${i.months} months` : "no interval";
			console.log(`    - ${i.task} (${interval})`);
		}
	}
	console.log();
}

if (yellowIssues.length > 0 && process.argv.includes("--verbose")) {
	console.log(`--- YELLOW issues (${yellowIssues.length}) — inherited or Tier 3 sources ---\n`);
	const grouped = {};
	for (const issue of yellowIssues) {
		if (!grouped[issue.file]) grouped[issue.file] = [];
		grouped[issue.file].push(issue);
	}
	for (const [file, issues] of Object.entries(grouped)) {
		console.log(`  ${file}:`);
		for (const i of issues) {
			console.log(`    - ${i.task}: ${i.source}`);
		}
	}
	console.log();
}

if (redCount === 0) {
	console.log("All MFR intervals have sources. No RED issues found.");
	process.exit(0);
} else {
	console.log(
		`${redCount} MFR interval(s) have no source. Fix these before committing.`
	);
	process.exit(1);
}
