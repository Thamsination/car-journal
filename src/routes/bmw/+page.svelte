<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { token } from '$lib/stores';
	import { setRepoSecret, triggerWorkflow } from '$lib/github';

	const HCAPTCHA_SITE_KEYS: Record<string, string> = {
		rest_of_world: '10000000-ffff-ffff-ffff-000000000001',
		north_america: 'dc24de9a-9844-438b-b542-60067ff4dbe9'
	};

	let email = $state('');
	let password = $state('');
	let vin = $state('');
	let region = $state('rest_of_world');
	let captchaToken = $state('');
	let step = $state<'form' | 'captcha' | 'saving' | 'done' | 'error'>('form');
	let errorMsg = $state('');
	let statusMsg = $state('');

	let captchaContainer: HTMLDivElement | undefined = $state();
	let hcaptchaWidgetId: string | null = $state(null);
	let hcaptchaLoaded = $state(false);

	onMount(() => {
		if (!$token) {
			goto(`${base}/setup`);
			return;
		}
		loadHcaptchaScript();
	});

	function loadHcaptchaScript() {
		if (document.querySelector('script[src*="hcaptcha"]')) {
			hcaptchaLoaded = true;
			return;
		}
		const script = document.createElement('script');
		script.src = 'https://js.hcaptcha.com/1/api.js?render=explicit';
		script.async = true;
		script.onload = () => {
			hcaptchaLoaded = true;
		};
		document.head.appendChild(script);
	}

	function proceedToCaptcha() {
		if (!email || !password || !vin) {
			errorMsg = 'Please fill in all fields';
			return;
		}
		errorMsg = '';
		step = 'captcha';
		renderCaptcha();
	}

	function renderCaptcha() {
		setTimeout(() => {
			if (!captchaContainer || !hcaptchaLoaded) {
				setTimeout(renderCaptcha, 200);
				return;
			}
			const w = window as unknown as Record<string, unknown>;
			const hcaptcha = w.hcaptcha as {
				render: (el: HTMLElement, opts: Record<string, unknown>) => string;
			};
			if (hcaptchaWidgetId !== null) return;
			hcaptchaWidgetId = hcaptcha.render(captchaContainer, {
				sitekey: HCAPTCHA_SITE_KEYS[region] || HCAPTCHA_SITE_KEYS.rest_of_world,
				callback: onCaptchaSuccess,
				'error-callback': onCaptchaError
			});
		}, 100);
	}

	function onCaptchaSuccess(token: string) {
		captchaToken = token;
	}

	function onCaptchaError() {
		errorMsg = 'Captcha verification failed. Please try again.';
	}

	async function handleSubmit() {
		if (!captchaToken) {
			errorMsg = 'Please solve the captcha first';
			return;
		}
		step = 'saving';
		errorMsg = '';
		try {
			statusMsg = 'Encrypting and storing BMW credentials...';
			await setRepoSecret('BMW_USERNAME', email);
			await setRepoSecret('BMW_PASSWORD', password);
			await setRepoSecret('BMW_VIN', vin);
			await setRepoSecret('BMW_REGION', region);
			await setRepoSecret('GH_PAT', $token);

			statusMsg = 'Triggering BMW authentication...';
			await triggerWorkflow('bmw-auth.yml', { captcha_token: captchaToken });

			step = 'done';
		} catch (e: unknown) {
			errorMsg = e instanceof Error ? e.message : 'Failed to store credentials';
			step = 'captcha';
		}
	}

	function resetForm() {
		step = 'form';
		captchaToken = '';
		hcaptchaWidgetId = null;
		errorMsg = '';
		statusMsg = '';
	}
</script>

<svelte:head>
	<title>Connect BMW — G31 Journal</title>
</svelte:head>

