<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { events, totalCost, costByCategory, upcomingEvents, vehicle } from '$lib/stores';
	import { loadEvents, loadVehicle } from '$lib/github';
	import { formatCost, formatDate, statusColor, statusLabel } from '$lib/utils';

	let loading = $state(true);

	onMount(async () => {
		try {
			if ($events.length === 0) {
				$events = await loadEvents();
			}
			$vehicle = await loadVehicle();
		} catch {
			// data may not exist yet
		} finally {
			loading = false;
		}
	});

	const completedCount = $derived($events.filter((e) => e.status === 'done').length);
	const pendingCount = $derived($events.filter((e) => e.status !== 'done').length);
</script>

<svelte:head>
	<title>Dashboard — G31 Journal</title>
</svelte:head>

<div class="container">
	{#if loading}
		<div class="loading">Loading dashboard...</div>
	{:else}
		<div class="stats-grid">
			<div class="stat-card accent">
				<span class="stat-value">{formatCost($totalCost)}</span>
				<span class="stat-label">Total Spent</span>
			</div>

			{#if $vehicle.odometer}
				<div class="stat-card">
					<span class="stat-value">{$vehicle.odometer.toLocaleString()}</span>
					<span class="stat-label">Current KM</span>
				</div>
			{/if}

			<div class="stat-card">
				<span class="stat-value">{completedCount}</span>
				<span class="stat-label">Completed</span>
			</div>

			<div class="stat-card">
				<span class="stat-value">{pendingCount}</span>
				<span class="stat-label">Upcoming</span>
			</div>
		</div>

		{#if $upcomingEvents.length > 0}
			<section class="section">
				<h3 class="section-title">Upcoming Services</h3>
				<div class="upcoming-list">
					{#each $upcomingEvents as evt}
						<a href="{base}/event/{evt.id}" class="upcoming-card">
							<div class="upcoming-header">
								<span class="upcoming-event">{evt.event}</span>
								<span
									class="status-dot"
									style="background: {statusColor(evt.status)}"
								></span>
							</div>
							<div class="upcoming-meta">
								{#if evt.km}
									<span>{evt.km.toLocaleString()} km</span>
								{/if}
								{#if evt.date}
									<span>{formatDate(evt.date)}</span>
								{/if}
								{#if evt.cost > 0}
									<span>{formatCost(evt.cost)}</span>
								{/if}
							</div>
							{#if $vehicle.odometer && evt.km}
								{@const remaining = evt.km - $vehicle.odometer}
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

		{#if $costByCategory.length > 0}
			<section class="section">
				<h3 class="section-title">Cost Breakdown</h3>
				<div class="breakdown-list">
					{#each $costByCategory as cat}
						<div class="breakdown-row">
							<span class="breakdown-name">{cat.name}</span>
							<span class="breakdown-value">{formatCost(cat.total)}</span>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		{#if $vehicle.lastSynced}
			<p class="sync-info">
				Odometer synced {new Date($vehicle.lastSynced).toLocaleDateString('en-GB')}
			</p>
		{/if}
	{/if}
</div>

<style>
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
	}

	.stat-card.accent {
		grid-column: 1 / -1;
		background: var(--color-accent);
		border-color: var(--color-accent);
		color: white;
	}

	.stat-value {
		display: block;
		font-size: 22px;
		font-weight: 700;
		margin-bottom: 2px;
	}

	.stat-label {
		font-size: 12px;
		opacity: 0.7;
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

	.sync-info {
		text-align: center;
		font-size: 12px;
		color: var(--color-text-secondary);
		margin-top: 16px;
	}

	.loading {
		text-align: center;
		padding: 48px 16px;
		color: var(--color-text-secondary);
	}
</style>
