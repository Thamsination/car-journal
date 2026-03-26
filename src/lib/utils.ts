import type { DerivedStatus, EventCategory, CarEvent } from './types';
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

export function deriveStatus(evt: CarEvent): DerivedStatus {
	const today = todayISO();
	if (evt.completed) return 'completed';
	if (evt.date === today) return 'today';
	if (evt.date && evt.date > today) return 'scheduled';
	if (evt.date && evt.date < today) return 'delayed';
	if (evt.km !== null) return 'planned';
	return 'backlog';
}

const statusLabels: Record<DerivedStatus, string> = {
	completed: 'Completed',
	today: 'Today',
	scheduled: 'Scheduled',
	delayed: 'Delayed',
	planned: 'Planned',
	backlog: 'Backlog'
};

const statusColors: Record<DerivedStatus, string> = {
	completed: '#34c759',
	today: '#ff9500',
	scheduled: '#007aff',
	delayed: '#ff3b30',
	planned: '#8e8e93',
	backlog: '#636366'
};

export function statusLabel(status: DerivedStatus): string {
	return statusLabels[status] || status;
}

export function statusColor(status: DerivedStatus): string {
	return statusColors[status] || '#8e8e93';
}

const ALL_CATEGORIES: EventCategory[] = ['purchase', 'warranty', 'replacement', 'official-service', 'other-service', 'inspection'];

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
	inspection: 'Inspection'
};

const categoryColors: Record<EventCategory, string> = {
	purchase: '#5856d6',
	warranty: '#ff3b30',
	replacement: '#ff9500',
	'official-service': '#007aff',
	'other-service': '#34c759',
	inspection: '#5ac8fa'
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

import type { ServiceMilestone } from './types';

interface MfrInterval {
	task: string;
	km: number;
}

const MFR_INTERVALS: MfrInterval[] = [
	{ task: 'engine oil', km: 30000 },
	{ task: 'micro filter', km: 30000 },
	{ task: 'air cleaner element', km: 60000 },
	{ task: 'fuel filter', km: 60000 },
	{ task: 'front brake pads', km: 50000 },
	{ task: 'rear brake pads', km: 60000 },
	{ task: 'ZF8 gearbox fluid', km: 100000 },
	{ task: 'xDrive transfer case fluid', km: 80000 },
	{ task: 'differential fluids', km: 80000 },
	{ task: 'timing chain', km: 200000 },
	{ task: 'coolant flush', km: 120000 },
	{ task: 'intake carbon clean', km: 120000 },
];

const MAX_MFR_KM = 300000;

export function computeMfrMilestones(events: CarEvent[]): ServiceMilestone[] {
	const completedByTask = new Map<string, number[]>();
	for (const evt of events) {
		if (!evt.completed || evt.km === null) continue;
		const tasks = evt.tasks ?? [evt.event];
		for (const t of tasks) {
			const key = t.toLowerCase().trim();
			if (!completedByTask.has(key)) completedByTask.set(key, []);
			completedByTask.get(key)!.push(evt.km);
		}
	}

	const milestoneMap = new Map<number, string[]>();

	for (const interval of MFR_INTERVALS) {
		const doneKms = (completedByTask.get(interval.task) ?? []).sort((a, b) => a - b);

		let nextDueKm = interval.km;
		let doneIdx = 0;

		while (nextDueKm <= MAX_MFR_KM) {
			while (doneIdx < doneKms.length && doneKms[doneIdx] < nextDueKm) {
				nextDueKm = doneKms[doneIdx] + interval.km;
				doneIdx++;
			}
			if (nextDueKm > MAX_MFR_KM) break;

			if (doneIdx < doneKms.length && doneKms[doneIdx] === nextDueKm) {
				nextDueKm = doneKms[doneIdx] + interval.km;
				doneIdx++;
				continue;
			}

			if (!milestoneMap.has(nextDueKm)) milestoneMap.set(nextDueKm, []);
			milestoneMap.get(nextDueKm)!.push(interval.task);
			nextDueKm += interval.km;
		}
	}

	const oilMilestoneKms = [...milestoneMap.entries()]
		.filter(([, tasks]) => tasks.includes('engine oil'))
		.map(([km]) => km);

	for (const oilKm of oilMilestoneKms) {
		const cleanseKm = oilKm - 1000;
		if (cleanseKm > 0 && cleanseKm <= MAX_MFR_KM) {
			if (!milestoneMap.has(cleanseKm)) milestoneMap.set(cleanseKm, []);
			milestoneMap.get(cleanseKm)!.push('fuel system cleanse');
		}
	}

	return [...milestoneMap.entries()]
		.sort(([a], [b]) => a - b)
		.map(([km, tasks]) => ({ km, tasks: tasks.sort() }));
}

export type CompletionQuality = 'green' | 'amber' | 'red';

export function completionQuality(evt: CarEvent): CompletionQuality {
	const cat = evt.category || eventCategory(evt.event);

	if (cat === 'official-service') return 'green';

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
