import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    getWorkoutHeroTheme,
    WORKOUT_HERO_PREVIEW_CASES,
} from '../src/utils/workoutHeroMapping.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(scriptDir, '../public');
const missing = [];
const counts = new Map();

for (const focus of WORKOUT_HERO_PREVIEW_CASES) {
    const theme = getWorkoutHeroTheme(focus);
    const filePath = path.join(publicDir, decodeURIComponent(theme.image.replace(/^\//, '')));
    counts.set(theme.key, (counts.get(theme.key) || 0) + 1);
    if (!fs.existsSync(filePath)) missing.push({ focus, theme: theme.key, filePath });
}

if (missing.length) {
    console.error('Workout hero audit failed:');
    missing.forEach(item => console.error(`- ${item.focus} -> ${item.theme}: ${item.filePath}`));
    process.exit(1);
}

console.log(`Checked ${WORKOUT_HERO_PREVIEW_CASES.length} focus labels.`);
console.log([...counts.entries()].map(([key, count]) => `${key}:${count}`).join(' | '));
console.log('Every focus label resolves to an existing image.');
