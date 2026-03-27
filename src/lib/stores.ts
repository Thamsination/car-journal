import { writable, derived } from 'svelte/store';
import type { CarEvent, Part, DerivedStatus, ServiceInterval as HealthInterval } from './types';
import { deriveStatus, eventCategory } from './utils';

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
export const healthIntervals = writable<HealthInterval[]>([]);

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

const dashboardCategoryMap: Record<string, string> = {
	'purchase': 'Purchases',
	'warranty': 'Warranty',
	'replacement': 'Replacement',
	'official-service': 'Service',
	'other-service': 'Service',
	'inspection': 'Service'
};

const dashboardCategoryOrder = ['Car', 'Purchases', 'Service', 'Replacement', 'Warranty'];

export const costByCategory = derived(events, ($events) => {
	const buckets: Record<string, number> = {};
	for (const e of $events.filter((ev) => ev.completed)) {
		const isCarPurchase = e.event.toLowerCase() === 'car';
		const label = isCarPurchase
			? 'Car'
			: dashboardCategoryMap[eventCategory(e.event, e.category)] || 'Service';
		buckets[label] = (buckets[label] || 0) + (e.cost || 0);
	}
	return dashboardCategoryOrder
		.filter((name) => (buckets[name] || 0) > 0)
		.map((name) => ({ name, total: buckets[name] }));
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
	[manualOdometer, events, dailyAverageKm],
	([$manual, $events, $avgKm]) => {
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

export const scheduleEvents = derived([events, statusFilter, latestOdometer], ([$events, $filter, $odo]) => {
	const nonCompleted = $events.filter((e) => !e.completed).sort(sortByKmAsc);
	if ($filter === 'all') return nonCompleted;
	return nonCompleted.filter((e) => deriveStatus(e, $odo.km) === $filter);
});

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

export type ComponentHealth = 'good' | 'warning' | 'overdue';

const WARNING_THRESHOLD = 0.8;

export const componentHealthMap = derived(
	[healthIntervals, events, latestOdometer],
	([$intervals, $events, $odo]): Map<string, ComponentHealth> => {
		const map = new Map<string, ComponentHealth>();
		const odoKm = $odo.km;
		const now = Date.now();

		for (const interval of $intervals) {
			const lastEvent = findLastServiceForInterval($events, interval);
			const lastKm = lastEvent?.km ?? null;
			const lastDate = lastEvent?.date ?? '';

			let health: ComponentHealth = 'good';
			if (!lastEvent) {
				const firstDueKm = interval.intervalKm ?? Infinity;
				if (odoKm > 0 && odoKm >= firstDueKm) {
					health = 'overdue';
				} else if (odoKm > 0 && interval.intervalKm && odoKm >= firstDueKm * WARNING_THRESHOLD) {
					health = 'warning';
				}
			} else {
				let kmOverdue = false;
				let timeOverdue = false;
				let kmWarning = false;
				let timeWarning = false;

				if (interval.intervalKm && lastKm !== null && odoKm > 0) {
					const remaining = lastKm + interval.intervalKm - odoKm;
					const usedPct = Math.min(1, Math.max(0, (odoKm - lastKm) / interval.intervalKm));
					kmOverdue = remaining < 0;
					kmWarning = usedPct >= WARNING_THRESHOLD && remaining >= 0;
				}

				if (interval.intervalMonths && lastDate) {
					const lastMs = new Date(lastDate + 'T00:00:00').getTime();
					const intervalMs = interval.intervalMonths * 30.44 * 86400000;
					const nextDueMs = lastMs + intervalMs;
					const remainingDays = Math.round((nextDueMs - now) / 86400000);
					const usedTimePct = Math.min(1, Math.max(0, (now - lastMs) / intervalMs));
					timeOverdue = remainingDays < 0;
					timeWarning = usedTimePct >= WARNING_THRESHOLD && remainingDays >= 0;
				}

				if (kmOverdue || timeOverdue) health = 'overdue';
				else if (kmWarning || timeWarning) health = 'warning';
			}

			for (const match of interval.taskMatches) {
				map.set(match.toLowerCase(), health);
			}
		}
		return map;
	}
);

function findLastServiceForInterval(evts: CarEvent[], interval: HealthInterval): CarEvent | null {
	const matches = evts.filter((e) => {
		if (!e.completed) return false;
		const tasks = e.tasks ?? [e.event];
		return tasks.some((t) =>
			interval.taskMatches.some((m) => t.toLowerCase().includes(m.toLowerCase()))
		);
	});
	matches.sort((a, b) => {
		const aKm = a.km ?? 0;
		const bKm = b.km ?? 0;
		if (aKm !== bKm) return bKm - aKm;
		return (b.date || '').localeCompare(a.date || '');
	});
	return matches[0] ?? null;
}
