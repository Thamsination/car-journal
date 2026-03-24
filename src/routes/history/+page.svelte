<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { events, completedEvents } from '$lib/stores';
	import { loadEvents } from '$lib/github';
	import { formatCost, formatDate, eventCategory, categoryLabel, categoryColor } from '$lib/utils';

	let loading = $state(true);
	let loadError = $state('');
	let searchQuery = $state('');

	onMount(async () => {
		try {
			if ($events.length === 0) {
				$events = await loadEvents();
			}
		} catch (e: unknown) {
			loadError = e instanceof Error ? e.message : 'Failed to load history';
		} finally {
			loading = false;
		}
	});

	const timeline = $derived.by(() => {
		const items = [...$completedEvents];

		if (!searchQuery) return items;
		const q = searchQuery.toLowerCase();
		return items.filter((evt) =>
			evt.event.toLowerCase().includes(q) ||
			evt.provider.toLowerCase().includes(q) ||
			evt.notes.toLowerCase().includes(q)
		);
	});
</script>

<svelte:head>
	<title>History — G31 Journal</title>
</svelte:head>

<div class="container">
	<h2 class="page-title">History</h2>
	<p class="page-subtitle">Completed work</p>

	<div class="search-bar">
		<input type="search" placeholder="Search history..." bind:value={searchQuery} />
	</div>

	{#if loading}
		<div class="loading">Loading history...</div>
	{:else if loadError}
		<div class="error-state">{loadError}</div>
	{:else if timeline.length === 0}
		<div class="empty-state">No history found</div>
	{:else}
		<ul class="history-list">
			{#each timeline as evt, i}
				{@const cat = eventCategory(evt.event, evt.category)}
				<li class="history-card">
					<div class="history-marker">
						<div class="marker-dot"></div>
						{#if i < timeline.length - 1}
							<div class="marker-line"></div>
						{/if}
					</div>

					<a href="{base}/schedule/{evt.id}" class="history-content">
						<div class="history-header">
							<span class="history-date">{formatDate(evt.date)}</span>
							<span class="category-badge" style="background: {categoryColor(cat)}">{categoryLabel(cat)}</span>
						</div>
						<p class="history-event">{evt.event}</p>
						<div class="history-meta">
							{#if evt.km}
								<span>{evt.km.toLocaleString()} km</span>
							{/if}
							{#if evt.provider}
								<span>{evt.provider}</span>
							{/if}
							{#if evt.cost > 0}
								<span class="history-cost">{formatCost(evt.cost)}</span>
							{/if}
						</div>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.page-title {
		font-size: 20px;
		font-weight: 700;
		margin-bottom: 4px;
	}

	.page-subtitle {
		font-size: 13px;
		color: var(--color-text-secondary);
		margin-bottom: 16px;
	}

	.search-bar {
		margin-bottom: 16px;
	}

	.history-list {
		list-style: none;
	}

	.history-card {
		display: flex;
		gap: 12px;
	}

	.history-marker {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 16px;
		flex-shrink: 0;
	}

	.marker-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--color-accent);
		flex-shrink: 0;
		margin-top: 6px;
	}

	.marker-line {
		flex: 1;
		width: 2px;
		background: var(--color-border);
		margin: 4px 0;
	}

	.history-content {
		flex: 1;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: 12px 14px;
		margin-bottom: 8px;
	}

	a.history-content {
		text-decoration: none;
		color: var(--color-text);
		transition: box-shadow 0.2s;
	}

	a.history-content:active {
		box-shadow: var(--shadow-md);
	}

	.history-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 6px;
	}

	.history-date {
		font-size: 13px;
		font-weight: 600;
		color: var(--color-text-secondary);
	}

	.category-badge {
		font-size: 10px;
		font-weight: 600;
		padding: 2px 7px;
		border-radius: 8px;
		text-transform: uppercase;
		letter-spacing: 0.3px;
		color: white;
	}

	.history-event {
		font-size: 14px;
		font-weight: 500;
		margin-bottom: 4px;
		line-height: 1.4;
	}

	.history-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		font-size: 12px;
		color: var(--color-text-secondary);
	}

	.history-cost {
		font-weight: 600;
		color: var(--color-text);
	}

	.loading, .empty-state, .error-state {
		text-align: center;
		padding: 48px 16px;
		color: var(--color-text-secondary);
	}
</style>
