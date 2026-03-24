<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import {
		token, events, totalSpent, totalPlanned, costByCategory,
		nextBatchEvents, vehicle, latestOdometer,
		nextScheduledEvent
	} from '$lib/stores';
	import { loadEvents, loadVehicle } from '$lib/github';
	import { formatCost, formatDate, deriveStatus, statusColor, eventCategory, categoryColor } from '$lib/utils';

	let loading = $state(true);

	onMount(async () => {
		if (!$token) {
			goto(`${base}/setup`);
			return;
		}
		try {
			$events = await loadEvents();
			$vehicle = await loadVehicle();
		} catch {
			// data may not exist yet
		} finally {
			loading = false;
		}
	});

	const completedCount = $derived($events.filter((e) => e.completed).length);
	const upcomingCount = $derived($events.filter((e) => !e.completed).length);

	function goCompleted() {
		goto(`${base}/history`);
	}

	function goUpcoming() {
		goto(`${base}/schedule`);
	}
</script>

<svelte:head>
	<title>Dashboard — G31 Journal</title>
</svelte:head>

<div class="container">
	{#if loading}
		<div class="loading">Loading dashboard...</div>
	{:else}
		<div class="hero-card">
			<div class="odometer">
				<span class="odo-value">
					{$latestOdometer.km.toLocaleString()}{$latestOdometer.approximate ? '+' : ''}
				</span>
				<span class="odo-unit">km</span>
			</div>
			{#if $vehicle.lastSynced}
				<span class="odo-source">BMW synced {new Date($vehicle.lastSynced).toLocaleDateString('en-GB')}</span>
			{:else if $latestOdometer.approximate}
				<span class="odo-source">Based on last completed event</span>
			{/if}
		</div>

		{#if $nextScheduledEvent}
			<a href="{base}/schedule/{$nextScheduledEvent.id}" class="next-task-card">
				<span class="next-label">Next Scheduled</span>
				<span class="next-event">{$nextScheduledEvent.event}</span>
				<div class="next-meta">
					{#if $nextScheduledEvent.date}
						<span>{formatDate($nextScheduledEvent.date)}</span>
					{/if}
					{#if $nextScheduledEvent.km}
						<span>{$nextScheduledEvent.km.toLocaleString()} km</span>
					{/if}
					{#if $nextScheduledEvent.provider}
						<span>{$nextScheduledEvent.provider}</span>
					{/if}
				</div>
			</a>
		{/if}

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

		{#if $nextBatchEvents.length > 0}
			<section class="section">
				<h3 class="section-title">Upcoming Services — {$nextBatchEvents[0].km?.toLocaleString()} km</h3>
				<div class="upcoming-list">
					{#each $nextBatchEvents as evt}
						<a href="{base}/schedule/{evt.id}" class="upcoming-card">
							<div class="upcoming-header">
								<span class="upcoming-event">{evt.event}</span>
								<span
									class="status-dot"
									style="background: {categoryColor(eventCategory(evt.event, evt.category))}"
								></span>
							</div>
							<div class="upcoming-meta">
								{#if evt.date}
									<span>{formatDate(evt.date)}</span>
								{/if}
								{#if evt.cost > 0}
									<span>{formatCost(evt.cost)}</span>
								{/if}
								{#if evt.provider}
									<span>{evt.provider}</span>
								{/if}
							</div>
							{#if $latestOdometer.km > 0 && evt.km}
								{@const remaining = evt.km - $latestOdometer.km}
								{#if remaining > 0}
									<div class="km-remaining">
										<div class="progress-bar">
											<div
												class="progress-fill"
												style="width: {Math.min(100, Math.max(5, (1 - remaining / 20000) * 100))}%"
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

		<div class="stat-card accent total-spent">
			<span class="stat-value">{formatCost($totalSpent)}</span>
			<span class="stat-label">Total Spent</span>
		</div>

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

	.next-task-card {
		display: block;
		background: var(--color-accent);
		border-radius: var(--radius-md);
		padding: 14px 16px;
		margin-bottom: 12px;
		text-decoration: none;
		color: white;
	}

	.next-label {
		display: block;
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		opacity: 0.8;
		margin-bottom: 4px;
	}

	.next-event {
		display: block;
		font-size: 16px;
		font-weight: 700;
		margin-bottom: 4px;
	}

	.next-meta {
		display: flex;
		gap: 12px;
		font-size: 13px;
		opacity: 0.85;
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

	.upcoming-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.upcoming-card {
		display: block;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: 14px 16px;
		text-decoration: none;
		color: var(--color-text);
	}

	.upcoming-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 4px;
	}

	.upcoming-event {
		font-weight: 600;
		font-size: 14px;
	}

	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.upcoming-meta {
		display: flex;
		gap: 12px;
		font-size: 13px;
		color: var(--color-text-secondary);
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

	.total-spent {
		margin-bottom: 16px;
		background: var(--color-accent);
		border-color: var(--color-accent);
		color: white;
	}

	.total-spent .stat-label {
		color: rgba(255, 255, 255, 0.8);
	}

	.loading {
		text-align: center;
		padding: 48px 16px;
		color: var(--color-text-secondary);
	}
</style>
