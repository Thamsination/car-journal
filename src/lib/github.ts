import { get } from 'svelte/store';
import { token, repoOwner, repoName, activeVehicleId } from './stores';

const API_BASE = 'https://api.github.com';

function headers(): HeadersInit {
	return {
		Authorization: `Bearer ${get(token)}`,
		Accept: 'application/vnd.github+json',
		'X-GitHub-Api-Version': '2022-11-28'
	};
}

function repoPath(): string {
	return `${API_BASE}/repos/${get(repoOwner)}/${get(repoName)}`;
}

interface FileContent {
	content: string;
	sha: string;
}

export async function getFile(path: string): Promise<FileContent> {
	const res = await fetch(`${repoPath()}/contents/${path}`, { headers: headers() });
	if (!res.ok) {
		if (res.status === 404) {
			return { content: '', sha: '' };
		}
		throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
	}
	const data = await res.json();
	const binary = atob(data.content.replace(/\n/g, ''));
	const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
	const content = new TextDecoder().decode(bytes);
	return { content, sha: data.sha };
}

export async function putFile(
	path: string,
	content: string,
	sha: string,
	message: string
): Promise<string> {
	const bytes = new TextEncoder().encode(content);
	const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
	const encoded = btoa(binary);
	const body: Record<string, string> = { message, content: encoded };
	if (sha) body.sha = sha;

	const res = await fetch(`${repoPath()}/contents/${path}`, {
		method: 'PUT',
		headers: headers(),
		body: JSON.stringify(body)
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		throw new Error(`GitHub API error: ${res.status} — ${err.message || res.statusText}`);
	}
	const data = await res.json();
	return data.content.sha;
}

export async function readJsonFile<T>(path: string): Promise<{ data: T; sha: string }> {
	const { content, sha } = await getFile(path);
	if (!content) {
		throw new Error(`File not found: ${path}`);
	}
	const data = JSON.parse(content) as T;
	return { data, sha };
}

export async function writeJsonFile<T>(
	path: string,
	data: T,
	sha: string,
	commitMessage: string
): Promise<string> {
	const content = JSON.stringify(data, null, 2) + '\n';
	return putFile(path, content, sha, commitMessage);
}

export async function validateToken(): Promise<{ ok: boolean; error?: string }> {
	try {
		const res = await fetch(`${repoPath()}`, { headers: headers() });
		if (res.ok) return { ok: true };
		const body = await res.json().catch(() => ({}));
		return {
			ok: false,
			error: `${res.status}: ${body.message || res.statusText}`
		};
	} catch (e) {
		return { ok: false, error: `Network error: ${e instanceof Error ? e.message : String(e)}` };
	}
}

const ROOT_DATA = 'static/data';

function vehiclePath(): string {
	return `${ROOT_DATA}/vehicles/${get(activeVehicleId)}`;
}

const shaCache = new Map<string, string>();

function sha(key: string): string {
	return shaCache.get(key) ?? '';
}

function setSha(key: string, value: string) {
	shaCache.set(key, value);
}

// --- Vehicle Registry ---

export async function loadVehiclesRegistry(): Promise<import('./types').VehiclesRegistry> {
	const { data, sha: s } = await readJsonFile<import('./types').VehiclesRegistry>(`${ROOT_DATA}/vehicles.json`);
	setSha('vehicles-registry', s);
	return data;
}

export async function saveVehiclesRegistry(
	registry: import('./types').VehiclesRegistry,
	message: string
): Promise<void> {
	const newSha = await writeJsonFile(`${ROOT_DATA}/vehicles.json`, registry, sha('vehicles-registry'), message);
	setSha('vehicles-registry', newSha);
}

// --- Platform ---

export async function loadPlatform(platformId: string): Promise<import('./types').PlatformConfig | null> {
	const { content } = await getFile(`${ROOT_DATA}/platforms/${platformId}.json`);
	if (!content) return null;
	return JSON.parse(content) as import('./types').PlatformConfig;
}

// --- Per-Vehicle Data ---

export async function loadEvents(): Promise<import('./types').CarEvent[]> {
	const path = `${vehiclePath()}/events.json`;
	const { data, sha: s } = await readJsonFile<import('./types').EventsData>(path);
	setSha('events', s);
	return data.events;
}

export async function saveEvents(
	events: import('./types').CarEvent[],
	message: string
): Promise<void> {
	const path = `${vehiclePath()}/events.json`;
	const data: import('./types').EventsData = { events };
	const newSha = await writeJsonFile(path, data, sha('events'), message);
	setSha('events', newSha);
}

export async function loadParts(): Promise<import('./types').Part[]> {
	const path = `${vehiclePath()}/parts.json`;
	const { data, sha: s } = await readJsonFile<import('./types').PartsData>(path);
	setSha('parts', s);
	return data.parts;
}

export async function saveParts(
	parts: import('./types').Part[],
	message: string
): Promise<void> {
	const path = `${vehiclePath()}/parts.json`;
	const data: import('./types').PartsData = { parts };
	const newSha = await writeJsonFile(path, data, sha('parts'), message);
	setSha('parts', newSha);
}

export async function loadServiceSchedule(): Promise<import('./types').ServiceMilestone[]> {
	const path = `${vehiclePath()}/../../service-schedule.json`;
	const { content } = await getFile(path);
	if (!content) return [];
	const data = JSON.parse(content) as import('./types').ServiceSchedule;
	return data.milestones;
}

export async function loadHealthConfig(): Promise<import('./types').HealthConfig> {
	const path = `${vehiclePath()}/health-config.json`;
	const { content, sha: s } = await getFile(path);
	setSha('health', s);
	if (!content) {
		return { intervals: [] };
	}
	return JSON.parse(content) as import('./types').HealthConfig;
}

export async function saveHealthConfig(
	config: import('./types').HealthConfig,
	message: string
): Promise<void> {
	const path = `${vehiclePath()}/health-config.json`;
	const newSha = await writeJsonFile(path, config, sha('health'), message);
	setSha('health', newSha);
}

export async function loadVehicleConfig(): Promise<import('./types').VehicleConfig | null> {
	const path = `${vehiclePath()}/vehicle-config.json`;
	const { content, sha: s } = await getFile(path);
	setSha('vehicle-config', s);
	if (!content) return null;
	return JSON.parse(content) as import('./types').VehicleConfig;
}

export async function saveVehicleConfig(
	config: import('./types').VehicleConfig,
	message: string
): Promise<void> {
	const path = `${vehiclePath()}/vehicle-config.json`;
	const newSha = await writeJsonFile(path, config, sha('vehicle-config'), message);
	setSha('vehicle-config', newSha);
}

export async function loadTireConfig(): Promise<import('./types').TireConfig | null> {
	const path = `${vehiclePath()}/tire-config.json`;
	const { content, sha: s } = await getFile(path);
	setSha('tire', s);
	if (!content) return null;
	return JSON.parse(content) as import('./types').TireConfig;
}

export async function saveTireConfig(
	config: import('./types').TireConfig,
	message: string
): Promise<void> {
	const path = `${vehiclePath()}/tire-config.json`;
	const newSha = await writeJsonFile(path, config, sha('tire'), message);
	setSha('tire', newSha);
}

const receiptsDir = () => `${vehiclePath()}/receipts`;

export async function uploadReceipt(
	filename: string,
	base64Content: string,
	message: string
): Promise<string> {
	const path = `${receiptsDir()}/${filename}`;
	const { sha: existingSha } = await getFile(path).catch(() => ({ sha: '' }));
	const body: Record<string, string> = { message, content: base64Content };
	if (existingSha) body.sha = existingSha;

	const res = await fetch(`${repoPath()}/contents/${path}`, {
		method: 'PUT',
		headers: headers(),
		body: JSON.stringify(body)
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		throw new Error(`Upload failed: ${res.status} — ${err.message || res.statusText}`);
	}
	const data = await res.json();
	return data.content.sha;
}

export async function deleteReceipt(
	filename: string,
	message: string
): Promise<void> {
	const path = `${receiptsDir()}/${filename}`;
	const res = await fetch(`${repoPath()}/contents/${path}`, { headers: headers() });
	if (!res.ok) return;
	const fileData = await res.json();

	const delRes = await fetch(`${repoPath()}/contents/${path}`, {
		method: 'DELETE',
		headers: headers(),
		body: JSON.stringify({ message, sha: fileData.sha })
	});
	if (!delRes.ok) {
		const err = await delRes.json().catch(() => ({}));
		throw new Error(`Delete failed: ${delRes.status} — ${err.message || delRes.statusText}`);
	}
}

export function receiptUrl(filename: string): string {
	const vid = get(activeVehicleId);
	return `https://${get(repoOwner)}.github.io/${get(repoName)}/data/vehicles/${vid}/receipts/${filename}`;
}

export function clearShaCache(): void {
	shaCache.clear();
}
