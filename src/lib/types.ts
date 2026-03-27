export type DerivedStatus = 'completed' | 'scheduled' | 'overdue';

export type EventCategory = 'purchase' | 'warranty' | 'replacement' | 'official-service' | 'other-service' | 'inspection' | 'tire-swap';

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

export interface ServiceSchedule {
	milestones: ServiceMilestone[];
}

export interface VehicleConfig {
	name: string;
	licensePlate: string;
	vin: string;
	platform: string;
	year: number;
	make: string;
	model: string;
	chassis: string;
	engine: string;
	drivetrain: string;
}

export type TireSeason = 'summer' | 'winter' | 'all-year';

export interface TireProfile {
	id: string;
	season: TireSeason;
	brand: string;
	model: string;
	frontSize: string;
	rearSize: string | null;
	frontDot: string;
	rearDot: string | null;
	maxKm: number;
	maxMonths: number;
	archived?: boolean;
}

export interface TireConfig {
	profiles: TireProfile[];
	warningPct: number;
}

export interface VehicleRegistryEntry {
	id: string;
	label: string;
}

export interface VehiclesRegistry {
	vehicles: VehicleRegistryEntry[];
	activeVehicle: string;
}

export interface PlatformServiceInterval {
	task: string;
	km: number;
	kind: MilestoneKind;
}

export interface PlatformConfig {
	id: string;
	name: string;
	years: string;
	chassisCodes: string[];
	serviceIntervals: PlatformServiceInterval[];
	serviceNotes: Record<string, string>;
	milestones: { km: number; tasks: string[] }[];
}
