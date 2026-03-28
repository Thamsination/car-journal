#!/usr/bin/env node

/**
 * One-time migration: reads vehicle data from a GitHub repo's static/data/
 * directory and inserts it into Supabase.
 *
 * Usage:
 *   GITHUB_TOKEN=ghp_xxx \
 *   GITHUB_OWNER=Thamsination \
 *   GITHUB_REPO=car-journal \
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_KEY=eyJ... \
 *   SUPABASE_USER_ID=<uuid of the target user> \
 *   node scripts/migrate-github-to-supabase.js
 *
 * The SUPABASE_SERVICE_KEY is the service_role key (not the anon key)
 * because we bypass RLS to insert for a specific user.
 */

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'Thamsination';
const GITHUB_REPO = process.env.GITHUB_REPO || 'car-journal';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SUPABASE_USER_ID = process.env.SUPABASE_USER_ID;

if (!GITHUB_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_KEY || !SUPABASE_USER_ID) {
	console.error('Missing required env vars. See usage comment at top of script.');
	process.exit(1);
}

const GH_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents`;
const ghHeaders = {
	Authorization: `Bearer ${GITHUB_TOKEN}`,
	Accept: 'application/vnd.github+json'
};

async function ghGet(path) {
	const res = await fetch(`${GH_API}/${path}`, { headers: ghHeaders });
	if (!res.ok) {
		if (res.status === 404) return null;
		throw new Error(`GitHub ${res.status}: ${path}`);
	}
	const data = await res.json();
	if (Array.isArray(data)) return data;
	const binary = atob(data.content.replace(/\n/g, ''));
	const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
	return JSON.parse(new TextDecoder().decode(bytes));
}

async function supabasePost(table, body) {
	const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
		method: 'POST',
		headers: {
			apikey: SUPABASE_SERVICE_KEY,
			Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
			'Content-Type': 'application/json',
			Prefer: 'return=minimal,resolution=merge-duplicates'
		},
		body: JSON.stringify(body)
	});
	if (!res.ok) {
		const err = await res.text();
		throw new Error(`Supabase ${res.status} on ${table}: ${err}`);
	}
}

async function main() {
	console.log(`Reading vehicles.json from ${GITHUB_OWNER}/${GITHUB_REPO}...`);
	const registry = await ghGet('static/data/vehicles.json');
	if (!registry || !registry.vehicles) {
		console.log('No vehicles found.');
		return;
	}

	console.log(`Found ${registry.vehicles.length} vehicle(s). Migrating...`);

	for (const entry of registry.vehicles) {
		const vid = entry.id;
		const basePath = `static/data/vehicles/${vid}`;
		console.log(`  ${vid} (${entry.label})...`);

		const [config, eventsData, partsData, healthConfig, tireConfig] = await Promise.all([
			ghGet(`${basePath}/vehicle-config.json`).catch(() => ({})),
			ghGet(`${basePath}/events.json`).catch(() => ({ events: [] })),
			ghGet(`${basePath}/parts.json`).catch(() => ({ parts: [] })),
			ghGet(`${basePath}/health-config.json`).catch(() => ({ intervals: [] })),
			ghGet(`${basePath}/tire-config.json`).catch(() => ({ profiles: [], warningPct: 0.8 }))
		]);

		await supabasePost('vehicles', {
			id: vid,
			user_id: SUPABASE_USER_ID,
			label: entry.label,
			model: entry.model || config?.model || null,
			config: config || {},
			events: eventsData?.events || [],
			parts: partsData?.parts || [],
			health_config: healthConfig || { intervals: [] },
			tire_config: tireConfig || { profiles: [], warningPct: 0.8 }
		});

		console.log(`    ✓ inserted`);
	}

	await supabasePost('user_preferences', {
		user_id: SUPABASE_USER_ID,
		active_vehicle: registry.activeVehicle || registry.vehicles[0]?.id || ''
	});

	console.log(`\nDone! ${registry.vehicles.length} vehicle(s) migrated.`);
	console.log(`Active vehicle set to: ${registry.activeVehicle || registry.vehicles[0]?.id}`);
}

main().catch(err => {
	console.error('Migration failed:', err);
	process.exit(1);
});
