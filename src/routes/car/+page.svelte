<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import {
		token, events, latestOdometer, healthIntervals, dailyAverageKm,
		vehicleConfig, tireConfig, tireStatus
	} from '$lib/stores';
	import { loadEvents, loadHealthConfig, saveHealthConfig, loadVehicleConfig, loadTireConfig } from '$lib/github';
	import { formatDate } from '$lib/utils';
	import type { HealthConfig, CarEvent, ServiceInterval } from '$lib/types';

	let loading = $state(true);
	let loadError = $state('');
	let editingId = $state<string | null>(null);
	let editKm = $state('');
	let editMonths = $state('');
	let saving = $state(false);

	onMount(async () => {
		if (!$token) {
			goto(`${base}/setup`);
			return;
		}
		try {
			const promises: Promise<void>[] = [];
			if ($events.length === 0) {
				promises.push(loadEvents().then((e) => { $events = e; }));
			}
			if ($healthIntervals.length === 0) {
				promises.push(loadHealthConfig().then((c) => { $healthIntervals = c.intervals; }));
			}
			if (!$vehicleConfig) {
				promises.push(loadVehicleConfig().then((v) => { $vehicleConfig = v; }));
			}
			if (!$tireConfig) {
				promises.push(loadTireConfig().then((t) => { $tireConfig = t; }));
			}
			await Promise.all(promises);
		} catch (e: unknown) {
			loadError = e instanceof Error ? e.message : 'Failed to load';
		} finally {
			loading = false;
		}
	});

	interface ComponentStatus {
		interval: ServiceInterval;
		lastEvent: CarEvent | null;
		lastKm: number | null;
		lastDate: string;
		remainingKm: number | null;
		remainingDays: number | null;
		usedKmPct: number;
		usedTimePct: number;
		health: 'good' | 'warning' | 'overdue';
	}

	const WARNING_THRESHOLD = 0.8;

	const componentStatuses = $derived.by((): ComponentStatus[] => {
		const odoKm = $latestOdometer.km;
		const now = Date.now();
		const healthOrder = { overdue: 0, warning: 1, good: 2 };

		return $healthIntervals.map((interval) => {
			const lastEvent = findLastService(interval);
			const lastKm = lastEvent?.km ?? null;
			const lastDate = lastEvent?.date ?? '';

			let remainingKm: number | null = null;
			let usedKmPct = 0;
			if (interval.intervalKm && lastKm !== null && odoKm > 0) {
				const nextDueKm = lastKm + interval.intervalKm;
				remainingKm = nextDueKm - odoKm;
				usedKmPct = Math.min(1, Math.max(0, (odoKm - lastKm) / interval.intervalKm));
			}

			let remainingDays: number | null = null;
			let usedTimePct = 0;
			if (interval.intervalMonths && lastDate) {
				const lastMs = new Date(lastDate + 'T00:00:00').getTime();
				const intervalMs = interval.intervalMonths * 30.44 * 86400000;
				const nextDueMs = lastMs + intervalMs;
				remainingDays = Math.round((nextDueMs - now) / 86400000);
				usedTimePct = Math.min(1, Math.max(0, (now - lastMs) / intervalMs));
			}

			let health: 'good' | 'warning' | 'overdue' = 'good';
			if (!lastEvent) {
				const firstDueKm = interval.intervalKm ?? Infinity;
				if (odoKm > 0 && odoKm >= firstDueKm) {
					health = 'overdue';
				} else if (odoKm > 0 && interval.intervalKm && odoKm >= firstDueKm * WARNING_THRESHOLD) {
					health = 'warning';
				}
			} else {
				const kmOverdue = remainingKm !== null && remainingKm < 0;
				const timeOverdue = remainingDays !== null && remainingDays < 0;
				const kmWarning = remainingKm !== null && usedKmPct >= WARNING_THRESHOLD && remainingKm >= 0;
				const timeWarning = remainingDays !== null && usedTimePct >= WARNING_THRESHOLD && remainingDays >= 0;

				if (kmOverdue || timeOverdue) health = 'overdue';
				else if (kmWarning || timeWarning) health = 'warning';
			}

			return {
				interval, lastEvent, lastKm, lastDate,
				remainingKm, remainingDays, usedKmPct, usedTimePct, health
			};
		}).sort((a, b) => {
			const diff = healthOrder[a.health] - healthOrder[b.health];
			if (diff !== 0) return diff;
			return Math.max(b.usedKmPct, b.usedTimePct) - Math.max(a.usedKmPct, a.usedTimePct);
		});
	});

	const overdueCount = $derived(componentStatuses.filter((c) => c.health === 'overdue').length);
	const warningCount = $derived(componentStatuses.filter((c) => c.health === 'warning').length);

	const overallHealth = $derived.by(() => {
		const tireIsOverdue = $tireStatus.health === 'overdue';
		const tireIsWarning = $tireStatus.health === 'warning';
		const compOverdue = overdueCount > 0;
		const compWarning = warningCount > 0;

		if (compOverdue || tireIsOverdue) return 'bad' as const;
		if (compWarning || tireIsWarning) return 'okay' as const;
		if (componentStatuses.length === 0) return 'good' as const;
		return 'good' as const;
	});

	const healthSummary = $derived.by(() => {
		const tireH = $tireStatus.health;
		const hasOverdue = overdueCount > 0 || tireH === 'overdue';
		const hasWarning = warningCount > 0 || tireH === 'warning';

		if (hasOverdue && hasWarning) return 'Your car has overdue service items and other components need attention soon.';
		if (hasOverdue) return 'Your car has overdue service items that need attention.';
		if (hasWarning) return 'Your car is in good condition but needs attention soon.';
		return 'Your car is in good condition.';
	});

	const overallColors = { good: '#34c759', okay: '#ff9500', bad: '#ff3b30' };
	const overallIcons = { good: '✓', okay: '!', bad: '✕' };

	function vehicleTitle(v: typeof $vehicleConfig): string {
		if (!v) return 'Vehicle';
		return `${v.year} ${v.make} ${v.chassis} ${v.model}`;
	}

	function findLastService(interval: ServiceInterval): CarEvent | null {
		const matches = $events.filter((e) => {
			if (!e.completed) return false;
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

	function startEdit(id: string) {
		const interval = $healthIntervals.find((i) => i.id === id);
		if (!interval) return;
		editingId = id;
		editKm = interval.intervalKm?.toString() ?? '';
		editMonths = interval.intervalMonths?.toString() ?? '';
	}

	async function saveEdit() {
		if (!editingId) return;
		saving = true;
		try {
			const updated = $healthIntervals.map((i) => {
				if (i.id !== editingId) return i;
				return {
					...i,
					intervalKm: editKm ? parseInt(editKm, 10) : null,
					intervalMonths: editMonths ? parseInt(editMonths, 10) : null
				};
			});
			const config: HealthConfig = { intervals: updated };
			await saveHealthConfig(config, `Update interval: ${editingId}`);
			$healthIntervals = updated;
			editingId = null;
		} catch {
			alert('Failed to save');
		} finally {
			saving = false;
		}
	}

	function formatRemaining(km: number | null, days: number | null): string {
		const parts: string[] = [];
		if (km !== null) {
			if (km < 0) parts.push(`${Math.abs(km).toLocaleString()} km overdue`);
			else parts.push(`${km.toLocaleString()} km`);
		}
		if (days !== null) {
			if (days < 0) parts.push(`${Math.abs(days)} days overdue`);
			else if (days > 365) parts.push(`${Math.round(days / 30)} months`);
			else parts.push(`${days} days`);
		}
		return parts.join(' · ') || 'No data';
	}

	function remainingColor(remainPct: number): string {
		if (remainPct <= 0) return '#ff3b30';
		if (remainPct <= (1 - WARNING_THRESHOLD)) return '#ff9500';
		return '#34c759';
	}

	function tireHealthColor(h: string): string {
		if (h === 'overdue') return '#ff3b30';
		if (h === 'warning') return '#ff9500';
		return '#34c759';
	}
</script>

<svelte:head>
	<title>Car — G31 Journal</title>
</svelte:head>

<div class="container car-container">
	{#if loading}
		<div class="loading">Loading car data...</div>
	{:else if loadError}
		<div class="error-state">{loadError}</div>
	{:else}
		<!-- Vehicle Info -->
		<div class="vehicle-card">
			<div class="vehicle-identity">
				<h2 class="vehicle-name">{vehicleTitle($vehicleConfig)}</h2>
				{#if $vehicleConfig}
					<span class="vehicle-detail">{$vehicleConfig.engine} · {$vehicleConfig.drivetrain}</span>
				{/if}
			</div>
			<div class="vehicle-odo">
				<span class="odo-value">
					{$latestOdometer.source === 'estimated' ? '~' : ''}{$latestOdometer.km.toLocaleString()}{$latestOdometer.source === 'event' ? '+' : ''}
				</span>
				<span class="odo-unit">km</span>
			</div>
			{#if $latestOdometer.source === 'estimated' && $dailyAverageKm > 0}
				<span class="odo-source">Estimated · {$dailyAverageKm} km/day avg</span>
			{:else if $latestOdometer.source === 'manual'}
				<span class="odo-source">Manually set</span>
			{:else if $latestOdometer.source === 'event'}
				<span class="odo-source">Based on last completed event</span>
			{/if}
		</div>

		<!-- Health Summary -->
		<div class="summary-card" style="border-color: {overallColors[overallHealth]}">
			<div class="summary-icon" style="background: {overallColors[overallHealth]}">
				{overallIcons[overallHealth]}
			</div>
			<p class="summary-text">{healthSummary}</p>
		</div>

		<!-- Tire Status -->
		{#if $tireStatus.currentSet}
			{@const tire = $tireStatus}
			<h3 class="section-title">Tires</h3>
			<div
				class="tire-card"
				class:tire-overdue={tire.health === 'overdue'}
				class:tire-warning={tire.health === 'warning'}
			>
				<div class="tire-header">
					<span class="tire-set">{tire.profile?.label ?? tire.currentSet} tires</span>
					<span class="tire-health-badge" style="color: {tireHealthColor(tire.health)}">
						{tire.health === 'good' ? 'Good' : tire.health === 'warning' ? 'Wear soon' : 'Replace'}
					</span>
				</div>
				{#if tire.profile}
					<span class="tire-detail">{tire.profile.brand} {tire.profile.model} · {tire.profile.size}</span>
				{/if}

				<div class="tire-stats">
					<div class="tire-stat">
						<span class="tire-stat-label">Km driven</span>
						<span class="tire-stat-value">{tire.kmDriven.toLocaleString()} km</span>
						<div class="progress-bar">
							<div
								class="progress-fill"
								style="width: {Math.min(100, tire.kmPct * 100)}%; background: {remainingColor(Math.max(0, 1 - tire.kmPct))}"
							></div>
						</div>
						{#if tire.remainingKm !== null}
							<span class="tire-stat-remaining" style="color: {tire.remainingKm < 0 ? '#ff3b30' : 'var(--color-text-secondary)'}">
								{#if tire.remainingKm < 0}
									{Math.abs(tire.remainingKm).toLocaleString()} km overdue
								{:else}
									{tire.remainingKm.toLocaleString()} km remaining
								{/if}
							</span>
						{/if}
					</div>

					<div class="tire-stat">
						<span class="tire-stat-label">Age</span>
						<span class="tire-stat-value">
							{#if tire.ageDays > 365}
								{Math.floor(tire.ageDays / 365)}y {Math.round((tire.ageDays % 365) / 30)}m
							{:else if tire.ageDays > 30}
								{Math.round(tire.ageDays / 30)} months
							{:else}
								{tire.ageDays} days
							{/if}
						</span>
						<div class="progress-bar">
							<div
								class="progress-fill"
								style="width: {Math.min(100, tire.agePct * 100)}%; background: {remainingColor(Math.max(0, 1 - tire.agePct))}"
							></div>
						</div>
						{#if tire.remainingDays !== null}
							<span class="tire-stat-remaining" style="color: {tire.remainingDays < 0 ? '#ff3b30' : 'var(--color-text-secondary)'}">
								{#if tire.remainingDays < 0}
									{Math.abs(tire.remainingDays)} days overdue
								{:else if tire.remainingDays > 365}
									{Math.round(tire.remainingDays / 30)} months remaining
								{:else}
									{tire.remainingDays} days remaining
								{/if}
							</span>
						{/if}
					</div>
				</div>

				{#if tire.swapEvent}
					<span class="tire-swap-date">Mounted: {formatDate(tire.swapEvent.date)} · {(tire.swapEvent.km ?? 0).toLocaleString()} km</span>
				{/if}
			</div>
		{/if}

		<!-- Component Status -->
		<h3 class="section-title">Component Status</h3>

		<div class="component-list">
			{#each componentStatuses as comp}
				<div
					class="comp-card"
					class:comp-overdue={comp.health === 'overdue'}
					class:comp-warning={comp.health === 'warning'}
					class:comp-clickable={editingId !== comp.interval.id && !!comp.lastEvent}
					onclick={() => {
						if (editingId !== comp.interval.id && comp.lastEvent) {
							goto(`${base}/timeline?focus=${comp.lastEvent.id}`);
						}
					}}
					role={editingId !== comp.interval.id && comp.lastEvent ? 'link' : undefined}
					tabindex={editingId !== comp.interval.id && comp.lastEvent ? 0 : undefined}
				>
					<div class="comp-header">
						<span class="comp-name">{comp.interval.name}</span>
						<button class="comp-edit" onclick={(e) => { e.stopPropagation(); startEdit(comp.interval.id); }} aria-label="Edit interval">✎</button>
					</div>

					{#if editingId === comp.interval.id}
						<div class="edit-row">
							<div class="edit-field">
								<label>Interval (km)</label>
								<input type="number" bind:value={editKm} placeholder="e.g. 30000" inputmode="numeric" />
							</div>
							<div class="edit-field">
								<label>Interval (months)</label>
								<input type="number" bind:value={editMonths} placeholder="e.g. 24" inputmode="numeric" />
							</div>
						</div>
						<div class="edit-actions">
							<button class="edit-cancel" onclick={() => (editingId = null)}>Cancel</button>
							<button class="edit-save" onclick={saveEdit} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
						</div>
					{:else}
						<div class="comp-meta">
							{#if comp.lastEvent}
								<span class="meta-last">Last: {formatDate(comp.lastDate)}{comp.lastKm ? ` · ${comp.lastKm.toLocaleString()} km` : ''}</span>
							{:else if comp.health === 'overdue'}
								<span class="meta-last meta-unknown">No service record found</span>
							{:else}
								<span class="meta-last">First service at {(comp.interval.intervalKm ?? 0).toLocaleString()} km</span>
							{/if}
						</div>

						{#if comp.lastEvent}
							{@const usedPct = Math.max(comp.usedKmPct, comp.usedTimePct)}
							{@const remainPct = Math.max(0, 1 - usedPct)}
							<div class="progress-row">
								<span class="progress-label" style="color: {remainingColor(remainPct)}">
									{Math.round(remainPct * 100)}%
								</span>
								<div class="progress-bar">
									<div
										class="progress-fill"
										style="width: {remainPct * 100}%; background: {remainingColor(remainPct)}"
									></div>
								</div>
							</div>

							<div class="comp-remaining">
								{#if comp.health === 'overdue'}
									<span class="remaining-overdue">{formatRemaining(comp.remainingKm, comp.remainingDays)}</span>
								{:else}
									<span class="remaining-ok">{formatRemaining(comp.remainingKm, comp.remainingDays)} remaining</span>
								{/if}
							</div>
						{:else if comp.interval.intervalKm && $latestOdometer.km > 0}
							{@const usedPct = Math.min(1, Math.max(0, $latestOdometer.km / comp.interval.intervalKm))}
							{@const remainPct = Math.max(0, 1 - usedPct)}
							{@const remainingKm = comp.interval.intervalKm - $latestOdometer.km}
							<div class="progress-row">
								<span class="progress-label" style="color: {remainingColor(remainPct)}">
									{Math.round(remainPct * 100)}%
								</span>
								<div class="progress-bar">
									<div
										class="progress-fill"
										style="width: {remainPct * 100}%; background: {remainingColor(remainPct)}"
									></div>
								</div>
							</div>

							<div class="comp-remaining">
								{#if remainingKm > 0}
									<span class="remaining-ok">{remainingKm.toLocaleString()} km remaining</span>
								{:else}
									<span class="remaining-overdue">{Math.abs(remainingKm).toLocaleString()} km overdue</span>
								{/if}
							</div>
						{/if}

						<div class="comp-interval">
							{#if comp.interval.intervalKm}
								<span>Every {comp.interval.intervalKm.toLocaleString()} km</span>
							{/if}
							{#if comp.interval.intervalMonths}
								<span>Every {comp.interval.intervalMonths} months</span>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.car-container {
		padding-bottom: 80px;
	}

	/* Vehicle card */
	.vehicle-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 20px 16px 16px;
		margin-bottom: 12px;
		text-align: center;
	}

	.vehicle-identity {
		margin-bottom: 12px;
	}

	.vehicle-name {
		font-size: 18px;
		font-weight: 700;
		letter-spacing: -0.3px;
		margin-bottom: 2px;
	}

	.vehicle-detail {
		font-size: 13px;
		color: var(--color-text-secondary);
	}

	.vehicle-odo {
		display: flex;
		align-items: baseline;
		justify-content: center;
		gap: 6px;
	}

	.odo-value {
		font-size: 32px;
		font-weight: 800;
		letter-spacing: -1px;
	}

	.odo-unit {
		font-size: 15px;
		font-weight: 500;
		color: var(--color-text-secondary);
	}

	.odo-source {
		display: block;
		margin-top: 4px;
		font-size: 11px;
		color: var(--color-text-secondary);
		text-align: center;
	}

	/* Health summary */
	.summary-card {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 16px;
		background: var(--color-surface);
		border: 2px solid;
		border-radius: var(--radius-lg);
		margin-bottom: 24px;
	}

	.summary-icon {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		font-size: 20px;
		font-weight: 800;
		flex-shrink: 0;
	}

	.summary-text {
		font-size: 14px;
		line-height: 1.4;
		color: var(--color-text);
	}

	/* Section title */
	.section-title {
		font-size: 14px;
		font-weight: 700;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: 12px;
	}

	/* Tire card */
	.tire-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: 14px 16px;
		margin-bottom: 24px;
	}

	.tire-card.tire-overdue {
		border-left: 4px solid #ff3b30;
	}

	.tire-card.tire-warning {
		border-left: 4px solid #ff9500;
	}

	.tire-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 4px;
	}

	.tire-set {
		font-size: 15px;
		font-weight: 600;
		text-transform: capitalize;
	}

	.tire-health-badge {
		font-size: 12px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.3px;
	}

	.tire-detail {
		font-size: 12px;
		color: var(--color-text-secondary);
		display: block;
		margin-bottom: 12px;
	}

	.tire-stats {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
		margin-bottom: 10px;
	}

	.tire-stat {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.tire-stat-label {
		font-size: 11px;
		font-weight: 600;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.3px;
	}

	.tire-stat-value {
		font-size: 14px;
		font-weight: 600;
	}

	.tire-stat-remaining {
		font-size: 11px;
	}

	.tire-swap-date {
		font-size: 11px;
		color: var(--color-text-secondary);
	}

	/* Component list */
	.component-list {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.comp-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: 14px 16px;
	}

	.comp-card.comp-clickable {
		cursor: pointer;
	}

	.comp-card.comp-clickable:active {
		opacity: 0.85;
	}

	.comp-card.comp-overdue {
		border-left: 4px solid #ff3b30;
	}

	.comp-card.comp-warning {
		border-left: 4px solid #ff9500;
	}

	.comp-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 6px;
	}

	.comp-name {
		font-size: 15px;
		font-weight: 600;
	}

	.comp-edit {
		font-size: 16px;
		color: var(--color-text-secondary);
		background: none;
		border: none;
		padding: 4px 8px;
		cursor: pointer;
	}

	.comp-meta {
		margin-bottom: 8px;
	}

	.meta-last {
		font-size: 12px;
		color: var(--color-text-secondary);
	}

	.meta-unknown {
		color: #ff3b30;
		font-weight: 500;
	}

	.progress-row {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 6px;
	}

	.progress-bar {
		flex: 1;
		height: 8px;
		background: var(--color-border);
		border-radius: 4px;
		overflow: hidden;
		display: flex;
	}

	.progress-fill {
		height: 100%;
		border-radius: 4px;
		transition: width 0.3s ease;
		margin-left: auto;
	}

	.progress-label {
		font-size: 12px;
		font-weight: 700;
		min-width: 36px;
		text-align: left;
	}

	.comp-remaining {
		margin-bottom: 6px;
	}

	.remaining-ok {
		font-size: 13px;
		color: var(--color-text);
		font-weight: 500;
	}

	.remaining-overdue {
		font-size: 13px;
		color: #ff3b30;
		font-weight: 600;
	}

	.comp-interval {
		display: flex;
		gap: 12px;
		font-size: 11px;
		color: var(--color-text-secondary);
	}

	.edit-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		margin: 8px 0;
	}

	.edit-field label {
		display: block;
		font-size: 11px;
		font-weight: 600;
		color: var(--color-text-secondary);
		margin-bottom: 4px;
	}

	.edit-actions {
		display: flex;
		gap: 8px;
		margin-top: 8px;
	}

	.edit-cancel {
		flex: 1;
		padding: 8px;
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: 13px;
		color: var(--color-text);
	}

	.edit-save {
		flex: 1;
		padding: 8px;
		background: var(--color-accent);
		color: white;
		border-radius: var(--radius-sm);
		font-size: 13px;
		font-weight: 600;
	}

	.edit-save:disabled {
		opacity: 0.6;
	}

	.loading, .error-state {
		text-align: center;
		padding: 48px 16px;
		color: var(--color-text-secondary);
	}
</style>
