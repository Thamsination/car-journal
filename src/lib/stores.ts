import { writable, derived } from 'svelte/store';
import type { Session } from '@supabase/supabase-js';
import type { CarEvent, Part, DerivedStatus, ServiceInterval as HealthInterval, VehicleConfig, TireConfig, TireProfile, VehicleRegistryEntry, PlatformConfig } from './types';
import { deriveStatus, isEffectivelyCompleted, eventCategory } from './utils';

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

export const session = writable<Session | null>(null);
export const activeVehicleId = persistedWritable<string>('active_vehicle', '');
export const vehicleList = writable<VehicleRegistryEntry[]>([]);
export const vehicleListLoaded = writable(false);
export const requestAddVehicle = writable(false);
export const onboardingDismissed = persistedWritable<boolean>('onboarding_dismissed', false);

export const events = writable<CarEvent[]>([]);
export const parts = writable<Part[]>([]);
export const healthIntervals = writable<HealthInterval[]>([]);
export const platformConfig = writable<PlatformConfig | null>(null);
export const vehicleConfig = writable<VehicleConfig | null>(null);
export const tireConfig = writable<TireConfig | null>(null);

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
	[vehicleConfig, events, dailyAverageKm],
	([$vc, $events, $avgKm]) => {
		const manual = $vc?.odometer ?? null;
		if (manual !== null && manual > 0) {
			return { km: manual, approximate: false, source: 'manual' as const };
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

export const completedEvents = derived([events, latestOdometer], ([$events, $odo]) => {
	return $events.filter((e) => isEffectivelyCompleted(e, $odo.km)).sort(sortByDateDesc);
});

export const totalSpent = derived([events, latestOdometer], ([$events, $odo]) => {
	return $events
		.filter((e) => isEffectivelyCompleted(e, $odo.km))
		.reduce((sum, e) => sum + (e.cost || 0), 0);
});

export const totalPlanned = derived([events, latestOdometer], ([$events, $odo]) => {
	return $events
		.filter((e) => !isEffectivelyCompleted(e, $odo.km))
		.reduce((sum, e) => sum + (e.cost || 0), 0);
});

const dashboardCategoryMap: Record<string, string> = {
	'purchase': 'Purchases',
	'warranty': 'Warranty',
	'replacement': 'Replacement',
	'official-service': 'Service',
	'other-service': 'Service',
	'inspection': 'Service',
	'tire-swap': 'Purchases'
};

const dashboardCategoryOrder = ['Car', 'Purchases', 'Service', 'Replacement', 'Warranty'];

export const costByCategory = derived([events, latestOdometer], ([$events, $odo]) => {
	const buckets: Record<string, number> = {};
	for (const e of $events.filter((ev) => isEffectivelyCompleted(ev, $odo.km))) {
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

export const upcomingEvents = derived([events, latestOdometer], ([$events, $odo]) => {
	return $events
		.filter((e) => !isEffectivelyCompleted(e, $odo.km))
		.sort(sortByKmAsc);
});

export const lastCompletedKm = derived([events, latestOdometer], ([$events, $odo]) => {
	const completed = $events
		.filter((e) => isEffectivelyCompleted(e, $odo.km) && e.km !== null)
		.sort((a, b) => (b.km ?? 0) - (a.km ?? 0));
	return completed.length > 0 ? completed[0].km! : 0;
});

export const scheduleEvents = derived([events, statusFilter, latestOdometer], ([$events, $filter, $odo]) => {
	const nonCompleted = $events.filter((e) => !isEffectivelyCompleted(e, $odo.km)).sort(sortByKmAsc);
	if ($filter === 'all') return nonCompleted;
	return nonCompleted.filter((e) => deriveStatus(e, $odo.km) === $filter);
});

export const nextScheduledEvent = derived([events, latestOdometer], ([$events, $odo]) => {
	const upcoming = $events
		.filter((e) => !isEffectivelyCompleted(e, $odo.km))
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
			const lastEvent = findLastServiceForInterval($events, interval, odoKm);
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

function findLastServiceForInterval(evts: CarEvent[], interval: HealthInterval, currentOdometer: number): CarEvent | null {
	const matches = evts.filter((e) => {
		if (!isEffectivelyCompleted(e, currentOdometer)) return false;
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

export type TireHealth = 'good' | 'warning' | 'overdue';

export interface TireStatus {
	currentSet: 'summer' | 'winter' | 'all-year' | null;
	profile: TireProfile | null;
	swapEvent: CarEvent | null;
	kmDriven: number;
	ageDays: number;
	kmPct: number;
	agePct: number;
	health: TireHealth;
	remainingKm: number | null;
	remainingDays: number | null;
}

function detectSeason(evt: CarEvent): 'summer' | 'winter' | 'all-year' | null {
	const tasks = evt.tasks ?? [evt.event];
	const taskStr = tasks.join(' ').toLowerCase();
	if (taskStr.includes('winter')) return 'winter';
	if (taskStr.includes('summer')) return 'summer';
	if (taskStr.includes('all-year') || taskStr.includes('all year')) return 'all-year';
	return null;
}

export const tireSwapEvents = derived([events, latestOdometer], ([$events, $odo]) => {
	return $events
		.filter((e) => isEffectivelyCompleted(e, $odo.km) && e.category === 'tire-swap' && e.km !== null)
		.sort((a, b) => {
			const diff = (b.km ?? 0) - (a.km ?? 0);
			if (diff !== 0) return diff;
			return (b.date || '').localeCompare(a.date || '');
		});
});

function parseDotCode(dot: string): number | null {
	if (!dot || dot.length !== 4) return null;
	const week = parseInt(dot.slice(0, 2), 10);
	const year = 2000 + parseInt(dot.slice(2, 4), 10);
	if (isNaN(week) || isNaN(year) || week < 1 || week > 53) return null;
	const jan1 = new Date(year, 0, 1).getTime();
	return jan1 + (week - 1) * 7 * 86400000;
}

function oldestDotDate(profile: TireProfile): number | null {
	const front = parseDotCode(profile.frontDot);
	const rear = parseDotCode(profile.rearDot ?? '');
	if (front !== null && rear !== null) return Math.min(front, rear);
	return front ?? rear;
}

function extractProfileId(evt: CarEvent): string | null {
	const match = evt.notes.match(/\bProfile:\s*(\S+)/);
	return match ? match[1] : null;
}

export const tireStatus = derived(
	[tireSwapEvents, latestOdometer, tireConfig],
	([$swapEvents, $odo, $tireCfg]): TireStatus => {
		const empty: TireStatus = {
			currentSet: null, profile: null, swapEvent: null,
			kmDriven: 0, ageDays: 0, kmPct: 0, agePct: 0,
			health: 'good', remainingKm: null, remainingDays: null
		};

		if ($swapEvents.length === 0) return empty;

		const latest = $swapEvents[0];
		const currentSet = detectSeason(latest);

		if (!currentSet || !$tireCfg) return { ...empty, currentSet, swapEvent: latest };

		const profileId = extractProfileId(latest);
		let profile: TireProfile | null = null;
		if (profileId) {
			profile = $tireCfg.profiles.find((p) => p.id === profileId && !p.archived) ?? null;
		}
		if (!profile) {
			profile = $tireCfg.profiles
				.filter((p) => p.season === currentSet && !p.archived)
				.sort((a, b) => b.id.localeCompare(a.id))[0] ?? null;
		}
		if (!profile) return { ...empty, currentSet, swapEvent: latest };

		const swapsByKm = [...$swapEvents].reverse();
		let kmDriven = 0;
		for (let i = 0; i < swapsByKm.length; i++) {
			const season = detectSeason(swapsByKm[i]);
			if (season !== currentSet) continue;
			const mountKm = swapsByKm[i].km ?? 0;
			const endKm = (i + 1 < swapsByKm.length) ? (swapsByKm[i + 1].km ?? 0) : $odo.km;
			kmDriven += Math.max(0, endKm - mountKm);
		}

		const dotDate = oldestDotDate(profile);
		const fallbackDate = latest.date ? new Date(latest.date + 'T00:00:00').getTime() : Date.now();
		const ageOrigin = dotDate ?? fallbackDate;
		const ageDays = Math.max(0, Math.round((Date.now() - ageOrigin) / 86400000));

		const kmPct = profile.maxKm > 0 ? Math.min(1, kmDriven / profile.maxKm) : 0;
		const maxDays = profile.maxMonths * 30.44;
		const agePct = maxDays > 0 ? Math.min(1, ageDays / maxDays) : 0;

		const remainingKm = profile.maxKm - kmDriven;
		const remainingDays = Math.round(maxDays - ageDays);

		const warnPct = $tireCfg.warningPct;
		let health: TireHealth = 'good';
		if (kmPct >= 1 || agePct >= 1) health = 'overdue';
		else if (kmPct >= warnPct || agePct >= warnPct) health = 'warning';

		return {
			currentSet, profile, swapEvent: latest,
			kmDriven, ageDays, kmPct, agePct,
			health, remainingKm, remainingDays
		};
	}
);
