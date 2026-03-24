import type { EventStatus } from './types';

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

export function statusLabel(status: EventStatus): string {
	const labels: Record<EventStatus, string> = {
		done: 'Done',
		scheduled: 'Scheduled',
		future: 'Future'
	};
	return labels[status] || status;
}

export function statusColor(status: EventStatus): string {
	const colors: Record<EventStatus, string> = {
		done: 'var(--color-success)',
		scheduled: 'var(--color-warning)',
		future: 'var(--color-future)'
	};
	return colors[status] || 'var(--color-text-secondary)';
}

export type EventCategory = 'purchase' | 'recall' | 'replacement' | 'official-service' | 'other-service' | 'inspection';

const prefixToCategory: Record<string, EventCategory> = {
	purchase: 'purchase',
	recall: 'recall',
	replace: 'replacement',
	inspection: 'inspection',
	service: 'other-service',
	cleanse: 'other-service'
};

export function eventCategory(description: string): EventCategory {
	const prefix = (description.split(' - ')[0] || '').toLowerCase().trim();
	return prefixToCategory[prefix] || 'other-service';
}

const categoryLabels: Record<EventCategory, string> = {
	purchase: 'Purchase',
	recall: 'Recall',
	replacement: 'Replacement',
	'official-service': 'Official Service',
	'other-service': 'Other Service',
	inspection: 'Inspection'
};

const categoryColors: Record<EventCategory, string> = {
	purchase: '#5856d6',
	recall: '#ff3b30',
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
