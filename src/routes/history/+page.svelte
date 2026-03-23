<script lang="ts">
	import { onMount } from 'svelte';
	import { idriveRecords } from '$lib/stores';
	import { loadIDriveHistory } from '$lib/github';

	let loading = $state(true);
	let loadError = $state('');

	onMount(async () => {
		try {
			$idriveRecords = await loadIDriveHistory();
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
		return new Date(`${y}-${m}-${d}`).toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>iDrive History — G31 Journal</title>
</svelte:head>

<div class="container">
	<h2 class="page-title">iDrive Service History</h2>
	<p class="page-subtitle">Service records from the vehicle's digital service book</p>

	{#if loading}
		<div class="loading">Loading history...</div>
	{:else if loadError}
		<div class="error-state">{loadError}</div>
	{:else if $idriveRecords.length === 0}
		<div class="empty-state">No iDrive records found</div>
	{:else}
		<ul class="history-list">
			{#each $idriveRecords as record, i}
				<li class="history-card">
					<div class="history-marker">
						<div class="marker-dot"></div>
						{#if i < $idriveRecords.length - 1}
							<div class="marker-line"></div>
						{/if}
					</div>
					<div class="history-content">
						<div class="history-header">
							<span class="history-date">{formatIDriveDate(record.date)}</span>
							<span class="history-km">{record.km.toLocaleString()} km</span>
						</div>
						<p class="history-event">{record.event}</p>
						<span class="history-service">Service: {record.serviceNr}</span>
					</div>
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
		margin-bottom: 20px;
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

	.history-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 6px;
	}

	.history-date {
		font-size: 13px;
		font-weight: 600;
		color: var(--color-accent);
	}

	.history-km {
		font-size: 12px;
		color: var(--color-text-secondary);
	}

	.history-event {
		font-size: 14px;
		font-weight: 500;
		margin-bottom: 4px;
		line-height: 1.4;
	}

	.history-service {
		font-size: 12px;
		color: var(--color-text-secondary);
	}

	.loading, .empty-state, .error-state {
		text-align: center;
		padding: 48px 16px;
		color: var(--color-text-secondary);
	}
</style>
