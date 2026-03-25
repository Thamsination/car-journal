<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import { token, events, latestOdometer } from '$lib/stores';
	import { loadEvents, loadHealthConfig, saveHealthConfig } from '$lib/github';
	import { formatDate } from '$lib/utils';
	import type { ServiceInterval, HealthConfig, CarEvent } from '$lib/types';

	let loading = $state(true);
	let loadError = $state('');
	let intervals = $state<ServiceInterval[]>([]);
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
			if ($events.length === 0) {
				$events = await loadEvents();
			}
			const config = await loadHealthConfig();
			intervals = config.intervals;
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

		return intervals.map((interval) => {
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
				health = 'overdue';
			} else {
				const kmOverdue = remainingKm !== null && remainingKm < 0;
				const timeOverdue = remainingDays !== null && remainingDays < 0;
				const kmWarning = remainingKm !== null && usedKmPct >= WARNING_THRESHOLD && remainingKm >= 0;
				const timeWarning = remainingDays !== null && usedTimePct >= WARNING_THRESHOLD && remainingDays >= 0;

				if (kmOverdue || timeOverdue) health = 'overdue';
				else if (kmWarning || timeWarning) health = 'warning';
			}

			return {
				interval,
				lastEvent,
				lastKm,
				lastDate,
				remainingKm,
				remainingDays,
				usedKmPct,
				usedTimePct,
				health
			};
		}).sort((a, b) => {
			const diff = healthOrder[a.health] - healthOrder[b.health];
			if (diff !== 0) return diff;
			return Math.max(b.usedKmPct, b.usedTimePct) - Math.max(a.usedKmPct, a.usedTimePct);
		});
	});

	const overallHealth = $derived.by(() => {
		if (componentStatuses.length === 0) return 'good' as const;
		if (componentStatuses.some((c) => c.health === 'overdue')) return 'bad' as const;
		if (componentStatuses.some((c) => c.health === 'warning')) return 'okay' as const;
		return 'good' as const;
	});

	const overallLabels = { good: 'Good', okay: 'Attention Needed', bad: 'Service Overdue' };
	const overallColors = { good: '#34c759', okay: '#ff9500', bad: '#ff3b30' };
	const overallIcons = { good: '✓', okay: '!', bad: '✕' };

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
		const interval = intervals.find((i) => i.id === id);
		if (!interval) return;
		editingId = id;
		editKm = interval.intervalKm?.toString() ?? '';
		editMonths = interval.intervalMonths?.toString() ?? '';
	}

	async function saveEdit() {
		if (!editingId) return;
		saving = true;
		try {
			const updated = intervals.map((i) => {
				if (i.id !== editingId) return i;
				return {
					...i,
					intervalKm: editKm ? parseInt(editKm, 10) : null,
					intervalMonths: editMonths ? parseInt(editMonths, 10) : null
				};
			});
			const config: HealthConfig = { intervals: updated };
			await saveHealthConfig(config, `Update interval: ${editingId}`);
			intervals = updated;
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
</script>

<svelte:head>
	<title>Car Health — G31 Journal</title>
</svelte:head>

<div class="container health-container">
	{#if loading}
		<div class="loading">Loading health data...</div>
	{:else if loadError}
		<div class="error-state">{loadError}</div>
	{:else}
		<div class="overall-card" style="border-color: {overallColors[overallHealth]}">
			<div class="overall-icon" style="background: {overallColors[overallHealth]}">
				{overallIcons[overallHealth]}
			</div>
			<div class="overall-text">
				<h2 style="color: {overallColors[overallHealth]}">{overallLabels[overallHealth]}</h2>
				<p class="overall-sub">
					{#if $latestOdometer.km > 0}
						{$latestOdometer.km.toLocaleString()} km{$latestOdometer.approximate ? ' (est.)' : ''}
					{:else}
						Odometer not set
					{/if}
				</p>
			</div>
		</div>

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
							{:else}
								<span class="meta-last meta-unknown">No service record found</span>
							{/if}
						</div>

						{#if comp.lastEvent}
							{@const usedPct = Math.max(comp.usedKmPct, comp.usedTimePct)}
							{@const remainPct = Math.max(0, 1 - usedPct)}
							<div class="progress-row">
								<div class="progress-bar">
									<div
										class="progress-fill"
										style="width: {remainPct * 100}%; background: {remainingColor(remainPct)}"
									></div>
								</div>
								<span class="progress-label" style="color: {remainingColor(remainPct)}">
									{Math.round(remainPct * 100)}%
								</span>
							</div>

							<div class="comp-remaining">
								{#if comp.health === 'overdue'}
									<span class="remaining-overdue">{formatRemaining(comp.remainingKm, comp.remainingDays)}</span>
								{:else}
									<span class="remaining-ok">{formatRemaining(comp.remainingKm, comp.remainingDays)} remaining</span>
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
	.health-container {
		padding-bottom: 80px;
	}

	.overall-card {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 20px;
		background: var(--color-surface);
		border: 2px solid;
		border-radius: var(--radius-lg);
		margin-bottom: 24px;
	}

	.overall-icon {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		font-size: 24px;
		font-weight: 800;
		flex-shrink: 0;
	}

	.overall-text h2 {
		font-size: 20px;
		font-weight: 700;
		margin-bottom: 2px;
	}

	.overall-sub {
		font-size: 13px;
		color: var(--color-text-secondary);
	}

	.section-title {
		font-size: 14px;
		font-weight: 700;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: 12px;
	}

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
	}

	.progress-fill {
		height: 100%;
		border-radius: 4px;
		transition: width 0.3s ease;
	}

	.progress-label {
		font-size: 12px;
		font-weight: 700;
		min-width: 36px;
		text-align: right;
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
