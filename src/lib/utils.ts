import type { DerivedStatus, EventCategory, CarEvent, PlatformConfig, HealthConfig, TransmissionType, PlatformServiceInterval } from './types';
export type { EventCategory } from './types';

export function generateId(prefix: string): string {
	const timestamp = Date.now().toString(36);
	const random = Math.random().toString(36).substring(2, 7);
	return `${prefix}_${timestamp}_${random}`;
}

export function formatCost(amount: number, currency = 'DKK'): string {
	return new Intl.NumberFormat('da-DK', {
		style: 'currency',
		currency,
		minimumFractionDigits: 0,
		maximumFractionDigits: 0
	}).format(amount);
}

export function formatDate(dateString: string): string {
	if (!dateString) return '';
	const date = new Date(dateString + 'T00:00:00');
	return new Intl.DateTimeFormat('en-GB', {
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	}).format(date);
}

export function formatDateISO(date: Date): string {
	return date.toISOString().split('T')[0];
}

function todayISO(): string {
	return formatDateISO(new Date());
}

export function deriveStatus(evt: CarEvent, currentOdometer = 0): DerivedStatus {
	if (evt.completed) return 'completed';
	const today = todayISO();
	if (evt.km !== null && currentOdometer > 0 && currentOdometer > evt.km) return 'overdue';
	if (evt.date && evt.date < today) return 'overdue';
	return 'scheduled';
}

const statusLabels: Record<DerivedStatus, string> = {
	completed: 'Completed',
	scheduled: 'Scheduled',
	overdue: 'Overdue'
};

const statusColors: Record<DerivedStatus, string> = {
	completed: '#34c759',
	scheduled: '#007aff',
	overdue: '#ff3b30'
};

export function statusLabel(status: DerivedStatus): string {
	return statusLabels[status] || status;
}

export function statusColor(status: DerivedStatus): string {
	return statusColors[status] || '#8e8e93';
}

const ALL_CATEGORIES: EventCategory[] = ['purchase', 'warranty', 'replacement', 'official-service', 'other-service', 'inspection', 'tire-swap'];

export function allCategories(): { value: EventCategory; label: string }[] {
	return ALL_CATEGORIES.map((c) => ({ value: c, label: categoryLabels[c] }));
}

const prefixToCategory: Record<string, EventCategory> = {
	purchase: 'purchase',
	recall: 'warranty',
	replace: 'replacement',
	inspection: 'inspection',
	service: 'other-service',
	cleanse: 'other-service'
};

export function eventCategory(description: string, stored?: EventCategory): EventCategory {
	if (stored) return stored;
	const prefix = (description.split(' - ')[0] || '').toLowerCase().trim();
	return prefixToCategory[prefix] || 'other-service';
}

const categoryLabels: Record<EventCategory, string> = {
	purchase: 'Purchase',
	warranty: 'Warranty',
	replacement: 'Replacement',
	'official-service': 'Official Service',
	'other-service': 'Other Service',
	inspection: 'Inspection',
	'tire-swap': 'Tire Swap'
};

const categoryColors: Record<EventCategory, string> = {
	purchase: '#5856d6',
	warranty: '#ff3b30',
	replacement: '#ff9500',
	'official-service': '#007aff',
	'other-service': '#34c759',
	inspection: '#5ac8fa',
	'tire-swap': '#a78bfa'
};

export function categoryLabel(cat: EventCategory): string {
	return categoryLabels[cat];
}

export function categoryColor(cat: EventCategory): string {
	return categoryColors[cat];
}

export function parseCostInput(value: string): number {
	const cleaned = value.replace(/[^0-9.,\-]/g, '').replace(',', '.');
	return Math.round(parseFloat(cleaned) || 0);
}

export function getEventTasks(evt: CarEvent): string[] {
	if (evt.tasks && evt.tasks.length > 0) return evt.tasks;
	return evt.event.split(',').map(s => s.trim()).filter(Boolean);
}

export function buildEventString(tasks: string[]): string {
	const str = tasks.join(', ');
	return str.charAt(0).toUpperCase() + str.slice(1);
}

import type { ServiceMilestone, MilestoneKind } from './types';

