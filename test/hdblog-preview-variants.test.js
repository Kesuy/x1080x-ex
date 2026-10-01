import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isFourKPreviewCandidate,
  isFourKPreviewValue,
  partitionPreviewCandidates,
} from '../src/hdblog-preview-variants.js';

test('recognizes common 4K Preview filename markers without treating 6M as 4K', () => {
  assert.equal(isFourKPreviewValue('https://pixhost.to/show/6003/775026998_ebwh-365_4k60fps-mp4.jpg'), true);
  assert.equal(isFourKPreviewValue('https://img1.example.com/EBWH-365_2160p.jpg'), true);
  assert.equal(isFourKPreviewValue('https://img1.example.com/EBWH-365_UHD-preview.jpg'), true);
  assert.equal(isFourKPreviewValue('https://pixhost.to/show/5614/768440896_ebwh-365_6m-mp4.jpg'), false);
});

test('partitions EBWH-365 Preview candidates so standard is preferred even when 4K appears first', () => {
  const fourK = {
    pixhostShowUrl: 'https://pixhost.to/show/6003/775026998_ebwh-365_4k60fps-mp4.jpg',
  };
  const standard = {
    pixhostShowUrl: 'https://pixhost.to/show/5614/768440896_ebwh-365_6m-mp4.jpg',
  };
  assert.equal(isFourKPreviewCandidate(fourK), true);
  assert.equal(isFourKPreviewCandidate(standard), false);
  assert.deepEqual(partitionPreviewCandidates([fourK, standard]), {
    standard: [standard],
    fourK: [fourK],
  });
});
