<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { events } from '$lib/stores';
	import { saveEvents, loadEvents } from '$lib/github';
	import { formatCost } from '$lib/utils';
	import { isOnline, queueWrite } from '$lib/offline';
	import type { CarEvent, EventStatus } from '$lib/types';
	import { onMount } from 'svelte';

	let event = $state<CarEvent | null>(null);
	let editing = $state(false);
	let saving = $state(false);
	let deleting = $state(false);
	let saveError = $state('');
	let costInput = $state('');

	let form = $state<CarEvent>({
		id: '',
		km: null,
		date: '',
		event: '',
		cost: 0,
		currency: 'DKK',
		provider: '',
		notes: '',
		status: 'done',
		invoiceNr: ''
	});

	onMount(() => {
		const id = $page.params.id;
		const found = $events.find((e) => e.id === id);
		if (found) {
			event = found;
			form = { ...found };
			costInput = found.cost > 0 ? found.cost.toString() : '';
		}
	});

	async function handleSave() {
		if (!form.event.trim()) {
			saveError = 'Event description is required';
			return;
		}
		saving = true;
		saveError = '';
		try {
			form.cost = Math.round(parseFloat(costInput.replace(/[^0-9.,\-]/g, '').replace(',', '.')) || 0);
			const updated = $events.map((e) => (e.id === form.id ? { ...form } : e));

			if (isOnline()) {
				await loadEvents();
				await saveEvents(updated, `Update: ${form.event}`);
			} else {
				await queueWrite('events', updated, `Update: ${form.event}`);
			}

			$events = updated;
			event = { ...form };
			editing = false;
		} catch (e: unknown) {
			saveError = e instanceof Error ? e.message : 'Failed to save';
		} finally {
			saving = false;
		}
	}

	async function handleDelete() {
		if (!confirm('Delete this event permanently?')) return;
		deleting = true;
		try {
			const updated = $events.filter((e) => e.id !== form.id);

			if (isOnline()) {
				await loadEvents();
				await saveEvents(updated, `Delete: ${form.event}`);
			} else {
				await queueWrite('events', updated, `Delete: ${form.event}`);
			}
			$events = updated;
			goto(`${base}/events`);
		} catch (e: unknown) {
			saveError = e instanceof Error ? e.message : 'Failed to delete';
		} finally {
			deleting = false;
		}
	}
</script>

<svelte:head>
	<title>{event?.event ?? 'Event'} — G31 Journal</title>
</svelte:head>

