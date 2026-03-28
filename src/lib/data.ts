import { get } from 'svelte/store';
import { base } from '$app/paths';
import { supabase } from './supabase';
import { activeVehicleId } from './stores';
import type {
	CarEvent, Part, VehiclesRegistry, VehicleConfig,
	HealthConfig, TireConfig, PlatformConfig,
	ServiceMilestone, ServiceSchedule
} from './types';

export interface PlatformIndexEntry {
	platformId: string;
	make: string;
	models: string[];
	yearFrom: number;
	yearTo: number;
}

let _userId = '';

export function setUserId(id: string) {
	_userId = id;
}

// --- Vehicle Registry ---

export async function loadVehiclesRegistry(): Promise<VehiclesRegistry> {
	const { data: vehicles, error: vErr } = await supabase
		.from('vehicles')
		.select('id, label, model');

	if (vErr) throw new Error(vErr.message);

	const { data: prefs } = await supabase
		.from('user_preferences')
		.select('active_vehicle')
		.single();

	return {
		vehicles: (vehicles ?? []).map(v => ({
			id: v.id,
			label: v.label,
			model: v.model ?? undefined
		})),
		activeVehicle: prefs?.active_vehicle ?? ''
	};
}

export async function saveVehiclesRegistry(
	registry: VehiclesRegistry,
	_message: string
): Promise<void> {
	const { data: { user } } = await supabase.auth.getUser();
	if (!user) throw new Error('Not authenticated');

	await supabase.from('user_preferences').upsert({
		user_id: user.id,
		active_vehicle: registry.activeVehicle
	});

	for (const v of registry.vehicles) {
		await supabase
			.from('vehicles')
			.update({ label: v.label, model: v.model ?? null })
			.eq('id', v.id);
	}
}

// --- Platform (static fetch from deployed site) ---

export async function loadPlatform(platformId: string): Promise<PlatformConfig | null> {
	try {
		const res = await fetch(`${base}/data/platforms/${platformId}.json`);
		if (!res.ok) return null;
		return await res.json();
	} catch {
		return null;
	}
}

export async function loadPlatformIndex(): Promise<PlatformIndexEntry[]> {
	try {
		const res = await fetch(`${base}/data/platforms/index.json`);
		if (!res.ok) return [];
		return await res.json();
	} catch {
		return [];
	}
}

// --- Vehicle CRUD ---

export async function createVehicleFiles(
	vehicleId: string,
	config: VehicleConfig,
	healthConfig: HealthConfig
): Promise<void> {
	const { data: { user } } = await supabase.auth.getUser();
	if (!user) throw new Error('Not authenticated');

	const { error } = await supabase.from('vehicles').insert({
		id: vehicleId,
		user_id: user.id,
		label: config.name,
		model: config.model,
		config,
		events: [],
		parts: [],
		health_config: healthConfig,
		tire_config: { profiles: [], warningPct: 0.8 }
	});

	if (error) throw new Error(error.message);
}

export async function deleteVehicleFiles(vehicleId: string): Promise<void> {
	const { data: { user } } = await supabase.auth.getUser();
	if (user) {
		const folder = `${user.id}/${vehicleId}`;
		const { data: files } = await supabase.storage
			.from('receipts')
			.list(folder);
		if (files && files.length > 0) {
			await supabase.storage
				.from('receipts')
				.remove(files.map(f => `${folder}/${f.name}`));
		}
	}

	const { error } = await supabase
		.from('vehicles')
		.delete()
		.eq('id', vehicleId);

	if (error) throw new Error(error.message);
}

// --- Per-Vehicle Data ---

export async function loadEvents(): Promise<CarEvent[]> {
	const vid = get(activeVehicleId);
	const { data, error } = await supabase
		.from('vehicles')
		.select('events')
		.eq('id', vid)
		.single();

	if (error) throw new Error(error.message);
	return (data?.events as CarEvent[]) ?? [];
}

export async function saveEvents(
	evts: CarEvent[],
	_message: string
): Promise<void> {
	const vid = get(activeVehicleId);
	const { error } = await supabase
		.from('vehicles')
		.update({ events: evts })
		.eq('id', vid);

	if (error) throw new Error(error.message);
}

