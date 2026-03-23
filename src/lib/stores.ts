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

export const filteredEvents = derived([events, statusFilter], ([$events, $filter]) => {
	const sorted = [...$events].sort((a, b) => {
		if (!a.date && !b.date) return 0;
		if (!a.date) return 1;
		if (!b.date) return -1;
		return b.date.localeCompare(a.date);
	});
	if ($filter === 'all') return sorted;
	return sorted.filter((e) => e.status === $filter);
});

export const totalCost = derived(events, ($events) => {
	return $events.reduce((sum, e) => sum + (e.cost || 0), 0);
});

export const costByCategory = derived(events, ($events) => {
	const categories: Record<string, number> = {};
	for (const e of $events) {
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
