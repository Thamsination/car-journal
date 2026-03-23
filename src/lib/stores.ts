import { writable, derived } from 'svelte/store';
import type { CarEvent, Part, IDriveRecord, VehicleStatus } from './types';

function persistedWritable<T>(key: string, initial: T) {
	const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
	const value = stored ? JSON.parse(stored) : initial;
	const store = writable<T>(value);
	store.subscribe((v) => {
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(key, JSON.stringify(v));
		}
	});
	return store;
}

export const token = persistedWritable<string>('gh_token', '');
export const repoOwner = persistedWritable<string>('repo_owner', 'Thamsination');
export const repoName = persistedWritable<string>('repo_name', 'car-journal');

export const events = writable<CarEvent[]>([]);
export const parts = writable<Part[]>([]);
export const idriveRecords = writable<IDriveRecord[]>([]);
export const vehicle = writable<VehicleStatus>({
	vin: '',
	odometer: null,
	fuelLevel: null,
	lastSynced: null
});

export const isLoading = writable(false);
export const error = writable<string | null>(null);

export const statusFilter = writable<string>('all');

function sortByKmThenDate(a: CarEvent, b: CarEvent): number {
	const aKm = a.km ?? -1;
	const bKm = b.km ?? -1;
	if (aKm !== bKm) return bKm - aKm;
	if (!a.date && !b.date) return 0;
	if (!a.date) return 1;
	if (!b.date) return -1;
	return b.date.localeCompare(a.date);
}

export const filteredEvents = derived([events, statusFilter], ([$events, $filter]) => {
	const sorted = [...$events].sort(sortByKmThenDate);
	if ($filter === 'all') return sorted;
	return sorted.filter((e) => e.status === $filter);
});

export const totalSpent = derived(events, ($events) => {
	return $events
		.filter((e) => e.status === 'done')
		.reduce((sum, e) => sum + (e.cost || 0), 0);
});

export const totalPlanned = derived(events, ($events) => {
	return $events
		.filter((e) => e.status !== 'done')
		.reduce((sum, e) => sum + (e.cost || 0), 0);
});

export const costByCategory = derived(events, ($events) => {
	const categories: Record<string, number> = {};
	for (const e of $events.filter((ev) => ev.status === 'done')) {
		const cat = e.event.split(' - ')[0] || 'Other';
		categories[cat] = (categories[cat] || 0) + (e.cost || 0);
	}
	return Object.entries(categories)
		.map(([name, total]) => ({ name, total }))
		.sort((a, b) => b.total - a.total);
});

export const upcomingEvents = derived(events, ($events) => {
	return $events
		.filter((e) => e.status === 'scheduled' || e.status === 'pending' || e.status === 'future')
		.sort((a, b) => {
			if (a.km === null && b.km === null) return 0;
			if (a.km === null) return 1;
			if (b.km === null) return -1;
			return a.km - b.km;
		});
});

export const latestOdometer = derived([vehicle, events], ([$vehicle, $events]) => {
	if ($vehicle.odometer) {
		return { km: $vehicle.odometer, approximate: false };
	}
	const completed = $events
		.filter((e) => e.status === 'done' && e.km !== null)
		.sort((a, b) => (b.km ?? 0) - (a.km ?? 0));
	if (completed.length > 0) {
		return { km: completed[0].km!, approximate: true };
	}
	return { km: 0, approximate: false };
});

export const nextScheduledEvent = derived(events, ($events) => {
	const upcoming = $events
		.filter((e) => e.status === 'scheduled' || e.status === 'pending')
		.sort((a, b) => {
			const aKm = a.km ?? Infinity;
			const bKm = b.km ?? Infinity;
			if (aKm !== bKm) return aKm - bKm;
			const da = a.date || '9999';
			const db = b.date || '9999';
			return da.localeCompare(db);
		});
	return upcoming[0] ?? null;
});

export const nextBatchEvents = derived(
	[upcomingEvents, nextScheduledEvent],
	([$upcoming, $next]) => {
		const excluded = $next?.id;
		const remaining = $upcoming.filter((e) => e.id !== excluded && e.km !== null);
		if (remaining.length === 0) return [];
		const lowestKm = remaining[0].km;
		return remaining.filter((e) => e.km === lowestKm);
	}
);