export async function loadParts(): Promise<Part[]> {
	const vid = get(activeVehicleId);
	const { data, error } = await supabase
		.from('vehicles')
		.select('parts')
		.eq('id', vid)
		.single();

	if (error) throw new Error(error.message);
	return (data?.parts as Part[]) ?? [];
}

export async function saveParts(
	pts: Part[],
	_message: string
): Promise<void> {
	const vid = get(activeVehicleId);
	const { error } = await supabase
		.from('vehicles')
		.update({ parts: pts })
		.eq('id', vid);

	if (error) throw new Error(error.message);
}

export async function loadHealthConfig(): Promise<HealthConfig> {
	const vid = get(activeVehicleId);
	const { data, error } = await supabase
		.from('vehicles')
		.select('health_config')
		.eq('id', vid)
		.single();

	if (error && error.code !== 'PGRST116') throw new Error(error.message);
	return (data?.health_config as HealthConfig) ?? { intervals: [] };
}

export async function saveHealthConfig(
	config: HealthConfig,
	_message: string
): Promise<void> {
	const vid = get(activeVehicleId);
	const { error } = await supabase
		.from('vehicles')
		.update({ health_config: config })
		.eq('id', vid);

	if (error) throw new Error(error.message);
}

export async function loadVehicleConfig(): Promise<VehicleConfig | null> {
	const vid = get(activeVehicleId);
	const { data, error } = await supabase
		.from('vehicles')
		.select('config')
		.eq('id', vid)
		.single();

	if (error && error.code !== 'PGRST116') throw new Error(error.message);
	if (!data?.config) return null;

	const raw = data.config as VehicleConfig & { engine?: string };
	if (raw.engine && !raw.displacement) {
		delete raw.engine;
	} else if (raw.displacement) {
		delete raw.engine;
	}
	return raw;
}

export async function saveVehicleConfig(
	config: VehicleConfig,
	_message: string
): Promise<void> {
	const vid = get(activeVehicleId);
	const { error } = await supabase
		.from('vehicles')
		.update({ config })
		.eq('id', vid);

	if (error) throw new Error(error.message);
}

export async function loadTireConfig(): Promise<TireConfig | null> {
	const vid = get(activeVehicleId);
	const { data, error } = await supabase
		.from('vehicles')
		.select('tire_config')
		.eq('id', vid)
		.single();

	if (error && error.code !== 'PGRST116') throw new Error(error.message);
	return (data?.tire_config as TireConfig) ?? null;
}

export async function saveTireConfig(
	config: TireConfig,
	_message: string
): Promise<void> {
	const vid = get(activeVehicleId);
	const { error } = await supabase
		.from('vehicles')
		.update({ tire_config: config })
		.eq('id', vid);

	if (error) throw new Error(error.message);
}

export async function loadServiceSchedule(): Promise<ServiceMilestone[]> {
	try {
		const res = await fetch(`${base}/data/service-schedule.json`);
		if (!res.ok) return [];
		const data = await res.json() as ServiceSchedule;
		return data.milestones;
	} catch {
		return [];
	}
}

// --- Receipts ---

export async function uploadReceipt(
	filename: string,
	base64Content: string,
	_message: string
): Promise<string> {
	if (!_userId) throw new Error('Not authenticated');

	const vid = get(activeVehicleId);
	const path = `${_userId}/${vid}/${filename}`;

	const binary = atob(base64Content);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}

	const { error } = await supabase.storage
		.from('receipts')
		.upload(path, bytes, { upsert: true });

	if (error) throw new Error(`Upload failed: ${error.message}`);
	return path;
}

export async function deleteReceipt(
	filename: string,
	_message: string
): Promise<void> {
	if (!_userId) throw new Error('Not authenticated');

	const vid = get(activeVehicleId);
	const path = `${_userId}/${vid}/${filename}`;

	const { error } = await supabase.storage
		.from('receipts')
		.remove([path]);

	if (error) throw new Error(`Delete failed: ${error.message}`);
}

export function receiptUrl(filename: string): string {
	const vid = get(activeVehicleId);
	const path = `${_userId}/${vid}/${filename}`;
	const { data } = supabase.storage.from('receipts').getPublicUrl(path);
	return data.publicUrl;
}

export function clearShaCache(): void {
	// No-op: SHA cache was GitHub-specific
}
