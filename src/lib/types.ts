export type DerivedStatus = 'completed' | 'scheduled' | 'overdue';

export type EventCategory = 'purchase' | 'warranty' | 'replacement' | 'official-service' | 'other-service' | 'inspection';

export interface CarEvent {
	id: string;
	km: number | null;
	date: string;
	event: string;
	cost: number;
	currency: string;
	provider: string;
	notes: string;
	completed: boolean;
	category?: EventCategory;
	tasks?: string[];
	kmEstimated?: boolean;
	receipts?: string[];
	invoiceNr: string;
}

export interface Part {
	id: string;
	name: string;
	oemPartNr: string;
	brand: string;
	supplierStatus: string;
	partNr: string;
	source: string;
	price: number;
	currency: string;
	notes: string;
}

export interface EventsData {
	events: CarEvent[];
}

export interface PartsData {
	parts: Part[];
}

export interface ServiceInterval {
	id: string;
	name: string;
	taskMatches: string[];
	intervalKm: number | null;
	intervalMonths: number | null;
}

export interface HealthConfig {
	intervals: ServiceInterval[];
}

export type MilestoneKind = 'mfr' | 'rec';

export interface ServiceMilestone {
	km: number;
	tasks: string[];
	kind: MilestoneKind;
}
