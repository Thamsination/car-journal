#!/usr/bin/env node
/**
 * One-time migration: remove engines + milestones from platform JSON;
 * add displacement/cylinders/fuelType where verified (see AGENT_PROMPT_DROP_ENGINE_CODES.md).
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLATFORMS_DIR = join(__dirname, "../static/data/platforms");

/** BEV + REx in one file — cannot state a single verified ICE triple for all listed models. */
const IDS_NO_VERIFIED_ENGINE_SPEC = new Set(["BMW-I01"]);

const PLATFORM_KEY_ORDER = [
	"id",
	"name",
	"years",
	"chassisCodes",
	"drivetrains",
	"transmissions",
	"displacement",
	"cylinders",
	"fuelType",
	"vehicles",
	"serviceIntervals",
	"serviceNotes",
];

/**
 * @param {Record<string, unknown>} data
 * @returns {Record<string, unknown>}
 */
function reorderPlatformKeys(data) {
	/** @type {Record<string, unknown>} */
	const out = {};
	for (const k of PLATFORM_KEY_ORDER) {
		if (Object.prototype.hasOwnProperty.call(data, k)) out[k] = data[k];
	}
	for (const k of Object.keys(data)) {
		if (!PLATFORM_KEY_ORDER.includes(k)) out[k] = data[k];
	}
	return out;
}

/** @type {Record<string, { displacement?: string | null; cylinders?: number; fuelType?: string; name?: string }>} */
const EXPLICIT = {
	"G30-G31-B47": {
		displacement: "2.0L",
		cylinders: 4,
		fuelType: "diesel",
		name: "BMW G30/G31 5 Series (2.0L 4-cyl diesel)",
	},
	"G30-G31-B48": {
		displacement: "2.0L",
		cylinders: 4,
		fuelType: "petrol",
		name: "BMW G30/G31 5 Series (2.0L 4-cyl petrol)",
	},
	"G30-G31-B57": {
		displacement: "3.0L",
		cylinders: 6,
		fuelType: "diesel",
		name: "BMW G30/G31 5 Series (3.0L 6-cyl diesel)",
	},
	"G30-G31-B58": {
		name: "BMW G30/G31 5 Series (3.0L 6-cyl petrol)",
	},
	"Mercedes-EQ-EQE": {
		displacement: null,
		cylinders: 0,
		fuelType: "electric",
	},
	"BMW-I20": {
		displacement: null,
		cylinders: 0,
		fuelType: "electric",
	},
	"BMW-I15": {
		displacement: "1.5L",
		cylinders: 3,
		fuelType: "hybrid",
		name: "BMW i8 (1.5L 3-cyl plug-in hybrid)",
	},
	"BMW-G09": {
		displacement: "4.4L",
		cylinders: 8,
		fuelType: "hybrid",
		name: "BMW G09 XM (4.4L V8 plug-in hybrid)",
	},
	"Subaru-WRX-EJ-turbo": {
		displacement: "2.0–2.5L",
		cylinders: 4,
		fuelType: "petrol",
		name: "Subaru Impreza WRX / WRX / WRX STI (2.0–2.5L 4-cyl turbo petrol)",
	},
	"Subaru-WRX-FA20DIT": {
		displacement: "2.0L",
		cylinders: 4,
		fuelType: "petrol",
		name: "Subaru WRX (2.0L 4-cyl turbo petrol)",
	},
	"Subaru-WRX-FA24DIT": {
		displacement: "2.4L",
		cylinders: 4,
		fuelType: "petrol",
		name: "Subaru WRX (2.4L 4-cyl turbo petrol)",
	},
};

/** @type {Record<string, { displacement: string; cylinders: number; fuelType: string }>} */
const ICE_SPECS = {
	B37: { displacement: "1.5L", cylinders: 3, fuelType: "diesel" },
	B38: { displacement: "1.5L", cylinders: 3, fuelType: "petrol" },
	B47: { displacement: "2.0L", cylinders: 4, fuelType: "diesel" },
	B48: { displacement: "2.0L", cylinders: 4, fuelType: "petrol" },
	B57: { displacement: "3.0L", cylinders: 6, fuelType: "diesel" },
	B58: { displacement: "3.0L", cylinders: 6, fuelType: "petrol" },
	N13: { displacement: "1.6L", cylinders: 4, fuelType: "petrol" },
	N20: { displacement: "2.0L", cylinders: 4, fuelType: "petrol" },
	N47: { displacement: "2.0L", cylinders: 4, fuelType: "diesel" },
	N55: { displacement: "3.0L", cylinders: 6, fuelType: "petrol" },
	N57: { displacement: "3.0L", cylinders: 6, fuelType: "diesel" },
	N63: { displacement: "4.4L", cylinders: 8, fuelType: "petrol" },
	S55: { displacement: "3.0L", cylinders: 6, fuelType: "petrol" },
	S58: { displacement: "3.0L", cylinders: 6, fuelType: "petrol" },
	S68: { displacement: "4.4L", cylinders: 8, fuelType: "petrol" },
	FA20F: { displacement: "2.0L", cylinders: 4, fuelType: "petrol" },
	FA24F: { displacement: "2.4L", cylinders: 4, fuelType: "petrol" },
};

