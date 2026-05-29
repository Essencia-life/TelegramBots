<script>
	import { init } from '@sveltia/cms';
	import { resolve } from '$app/paths';
	import weeklyJobs from '$lib/config/weekly-jobs';
	import { onMount } from 'svelte';

	onMount(() => {
		init({
			config: {
				backend: {
					name: 'github',
					repo: 'Essencia-life/TelegramBots',
					branch: 'main',
					base_url: 'https://essencia-cockpit.vercel.app',
					auth_endpoint: resolve('/admin/auth'),
					commit_messages: {
						create: 'feat({{collection}}): created “{{slug}}”',
						update: 'feat({{collection}}): updated “{{slug}}”',
						delete: 'feat({{collection}}): deleted “{{slug}}”',
						uploadMedia: 'feat({{collection}}): uploaded “{{path}}”',
						deleteMedia: 'feat({{collection}}): deleted “{{path}}”'
					}
				},
				load_config_file: false,
				media_folder: 'apps/orga/src/lib/assets',
				public_folder: '',
				collections: [
					{
						name: 'configuration',
						label: 'Configuration',
						format: 'json',
						editor: {
							preview: false
						},
						files: [weeklyJobs]
					}
				]
			}
		});
	});
</script>
