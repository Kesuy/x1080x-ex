import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  BATCH_CF_EVENT_KEY, BATCH_CF_SESSION_KEY,
  isCloudflareChallengePage, reportBatchCloudflareChallenge,
} from '../src/batch-cf-detection.js';

test('recognizes Cloudflare challenges by specific form and title/body indicators', () => {
  const doc = new JSDOM('<html><head><title>Just a moment...</title></head><body>Cloudflare: checking if the site connection is secure</body></html>');
  assert.equal(isCloudflareChallengePage(doc.window.document), true);
  const formDoc = new JSDOM('<html><body><form id="challenge-form"></form></body></html>');
  assert.equal(isCloudflareChallengePage(formDoc.window.document), true);
  const normal = new JSDOM('<html><head><title>RTRY-001</title></head><body>Resources list</body></html>');
  assert.equal(isCloudflareChallengePage(normal.window.document), false);
  doc.window.close(); formDoc.window.close(); normal.window.close();
});

test('reports only same batch session and opened URL, not unrelated Cloudflare tabs', () => {
  const url = 'https://1080xin.com/resources/abc123';
  const doc = new JSDOM('<html><head><title>Just a moment...</title></head><body>Cloudflare verification required</body></html>');
  const store = new Map();
  const read = (key, fallback) => store.has(key) ? store.get(key) : fallback;
  const write = (key, value) => store.set(key, value);
  const now = 100000;
  store.set(BATCH_CF_SESSION_KEY, {
    id: 'run-1', host: '1080xin.com', urls: [url], updatedAt: now - 1000,
  });

  assert.equal(reportBatchCloudflareChallenge(doc.window.document, url, read, write, now), true);
  assert.deepEqual(store.get(BATCH_CF_EVENT_KEY), {
    sessionId: 'run-1', url, challengeUrl: url, detectedAt: now,
  });
  store.delete(BATCH_CF_EVENT_KEY);
  assert.equal(reportBatchCloudflareChallenge(doc.window.document, 'https://1080xin.com/resources/unrelated', read, write, now), false);
  assert.equal(store.has(BATCH_CF_EVENT_KEY), false);
  assert.equal(reportBatchCloudflareChallenge(doc.window.document, 'https://hdblog.me/resources/abc123', read, write, now), false);
  store.get(BATCH_CF_SESSION_KEY).updatedAt = now - 150000;
  assert.equal(reportBatchCloudflareChallenge(doc.window.document, url, read, write, now), false);
  doc.window.close();
});

test('Cloudflare listener must not mark a normal resource page as a challenge', () => {
  const doc = new JSDOM('<html><head><title>RTRY-001</title></head><body><h1>RTRY-001</h1></body></html>');
  const store = new Map();
  const url = 'https://1080xin.com/resources/abc123';
  store.set(BATCH_CF_SESSION_KEY, {
    id: 'run-2', host: '1080xin.com', urls: [url], updatedAt: 10000,
  });
  const read = (key, fallback) => store.get(key) ?? fallback;
  const write = (key, value) => store.set(key, value);
  assert.equal(reportBatchCloudflareChallenge(doc.window.document, url, read, write, 10000), false);
  assert.equal(store.has(BATCH_CF_EVENT_KEY), false);
  doc.window.close();
});

test('maps a redirected Cloudflare challenge back to the original resource', () => {
  const original = 'https://1080xin.com/resources/abc123';
  const redirected = 'https://1080xin.com/cdn-cgi/challenge-platform/h/s/p';
  const doc = new JSDOM('<html><head><title>Just a moment...</title></head><body>Cloudflare</body></html>');
  const store = new Map([[BATCH_CF_SESSION_KEY, {
    id: 'run-redirect', host: '1080xin.com', urls: [original], updatedAt: 10000,
  }]]);
  const read = (key, fallback) => store.get(key) ?? fallback;
  const write = (key, value) => store.set(key, value);
  assert.equal(reportBatchCloudflareChallenge(doc.window.document, redirected, read, write, 10000), true);
  assert.equal(store.get(BATCH_CF_EVENT_KEY)?.url, original);
  assert.equal(store.get(BATCH_CF_EVENT_KEY)?.challengeUrl, redirected);
  doc.window.close();
});
