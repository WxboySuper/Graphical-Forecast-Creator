/**
 * Renders the release archive for the Updates page from
 * marketing/src/data/releases.json. Each release becomes a section with its
 * headline stories, optional screenshots, and an "Also improved" list.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { escapeHtml } from './template.mjs';

const esc = escapeHtml;

const renderShot = (shot) =>
  `<figure class="shot"><img src="${esc(shot.src)}" alt="${esc(shot.alt)}" loading="lazy">${shot.caption ? `<figcaption>${esc(shot.caption)}</figcaption>` : ''}</figure>`;

const renderBullets = (bullets = []) =>
  bullets.length ? `<ul class="arrows">${bullets.map((bullet) => `<li>${esc(bullet)}</li>`).join('')}</ul>` : '';

const renderSection = (section) => `
<article class="story-card reveal">
  <div>${section.eyebrow ? `<p class="eyebrow">${esc(section.eyebrow)}</p>` : ''}<h3>${esc(section.title)}</h3></div>
  <div><p>${esc(section.body)}</p>${renderBullets(section.bullets)}</div>
  ${(section.screenshots ?? []).map(renderShot).join('')}
</article>`;

const renderImprovements = (items = []) =>
  items.length
    ? `<div class="also reveal"><h3>Also improved</h3><ul class="arrows">${items.map((item) => `<li>${esc(item.text)}</li>`).join('')}</ul></div>`
    : '';

const renderRelease = (release, index) => `
<section class="release${index === 0 ? ' release-latest' : ''}" id="${esc(release.label.replace(/\./g, '-'))}" aria-labelledby="rel-${index}">
  <header class="release-head reveal">
    <p class="eyebrow">${esc(release.label)}${release.date ? ` · ${esc(release.date)}` : ''}</p>
    <h2 class="big" id="rel-${index}">${esc(release.title)}</h2>
    <p class="lede">${esc(release.summary)}</p>
    ${release.heroImage ? renderShot(release.heroImage) : ''}
  </header>
  ${release.sections.map(renderSection).join('')}
  ${renderImprovements(release.improvements)}
</section>`;

const REQUIRED_TEXT = ['label', 'title', 'summary'];

/** Fails with a readable message when a release entry is missing what the page needs. */
const assertRelease = (release, index) => {
  for (const key of REQUIRED_TEXT) {
    if (typeof release?.[key] !== 'string') throw new Error(`releases.json entry ${index} needs a string "${key}"`);
  }
  if (!Array.isArray(release.sections)) throw new Error(`releases.json entry ${index} needs a "sections" array`);
};

/** Builds the release archive markup, newest release first. */
export const buildReleaseHtml = (root) => {
  const releases = JSON.parse(readFileSync(path.join(root, 'marketing', 'src', 'data', 'releases.json'), 'utf8'));
  releases.forEach(assertRelease);
  return releases.map(renderRelease).join('\n');
};
