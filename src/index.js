import ICAL from 'ical.js';
import * as htmlparser2 from 'htmlparser2';
import { program } from 'commander';
import { convert } from 'html-to-text';

import fs from 'fs';

program
	.name('mobilizon-newsletter')
	.description('Compiles Mobilizon posts and events into a newsletter')
	.argument('<url>', 'Mobilizon instance URL')
	.option('--year <number>')
	.option('--month <number>');

program.parse();

const args = program.args;
const opts = program.opts();

const LOCALE = 'nl'; // TODO: make configurable
const MAX_DESCRIPTION_LENGTH = 256;
const MOBILIZON_BASE_URL = args[0];
const MOBILIZON_ICS_URL = `${MOBILIZON_BASE_URL}/feed/instance/ics`;
const MOBILIZON_RSS_URL = `${MOBILIZON_BASE_URL}/feed/instance/atom`;
const MONTH_DATE = new Date(`${opts.year}-${opts.month}-01T02:00:00`); // TODO: fix locale

function nextMonth(date) {
	if (date.getMonth() == 11) {
		return new Date(date.getFullYear() + 1, 0, 1);
	} else {
		return new Date(date.getFullYear(), date.getMonth() + 1, 1);
	}
}
function previousMonth(date) {
	if (date.getMonth() == 0) {
		return new Date(date.getFullYear() - 1, 11, 1);
	} else {
		return new Date(date.getFullYear(), date.getMonth() - 1, 1);
	}
}

async function fetchIcs(url) {
	const result = await fetch(url);
	const text = await result.text();

	const jcalData = ICAL.parse(text);

	return new ICAL.Component(jcalData);
}

async function fetchRss(url) {
	const result = await fetch(url);
	const text = await result.text();

	return htmlparser2.parseFeed(text);
}

function compareDates(a, b) {
	if (a.getTime() > b.getTime()) {
		return 1;
	} else if (a.getTime() < b.getTime()) {
		return -1;
	}
	return 0;
}

function truncate(str, maxChars) {
	let truncated = convert(str).slice(0, maxChars);

	// Add ellipsis
	if (truncated.length < str.length) {
		truncated = truncated.trimEnd() + '...';
	}

	// Remove nextlines
	truncated = truncated.replace(/(\r\n|\n|\r)/gm, ' ');

	return truncated;
}

function capitalize(val) {
	return String(val).charAt(0).toUpperCase() + String(val).slice(1);
}

function filterEvents(ics, startDate, endDate) {
	let events = ics.getAllSubcomponents('vevent').filter((event) => {
		const eventStart = event.getFirstPropertyValue('dtstart').toJSDate();

		return eventStart > startDate && eventStart <= endDate;
	});
	events.sort((a, b) => {
		const aDate = a.getFirstPropertyValue('dtstart').toJSDate();
		const bDate = b.getFirstPropertyValue('dtstart').toJSDate();
		return compareDates(aDate, bDate);
	});

	return events;
}

function filterRssItems(rss, startDate, endDate) {
	const items = rss.items.filter((item) => {
		const date = new Date(item.pubDate);

		const isInDateRange = date > startDate && date <= endDate;
		if (!isInDateRange) {
			return false;
		}

		const url = new URL(item.link);
		const isPost = url.pathname.startsWith('/p/');
		if (!isPost) {
			// Past events are ignored. If event information is needed, use the ICS file instead.
			return false;
		}

		return true;
	});

	items.sort((a, b) => {
		const aDate = new Date(a.pubDate);
		const bDate = new Date(b.pubDate);

		return compareDates(aDate, bDate);
	});

	return items;
}

function formatDate(date) {
	return date.toLocaleDateString(LOCALE, {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
	});
}

function formatTime(date) {
	return date.toLocaleTimeString(LOCALE, {
		hour: '2-digit',
		minute: '2-digit',
	});
}

const html = [];

const monthName = MONTH_DATE.toLocaleString(LOCALE, { month: 'long' });

html.push(`<h1>Nieuwsbrief ${monthName} 2024</h1>`);

html.push(`<p>Lieve rebel,</p>`);

html.push(`<p>Welkom bij de nieuwsbrief!</p>`);

