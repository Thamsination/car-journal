<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import {
		token, events, idriveRecords, totalSpent, totalPlanned, costByCategory,
		nextBatchEvents, vehicle, latestOdometer, lastCompletedKm, dailyAverageKm,
		nextScheduledEvent
	} from '$lib/stores';
	import { loadEvents, loadVehicle, loadIDriveHistory } from '$lib/github';
	import {
		formatCost, formatDateISO, deriveStatus, statusColor,
		eventCategory, categoryLabel, categoryColor
	} from '$lib/utils';
	import type { CarEvent, DerivedStatus } from '$lib/types';

	let loading = $state(true);

	onMount(async () => {
		if (!$token) {
			goto(`${base}/setup`);
			return;
		}
		try {
			const [evts, veh, idrive] = await Promise.all([
				loadEvents(),
				loadVehicle(),
				loadIDriveHistory()
			]);
			$events = evts;
			$vehicle = veh;
			$idriveRecords = idrive;
		} catch {
			// data may not exist yet
		} finally {
			loading = false;
		}
	});

	const completedCount = $derived($events.filter((e) => e.completed).length + $idriveRecords.length);
	const upcomingCount = $derived($events.filter((e) => !e.completed).length);

	function goCompleted() {
		goto(`${base}/history`);
	}

	function goUpcoming() {
		goto(`${base}/schedule`);
	}

	function smartStatusText(evt: CarEvent, status: DerivedStatus, odoKm: number): string {
		if (status === 'today') return 'Today';
		if (status === 'scheduled' && evt.date) {
			const today = new Date(formatDateISO(new Date()) + 'T00:00:00');
			const target = new Date(evt.date + 'T00:00:00');
			const days = Math.round((target.getTime() - today.getTime()) / 86400000);
			return days === 1 ? 'In 1 day' : `In ${days} days`;
		}
		if (status === 'delayed' && evt.km !== null && odoKm > 0) {
			const overdue = odoKm - evt.km;
			if (overdue > 0) return `Overdue ${overdue.toLocaleString()} km`;
		}
		if (status === 'planned') return 'Planned';
		if (status === 'backlog') return 'Backlog';
		if (status === 'delayed') return 'Delayed';
		return '';
	}
</script>

<svelte:head>
	<title>Dashboard — G31 Journal</title>
</svelte:head>

