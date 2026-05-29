import type { CollectionFile, Field } from '@sveltia/cms';

const metaFields: Field[] = [
	{ name: 'calendar', label: 'Calendar', widget: 'select', options: ['community', 'events'] },
	{ name: 'name', label: 'Name' },
	{ name: 'title', label: 'title' },
	{
		name: 'description',
		label: 'Description',
		widget: 'text'
	},
	{ name: 'location', label: 'Location' }
];

const timeFields: Field[] = [
	{
		name: 'startTime',
		label: 'Start Time',
		widget: 'object',
		fields: [
			{ name: 'hour', label: 'Hour', widget: 'number' },
			{ name: 'minute', label: 'Minute', widget: 'number' }
		]
	},
	{
		name: 'endTime',
		label: 'End Time',
		widget: 'object',
		fields: [
			{ name: 'hour', label: 'Hour', widget: 'number' },
			{ name: 'minute', label: 'Minute', widget: 'number' }
		]
	}
];

const jobsField: Field = {
	name: 'jobs',
	label: 'Jobs',
	label_singular: 'Job',
	widget: 'list',
	min: 1,
	summary: '{{title}}',
	fields: [
		{ name: 'name', label: 'Name' },
		{ name: 'title', label: 'title' },
		{ name: 'persons', label: 'Persons', widget: 'number', min: 1, max: 2 },
		{ name: 'askDetails', label: 'Ask for details', widget: 'boolean' }
	]
};

export default {
	name: 'config',
	file: 'src/lib/config/weekly-jobs.json',
	label: 'Weekly Jobs',
	fields: [
		{
			name: 'config',
			label: 'Weekly Jobs',
			label_singular: 'Job',
			widget: 'list',
			types: [
				{
					name: 'daily',
					label: 'Daily Job',
					summary: '{{title}}',
					widget: 'object',
					fields: [
						{ name: 'type', widget: 'hidden', default: 'daily' },
						...metaFields,
						...timeFields,
						{
							name: 'weekdays',
							label: 'Days',
							widget: 'select',
							multiple: true,
							options: [
								{ label: 'Monday', value: 1 },
								{ label: 'Tuesday', value: 2 },
								{ label: 'Wednesday', value: 3 },
								{ label: 'Thursday', value: 4 },
								{ label: 'Friday', value: 5 }
							]
						},
						jobsField
					]
				},
				{
					name: 'moon',
					label: 'Moon Cycle Job',
					summary: '{{title}}',
					widget: 'object',
					fields: [
						{ name: 'type', widget: 'hidden', default: 'moon' },
						...metaFields,
						...timeFields,
						{
							name: 'relation',
							label: 'Moon Phase Relation',
							widget: 'select',
							options: [
								{ label: 'Exact {Day} on {Moon Phase}', value: 'EXACT' },
								{ label: 'Not Exact {Day} on {Moon Phase}', value: 'NOT_EXACT' },
								{ label: 'Last {Day} before {Moon Phase}', value: 'LAST_BEFORE' },
								{ label: 'Not {Day} before {Moon Phase}', value: 'NOT_LAST_BEFORE' },
								{ label: 'Last {Day} on or before {Moon Phase}', value: 'LAST_ON_OR_BEFORE' },
								{
									label: 'Not last {Day} on or before {Moon Phase}',
									value: 'NOT_LAST_ON_OR_BEFORE'
								},
								{ label: 'First {Day} after {Moon Phase}', value: 'FIRST_AFTER' },
								{ label: 'Not first {Day} after {Moon Phase}', value: 'NOT_FIRST_AFTER' },
								{ label: 'First {Day} on or after {Moon Phase}', value: 'FIRST_ON_OR_AFTER' },
								{
									label: 'Not first {Day} on or after {Moon Phase}',
									value: 'NOT_FIRST_ON_OR_AFTER'
								}
							]
						},
						{
							name: 'weekday',
							label: 'Day',
							widget: 'select',
							options: [
								{ label: 'Monday', value: 1 },
								{ label: 'Tuesday', value: 2 },
								{ label: 'Wednesday', value: 3 },
								{ label: 'Thursday', value: 4 },
								{ label: 'Friday', value: 5 }
							]
						},
						{
							name: 'phase',
							label: 'Moon Phase',
							widget: 'select',
							options: [
								{ label: 'New Moon', value: 'NEW_MOON' },
								{ label: 'Waxing Crescent', value: 'WAXING_CRESCENT' },
								{ label: 'First Quarter', value: 'FIRST_QUARTER' },
								{ label: 'Waxing Gibbous', value: 'WAXING_GIBBOUS' },
								{ label: 'Full Moon', value: 'FULL_MOON' },
								{ label: 'Waning Gibbous', value: 'WANING_GIBBOUS' },
								{ label: 'Last Quarter', value: 'LAST_QUARTER' },
								{ label: 'Waning Crescent', value: 'WANING_CRESCENT' }
							]
						},
						jobsField
					]
				},
				{
					name: 'weekly',
					label: 'Week Job',
					summary: '{{title}}',
					widget: 'object',
					fields: [{ name: 'type', widget: 'hidden', default: 'weekly' }, ...metaFields, jobsField]
				}
			]
		}
	]
} satisfies CollectionFile;
