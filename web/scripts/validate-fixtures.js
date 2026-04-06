/**
 * Validates combined region fixtures under web/test/fixtures/*.json
 * (same files produced by generate-fixtures.js / the Drive sync workflow).
 *
 * Usage: node web/scripts/validate-fixtures.js
 * Exit 0 on success, 1 on any failure.
 *
 * Keep MIN_SECTIONS and ALLOWED_CATEGORIES in sync with web/server.js loaders.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '..', 'test', 'fixtures');

/** Minimum section counts — bump when docs legitimately grow. */
const MIN_SECTIONS = {
  canada: 38,
  usa: 16,
  mexico: 14,
  puerto_rico: 10,
};

/** Allowed section.category values per region (mirrors server.js *_CATEGORIES). */
const ALLOWED_CATEGORIES = {
  canada: new Set([
    'Overview & Reference',
    'National & CREA DDF',
    'Ontario',
    'British Columbia',
    'Alberta',
    'Quebec',
    'Prairie Provinces',
    'Atlantic Provinces',
    'Territories',
    'Universal Compliance',
    'Privacy & CASL',
    'Technical & RESO',
    'AI & Accessibility',
    'Competition Law',
    'Vendors & Agreements',
    'Commercial Listings',
  ]),
  usa: new Set([
    'Overview & Reference',
    'National Framework',
    'IDX Policy',
    'VOW Policy',
    'Clear Cooperation',
    'Technical & RESO',
    'Regional MLS',
    'Privacy Law',
    'Email & CAN-SPAM',
    'FinCEN & AML',
    'State Regulations',
    'NYC Regulations',
    'Fair Housing & ADA',
    'Antitrust & Competition',
    'AI & AVM',
    'Universal Compliance',
  ]),
  mexico: new Set([
    'Overview & Reference',
    'Market Structure',
    'Regulatory Bodies',
    'AMPI & Regional MLS',
    'Portal Landscape',
    'Consumer Protection',
    'Foreign Ownership',
    'Transaction Process',
    'Tax Reference',
    'State Regulations',
    'AML Compliance',
    'Data Privacy',
    'Regional Notes',
    'Universal Compliance',
  ]),
  puerto_rico: new Set([
    'Regulatory Framework',
    'Agent Licensing',
    'Stellar MLS & Feeds',
    'FinCEN & AML',
    'Short-Term Rental',
    'Fair Housing',
    'ADA Accessibility',
    'Email Marketing',
    'Data Privacy',
    'Universal Compliance',
  ]),
};

const FILES = [
  { region: 'canada', file: 'canada.json' },
  { region: 'usa', file: 'usa.json' },
  { region: 'mexico', file: 'mexico.json' },
  { region: 'puerto_rico', file: 'puerto_rico.json' },
];

function fail(msg) {
  console.error(`validate-fixtures: ${msg}`);
  process.exit(1);
}

function validateFile(region, filename) {
  const full = path.join(FIXTURES_DIR, filename);
  if (!fs.existsSync(full)) {
    fail(`missing file ${filename}`);
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (e) {
    fail(`${filename}: invalid JSON — ${e.message}`);
  }

  if (data.ok !== true) {
    fail(`${filename}: expected ok: true`);
  }

  if (!Array.isArray(data.sections)) {
    fail(`${filename}: sections must be an array`);
  }

  const min = MIN_SECTIONS[region];
  if (data.sections.length < min) {
    fail(
      `${filename}: expected at least ${min} sections, got ${data.sections.length} — run fixtures:generate after updating documents/`
    );
  }

  const seenIds = new Set();
  const allowed = ALLOWED_CATEGORIES[region];

  for (let i = 0; i < data.sections.length; i++) {
    const sec = data.sections[i];
    const prefix = `${filename} section[${i}]`;

    if (!sec || typeof sec !== 'object') {
      fail(`${prefix}: must be an object`);
    }

    if (typeof sec.id !== 'string' || !sec.id.trim()) {
      fail(`${prefix}: missing id`);
    }

    if (seenIds.has(sec.id)) {
      fail(`${prefix}: duplicate id ${JSON.stringify(sec.id)}`);
    }
    seenIds.add(sec.id);

    if (typeof sec.title !== 'string') {
      fail(`${prefix}: title must be a string`);
    }

    if (typeof sec.contentHtml !== 'string') {
      fail(`${prefix}: contentHtml must be a string`);
    }

    if (sec.category !== undefined) {
      if (typeof sec.category !== 'string' || !sec.category.trim()) {
        fail(`${prefix}: category must be a non-empty string when set`);
      }
      if (!allowed.has(sec.category)) {
        fail(
          `${prefix}: unknown category ${JSON.stringify(sec.category)} — sync ALLOWED_CATEGORIES in validate-fixtures.js with server.js`
        );
      }
    }
  }

  console.log(`OK ${filename} (${data.sections.length} sections)`);
}

function main() {
  for (const { region, file } of FILES) {
    validateFile(region, file);
  }
  console.log('validate-fixtures: all region fixtures passed.');
}

main();