<div class="container">
	{#if loading}
		<div class="loading">Loading dashboard...</div>
	{:else}
		<!-- 1. Odometer -->
		<div class="hero-card">
			<div class="odometer">
				<span class="odo-value">
					{$latestOdometer.source === 'estimated' ? '~' : ''}{$latestOdometer.km.toLocaleString()}{$latestOdometer.source === 'event' ? '+' : ''}
				</span>
				<span class="odo-unit">km</span>
			</div>
			{#if $latestOdometer.source === 'bmw'}
				<span class="odo-source">BMW synced {new Date($vehicle.lastSynced ?? '').toLocaleDateString('en-GB')}</span>
			{:else if $latestOdometer.source === 'manual'}
				<span class="odo-source">Manually set</span>
			{:else if $latestOdometer.source === 'estimated'}
				<span class="odo-source">Estimated · {$dailyAverageKm} km/day avg</span>
			{:else if $latestOdometer.source === 'event'}
				<span class="odo-source">Based on last completed event</span>
			{/if}
		</div>

		<!-- 2. Completed / Upcoming counters -->
		<div class="stats-grid">
			<button class="stat-card tappable" onclick={goCompleted}>
				<span class="stat-value">{completedCount}</span>
				<span class="stat-label">Completed</span>
			</button>

			<button class="stat-card tappable" onclick={goUpcoming}>
				<span class="stat-value">{upcomingCount}</span>
				<span class="stat-label">Upcoming</span>
			</button>
		</div>

		<!-- 3. Next Scheduled (single card, schedule-style) -->
		{#if $nextScheduledEvent}
			{@const nse = $nextScheduledEvent}
			{@const nseStatus = deriveStatus(nse)}
			{@const nseText = smartStatusText(nse, nseStatus, $latestOdometer.km)}
			<section class="section">
				<h3 class="section-title">Next Scheduled</h3>
				<a href="{base}/schedule/{nse.id}" class="event-card">
					<div class="event-header">
						<span
							class="category-badge"
							style="background: {categoryColor(eventCategory(nse.event, nse.category))}"
						>
							{categoryLabel(eventCategory(nse.event, nse.category))}
						</span>
						<span class="status-text" style="color: {statusColor(nseStatus)}">
							{nseText}
						</span>
					</div>
					<h3 class="event-title">{nse.event}</h3>
					<div class="event-meta">
						{#if nse.km}
							<span class="meta-item">{nse.km.toLocaleString()} km</span>
						{/if}
						{#if nse.provider}
							<span class="meta-item">{nse.provider}</span>
						{/if}
						{#if nse.cost > 0}
							<span class="meta-cost">{formatCost(nse.cost)}</span>
						{/if}
					</div>
					{#if $latestOdometer.km > 0 && nse.km}
						{@const remaining = nse.km - $latestOdometer.km}
						{@const totalWindow = nse.km - $lastCompletedKm}
						{@const driven = $latestOdometer.km - $lastCompletedKm}
						{#if remaining > 0}
							<div class="km-remaining">
								<div class="progress-bar">
									<div
										class="progress-fill"
										style="width: {totalWindow > 0 ? Math.min(100, Math.max(3, (driven / totalWindow) * 100)) : 5}%"
									></div>
								</div>
								<span class="remaining-text">{remaining.toLocaleString()} km remaining</span>
							</div>
						{:else}
							<span class="overdue-text">Overdue by {Math.abs(remaining).toLocaleString()} km</span>
						{/if}
					{/if}
				</a>
			</section>
		{/if}

		<!-- 4. Upcoming Services batch (schedule-style cards with KM tracker) -->
		{#if $nextBatchEvents.length > 0}
			<section class="section">
				<h3 class="section-title">Upcoming Services — {$nextBatchEvents[0].km?.toLocaleString()} km</h3>
				<div class="card-list">
					{#each $nextBatchEvents as evt}
						{@const evtStatus = deriveStatus(evt)}
						{@const evtText = smartStatusText(evt, evtStatus, $latestOdometer.km)}
						<a href="{base}/schedule/{evt.id}" class="event-card">
							<div class="event-header">
								<span
									class="category-badge"
									style="background: {categoryColor(eventCategory(evt.event, evt.category))}"
								>
									{categoryLabel(eventCategory(evt.event, evt.category))}
								</span>
								<span class="status-text" style="color: {statusColor(evtStatus)}">
									{evtText}
								</span>
							</div>
							<h3 class="event-title">{evt.event}</h3>
							<div class="event-meta">
								{#if evt.km}
									<span class="meta-item">{evt.km.toLocaleString()} km</span>
								{/if}
								{#if evt.provider}
									<span class="meta-item">{evt.provider}</span>
								{/if}
								{#if evt.cost > 0}
									<span class="meta-cost">{formatCost(evt.cost)}</span>
								{/if}
							</div>
							{#if $latestOdometer.km > 0 && evt.km}
								{@const remaining = evt.km - $latestOdometer.km}
								{@const totalWindow = evt.km - $lastCompletedKm}
								{@const driven = $latestOdometer.km - $lastCompletedKm}
								{#if remaining > 0}
									<div class="km-remaining">
										<div class="progress-bar">
											<div
												class="progress-fill"
												style="width: {totalWindow > 0 ? Math.min(100, Math.max(3, (driven / totalWindow) * 100)) : 5}%"
											></div>
										</div>
										<span class="remaining-text">{remaining.toLocaleString()} km remaining</span>
									</div>
								{:else}
									<span class="overdue-text">Overdue by {Math.abs(remaining).toLocaleString()} km</span>
								{/if}
							{/if}
						</a>
					{/each}
				</div>
			</section>
		{/if}

		<!-- 5. Total Spent -->
		<div class="stat-card accent total-spent">
			<span class="stat-value">{formatCost($totalSpent)}</span>
			<span class="stat-label">Total Spent</span>
		</div>

		<!-- 6. Cost Breakdown -->
		{#if $costByCategory.length > 0 || $totalPlanned > 0}
			<section class="section">
				<h3 class="section-title">Cost Breakdown</h3>
				<div class="breakdown-list">
					{#each $costByCategory as cat}
						<div class="breakdown-row">
							<span class="breakdown-name">{cat.name}</span>
							<span class="breakdown-value">{formatCost(cat.total)}</span>
						</div>
					{/each}
					{#if $totalPlanned > 0}
						<div class="breakdown-row planned">
							<span class="breakdown-name">Planned (upcoming)</span>
							<span class="breakdown-value">{formatCost($totalPlanned)}</span>
						</div>
					{/if}
				</div>
			</section>
		{/if}
	{/if}
</div>

<style>
	.hero-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 24px 16px 16px;
		text-align: center;
		margin-bottom: 12px;
	}

	.odometer {
		display: flex;
		align-items: baseline;
		justify-content: center;
		gap: 6px;
	}

	.odo-value {
		font-size: 36px;
		font-weight: 800;
		letter-spacing: -1px;
	}

	.odo-unit {
		font-size: 16px;
		font-weight: 500;
		color: var(--color-text-secondary);
	}

	.odo-source {
		display: block;
		margin-top: 4px;
		font-size: 11px;
		color: var(--color-text-secondary);
	}

	.stats-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
		margin-bottom: 24px;
	}

	.stat-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: 16px;
		text-align: center;
		color: var(--color-text);
	}

	.stat-card.tappable {
		cursor: pointer;
		transition: box-shadow 0.2s;
	}

	.stat-card.tappable:active {
		box-shadow: var(--shadow-md);
	}

	.stat-value {
		display: block;
		font-size: 22px;
		font-weight: 700;
		margin-bottom: 2px;
	}

	.stat-label {
		font-size: 12px;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.section {
		margin-bottom: 24px;
	}

	.section-title {
		font-size: 15px;
		font-weight: 700;
		margin-bottom: 10px;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	/* Shared card styles matching Schedule page */
	.event-card {
		display: block;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: 14px 16px;
		text-decoration: none;
		color: var(--color-text);
		transition: box-shadow 0.2s;
	}

	.event-card:active {
		box-shadow: var(--shadow-md);
	}

	.event-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 6px;
	}

	.category-badge {
		font-size: 11px;
		font-weight: 600;
		color: white;
		padding: 2px 8px;
		border-radius: 10px;
		text-transform: uppercase;
		letter-spacing: 0.3px;
	}

	.status-text {
		font-size: 12px;
		font-weight: 600;
		white-space: nowrap;
	}

	.event-title {
		font-size: 16px;
		font-weight: 600;
		margin-bottom: 6px;
	}

	.event-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
		font-size: 13px;
		color: var(--color-text-secondary);
	}

	.meta-item::after {
		content: '·';
		margin-left: 8px;
		color: var(--color-border);
	}

	.meta-item:last-of-type::after {
		content: '';
	}

	.meta-cost {
		font-weight: 600;
		color: var(--color-text);
		margin-left: auto;
	}

	.km-remaining {
		margin-top: 8px;
	}

	.progress-bar {
		height: 4px;
		background: var(--color-border);
		border-radius: 2px;
		overflow: hidden;
		margin-bottom: 4px;
	}

	.progress-fill {
		height: 100%;
		background: var(--color-accent);
		border-radius: 2px;
		transition: width 0.3s;
	}

	.remaining-text {
		font-size: 12px;
		color: var(--color-text-secondary);
	}

	.overdue-text {
		font-size: 12px;
		color: var(--color-danger);
		font-weight: 600;
		margin-top: 4px;
		display: block;
	}

	.card-list {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.total-spent {
		margin-bottom: 16px;
		background: var(--color-accent);
		border-color: var(--color-accent);
		color: white;
	}

	.total-spent .stat-label {
		color: rgba(255, 255, 255, 0.8);
	}

	.breakdown-list {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.breakdown-row {
		display: flex;
		justify-content: space-between;
		padding: 12px 16px;
		border-bottom: 1px solid var(--color-border);
		font-size: 14px;
	}

	.breakdown-row:last-child {
		border-bottom: none;
	}

	.breakdown-name {
		color: var(--color-text-secondary);
	}

	.breakdown-value {
		font-weight: 600;
	}

	.breakdown-row.planned {
		opacity: 0.7;
		font-style: italic;
	}

	.loading {
		text-align: center;
		padding: 48px 16px;
		color: var(--color-text-secondary);
	}
</style>
