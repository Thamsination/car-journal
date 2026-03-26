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

import type { ServiceMilestone, MilestoneKind } from './types';

interface ServiceInterval {
	task: string;
	km: number;
	kind: MilestoneKind;
}

const SERVICE_INTERVALS: ServiceInterval[] = [
	{ task: 'engine oil', km: 30000, kind: 'mfr' },
	{ task: 'micro filter', km: 30000, kind: 'mfr' },
	{ task: 'air cleaner element', km: 60000, kind: 'mfr' },
	{ task: 'fuel filter', km: 60000, kind: 'mfr' },
	{ task: 'check front brake pads', km: 50000, kind: 'mfr' },
	{ task: 'check rear brake pads', km: 60000, kind: 'mfr' },
	{ task: 'vehicle check', km: 60000, kind: 'mfr' },
	{ task: 'engine oil', km: 10000, kind: 'rec' },
	{ task: 'ZF8 gearbox fluid', km: 100000, kind: 'rec' },
	{ task: 'xDrive transfer case fluid', km: 80000, kind: 'rec' },
	{ task: 'differential fluids', km: 80000, kind: 'rec' },
	{ task: 'timing chain', km: 200000, kind: 'rec' },
	{ task: 'coolant flush', km: 120000, kind: 'rec' },
	{ task: 'intake carbon clean', km: 120000, kind: 'rec' },
];

const MAX_SERVICE_KM = 300000;

export const SERVICE_NOTES: Record<string, string> = {
	'engine oil': 'BMW CBS scheduled service. Engine oil degrades with mileage and time, losing its lubricating and cooling properties. Regular replacement protects engine internals from premature wear.',
	'micro filter': 'BMW CBS scheduled service. The cabin micro filter traps pollen, dust and pollutants. A clogged filter reduces airflow and cabin air quality.',
	'air cleaner element': 'BMW CBS scheduled service (every 4th oil service). The engine air filter ensures clean air enters the combustion chamber. A dirty filter reduces performance and fuel efficiency.',
	'fuel filter': 'BMW CBS scheduled service (every 4th oil service). The fuel filter removes contaminants from diesel fuel before it reaches the injectors, preventing damage to the high-pressure fuel system.',
	'check front brake pads': 'BMW CBS wear-based reminder. Brake pad thickness should be inspected to ensure safe braking performance. The B47 520d xDrive is heavier than RWD variants, increasing front brake wear.',
	'check rear brake pads': 'BMW CBS wear-based reminder. Rear brake pads typically last longer than fronts but still require periodic inspection for safe operation.',
	'ZF8 gearbox fluid': 'ZF recommends fluid replacement every 100,000 km despite BMW classifying it as a "lifetime fill." The ZF 8HP transmission fluid degrades over time, and fresh fluid maintains smooth shifting and extends gearbox life.',
	'xDrive transfer case fluid': 'The xDrive transfer case distributes torque between front and rear axles. Fluid degrades under load and heat, and replacement prevents premature wear of internal components.',
	'differential fluids': 'Front and rear differential fluids lubricate the gears that transfer power to the wheels. Regular replacement prevents excessive wear and ensures smooth operation, especially under heavy load.',
	'timing chain': 'The B47 diesel timing chain is located at the rear of the engine. While more reliable than the earlier N47, preventive replacement around 200,000 km avoids the risk of catastrophic engine failure from a stretched or broken chain.',
	'coolant flush': 'Engine coolant loses its anti-corrosion properties over time. A flush removes deposits and replenishes protection for the cooling system, water pump, and heater core.',
	'intake carbon clean': 'Direct injection diesel engines accumulate carbon deposits on intake valves since fuel is not sprayed over them. Carbon buildup restricts airflow, reducing power and efficiency. Walnut blasting or chemical cleaning restores performance.',
	'vehicle check': 'BMW CBS scheduled inspection (typically every 2nd oil service). A comprehensive inspection covering braking systems, vehicle diagnostics, and technical components. The exact interval is determined by the car\'s CBS computer based on driving style and conditions.',
	'fuel system cleanse': 'A diesel fuel additive cleans injectors, the fuel pump, and combustion chambers. Best used before an oil change so any loosened deposits are captured by the oil filter being replaced.',
};

function computeIntervalMilestones(
	intervals: ServiceInterval[],
	events: CarEvent[],
	kind: MilestoneKind
): ServiceMilestone[] {
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
	const filtered = intervals.filter((i) => i.kind === kind);

	for (const interval of filtered) {
		const matchKey = interval.task.replace('check ', '');
		const doneKms = (
			completedByTask.get(interval.task) ??
			completedByTask.get(matchKey) ??
			[]
		).sort((a, b) => a - b);

		const lastDoneKm = doneKms.length > 0 ? doneKms[doneKms.length - 1] : 0;
		let nextDueKm = lastDoneKm > 0
			? lastDoneKm + interval.km
			: interval.km;

		while (nextDueKm <= MAX_SERVICE_KM) {
			if (!milestoneMap.has(nextDueKm)) milestoneMap.set(nextDueKm, []);
			milestoneMap.get(nextDueKm)!.push(interval.task);
			nextDueKm += interval.km;
		}
	}

	return [...milestoneMap.entries()]
		.sort(([a], [b]) => a - b)
		.map(([km, tasks]) => ({ km, tasks: tasks.sort(), kind }));
}

export function computeMfrMilestones(events: CarEvent[]): ServiceMilestone[] {
	return computeIntervalMilestones(SERVICE_INTERVALS, events, 'mfr');
}

export function computeRecMilestones(events: CarEvent[]): ServiceMilestone[] {
	const recMilestones = computeIntervalMilestones(SERVICE_INTERVALS, events, 'rec');

	const mfrMilestones = computeMfrMilestones(events);

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

	const oilKms = mfrMilestones
		.filter((ms) => ms.tasks.includes('engine oil'))
		.map((ms) => ms.km);

	for (const oilKm of oilKms) {
		const cleanseKm = oilKm - 1000;
		if (cleanseKm > 0 && cleanseKm <= MAX_SERVICE_KM) {
			const existing = recMilestones.find((ms) => ms.km === cleanseKm);
			if (existing) {
				if (!existing.tasks.includes('fuel system cleanse')) {
					existing.tasks.push('fuel system cleanse');
					existing.tasks.sort();
				}
			} else {
				recMilestones.push({ km: cleanseKm, tasks: ['fuel system cleanse'], kind: 'rec' });
			}
		}
	}

	return recMilestones
		.filter((ms) => ms.tasks.length > 0)
		.sort((a, b) => a.km - b.km);
}

export function milestoneId(ms: ServiceMilestone): string {
	return `${ms.kind}-${ms.km}`;
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