export interface ServiceInterval {
	task: string;
	km: number | null;
	months: number | null;
	kind: MilestoneKind;
}

const MAX_SERVICE_KM = 300000;

export function getServiceNotes(platform: PlatformConfig | null): Record<string, string> {
	return platform?.serviceNotes ?? {};
}

export function filterByTransmission(
	intervals: PlatformServiceInterval[],
	transmission: TransmissionType | null | undefined
): PlatformServiceInterval[] {
	return intervals.filter((i) => {
		if (!i.transmission || i.transmission.length === 0) return true;
		if (!transmission) return true;
		return i.transmission.includes(transmission);
	});
}

export function getServiceIntervals(platform: PlatformConfig | null, transmission?: TransmissionType | null): ServiceInterval[] {
	if (!platform) return [];
	return filterByTransmission(platform.serviceIntervals, transmission);
}

interface TaskAction {
	verb: string;
	summary: string;
	why: string;
}

const TASK_ACTIONS: Record<string, TaskAction> = {
	'engine oil': { verb: 'change', summary: 'engine oil', why: 'to protect engine internals' },
	'micro filter': { verb: 'replace', summary: 'micro filter', why: 'for cabin air quality' },
	'air cleaner element': { verb: 'replace', summary: 'air cleaner element', why: 'for clean combustion air' },
	'fuel filter': { verb: 'replace', summary: 'fuel filter', why: 'to protect the injection system' },
	'vehicle check': { verb: 'perform', summary: 'vehicle check', why: 'to inspect braking and diagnostics' },
	'check front brake pads': { verb: 'inspect', summary: 'front brake pads', why: 'for safe braking' },
	'check rear brake pads': { verb: 'inspect', summary: 'rear brake pads', why: 'for safe braking' },
	'ZF8 gearbox fluid': { verb: 'change', summary: 'gearbox fluid', why: 'for smooth shifting' },
	'xDrive transfer case fluid': { verb: 'change', summary: 'transfer case fluid', why: 'to protect the xDrive system' },
	'differential fluids': { verb: 'change', summary: 'differential fluids', why: 'to prevent gear wear' },
	'timing chain': { verb: 'replace', summary: 'timing chain', why: 'to prevent engine failure' },
	'coolant flush': { verb: 'flush', summary: 'coolant', why: 'to protect the cooling system' },
	'intake carbon clean': { verb: 'clean', summary: 'intake valves', why: 'to restore engine performance' },
};

const PRESERVE_CASE = new Set(['xDrive', 'ZF8', 'EGR', 'OEM', 'CarPlay']);

export function capitalizeTask(text: string): string {
	for (const word of PRESERVE_CASE) {
		if (text.startsWith(word.toLowerCase()) || text.startsWith(word)) return text;
	}
	return text.charAt(0).toUpperCase() + text.slice(1);
}

export function milestoneActionText(tasks: string[]): string {
	if (tasks.length === 0) return '';

	const actions = tasks.map((t) => TASK_ACTIONS[t]).filter(Boolean);
	if (actions.length === 0) return capitalizeTask(tasks.join(', '));

	if (actions.length === 1) {
		const a = actions[0];
		const text = `${a.verb} ${a.summary} ${a.why}`;
		return text.charAt(0).toUpperCase() + text.slice(1);
	}

	const grouped = new Map<string, TaskAction[]>();
	for (const a of actions) {
		if (!grouped.has(a.verb)) grouped.set(a.verb, []);
		grouped.get(a.verb)!.push(a);
	}

	const parts: string[] = [];
	const whys: string[] = [];

	for (const [verb, group] of grouped) {
		const summaries = group.map((a) => a.summary).join(', ');
		parts.push(`${verb} ${summaries}`);
		for (const a of group) {
			if (!whys.includes(a.why)) whys.push(a.why);
		}
	}

	const uniqueWhys = whys.length <= 2 ? whys.join(' and ') : whys.slice(0, 2).join(' and ');
	const text = `${parts.join(', ')} ${uniqueWhys}`;
	return text.charAt(0).toUpperCase() + text.slice(1);
}

