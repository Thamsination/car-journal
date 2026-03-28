<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { session } from '$lib/stores';
	import { supabase } from '$lib/supabase';

	let inputEmail = $state('');
	let sending = $state(false);
	let emailSent = $state(false);
	let loginError = $state('');

	async function signInWithEmail() {
		if (!inputEmail.trim()) {
			loginError = 'Please enter your email';
			return;
		}

		sending = true;
		loginError = '';

		const { error } = await supabase.auth.signInWithOtp({
			email: inputEmail.trim(),
			options: {
				emailRedirectTo: window.location.origin + base + '/'
			}
		});

		if (error) {
			loginError = error.message;
		} else {
			emailSent = true;
		}
		sending = false;
	}

	async function signInWithGoogle() {
		loginError = '';
		const { error } = await supabase.auth.signInWithOAuth({
			provider: 'google',
			options: {
				redirectTo: window.location.origin + base + '/'
			}
		});
		if (error) {
			loginError = error.message;
		}
	}

	$effect(() => {
		if ($session) {
			goto(`${base}/`);
		}
	});
</script>

<svelte:head>
	<title>Sign In — Car Journal</title>
</svelte:head>

<div class="container setup-page">
	<div class="setup-card">
		<div class="setup-header">
			<h2>Welcome</h2>
			<p>Sign in to track your vehicle maintenance.</p>
		</div>

		{#if emailSent}
			<div class="email-sent">
				<p class="sent-icon">✉</p>
				<p class="sent-title">Check your inbox</p>
				<p class="sent-desc">
					We sent a sign-in link to <strong>{inputEmail}</strong>. Click the link to continue.
				</p>
				<button class="link-btn" onclick={() => { emailSent = false; inputEmail = ''; }}>
					Use a different email
				</button>
			</div>
		{:else}
			<form onsubmit={(e) => { e.preventDefault(); signInWithEmail(); }}>
				<div class="field">
					<label for="email">Email</label>
					<input
						id="email"
						type="email"
						bind:value={inputEmail}
						placeholder="you@example.com"
						autocomplete="email"
					/>
				</div>

				{#if loginError}
					<p class="error-msg">{loginError}</p>
				{/if}

				<button type="submit" class="submit-btn" disabled={sending}>
					{sending ? 'Sending...' : 'Send magic link'}
				</button>
			</form>

			<div class="divider">
				<span>or</span>
			</div>

			<button class="google-btn" onclick={signInWithGoogle}>
				Sign in with Google
			</button>
		{/if}
	</div>
</div>

<style>
	.setup-page {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 80dvh;
	}

	.setup-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 32px 24px;
		width: 100%;
		max-width: 400px;
	}

	.setup-header {
		text-align: center;
		margin-bottom: 24px;
	}

	.setup-header h2 {
		font-size: 24px;
		font-weight: 700;
		margin-bottom: 8px;
	}

	.setup-header p {
		color: var(--color-text-secondary);
		font-size: 14px;
	}

	.field {
		margin-bottom: 16px;
	}

	.field label {
		display: block;
		font-size: 13px;
		font-weight: 600;
		margin-bottom: 6px;
		color: var(--color-text-secondary);
	}

	.field input {
		width: 100%;
		padding: 12px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: 15px;
		background: var(--color-surface);
		color: var(--color-text);
	}

	.error-msg {
		color: var(--color-danger);
		font-size: 14px;
		margin-bottom: 12px;
		text-align: center;
	}

	.submit-btn {
		width: 100%;
		padding: 12px;
		background: var(--color-accent);
		color: white;
		border-radius: var(--radius-sm);
		font-size: 16px;
		font-weight: 600;
		transition: background 0.2s;
	}

	.submit-btn:hover {
		background: var(--color-accent-hover);
	}

	.submit-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.divider {
		display: flex;
		align-items: center;
		gap: 12px;
		margin: 20px 0;
		color: var(--color-text-secondary);
		font-size: 13px;
	}

	.divider::before,
	.divider::after {
		content: '';
		flex: 1;
		height: 1px;
		background: var(--color-border);
	}

	.google-btn {
		width: 100%;
		padding: 12px;
		background: var(--color-surface);
		color: var(--color-text);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: 15px;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s;
	}

	.google-btn:hover {
		background: var(--color-surface-elevated, #f2f2f7);
	}

	.email-sent {
		text-align: center;
		padding: 12px 0;
	}

	.sent-icon {
		font-size: 36px;
		margin-bottom: 8px;
	}

	.sent-title {
		font-size: 18px;
		font-weight: 700;
		margin-bottom: 8px;
	}

	.sent-desc {
		font-size: 14px;
		color: var(--color-text-secondary);
		line-height: 1.5;
		margin-bottom: 16px;
	}

	.link-btn {
		background: none;
		color: var(--color-accent);
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		padding: 8px;
	}
</style>