/**
 * @param {string[]} engines
 * @returns {{ displacement: string | null; cylinders: number; fuelType: string } | null}
 */
function heuristicSpecs(engines) {
	if (!engines?.length) return null;
	const hasElectric = engines.some((e) => String(e).toLowerCase() === "electric");
	const ice = engines.filter((e) => String(e).toLowerCase() !== "electric");
	if (ice.length === 0 && hasElectric) {
		return { displacement: null, cylinders: 0, fuelType: "electric" };
	}
	if (ice.length === 1 && hasElectric) {
		const spec = ICE_SPECS[ice[0]];
		if (!spec) return null;
		return {
			displacement: spec.displacement,
			cylinders: spec.cylinders,
			fuelType: "hybrid",
		};
	}
	if (ice.length === 1 && !hasElectric) {
		const spec = ICE_SPECS[ice[0]];
		if (!spec) return null;
		return {
			displacement: spec.displacement,
			cylinders: spec.cylinders,
			fuelType: spec.fuelType,
		};
	}
	return null;
}

/**
 * @param {Record<string, unknown>} data
 */
function pickExistingSpecs(data) {
	/** @type {Record<string, unknown>} */
	const o = {};
	if (Object.prototype.hasOwnProperty.call(data, "displacement")) o.displacement = data.displacement;
	if (Object.prototype.hasOwnProperty.call(data, "cylinders")) o.cylinders = data.cylinders;
	if (Object.prototype.hasOwnProperty.call(data, "fuelType")) o.fuelType = data.fuelType;
	return o;
}

function migrationProvidesEngineSpec(updates) {
	return (
		Object.prototype.hasOwnProperty.call(updates, "displacement") ||
		Object.prototype.hasOwnProperty.call(updates, "cylinders") ||
		Object.prototype.hasOwnProperty.call(updates, "fuelType")
	);
}

/**
 * @param {Record<string, unknown>} data
 */
function migrateOne(data) {
	const id = String(data.id ?? "");
	const origSpecs = pickExistingSpecs(data);
	const enginesWas = Array.isArray(data.engines) ? [...data.engines] : [];

	delete data.milestones;
	delete data.engines;

	const vehicles = data.vehicles;
	if (Array.isArray(vehicles)) {
		for (const v of vehicles) {
			if (v && typeof v === "object" && "engines" in v) delete v.engines;
		}
	}

	const ex = EXPLICIT[id];
	const heur = heuristicSpecs(enginesWas);
	/** @type {Record<string, unknown>} */
	const updates = ex ? { ...ex } : heur ? { ...heur } : {};

	if (updates.name != null) data.name = updates.name;

	if (migrationProvidesEngineSpec(updates)) {
		if (Object.prototype.hasOwnProperty.call(updates, "displacement")) data.displacement = updates.displacement;
		if (Object.prototype.hasOwnProperty.call(updates, "cylinders")) data.cylinders = updates.cylinders;
		if (Object.prototype.hasOwnProperty.call(updates, "fuelType")) data.fuelType = updates.fuelType;
	} else if (Object.keys(origSpecs).length > 0) {
		if ("displacement" in origSpecs) data.displacement = origSpecs.displacement;
		if ("cylinders" in origSpecs) data.cylinders = origSpecs.cylinders;
		if ("fuelType" in origSpecs) data.fuelType = origSpecs.fuelType;
	} else {
		delete data.displacement;
		delete data.cylinders;
		delete data.fuelType;
	}

	if (IDS_NO_VERIFIED_ENGINE_SPEC.has(id)) {
		delete data.displacement;
		delete data.cylinders;
		delete data.fuelType;
	}
}

function main() {
	const files = readdirSync(PLATFORMS_DIR).filter((f) => f.endsWith(".json") && f !== "index.json");
	for (const f of files) {
		const path = join(PLATFORMS_DIR, f);
		const data = JSON.parse(readFileSync(path, "utf8"));
		migrateOne(data);
		writeFileSync(path, JSON.stringify(reorderPlatformKeys(data), null, 2) + "\n", "utf8");
	}
	console.log(`Migrated ${files.length} platform files in ${PLATFORMS_DIR}`);
}

main();