const COVER_TOLERANCE_KM = 1000;

const WEAR_BASED_TASKS = new Set(['check front brake pads', 'check rear brake pads']);

const VEHICLE_CHECK_IMPLIES = ['check front brake pads', 'check rear brake pads'];

function completedByTaskMap(events: CarEvent[]): Map<string, number[]> {
	const map = new Map<string, number[]>();
	for (const evt of events) {
		if (!evt.completed || evt.km === null) continue;
		const tasks = evt.tasks ?? [evt.event];
		for (const t of tasks) {
			const key = t.toLowerCase().trim();
			if (!map.has(key)) map.set(key, []);
			map.get(key)!.push(evt.km);
			if (key === 'vehicle check') {
				for (const implied of VEHICLE_CHECK_IMPLIES) {
					if (!map.has(implied)) map.set(implied, []);
					map.get(implied)!.push(evt.km);
				}
			}
		}
	}
	for (const [, kms] of map) kms.sort((a, b) => a - b);
	return map;
}

interface RollingMilestone {
	km: number;
	task: string;
	covered: boolean;
}

function buildRollingChain(
	task: string,
	intervalKm: number,
	doneKms: number[]
): RollingMilestone[] {
	const milestones: RollingMilestone[] = [];
	let nextDueKm = intervalKm;

	for (const dkm of doneKms) {
		while (nextDueKm <= MAX_SERVICE_KM && nextDueKm + COVER_TOLERANCE_KM < dkm) {
			milestones.push({ km: nextDueKm, task, covered: false });
			nextDueKm += intervalKm;
		}
		if (nextDueKm <= MAX_SERVICE_KM && dkm <= nextDueKm + COVER_TOLERANCE_KM) {
			milestones.push({ km: dkm, task, covered: true });
			nextDueKm = dkm + intervalKm;
		}
	}

	while (nextDueKm <= MAX_SERVICE_KM) {
		milestones.push({ km: nextDueKm, task, covered: false });
		nextDueKm += intervalKm;
	}

	return milestones;
}

function mergedDoneKms(completed: Map<string, number[]>, task: string): number[] {
	const matchKey = task.replace('check ', '');
	const exact = completed.get(task) ?? [];
	const alt = task !== matchKey ? (completed.get(matchKey) ?? []) : [];
	if (alt.length === 0) return exact;
	if (exact.length === 0) return alt;
	const merged = [...new Set([...exact, ...alt])];
	merged.sort((a, b) => a - b);
	return merged;
}

function computeIntervalMilestones(
	intervals: ServiceInterval[],
	events: CarEvent[],
	kind: MilestoneKind,
): ServiceMilestone[] {
	const completed = completedByTaskMap(events);
	const filtered = intervals.filter((i) => i.kind === kind && i.km != null);

	const allRolling: RollingMilestone[] = [];
	for (const interval of filtered) {
		const doneKms = mergedDoneKms(completed, interval.task);
		allRolling.push(...buildRollingChain(interval.task, interval.km!, doneKms));
	}

	const milestoneMap = new Map<number, { tasks: string[]; coveredTasks: Set<string> }>();
	for (const rm of allRolling) {
		if (!milestoneMap.has(rm.km)) milestoneMap.set(rm.km, { tasks: [], coveredTasks: new Set() });
		const entry = milestoneMap.get(rm.km)!;
		entry.tasks.push(rm.task);
		if (rm.covered) entry.coveredTasks.add(rm.task);
	}

	return [...milestoneMap.entries()]
		.sort(([a], [b]) => a - b)
		.map(([km, { tasks }]) => ({ km, tasks: tasks.sort(), kind }));
}

export type TaskStatus = 'covered' | 'amber' | 'red' | 'scheduled';

export interface TaskWithStatus {
	task: string;
	status: TaskStatus;
	overdueKm: number;
}

function findEarliestUncoveredKm(task: string, intervalKm: number, doneKms: number[]): number {
	const chain = buildRollingChain(task, intervalKm, doneKms);
	for (const m of chain) {
		if (!m.covered) return m.km;
	}
	return Infinity;
}