<div class="container">
	<div class="page-header">
		<a href="{base}/events" class="back-btn">← Back</a>
		<h2>{editing ? 'Edit Event' : 'Event Details'}</h2>
	</div>

	{#if !event}
		<div class="empty-state">Event not found</div>
	{:else if editing}
		<form class="event-form" onsubmit={(e) => { e.preventDefault(); handleSave(); }}>
			<div class="field">
				<label for="event">Event</label>
				<input id="event" type="text" bind:value={form.event} required />
			</div>

			<div class="field-row">
				<div class="field">
					<label for="date">Date</label>
					<input id="date" type="date" bind:value={form.date} />
				</div>
				<div class="field">
					<label for="km">Odometer (km)</label>
					<input id="km" type="number" bind:value={form.km} />
				</div>
			</div>

			<div class="field-row">
				<div class="field">
					<label for="cost">Cost (DKK)</label>
					<input id="cost" type="text" bind:value={costInput} inputmode="decimal" />
				</div>
				<div class="field">
					<label for="status">Status</label>
					<select id="status" bind:value={form.status}>
						<option value="done">Done</option>
						<option value="scheduled">Scheduled</option>
						<option value="pending">Pending</option>
						<option value="future">Future</option>
					</select>
				</div>
			</div>

			<div class="field">
				<label for="provider">Provider</label>
				<input id="provider" type="text" bind:value={form.provider} />
			</div>

			<div class="field">
				<label for="notes">Notes</label>
				<textarea id="notes" bind:value={form.notes} rows="3"></textarea>
			</div>

			<div class="field">
				<label for="invoice">Invoice nr / ID</label>
				<input id="invoice" type="text" bind:value={form.invoiceNr} />
			</div>

			{#if saveError}
				<p class="error-msg">{saveError}</p>
			{/if}

			<div class="button-row">
				<button type="button" class="cancel-btn" onclick={() => { editing = false; form = { ...event! }; }}>
					Cancel
				</button>
				<button type="submit" class="submit-btn" disabled={saving}>
					{saving ? 'Saving...' : 'Save'}
				</button>
			</div>
		</form>
	{:else}
		<div class="detail-card">
			<div class="detail-row">
				<span class="detail-label">Status</span>
				<span class="detail-value">{event.status.charAt(0).toUpperCase() + event.status.slice(1)}</span>
			</div>
			<div class="detail-row">
				<span class="detail-label">Date</span>
				<span class="detail-value">{event.date || '—'}</span>
			</div>
			<div class="detail-row">
				<span class="detail-label">Odometer</span>
				<span class="detail-value">{event.km ? `${event.km.toLocaleString()} km` : '—'}</span>
			</div>
			<div class="detail-row">
				<span class="detail-label">Cost</span>
				<span class="detail-value">{event.cost > 0 ? formatCost(event.cost) : '—'}</span>
			</div>
			<div class="detail-row">
				<span class="detail-label">Provider</span>
				<span class="detail-value">{event.provider || '—'}</span>
			</div>
			{#if event.notes}
				<div class="detail-row">
					<span class="detail-label">Notes</span>
					<span class="detail-value">{event.notes}</span>
				</div>
			{/if}
			{#if event.invoiceNr}
				<div class="detail-row">
					<span class="detail-label">Invoice</span>
					<span class="detail-value">{event.invoiceNr}</span>
				</div>
			{/if}

			<div class="button-row">
				<button class="edit-btn" onclick={() => (editing = true)}>Edit</button>
				<button class="delete-btn" onclick={handleDelete} disabled={deleting}>
					{deleting ? 'Deleting...' : 'Delete'}
				</button>
			</div>
		</div>
	{/if}
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

	.detail-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: 20px;
	}

	.detail-row {
		display: flex;
		justify-content: space-between;
		padding: 10px 0;
		border-bottom: 1px solid var(--color-border);
	}

	.detail-row:last-of-type {
		border-bottom: none;
	}

	.detail-label {
		font-size: 14px;
		color: var(--color-text-secondary);
		flex-shrink: 0;
		margin-right: 16px;
	}

	.detail-value {
		font-size: 14px;
		font-weight: 500;
		text-align: right;
	}

	.event-form {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.field label {
		display: block;
		font-size: 13px;
		font-weight: 600;
		margin-bottom: 6px;
		color: var(--color-text-secondary);
	}

	.field-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}

	textarea {
		resize: vertical;
		min-height: 60px;
	}

	.error-msg {
		color: var(--color-danger);
		font-size: 14px;
		text-align: center;
	}

	.button-row {
		display: flex;
		gap: 12px;
		margin-top: 16px;
	}

	.edit-btn,
	.submit-btn {
		flex: 1;
		padding: 12px;
		background: var(--color-accent);
		color: white;
		border-radius: var(--radius-sm);
		font-size: 15px;
		font-weight: 600;
	}

	.cancel-btn {
		flex: 1;
		padding: 12px;
		background: var(--color-surface-raised);
		color: var(--color-text);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: 15px;
		font-weight: 500;
	}

	.delete-btn {
		flex: 1;
		padding: 12px;
		background: none;
		color: var(--color-danger);
		border: 1px solid var(--color-danger);
		border-radius: var(--radius-sm);
		font-size: 15px;
		font-weight: 500;
	}

	.submit-btn:disabled,
	.delete-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.empty-state {
		text-align: center;
		padding: 48px 16px;
		color: var(--color-text-secondary);
	}
</style>
