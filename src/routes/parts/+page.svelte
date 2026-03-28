<script lang="ts">
	import { onMount } from 'svelte';
	import { parts } from '$lib/stores';
	import { loadParts, saveParts } from '$lib/data';
	import { formatCost, generateId } from '$lib/utils';
	import type { Part } from '$lib/types';

	let loading = $state(true);
	let loadError = $state('');
	let searchQuery = $state('');
	let editingId = $state<string | null>(null);
	let addingNew = $state(false);
	let saving = $state(false);

	let form = $state<Part>(emptyPart());

	function emptyPart(): Part {
		return {
			id: generateId('part'),
			name: '',
			oemPartNr: '',
			brand: '',
			supplierStatus: '',
			partNr: '',
			source: '',
			price: 0,
			currency: 'DKK',
			notes: ''
		};
	}

	const displayParts = $derived(
		$parts.filter((p) => {
			if (!searchQuery) return true;
			const q = searchQuery.toLowerCase();
			return (
				p.name.toLowerCase().includes(q) ||
				p.brand.toLowerCase().includes(q) ||
				p.oemPartNr.toLowerCase().includes(q) ||
				p.partNr.toLowerCase().includes(q)
			);
		})
	);

	onMount(async () => {
		try {
			$parts = await loadParts();
		} catch (e: unknown) {
			loadError = e instanceof Error ? e.message : 'Failed to load parts';
		} finally {
			loading = false;
		}
	});

	function startEdit(part: Part) {
		editingId = part.id;
		form = { ...part };
		addingNew = false;
	}

	function startAdd() {
		form = emptyPart();
		addingNew = true;
		editingId = null;
	}

	function cancelEdit() {
		editingId = null;
		addingNew = false;
	}

	async function handleSave() {
		if (!form.name.trim()) return;
		saving = true;
		try {
			let updated: Part[];
			if (addingNew) {
				updated = [...$parts, { ...form }];
				await saveParts(updated, `Add part: ${form.name}`);
			} else {
				updated = $parts.map((p) => (p.id === form.id ? { ...form } : p));
				await saveParts(updated, `Update part: ${form.name}`);
			}
			$parts = updated;
			editingId = null;
			addingNew = false;
		} catch {
			alert('Failed to save');
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>Parts — G31 Journal</title>
</svelte:head>

<div class="container">
	<div class="page-header">
		<h2>Parts Reference</h2>
		<button class="add-btn" onclick={startAdd}>+ Add</button>
	</div>

	<div class="search-bar">
		<input type="search" placeholder="Search parts..." bind:value={searchQuery} />
	</div>

	{#if addingNew}
		<form class="inline-form" onsubmit={(e) => { e.preventDefault(); handleSave(); }}>
			<input type="text" bind:value={form.name} placeholder="Part name" required />
			<input type="text" bind:value={form.oemPartNr} placeholder="OEM part nr" />
			<input type="text" bind:value={form.brand} placeholder="Brand" />
			<input type="text" bind:value={form.partNr} placeholder="Part nr" />
			<input type="text" bind:value={form.supplierStatus} placeholder="Supplier status" />
			<input type="number" bind:value={form.price} placeholder="Price" />
			<textarea bind:value={form.notes} placeholder="Notes" rows="2"></textarea>
			<div class="form-actions">
				<button type="button" class="cancel-btn" onclick={cancelEdit}>Cancel</button>
				<button type="submit" class="save-btn" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
			</div>
		</form>
	{/if}

	{#if loading}
		<div class="loading">Loading parts...</div>
	{:else if loadError}
		<div class="error-state">{loadError}</div>
	{:else if displayParts.length === 0}
		<div class="empty-state">No parts found</div>
	{:else}
		<ul class="parts-list">
			{#each displayParts as part (part.id)}
				{#if editingId === part.id}
					<li>
						<form class="inline-form" onsubmit={(e) => { e.preventDefault(); handleSave(); }}>
							<input type="text" bind:value={form.name} placeholder="Part name" required />
							<input type="text" bind:value={form.oemPartNr} placeholder="OEM part nr" />
							<input type="text" bind:value={form.brand} placeholder="Brand" />
							<input type="text" bind:value={form.partNr} placeholder="Part nr" />
							<input type="text" bind:value={form.supplierStatus} placeholder="Supplier status" />
							<input type="number" bind:value={form.price} placeholder="Price" />
							<textarea bind:value={form.notes} placeholder="Notes" rows="2"></textarea>
							<div class="form-actions">
								<button type="button" class="cancel-btn" onclick={cancelEdit}>Cancel</button>
								<button type="submit" class="save-btn" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
							</div>
						</form>
					</li>
				{:else}
					<li>
						<button class="part-card" onclick={() => startEdit(part)}>
							<div class="part-header">
								<span class="part-name">{part.name}</span>
								{#if part.price > 0}
									<span class="part-price">{formatCost(part.price)}</span>
								{/if}
							</div>
							<div class="part-meta">
								{#if part.brand}<span>{part.brand}</span>{/if}
								{#if part.partNr}<span>{part.partNr}</span>{/if}
								{#if part.oemPartNr}<span class="oem">OEM: {part.oemPartNr}</span>{/if}
							</div>
							{#if part.notes}
								<p class="part-notes">{part.notes}</p>
							{/if}
						</button>
					</li>
				{/if}
			{/each}
		</ul>
	{/if}
</div>

<style>
	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 12px;
	}

	.page-header h2 {
		font-size: 20px;
		font-weight: 700;
	}

	.add-btn {
		padding: 6px 14px;
		background: var(--color-accent);
		color: white;
		border-radius: var(--radius-sm);
		font-size: 14px;
		font-weight: 600;
	}

	.search-bar {
		margin-bottom: 12px;
	}

	.parts-list {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.part-card {
		width: 100%;
		text-align: left;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: 14px 16px;
		color: var(--color-text);
	}

	.part-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 4px;
	}

	.part-name {
		font-weight: 600;
		font-size: 15px;
	}

	.part-price {
		font-weight: 600;
		font-size: 14px;
	}

	.part-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		font-size: 13px;
		color: var(--color-text-secondary);
	}

	.oem {
		font-family: monospace;
		font-size: 12px;
	}

	.part-notes {
		margin-top: 6px;
		font-size: 13px;
		color: var(--color-text-secondary);
		line-height: 1.4;
	}

	.inline-form {
		background: var(--color-surface);
		border: 2px solid var(--color-accent);
		border-radius: var(--radius-md);
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-bottom: 8px;
	}

	.form-actions {
		display: flex;
		gap: 8px;
	}

	.cancel-btn {
		flex: 1;
		padding: 10px;
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		color: var(--color-text);
		font-size: 14px;
	}

	.save-btn {
		flex: 1;
		padding: 10px;
		background: var(--color-accent);
		color: white;
		border-radius: var(--radius-sm);
		font-size: 14px;
		font-weight: 600;
	}

	.save-btn:disabled {
		opacity: 0.6;
	}

	.loading, .empty-state, .error-state {
		text-align: center;
		padding: 48px 16px;
		color: var(--color-text-secondary);
	}
</style>
