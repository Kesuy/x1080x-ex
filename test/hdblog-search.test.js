import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectHdblogSearchResults,
  filterHdblogSearchResults,
  filterSearchCandidates,
  isBlockedTitle,
  isHdblogSearchUrl,
  parseBlockedKeywords,
  redirectTargetForSearch,
} from '../src/hdblog-search.js';

test('parses blocked keywords without splitting phrases on spaces and removes duplicates', () => {
  assert.deepEqual(
    parseBlockedKeywords('モザイク破壊\nUncensored, uncensored；无码 标题'),
    ['モザイク破壊', 'Uncensored', '无码 标题']
  );
});

test('matches blocked keywords case-insensitively and after Unicode normalization', () => {
  assert.equal(isBlockedTitle('(モザイク破壊) IPZZ-941 sample', ['モザイク破壊']), true);
  assert.equal(isBlockedTitle('UNCENSORED IPZZ-941', ['uncensored']), true);
  assert.equal(isBlockedTitle('IPZZ-941 normal result', ['モザイク破壊']), false);
});

test('recognizes hdblog search URLs only when a non-empty s query is present', () => {
  assert.equal(isHdblogSearchUrl('https://hdblog.me/?s=IPZZ-941'), true);
  assert.equal(isHdblogSearchUrl('https://www.hdblog.me/?s=IPZZ-941'), true);
  assert.equal(isHdblogSearchUrl('https://hdblog.me/985910/ipzz-941/'), false);
  assert.equal(isHdblogSearchUrl('https://example.com/?s=IPZZ-941'), false);
});

test('IPZZ-941 example filters モザイク破壊 and redirects to the sole real result', () => {
  const candidates = [
    {
      title: '(モザイク破壊) IPZZ-941 僕が惚れたバイト先の澪さんと親友が裏切り交際',
      url: 'https://hdblog.me/986166/un-ipzz-941/',
    },
    {
      title: 'IPZZ-941 僕が惚れたバイト先の澪さんと親友が裏切り交際',
      url: 'https://hdblog.me/985910/ipzz-941/',
    },
  ];
  const result = filterSearchCandidates(candidates, ['モザイク破壊']);
  assert.equal(result.blocked.length, 1);
  assert.deepEqual(result.remaining, [candidates[1]]);
  assert.equal(redirectTargetForSearch(result.remaining), 'https://hdblog.me/985910/ipzz-941/');
});

test('zero results do not redirect and multiple results do not redirect', () => {
  const blockedAll = filterSearchCandidates([
    { title: 'モザイク破壊 A', url: 'https://hdblog.me/a/' },
    { title: 'モザイク破壊 B', url: 'https://hdblog.me/b/' },
  ], ['モザイク破壊']);
  assert.equal(blockedAll.remaining.length, 0);
  assert.equal(redirectTargetForSearch(blockedAll.remaining), '');

  const multiple = filterSearchCandidates([
    { title: 'A', url: 'https://hdblog.me/a/' },
    { title: 'B', url: 'https://hdblog.me/b/' },
  ], ['モザイク破壊']);
  assert.equal(multiple.remaining.length, 2);
  assert.equal(redirectTargetForSearch(multiple.remaining), '');
});

test('DOM collection ignores cross-origin links and filtering removes only blocked articles', () => {
  const makeArticle = (title, href) => {
    const article = {
      removed: false,
      remove() { this.removed = true; },
      querySelector() {
        return {
          textContent: title,
          getAttribute(name) { return name === 'href' ? href : null; },
        };
      },
    };
    return article;
  };
  const blockedArticle = makeArticle('(モザイク破壊) IPZZ-941', '/986166/un-ipzz-941/');
  const keptArticle = makeArticle('IPZZ-941', '/985910/ipzz-941/');
  const externalArticle = makeArticle('external', 'https://example.com/post/');
  const document = {
    baseURI: 'https://hdblog.me/?s=IPZZ-941',
    querySelectorAll() { return [blockedArticle, keptArticle, externalArticle]; },
  };

  assert.equal(collectHdblogSearchResults(document).length, 2);
  const result = filterHdblogSearchResults(document, ['モザイク破壊']);
  assert.equal(result.blocked.length, 1);
  assert.equal(result.remaining.length, 1);
  assert.equal(result.remaining[0].url, 'https://hdblog.me/985910/ipzz-941/');
  assert.equal(blockedArticle.removed, true);
  assert.equal(keptArticle.removed, false);
  assert.equal(externalArticle.removed, false);
});
