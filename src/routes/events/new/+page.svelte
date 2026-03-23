<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { events } from '$lib/stores';
	import { saveEvents, loadEvents } from '$lib/github';
	import { generateId, formatDateISO } from '$lib/utils';
	import { isOnline, queueWrite } from '$lib/offline';
	import type { CarEvent, EventStatus } from '$lib/types';

	let saving = $state(false);
	let saveError = $state('');

	let form = $state<CarEvent>({
		id: generateId('evt'),
		km: null,
		date: formatDateISO(new Date()),
		event: '',
		cost: 0,
		currency: 'DKK',
		provider: '',
		notes: '',
		status: 'done',
		invoiceNr: ''
	});

	let costInput = $state('');

	async function handleSave() {
		if (!form.event.trim()) {
			saveError = 'Event description is required';
			return;
		}

		saving = true;
		saveError = '';

		try {
			form.cost = Math.round(parseFloat(costInput.replace(/[^0-9.,\-]/g, '').replace(',', '.')) || 0);
			const updated = [...$events, { ...form }];

			if (isOnline()) {
				await loadEvents();
				await saveEvents(updated, `Add: ${form.event}`);
			} else {
				await queueWrite('events', updated, `Add: ${form.event}`);
			}

			$events = updated;
			goto(`${base}/events`);
		} catch (e: unknown) {
			saveError = e instanceof Error ? e.message : 'Failed to save';
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>New Event — G31 Journal</title>
</svelte:head>

<div class="container">
	<div class="page-header">
		<a href="{base}/events" class="back-btn">← Back</a>
		<h2>New Event</h2>
	</div>

	<form class="event-form" onsubmit={(e) => { e.preventDefault(); handleSave(); }}>
		<div class="field">
			<label for="event">Event</label>
			<input id="event" type="text" bind:value={form.event} placeholder="Service - oil change" required />
		</div>

		<div class="field-row">
			<div class="field">
				<label for="date">Date</label>
				<input id="date" type="date" bind:value={form.date} />
			</div>
			<div class="field">
				<label for="km">Odometer (km)</label>
				<input id="km" type="number" bind:value={form.km} placeholder="187000" />
			</div>
		</div>

		<div class="field-row">
			<div class="field">
				<label for="cost">Cost (DKK)</label>
				<input id="cost" type="text" bind:value={costInput} placeholder="3,600" inputmode="decimal" />
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
			<input id="provider" type="text" bind:value={form.provider} placeholder="BimmerUpgrade" />
		</div>

		<div class="field">
			<label for="notes">Notes</label>
			<textarea id="notes" bind:value={form.notes} rows="3" placeholder="Additional details..."></textarea>
		</div>

		<div class="field">
			<label for="invoice">Invoice nr / ID</label>
			<input id="invoice" type="text" bind:value={form.invoiceNr} placeholder="Optional" />
		</div>

		{#if saveError}
			<p class="error-msg">{saveError}</p>
		{/if}

		<button type="submit" class="submit-btn" disabled={saving}>
			{saving ? 'Saving...' : 'Save Event'}
		</button>
	</form>
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

	.submit-btn {
		width: 100%;
		padding: 14px;
		background: var(--color-accent);
		color: white;
		border-radius: var(--radius-sm);
		font-size: 16px;
		font-weight: 600;
		margin-top: 4px;
	}

	.submit-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
</style>
