import { get } from 'svelte/store';
import { token, repoOwner, repoName } from './stores';

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

let eventsSha = '';
let partsSha = '';

const DATA_PATH = 'static/data';

export async function loadEvents(): Promise<import('./types').CarEvent[]> {
	const { data, sha } = await readJsonFile<import('./types').EventsData>(`${DATA_PATH}/events.json`);
	eventsSha = sha;
	return data.events;
}

export async function saveEvents(
	events: import('./types').CarEvent[],
	message: string
): Promise<void> {
	const data: import('./types').EventsData = { events };
	eventsSha = await writeJsonFile(`${DATA_PATH}/events.json`, data, eventsSha, message);
}

export async function loadParts(): Promise<import('./types').Part[]> {
	const { data, sha } = await readJsonFile<import('./types').PartsData>(`${DATA_PATH}/parts.json`);
	partsSha = sha;
	return data.parts;
}

export async function saveParts(
	parts: import('./types').Part[],
	message: string
): Promise<void> {
	const data: import('./types').PartsData = { parts };
	partsSha = await writeJsonFile(`${DATA_PATH}/parts.json`, data, partsSha, message);
}

export async function loadIDriveHistory(): Promise<import('./types').IDriveRecord[]> {
	const { data } = await readJsonFile<import('./types').IDriveData>(`${DATA_PATH}/idrive-history.json`);
	return data.records;
}

