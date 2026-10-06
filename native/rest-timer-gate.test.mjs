/**
 * D-32 (#477): Rest Timer → Live Activity correctness gate.
 *
 * Deterministic regression suite for the timer state → published ActivityKit
 * state → rendered progress pipeline. TypeScript owns ALL rest state; this
 * verifies the forwarding layer never publishes stale/wrong state.
 *
 * Tests the REAL `createRestLiveActivity` from rest-live-activity.ts with an
 * injected mock facade — no iPhone, no ActivityKit, fully deterministic.
 *
 * Run: node --test rest-timer-gate.test.mjs (from native/)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// Stub native-only imports so the pure state machine loads under Node.
register('./rest-timer-gate.loader.mjs', import.meta.url);

// Import the REAL implementation. The facade is injected, so no native deps.
const { createRestLiveActivity } = await import('./src/native/ios/rest-live-activity.ts');

/**
 * Mock facade that records every native call with its arguments.
 * Resolves startRestActivity with a fake id after a microtask (async gap).
 */
function createMockFacade() {
  const calls = [];
  let nextId = 1;
  const facade = {
    startRestActivity: (params) => {
      calls.push({ method: 'start', params });
      const id = `activity-${nextId++}`;
      return Promise.resolve(id);
    },
    updateRestActivity: (id, params) => {
      calls.push({ method: 'update', id, params });
      return Promise.resolve();
    },
    endRestActivity: (id) => {
      calls.push({ method: 'end', id });
      return Promise.resolve();
    },
    addIslandRestIntentListener: () => () => {},
    getIslandRestState: () => Promise.resolve(null),
  };
  return { facade, calls };
}

const display = {
  exerciseName: 'Bench Press',
  setNumber: 2,
  totalSets: 3,
  languageCode: 'vi',
};

/** Flush pending microtasks (start promise resolution). */
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('D-32: Rest Timer → Live Activity gate', () => {
  it('start publishes resting state with correct end', async () => {
    const { facade, calls } = createMockFacade();
    const api = createRestLiveActivity(facade);

    api.restLiveActivityStarted(display, 90, 90);
    await flush();

    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'start');
    assert.equal(calls[0].params.activityState, 'resting');
    assert.equal(calls[0].params.totalSeconds, 90);
    assert.equal(calls[0].params.remainingSeconds, 90);
    assert.equal(calls[0].params.exerciseName, 'Bench Press');
  });

  it('-15s adjust publishes updated remaining (no stale state)', async () => {
    const { facade, calls } = createMockFacade();
    const api = createRestLiveActivity(facade);

    api.restLiveActivityStarted(display, 90, 90);
    await flush();
    api.restLiveActivityAdjusted(90, 75); // -15s
    await flush();

    const updates = calls.filter((c) => c.method === 'update');
    assert.equal(updates.length, 1, 'adjust must publish exactly one update');
    assert.equal(updates[0].params.remainingSeconds, 75);
    assert.equal(updates[0].params.totalSeconds, 90);
  });

  it('+15s adjust publishes updated remaining', async () => {
    const { facade, calls } = createMockFacade();
    const api = createRestLiveActivity(facade);

    api.restLiveActivityStarted(display, 90, 60);
    await flush();
    api.restLiveActivityAdjusted(90, 75); // +15s
    await flush();

    const updates = calls.filter((c) => c.method === 'update');
    assert.equal(updates.length, 1);
    assert.equal(updates[0].params.remainingSeconds, 75);
  });

  it('end publishes end for the active id (no resurrection)', async () => {
    const { facade, calls } = createMockFacade();
    const api = createRestLiveActivity(facade);

    api.restLiveActivityStarted(display, 90, 90);
    await flush();
    const startId = calls[0].params; // capture
    api.restLiveActivityEnded();
    await flush();

    const ends = calls.filter((c) => c.method === 'end');
    assert.equal(ends.length, 1, 'end must be published exactly once');
    // After end, no further updates may reference the old id
    api.restLiveActivityAdjusted(90, 75);
    await flush();
    const lateUpdates = calls.filter(
      (c) => c.method === 'update' && c.id === ends[0].id
    );
    assert.equal(lateUpdates.length, 0, 'no updates after end (stale resurrection)');
  });

  it('restart ends previous before starting new (no orphan)', async () => {
    const { facade, calls } = createMockFacade();
    const api = createRestLiveActivity(facade);

    api.restLiveActivityStarted(display, 90, 90);
    await flush();
    const firstId = calls.find((c) => c.method === 'start');
    assert.ok(firstId);

    api.restLiveActivityStarted(display, 120, 120);
    await flush();

    const ends = calls.filter((c) => c.method === 'end');
    const starts = calls.filter((c) => c.method === 'start');
    assert.equal(starts.length, 2);
    assert.equal(ends.length, 1, 'previous activity must be ended on restart');
  });

  it('stale start resolution is ended, not adopted (async race)', async () => {
    let resolveStart;
    const calls = [];
    const facade = {
      startRestActivity: (params) => {
        calls.push({ method: 'start', params });
        return new Promise((r) => { resolveStart = r; });
      },
      updateRestActivity: (id, params) => {
        calls.push({ method: 'update', id, params });
        return Promise.resolve();
      },
      endRestActivity: (id) => {
        calls.push({ method: 'end', id });
        return Promise.resolve();
      },
      addIslandRestIntentListener: () => () => {},
      getIslandRestState: () => Promise.resolve(null),
    };
    const api = createRestLiveActivity(facade);

    api.restLiveActivityStarted(display, 90, 90);
    // End before the start promise resolves (race)
    api.restLiveActivityEnded();
    resolveStart('stale-id');
    await flush();

    const ends = calls.filter((c) => c.method === 'end');
    assert.ok(
      ends.some((e) => e.id === 'stale-id'),
      'stale start id must be ended, not leaked'
    );
  });

  it('adjust during pending start replays after id arrives', async () => {
    let resolveStart;
    const calls = [];
    const facade = {
      startRestActivity: (params) => {
        calls.push({ method: 'start', params });
        return new Promise((r) => { resolveStart = r; });
      },
      updateRestActivity: (id, params) => {
        calls.push({ method: 'update', id, params });
        return Promise.resolve();
      },
      endRestActivity: (id) => {
        calls.push({ method: 'end', id });
        return Promise.resolve();
      },
      addIslandRestIntentListener: () => () => {},
      getIslandRestState: () => Promise.resolve(null),
    };
    const api = createRestLiveActivity(facade);

    api.restLiveActivityStarted(display, 90, 90);
    api.restLiveActivityAdjusted(90, 75); // lands while start pending
    resolveStart('activity-1');
    await flush();

    const updates = calls.filter((c) => c.method === 'update');
    assert.equal(updates.length, 1, 'pending adjust must replay');
    assert.equal(updates[0].params.remainingSeconds, 75);
    assert.equal(updates[0].id, 'activity-1');
  });

  it('double end is safe (idempotent)', async () => {
    const { facade, calls } = createMockFacade();
    const api = createRestLiveActivity(facade);

    api.restLiveActivityStarted(display, 90, 90);
    await flush();
    api.restLiveActivityEnded();
    api.restLiveActivityEnded();
    await flush();

    const ends = calls.filter((c) => c.method === 'end');
    assert.equal(ends.length, 1, 'double end must not double-publish');
  });
});
