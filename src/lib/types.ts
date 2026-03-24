export type EventStatus = 'done' | 'scheduled' | 'future';

export type EventCategory = 'purchase' | 'recall' | 'replacement' | 'official-service' | 'other-service' | 'inspection';

export interface CarEvent {
	id: string;
	km: number | null;
	date: string;
	event: string;
	cost: number;
	currency: string;
	provider: string;
	notes: string;
	status: EventStatus;
	category?: EventCategory;
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

export interface IDriveRecord {
	status: string;
	date: string;
	km: number;
	serviceNr: string;
	event: string;
}

export interface VehicleStatus {
	vin: string;
	odometer: number | null;
	fuelLevel: number | null;
	lastSynced: string | null;
}

export interface EventsData {
	events: CarEvent[];
}

export interface PartsData {
	parts: Part[];
}

export interface IDriveData {
	records: IDriveRecord[];
}
