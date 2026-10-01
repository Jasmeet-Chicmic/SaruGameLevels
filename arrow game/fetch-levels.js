#!/usr/bin/env node
// Downloads every board from the Arrows API into ./levels/<difficulty>/<difficulty>-<number>.json
//
// Usage:
//   ARROWS_TOKEN="<bearer token>" node fetch-levels.js
//   node fetch-levels.js <bearer token>
//
// The token is the short-lived "authorization: Bearer ..." value from the
// admin site's network tab; grab a fresh one if you get a 401.

const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://arrows.dev.shunya.app/v1';
const PAGE_SIZE = 10;
const OUT_DIR = path.join(__dirname, 'levels');

const token = (process.env.ARROWS_TOKEN || process.argv[2] || '').replace(/^Bearer\s+/i, '');
if (!token) {
  console.error('Missing token. Set ARROWS_TOKEN or pass it as the first argument.');
  process.exit(1);
}

const headers = {
  accept: 'application/json',
  authorization: `Bearer ${token}`,
  'content-type': 'application/json',
  origin: 'https://arcade.admin.dev.shunya.app',
  referer: 'https://arcade.admin.dev.shunya.app/',
};

async function get(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} for ${url}: ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}

async function listBoards() {
  const boards = [];
  let total = Infinity;
  while (boards.length < total) {
    const json = await get(`${BASE_URL}/boards?limit=${PAGE_SIZE}&skip=${boards.length}`);
    const { data, totalCount } = json.data;
    total = totalCount;
    if (!data.length) break;
    boards.push(...data);
  }
  return boards;
}

// Same convention as the other games: easy-01.., medium-501.., hard-1001..
// API names are inconsistent (E, M, ML, EL, H, HL...), so number by creation date.
// Demo boards keep their API names.
const NUMBERING = { easy: { start: 1, pad: 2 }, medium: { start: 501, pad: 1 }, hard: { start: 1001, pad: 1 } };

function assignNames(boards) {
  for (const [difficulty, { start, pad }] of Object.entries(NUMBERING)) {
    boards
      .filter((b) => b.level?.name?.toLowerCase() === difficulty)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .forEach((b, i) => {
        b.name = `${difficulty}-${String(start + i).padStart(pad, '0')}`;
      });
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const boards = await listBoards();
  console.log(`Found ${boards.length} boards`);
  assignNames(boards);
  fs.writeFileSync(path.join(OUT_DIR, '_index.json'), JSON.stringify(boards, null, 2));

  let failed = 0;
  for (const [i, board] of boards.entries()) {
    const dir = path.join(OUT_DIR, (board.level?.name || 'unknown').toLowerCase());
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${board.name}.json`);
    try {
      const details = await get(`${BASE_URL}/boards/details?boardId=${board.id}`);
      const level = details.data ?? details;
      level.name = board.name;
      fs.writeFileSync(file, JSON.stringify(level, null, 2));
      console.log(`[${i + 1}/${boards.length}] saved ${board.name} (${board.level?.name})`);
    } catch (err) {
      failed++;
      console.error(`[${i + 1}/${boards.length}] FAILED ${board.name}: ${err.message}`);
    }
  }

  console.log(`Done. ${boards.length - failed} saved, ${failed} failed -> ${OUT_DIR}`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