export function milestoneTaskStatuses(
	ms: ServiceMilestone,
	events: CarEvent[],
	currentOdometer: number,
	serviceIntervals: ServiceInterval[] = []
): TaskWithStatus[] {
	const completed = completedByTaskMap(events);

	const allIntervals = serviceIntervals;

	return ms.tasks.map((task) => {
		if (ms.km > currentOdometer) {
			return { task, status: 'scheduled' as TaskStatus, overdueKm: 0 };
		}

		const doneKms = mergedDoneKms(completed, task);

		const interval = allIntervals.find((i) => i.task === task);
		if (!interval || interval.km == null) {
			const hasCoveringService = doneKms.some((dkm) => dkm <= ms.km + COVER_TOLERANCE_KM);
			if (hasCoveringService) {
				return { task, status: 'covered' as TaskStatus, overdueKm: 0 };
			}
			return { task, status: 'scheduled' as TaskStatus, overdueKm: 0 };
		}

		const chain = buildRollingChain(task, interval.km, doneKms);
		const thisEntry = chain.find((m) => m.km === ms.km);
		if (thisEntry?.covered) {
			return { task, status: 'covered' as TaskStatus, overdueKm: 0 };
		}

		if (WEAR_BASED_TASKS.has(task)) {
			return { task, status: 'scheduled' as TaskStatus, overdueKm: 0 };
		}

		const earliestUncovered = findEarliestUncoveredKm(task, interval.km, doneKms);
		if (earliestUncovered > currentOdometer) {
			return { task, status: 'scheduled' as TaskStatus, overdueKm: 0 };
		}

		const overdueKm = currentOdometer - earliestUncovered;
		const hasLaterService = doneKms.some((dkm) => dkm > ms.km);
		if (hasLaterService || overdueKm <= 10000) {
			return { task, status: 'amber' as TaskStatus, overdueKm };
		}
		return { task, status: 'red' as TaskStatus, overdueKm };
	});
}

export function milestoneCardStatus(taskStatuses: TaskWithStatus[]): TaskStatus {
	if (taskStatuses.some((t) => t.status === 'red')) return 'red';
	if (taskStatuses.some((t) => t.status === 'amber')) return 'amber';
	if (taskStatuses.some((t) => t.status === 'scheduled')) return 'scheduled';
	return 'covered';
}

export function computeMfrMilestones(events: CarEvent[], serviceIntervals: ServiceInterval[] = []): ServiceMilestone[] {
	return computeIntervalMilestones(serviceIntervals, events, 'mfr');
}

export function computeRecMilestones(events: CarEvent[], serviceIntervals: ServiceInterval[] = []): ServiceMilestone[] {
	const recMilestones = computeIntervalMilestones(serviceIntervals, events, 'rec');
	const mfrMilestones = computeMfrMilestones(events, serviceIntervals);

	const mfrTasksByKm = new Map<number, Set<string>>();
	for (const ms of mfrMilestones) {
		if (!mfrTasksByKm.has(ms.km)) mfrTasksByKm.set(ms.km, new Set());
		for (const t of ms.tasks) mfrTasksByKm.get(ms.km)!.add(t);
	}

	for (const ms of recMilestones) {
		const mfrTasks = mfrTasksByKm.get(ms.km);
		if (mfrTasks) {
			ms.tasks = ms.tasks.filter((t) => !mfrTasks.has(t));
		}
	}

	return recMilestones
		.filter((ms) => ms.tasks.length > 0)
		.sort((a, b) => a.km - b.km);
}

export function milestoneId(ms: ServiceMilestone): string {
	return `${ms.kind}-${ms.km}`;
}

export interface TimeMilestone {
	task: string;
	kind: MilestoneKind;
	dueDate: string;
	estimatedKm: number;
	months: number;
	lastServiceDate: string;
	status: 'covered' | 'scheduled' | 'overdue';
}