html.push(`<p>[op maat gemaakte input kan hier]</p>`);

html.push(`<p>Met (dier)vriendelijke groeten,</p>`);

html.push(`<p>Animal Rebellion</p>`);

html.push(`<h2>Aankomende evenementen</h2>`);

{
	const ics = await fetchIcs(MOBILIZON_ICS_URL);
	const events = filterEvents(ics, MONTH_DATE, nextMonth(MONTH_DATE));

	html.push(
		`<p>In ${monthName} staan ${events.length} evenementen op de planning!</p>`
	);

	html.push(
		`<p>Kijk op <a href="${MOBILIZON_BASE_URL}">Mobilizon</a> voor een actueel overzicht van alle evenementen.</p>`
	);

	events.forEach((event) => {
		const url = event.getFirstPropertyValue('url');
		const title = event.getFirstPropertyValue('summary');
		const date = event.getFirstPropertyValue('dtstart').toJSDate();
		const description = event.getFirstPropertyValue('description');
		const groupName = event.getFirstPropertyValue('organizer');
		const location = event.getFirstPropertyValue('location');

		html.push(`<h3><a href="${url}">${title}</a></h3>`);
		html.push(`<p><b>Door:</b> ${groupName}</p>`);
		html.push(
			`<p><b>Wanneer</b>: <time datetime="${date.toLocaleDateString(LOCALE)}">${capitalize(formatDate(date))} om ${formatTime(date)}</time></p>`
		);
		if (location) {
			html.push(
				`<p><b>Waar</b>: <a href="https://www.openstreetmap.org/search?query=${encodeURIComponent(location)}" target="_blank" rel="noopener noreferrer"><adress>${location}</address></a></p>`
			);
		}
		html.push(
			`<p>${truncate(description, MAX_DESCRIPTION_LENGTH)} <a href="${url}" title="${title}">Meer lezen.</a></p>`
		);
	});
}

html.push(`<h2>Berichten van afgelopen maand</h2>`);

{
	const rss = await fetchRss(MOBILIZON_RSS_URL);
	const items = filterRssItems(rss, previousMonth(MONTH_DATE), MONTH_DATE);

	html.push(
		`<p>Afgelopen maand hebben jullie ${items.length} berichten gedeeld.</p>`
	);
	html.push(
		`<p>Wil je ook iets delen? Dat kan door een bericht te maken op <a href="${MOBILIZON_BASE_URL}">Mobilizon</a>!</p>`
	);

	html.push('<ul>');
	items.forEach((item) => {
		const date = new Date(item.pubDate);
		const timestamp = capitalize(formatDate(date));
		const url = item.link;
		const title = item.title;
		const description = truncate(item.description, MAX_DESCRIPTION_LENGTH);

		html.push(
			`<li><time datetime="${date.toLocaleDateString(LOCALE)}">${timestamp}</time>: <a href="${url}" title="${description}">${title}</a></li>`
		);
	});
	html.push('</ul>');
}

{
	html.push(`<h2>Blijf op de hoogte!</h2>`);
	html.push('<p>Volg ons via onze kanalen!</p>');
	html.push(`<ul>`);
	html.push(`\t<li><a href="https://animalrebellion.nl">Website</li>`);
	html.push(
		`\t<li><a href="https://groups.animalrebellion.nl">Mobilizon</li>`
	);
	html.push(
		`\t<li><a href="https://lone.earth/c/acties_van_animal_rebellion/videos">Peertube</li>`
	);
	html.push(
		`\t<li><a href="https://mastodon.social/@AnimalRebellion">Mastodon</li>`
	);
	html.push(
		`\t<li><a href="mailto:animalrebellion.netherlands@protonmail.com">E-mail (animalrebellion.netherlands@protonmail.com)</a></li>`
	);
	html.push(`</ul>`);
}

html.push(
	`<p><em>De inhoud van deze nieuwsbrief is automatisch opgesteld op basis van publieke activiteit op Mobilizon. Als je vragen of opmerkingen hebt, stuur dan <a href="animalrebllion.netherlands@protonmail.com">een email</a>.</em></p>`
);

const text = html.join('\n');

fs.writeFileSync('output.html', text);
