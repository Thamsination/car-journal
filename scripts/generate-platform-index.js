#!/usr/bin/env node
/**
 * Regenerate static/data/platforms/index.json from all platform JSON files.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLATFORMS_DIR = join(__dirname, "../static/data/platforms");

const entries = [];
for (const name of readdirSync(PLATFORMS_DIR).sort()) {
	if (!name.endsWith(".json") || name === "index.json") continue;
	const path = join(PLATFORMS_DIR, name);
	const data = JSON.parse(readFileSync(path, "utf8"));
	const platformId = data.id;
	const vehicles = data.vehicles;
	if (!Array.isArray(vehicles) || vehicles.length === 0) {
		console.warn(`WARNING: ${name} has no vehicles array — skipping`);
		continue;
	}
	for (const v of vehicles) {
		entries.push({
			platformId,
			make: v.make,
			models: v.models,
			yearFrom: v.yearFrom,
			yearTo: v.yearTo,
		});
	}
}

const out = join(PLATFORMS_DIR, "index.json");
writeFileSync(out, JSON.stringify(entries, null, 2) + "\n", "utf8");
console.log(`Wrote ${entries.length} entries to ${out}`);
