import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MODERN_BOARD_RESUME_MAX_HOPS,
  nextModernBoardResumeState,
  parseModernBoardResume,
} from '../src/modern-board-progress-resume.js';

const board = 'https://1080xin.com/boards/7RHPO2w4jFUYiDhDsxz0wE';
const page9 = board + '?page=9';

test('x1080x dynamic board unreadable page can be resumed in the same tab', () => {
  const plan = nextModernBoardResumeState(board + '?page=2', page9, null, 123456);
  assert.equal(plan.status, 'ready');
  assert.equal(plan.state.targetUrl, page9);
  assert.equal(plan.state.scope, board);
  assert.deepEqual(plan.state.visitedUrls, [page9]);
  assert.deepEqual(parseModernBoardResume(JSON.stringify(plan.state), page9, 123500), plan.state);
});

test('refuse off-board, cross-origin and same-page automatic navigation', () => {
  assert.equal(nextModernBoardResumeState(board, board).status, 'invalid');
  assert.equal(nextModernBoardResumeState(board, 'https://evil.test/boards/7RHPO2w4jFUYiDhDsxz0wE?page=9').status, 'invalid');
  assert.equal(nextModernBoardResumeState(board, 'https://1080xin.com/boards/anotherBoard?page=9').status, 'invalid');
  assert.equal(nextModernBoardResumeState('https://1080xin.com/resources/X', page9).status, 'invalid');
});

test('stop automatic page walking on hop limit and repeated page', () => {
  let plan = nextModernBoardResumeState(board, page9, null, 123456);
  for (let n = 10; n < 9 + MODERN_BOARD_RESUME_MAX_HOPS; n++) {
    plan = nextModernBoardResumeState(board + '?page=' + (n - 1),
      board + '?page=' + n, plan.state, 123456 + n);
    assert.equal(plan.status, 'ready');
  }
  assert.equal(plan.state.visitedUrls.length, MODERN_BOARD_RESUME_MAX_HOPS);
  assert.equal(nextModernBoardResumeState(board + '?page=20', page9, plan.state).status, 'limit');
  assert.equal(nextModernBoardResumeState(board + '?page=20', board + '?page=21', plan.state).status, 'limit');
});

test('pending dynamic browser resume expires and cannot attach to a different page', () => {
  const plan = nextModernBoardResumeState(board, page9, null, 100000);
  assert.equal(parseModernBoardResume(JSON.stringify(plan.state), board, 100001), null);
  assert.equal(parseModernBoardResume(JSON.stringify(plan.state), page9, 500001), null);
  assert.equal(parseModernBoardResume('{invalid-json', page9, 100000), null);
  assert.equal(parseModernBoardResume(JSON.stringify({...plan.state, scope: 'other'}), page9, 100000), null);
});