export function computeTimeMilestones(
	intervals: ServiceInterval[],
	evts: CarEvent[],
	currentOdometer: number,
	dailyAvgKm: number,
): TimeMilestone[] {
	const timeOnly = intervals.filter((i) => i.km == null && i.months != null);
	if (timeOnly.length === 0) return [];

	const completed = completedByTaskMap(evts);
	const now = new Date();
	const results: TimeMilestone[] = [];

	const purchaseEvt = evts.find(
		(e) => e.completed && e.category === 'purchase' && (e.tasks ?? [e.event]).some((t) => t.toLowerCase() === 'car')
	);
	const purchaseDate = purchaseEvt?.date ?? null;

	for (const interval of timeOnly) {
		const months = interval.months!;
		const doneKms = mergedDoneKms(completed, interval.task);

		const matchingEvents = evts
			.filter((e) => e.completed && e.date)
			.filter((e) => {
				const tasks = (e.tasks ?? [e.event]).map((t) => t.toLowerCase().trim());
				const taskKey = interval.task.toLowerCase().trim();
				const matchKey = taskKey.replace('check ', '');
				return tasks.includes(taskKey) || tasks.includes(matchKey);
			})
			.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

		const lastDate = matchingEvents[0]?.date ?? purchaseDate;
		if (!lastDate) continue;

		const lastMs = new Date(lastDate + 'T00:00:00');
		const dueMs = new Date(lastMs);
		dueMs.setMonth(dueMs.getMonth() + months);
		const dueDate = `${dueMs.getFullYear()}-${String(dueMs.getMonth() + 1).padStart(2, '0')}`;

		const daysUntilDue = Math.round((dueMs.getTime() - now.getTime()) / 86400000);
		const estimatedKm = dailyAvgKm > 0
			? Math.round(currentOdometer + daysUntilDue * dailyAvgKm)
			: currentOdometer;

		let status: TimeMilestone['status'] = 'scheduled';
		const COVER_WINDOW_MS = 30 * 86400000;
		if (matchingEvents.length > 0) {
			const lastServiceMs = new Date(matchingEvents[0].date + 'T00:00:00').getTime();
			if (Math.abs(lastServiceMs - dueMs.getTime()) <= COVER_WINDOW_MS) {
				status = 'covered';
			} else if (daysUntilDue < 0) {
				status = 'overdue';
			}
		} else if (daysUntilDue < 0) {
			status = 'overdue';
		}

		results.push({
			task: interval.task,
			kind: interval.kind,
			dueDate,
			estimatedKm,
			months,
			lastServiceDate: lastDate,
			status,
		});
	}

	return results;
}

export function generateHealthConfig(platform: PlatformConfig, transmission?: TransmissionType | null): HealthConfig {
	const filtered = filterByTransmission(platform.serviceIntervals, transmission);
	const taskMap = new Map<string, { km: number | null; months: number | null }>();

	for (const si of filtered) {
		const key = si.task.toLowerCase();
		const existing = taskMap.get(key);
		if (!existing) {
			taskMap.set(key, { km: si.km, months: si.months });
		} else {
			if (si.km != null && (existing.km == null || si.km < existing.km)) {
				existing.km = si.km;
			}
			if (si.months != null && (existing.months == null || si.months < existing.months)) {
				existing.months = si.months;
			}
		}
	}

	const intervals: import('./types').ServiceInterval[] = [];
	for (const [task, { km, months }] of taskMap) {
		const id = task.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
		const name = task.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
		intervals.push({
			id,
			name,
			taskMatches: [task],
			intervalKm: km,
			intervalMonths: months,
		});
	}

	return { intervals };
}

export type CompletionQuality = 'green' | 'amber' | 'red';

export function completionQuality(evt: CarEvent): CompletionQuality {
	const cat = evt.category || eventCategory(evt.event);

	if (cat === 'official-service' || cat === 'tire-swap') return 'green';

	const hasCategory = !!cat;
	const hasDate = !!evt.date;
	const hasKm = evt.km !== null && evt.km > 0;
	const hasCost = typeof evt.cost === 'number';
	const hasProvider = !!evt.provider.trim();
	const hasReceipt = !!evt.receipts && evt.receipts.length > 0;

	const coreComplete = hasCategory && hasDate && hasKm && hasCost && hasProvider;

	if (!coreComplete) return 'red';
	if (!hasReceipt) return 'amber';
	return 'green';
}
