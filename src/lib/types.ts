export type DerivedStatus = 'completed' | 'today' | 'scheduled' | 'delayed' | 'planned' | 'backlog';

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
