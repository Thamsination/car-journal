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

export type CompletionQuality = 'green' | 'amber' | 'red';

export function completionQuality(evt: CarEvent): CompletionQuality {
	const cat = evt.category || eventCategory(evt.event);
	const hasCategory = !!cat;
	const hasDate = !!evt.date;
	const hasKm = evt.km !== null && evt.km > 0;
	const hasCost = typeof evt.cost === 'number';
	const providerRequired = cat !== 'official-service';
	const hasProvider = !providerRequired || !!evt.provider.trim();
	const hasReceipt = !!evt.receipts && evt.receipts.length > 0;

	const coreComplete = hasCategory && hasDate && hasKm && hasCost && hasProvider;

	if (!coreComplete) return 'red';
	if (!hasReceipt) return 'amber';
	return 'green';
}
