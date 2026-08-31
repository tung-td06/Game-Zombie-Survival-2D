// Headless smoke test for web app
// Run with: cd web && node scripts/smoke.mjs

import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

const dom = new JSDOM(`<!DOCTYPE html><html><body><canvas id="c" width="1280" height="720"></canvas></body></html>`, {
  pretendToBeVisual: true,
});

// Stub browser APIs
global.window = dom.window;
global.document = dom.window.document;
global.HTMLCanvasElement = dom.window.HTMLCanvasElement;
global.localStorage = dom.window.localStorage;
global.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
global.performance = { now: () => Date.now() };

// Now dynamically import the game's TS files. Use tsx to compile on the fly? Let me just check the production bundle.
console.log('OK dom ready');

// Try to load production bundle
const buildPath = path.resolve(process.cwd(), '.next/static/chunks');
if (fs.existsSync(buildPath)) {
  console.log('Build exists, listing:');
  console.log(fs.readdirSync(buildPath).slice(0, 20));
}