<div class="container">
	<div class="page-header">
		<button class="back-btn" onclick={() => history.back()}>← Back</button>
		<h2>Connect BMW</h2>
	</div>

	{#if step === 'form'}
		<div class="info-card">
			<p>Connect your myBMW account to automatically sync odometer readings. Your credentials are encrypted and stored as GitHub secrets.</p>
		</div>

		<form class="bmw-form" onsubmit={(e) => { e.preventDefault(); proceedToCaptcha(); }}>
			<div class="field">
				<label for="bmw-email">BMW Account Email</label>
				<input id="bmw-email" type="email" bind:value={email} placeholder="your@email.com" required autocomplete="email" />
			</div>

			<div class="field">
				<label for="bmw-password">BMW Account Password</label>
				<input id="bmw-password" type="password" bind:value={password} placeholder="Password" required autocomplete="current-password" />
			</div>

			<div class="field">
				<label for="bmw-vin">Vehicle Identification Number (VIN)</label>
				<input id="bmw-vin" type="text" bind:value={vin} placeholder="WBAJC51020..." maxlength="17" required />
			</div>

			<div class="field">
				<label for="bmw-region">Region</label>
				<select id="bmw-region" bind:value={region}>
					<option value="rest_of_world">Rest of World (Europe, etc.)</option>
					<option value="north_america">North America</option>
					<option value="china">China</option>
				</select>
			</div>

			{#if errorMsg}
				<p class="error-msg">{errorMsg}</p>
			{/if}

			<button type="submit" class="submit-btn">
				Next — Verify Captcha
			</button>
		</form>

	{:else if step === 'captcha'}
		<div class="info-card">
			<p>BMW requires a captcha for first-time login. Solve it below, then tap Connect.</p>
		</div>

		<div class="captcha-section">
			<div bind:this={captchaContainer} class="captcha-widget"></div>

			{#if captchaToken}
				<div class="captcha-ok">Captcha solved</div>
			{/if}
		</div>

		{#if errorMsg}
			<p class="error-msg">{errorMsg}</p>
		{/if}

		<div class="button-row">
			<button class="cancel-btn" onclick={resetForm}>Back</button>
			<button class="submit-btn" onclick={handleSubmit} disabled={!captchaToken}>
				Connect
			</button>
		</div>

	{:else if step === 'saving'}
		<div class="status-card">
			<div class="spinner"></div>
			<p class="status-text">{statusMsg}</p>
		</div>

	{:else if step === 'done'}
		<div class="success-card">
			<div class="success-icon">&#10003;</div>
			<h3>Authentication Triggered</h3>
			<p>Your credentials have been securely stored and the BMW authentication workflow has been started.</p>
			<p class="note">The workflow takes ~2 minutes. Once complete, your odometer will sync daily at 06:00 UTC.</p>
			<a href="{base}/" class="submit-btn" style="display:block;text-align:center;text-decoration:none;margin-top:16px;">
				Go to Dashboard
			</a>
		</div>

	{:else if step === 'error'}
		<div class="error-card-full">
			<p>{errorMsg}</p>
			<button class="submit-btn" onclick={resetForm}>Try Again</button>
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
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
	}

	.info-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: 14px 16px;
		margin-bottom: 20px;
		font-size: 13px;
		color: var(--color-text-secondary);
		line-height: 1.5;
	}

	.bmw-form {
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

	.error-msg {
		color: var(--color-danger);
		font-size: 14px;
		text-align: center;
	}

	.button-row {
		display: flex;
		gap: 12px;
		margin-top: 8px;
	}

	.submit-btn {
		flex: 1;
		padding: 14px;
		background: var(--color-accent);
		color: white;
		border-radius: var(--radius-sm);
		font-size: 15px;
		font-weight: 600;
	}

	.submit-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.cancel-btn {
		flex: 1;
		padding: 14px;
		background: var(--color-surface-raised);
		color: var(--color-text);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: 15px;
		font-weight: 500;
	}

	.captcha-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		margin-bottom: 20px;
	}

	.captcha-widget {
		min-height: 78px;
	}

	.captcha-ok {
		font-size: 14px;
		font-weight: 600;
		color: var(--color-success);
	}

	.status-card {
		text-align: center;
		padding: 48px 16px;
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid var(--color-border);
		border-top-color: var(--color-accent);
		border-radius: 50%;
		margin: 0 auto 16px;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.status-text {
		color: var(--color-text-secondary);
		font-size: 14px;
	}

	.success-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: 32px 20px;
		text-align: center;
	}

	.success-icon {
		font-size: 48px;
		color: var(--color-success);
		margin-bottom: 12px;
	}

	.success-card h3 {
		font-size: 18px;
		font-weight: 700;
		margin-bottom: 8px;
	}

	.success-card p {
		font-size: 14px;
		color: var(--color-text-secondary);
		line-height: 1.5;
	}

	.success-card .note {
		font-size: 12px;
		margin-top: 12px;
		opacity: 0.7;
	}

	.error-card-full {
		text-align: center;
		padding: 32px 16px;
		background: var(--color-surface);
		border-radius: var(--radius-md);
		border: 1px solid var(--color-danger);
		color: var(--color-danger);
	}
</style>
