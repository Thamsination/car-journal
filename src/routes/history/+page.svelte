<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { events, completedEvents, idriveRecords } from '$lib/stores';
	import { loadEvents, loadIDriveHistory } from '$lib/github';
	import { formatCost, formatDate, eventCategory, categoryLabel, categoryColor } from '$lib/utils';
	import type { CarEvent, IDriveRecord } from '$lib/types';

	type TimelineItem =
		| { kind: 'journal'; data: CarEvent }
		| { kind: 'idrive'; data: IDriveRecord };

	let loading = $state(true);
	let loadError = $state('');
	let searchQuery = $state('');

	onMount(async () => {
		try {
			const [evts, records] = await Promise.all([
				$events.length === 0 ? loadEvents() : Promise.resolve($events),
				loadIDriveHistory()
			]);
			if ($events.length === 0) $events = evts;
			$idriveRecords = records;
		} catch (e: unknown) {
			loadError = e instanceof Error ? e.message : 'Failed to load history';
		} finally {
			loading = false;
		}
	});

	function formatIDriveDate(dateStr: string): string {
		if (!dateStr || dateStr.length !== 8) return dateStr;
		const y = dateStr.slice(0, 4);
		const m = dateStr.slice(4, 6);
		const d = dateStr.slice(6, 8);
		return `${y}-${m}-${d}`;
	}

	function idriveKm(record: IDriveRecord): number {
		return record.km ?? 0;
	}

	const timeline = $derived.by(() => {
		const items: TimelineItem[] = [];

		for (const evt of $completedEvents) {
			items.push({ kind: 'journal', data: evt });
		}
		for (const rec of $idriveRecords) {
			items.push({ kind: 'idrive', data: rec });
		}

		items.sort((a, b) => {
			const aDate = a.kind === 'journal' ? (a.data as CarEvent).date : formatIDriveDate((a.data as IDriveRecord).date);
			const bDate = b.kind === 'journal' ? (b.data as CarEvent).date : formatIDriveDate((b.data as IDriveRecord).date);
			if (aDate !== bDate) return (bDate || '').localeCompare(aDate || '');

			const aKm = a.kind === 'journal' ? (a.data as CarEvent).km ?? -1 : idriveKm(a.data as IDriveRecord);
			const bKm = b.kind === 'journal' ? (b.data as CarEvent).km ?? -1 : idriveKm(b.data as IDriveRecord);
			return bKm - aKm;
		});

		if (!searchQuery) return items;
		const q = searchQuery.toLowerCase();
		return items.filter((item) => {
			if (item.kind === 'journal') {
				const d = item.data as CarEvent;
				return d.event.toLowerCase().includes(q) || d.provider.toLowerCase().includes(q) || d.notes.toLowerCase().includes(q);
			}
			const d = item.data as IDriveRecord;
			return d.event.toLowerCase().includes(q) || d.serviceNr.toLowerCase().includes(q);
		});
	});
</script>

<svelte:head>
	<title>History — G31 Journal</title>
</svelte:head>

<div class="container">
	<h2 class="page-title">History</h2>
	<p class="page-subtitle">Completed work and iDrive service records</p>

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
			{#each timeline as item, i}
				<li class="history-card">
					<div class="history-marker">
						<div class="marker-dot" class:idrive={item.kind === 'idrive'}></div>
						{#if i < timeline.length - 1}
							<div class="marker-line"></div>
						{/if}
					</div>

					{#if item.kind === 'journal'}
						{@const evt = item.data as CarEvent}
						{@const cat = eventCategory(evt.event)}
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
					{:else}
						{@const rec = item.data as IDriveRecord}
						<div class="history-content">
							<div class="history-header">
								<span class="history-date">{formatDate(formatIDriveDate(rec.date))}</span>
								<span class="category-badge" style="background: {categoryColor('official-service')}">{categoryLabel('official-service')}</span>
							</div>
							<p class="history-event">{rec.event}</p>
							<div class="history-meta">
								<span>{rec.km.toLocaleString()} km</span>
								<span>Service: {rec.serviceNr}</span>
							</div>
						</div>
					{/if}
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
