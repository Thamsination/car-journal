<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import { token, events, filteredEvents, statusFilter, isLoading, error } from '$lib/stores';
	import { loadEvents } from '$lib/github';
	import { formatCost, formatDate, statusLabel, statusColor } from '$lib/utils';
	import type { EventStatus } from '$lib/types';

	const statuses: { value: string; label: string }[] = [
		{ value: 'all', label: 'All' },
		{ value: 'done', label: 'Done' },
		{ value: 'scheduled', label: 'Scheduled' },
		{ value: 'pending', label: 'Pending' },
		{ value: 'future', label: 'Future' }
	];

	let searchQuery = $state('');

	const displayEvents = $derived(
		$filteredEvents.filter((e) => {
			if (!searchQuery) return true;
			const q = searchQuery.toLowerCase();
			return (
				e.event.toLowerCase().includes(q) ||
				e.provider.toLowerCase().includes(q) ||
				e.notes.toLowerCase().includes(q)
			);
		})
	);

	onMount(async () => {
		if (!$token) {
			goto(`${base}/setup`);
			return;
		}
		await fetchEvents();
	});

	async function fetchEvents() {
		$isLoading = true;
		$error = null;
		try {
			$events = await loadEvents();
		} catch (e: unknown) {
			$error = e instanceof Error ? e.message : 'Failed to load events';
		} finally {
			$isLoading = false;
		}
	}
</script>

<svelte:head>
	<title>Events — G31 Journal</title>
</svelte:head>

<div class="container">
	<div class="search-bar">
		<input type="search" placeholder="Search events..." bind:value={searchQuery} />
	</div>

	<div class="filter-row">
		{#each statuses as s}
			<button
				class="filter-chip"
				class:active={$statusFilter === s.value}
				onclick={() => ($statusFilter = s.value)}
			>
				{s.label}
			</button>
		{/each}
	</div>

	{#if $isLoading}
		<div class="loading">Loading events...</div>
	{:else if $error}
		<div class="error-card">
			<p>{$error}</p>
			<button class="retry-btn" onclick={fetchEvents}>Retry</button>
		</div>
	{:else if displayEvents.length === 0}
		<div class="empty-state">
			<p>No events found</p>
		</div>
	{:else}
		<ul class="event-list">
			{#each displayEvents as event (event.id)}
				<li>
					<a href="{base}/event/{event.id}" class="event-card">
						<div class="event-header">
							<span
								class="status-badge"
								style="background: {statusColor(event.status)}"
							>
								{statusLabel(event.status)}
							</span>
							<span class="event-date">{formatDate(event.date)}</span>
						</div>
						<h3 class="event-title">{event.event}</h3>
						<div class="event-meta">
							{#if event.km}
								<span class="meta-item">{event.km.toLocaleString()} km</span>
							{/if}
							<span class="meta-item">{event.provider}</span>
							{#if event.cost > 0}
								<span class="meta-cost">{formatCost(event.cost)}</span>
							{/if}
						</div>
						{#if event.notes}
							<p class="event-notes">{event.notes}</p>
						{/if}
					</a>
				</li>
			{/each}
		</ul>
	{/if}

	<a href="{base}/event/new" class="fab" aria-label="Add new event">+</a>
</div>

<style>
	.search-bar {
		margin-bottom: 12px;
	}

	.filter-row {
		display: flex;
		gap: 8px;
		overflow-x: auto;
		padding-bottom: 4px;
		margin-bottom: 16px;
		-webkit-overflow-scrolling: touch;
	}

	.filter-chip {
		padding: 6px 14px;
		border-radius: 20px;
		font-size: 13px;
		font-weight: 500;
		white-space: nowrap;
		background: var(--color-surface);
		color: var(--color-text-secondary);
		border: 1px solid var(--color-border);
		transition: all 0.2s;
	}

	.filter-chip.active {
		background: var(--color-accent);
		color: white;
		border-color: var(--color-accent);
	}

	.event-list {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

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

	.status-badge {
		font-size: 11px;
		font-weight: 600;
		color: white;
		padding: 2px 8px;
		border-radius: 10px;
		text-transform: uppercase;
		letter-spacing: 0.3px;
	}

	.event-date {
		font-size: 13px;
		color: var(--color-text-secondary);
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

	.event-notes {
		margin-top: 6px;
		font-size: 13px;
		color: var(--color-text-secondary);
		line-height: 1.4;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.loading,
	.empty-state {
		text-align: center;
		padding: 48px 16px;
		color: var(--color-text-secondary);
	}

	.error-card {
		text-align: center;
		padding: 32px 16px;
		background: var(--color-surface);
		border-radius: var(--radius-md);
		border: 1px solid var(--color-danger);
		color: var(--color-danger);
	}

	.retry-btn {
		margin-top: 12px;
		padding: 8px 24px;
		background: var(--color-accent);
		color: white;
		border-radius: var(--radius-sm);
		font-weight: 500;
	}

	.fab {
		position: fixed;
		bottom: calc(var(--nav-height) + env(safe-area-inset-bottom, 0px) + 16px);
		right: 20px;
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: var(--color-accent);
		color: white;
		font-size: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: var(--shadow-md);
		text-decoration: none;
		z-index: 50;
		transition: transform 0.2s, background 0.2s;
	}

	.fab:active {
		transform: scale(0.92);
	}
</style>
