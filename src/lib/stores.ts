import { writable, derived } from 'svelte/store';
import type { CarEvent, Part, IDriveRecord, VehicleStatus, DerivedStatus } from './types';
import { deriveStatus } from './utils';

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
export const manualOdometer = persistedWritable<number | null>('manual_odometer', null);

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

function sortByKmAsc(a: CarEvent, b: CarEvent): number {
	const aKm = a.km ?? Infinity;
	const bKm = b.km ?? Infinity;
	if (aKm !== bKm) return aKm - bKm;
	if (!a.date && !b.date) return 0;
	if (!a.date) return 1;
	if (!b.date) return -1;
	return a.date.localeCompare(b.date);
}

function sortByDateDesc(a: CarEvent, b: CarEvent): number {
	if (!a.date && !b.date) return 0;
	if (!a.date) return 1;
	if (!b.date) return -1;
	if (a.date !== b.date) return b.date.localeCompare(a.date);
	const aKm = a.km ?? -1;
	const bKm = b.km ?? -1;
	return bKm - aKm;
}

export const scheduleEvents = derived([events, statusFilter], ([$events, $filter]) => {
	const nonCompleted = $events.filter((e) => !e.completed).sort(sortByKmAsc);
	if ($filter === 'all') return nonCompleted;
	return nonCompleted.filter((e) => deriveStatus(e) === $filter);
});

export const completedEvents = derived(events, ($events) => {
	return $events.filter((e) => e.completed).sort(sortByDateDesc);
});

export const totalSpent = derived(events, ($events) => {
	return $events
		.filter((e) => e.completed)
		.reduce((sum, e) => sum + (e.cost || 0), 0);
});

export const totalPlanned = derived(events, ($events) => {
	return $events
		.filter((e) => !e.completed)
		.reduce((sum, e) => sum + (e.cost || 0), 0);
});

export const costByCategory = derived(events, ($events) => {
	const categories: Record<string, number> = {};
	for (const e of $events.filter((ev) => ev.completed)) {
		const cat = e.event.split(' - ')[0] || 'Other';
		categories[cat] = (categories[cat] || 0) + (e.cost || 0);
	}
	return Object.entries(categories)
		.map(([name, total]) => ({ name, total }))
		.sort((a, b) => b.total - a.total);
});

export const upcomingEvents = derived(events, ($events) => {
	return $events
		.filter((e) => !e.completed)
		.sort(sortByKmAsc);
});

export const lastCompletedKm = derived(events, ($events) => {
	const completed = $events
		.filter((e) => e.completed && e.km !== null)
		.sort((a, b) => (b.km ?? 0) - (a.km ?? 0));
	return completed.length > 0 ? completed[0].km! : 0;
});

export const dailyAverageKm = derived(events, ($events) => {
	const withBoth = $events
		.filter((e) => e.completed && e.km !== null && e.date)
		.sort((a, b) => (a.date!).localeCompare(b.date!));
	if (withBoth.length < 2) return 0;
	const earliest = withBoth[0];
	const latest = withBoth[withBoth.length - 1];
	const kmDiff = (latest.km ?? 0) - (earliest.km ?? 0);
	const daysDiff = (new Date(latest.date!).getTime() - new Date(earliest.date!).getTime()) / 86400000;
	if (daysDiff <= 0 || kmDiff <= 0) return 0;
	return Math.round((kmDiff / daysDiff) * 10) / 10;
});

export const latestOdometer = derived(
	[vehicle, manualOdometer, events, dailyAverageKm],
	([$vehicle, $manual, $events, $avgKm]) => {
		if ($vehicle.odometer) {
			return { km: $vehicle.odometer, approximate: false, source: 'bmw' as const };
		}
		if ($manual !== null && $manual > 0) {
			return { km: $manual, approximate: false, source: 'manual' as const };
		}
		const completed = $events
			.filter((e) => e.completed && e.km !== null && e.date)
			.sort((a, b) => (b.km ?? 0) - (a.km ?? 0));
		if (completed.length > 0 && $avgKm > 0) {
			const latest = completed[0];
			const daysSince = (Date.now() - new Date(latest.date!).getTime()) / 86400000;
			const estimated = Math.round(latest.km! + daysSince * $avgKm);
			return { km: estimated, approximate: true, source: 'estimated' as const };
		}
		if (completed.length > 0) {
			return { km: completed[0].km!, approximate: true, source: 'event' as const };
		}
		return { km: 0, approximate: false, source: 'none' as const };
	}
);

export const nextScheduledEvent = derived(events, ($events) => {
	const upcoming = $events
		.filter((e) => !e.completed)
		.sort(sortByKmAsc);
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
