<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { token, repoOwner, repoName, events, parts, manualOdometer, latestOdometer } from '$lib/stores';

	let odoInput = $state($manualOdometer?.toString() ?? '');
	let odoSaved = $state(false);

	function saveOdometer() {
		const val = parseInt(odoInput, 10);
		$manualOdometer = val > 0 ? val : null;
		odoSaved = true;
		setTimeout(() => (odoSaved = false), 2000);
	}

	function clearOdometer() {
		odoInput = '';
		$manualOdometer = null;
		odoSaved = true;
		setTimeout(() => (odoSaved = false), 2000);
	}

	function handleLogout() {
		if (!confirm('Disconnect from GitHub? Your data is safe in the repository.')) return;
		$token = '';
		$events = [];
		$parts = [];
		goto(`${base}/setup`);
	}

	function exportCsv() {
		const header = 'KM,Date,Event,Cost (DKK),Provider,Notes,Completed,Invoice nr';
		const rows = $events.map((e) =>
			[
				e.km ?? '',
				e.date,
				`"${e.event.replace(/"/g, '""')}"`,
				e.cost,
				`"${e.provider.replace(/"/g, '""')}"`,
				`"${e.notes.replace(/"/g, '""')}"`,
				e.completed ? 'Yes' : 'No',
				e.invoiceNr
			].join(',')
		);
		const csv = [header, ...rows].join('\n');
		const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'car-journal-events.csv';
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<svelte:head>
	<title>Settings — Car Journal</title>
</svelte:head>

<div class="container">
	<div class="page-header">
		<a href="{base}/" class="back-btn">← Back</a>
		<h2>Settings</h2>
	</div>

	<div class="settings-card">
		<div class="setting-row">
			<span class="setting-label">Repository</span>
			<span class="setting-value">{$repoOwner}/{$repoName}</span>
		</div>
		<div class="setting-row">
			<span class="setting-label">Token</span>
			<span class="setting-value">••••••{$token.slice(-4)}</span>
		</div>
	</div>

	<div class="settings-card">
		<h3 class="card-title">Odometer</h3>
		<p class="card-desc">
			{#if $latestOdometer.source === 'manual'}
				Manual: {$latestOdometer.km.toLocaleString()} km
			{:else if $latestOdometer.source === 'estimated'}
				Estimated: ~{$latestOdometer.km.toLocaleString()} km
			{:else if $latestOdometer.source === 'event'}
				From completed event: {$latestOdometer.km.toLocaleString()}+ km
			{:else}
				No odometer data available
			{/if}
		</p>
		<div class="odo-input-row">
			<input
				type="number"
				inputmode="numeric"
				placeholder="e.g. 187045"
				bind:value={odoInput}
				class="odo-input"
			/>
			<button class="odo-save-btn" onclick={saveOdometer}>
				{odoSaved ? 'Saved!' : 'Set'}
			</button>
		</div>
		{#if $manualOdometer}
			<button class="odo-clear-btn" onclick={clearOdometer}>Clear manual odometer</button>
		{/if}
	</div>

	<div class="actions">
		<button class="action-btn export" onclick={exportCsv}>
			Export Events as CSV
		</button>
		<button class="action-btn logout" onclick={handleLogout}>
			Disconnect
		</button>
	</div>

	<p class="version-info">Car Journal</p>
</div>

<style>
	.page-header {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 20px;
	}

	.page-header h2 {
		font-size: 20px;
		font-weight: 700;
	}

	.back-btn {
		font-size: 14px;
		color: var(--color-accent);
		text-decoration: none;
	}

	.settings-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		margin-bottom: 24px;
		overflow: hidden;
	}

	.setting-row {
		display: flex;
		justify-content: space-between;
		padding: 14px 16px;
		border-bottom: 1px solid var(--color-border);
	}

	.setting-row:last-child {
		border-bottom: none;
	}

	.setting-label {
		color: var(--color-text-secondary);
		font-size: 14px;
	}

	.setting-value {
		font-size: 14px;
		font-weight: 500;
		font-family: monospace;
	}

	.card-title {
		font-size: 15px;
		font-weight: 700;
		padding: 14px 16px 0;
	}

	.card-desc {
		font-size: 13px;
		color: var(--color-text-secondary);
		padding: 4px 16px 0;
	}

	.odo-input-row {
		display: flex;
		gap: 8px;
		padding: 12px 16px;
	}

	.odo-input {
		flex: 1;
		padding: 10px 12px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: 15px;
		background: var(--color-bg);
		color: var(--color-text);
	}

	.odo-save-btn {
		padding: 10px 20px;
		background: var(--color-accent);
		color: white;
		border-radius: var(--radius-sm);
		font-size: 14px;
		font-weight: 600;
		white-space: nowrap;
	}

	.odo-clear-btn {
		display: block;
		width: 100%;
		padding: 10px 16px;
		background: none;
		color: var(--color-danger);
		font-size: 13px;
		font-weight: 500;
		text-align: center;
		border-top: 1px solid var(--color-border);
	}

	.actions {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.action-btn {
		width: 100%;
		padding: 14px;
		border-radius: var(--radius-sm);
		font-size: 15px;
		font-weight: 600;
		text-align: center;
	}

	.action-btn.export {
		background: var(--color-surface);
		color: var(--color-accent);
		border: 1px solid var(--color-accent);
	}

	.action-btn.logout {
		background: none;
		color: var(--color-danger);
		border: 1px solid var(--color-danger);
	}

	.version-info {
		text-align: center;
		font-size: 12px;
		color: var(--color-text-secondary);
		margin-top: 32px;
	}
</style>
