import test from "node:test";
import assert from "node:assert/strict";

import {
  StateManager,
} from "@iotkit/core";

test("StateManager set emits change event", () => {
  const state = new StateManager();

  const events: unknown[] = [];

  state.onChange((event) => {
    events.push(event);
  });

  assert.equal(
    state.set("armed", true),
    true
  );

  assert.equal(events.length, 1);

  const event = events[0] as {
    key: string;
    value: unknown;
    previousValue: unknown;
    timestamp: Date;
  };

  assert.equal(event.key, "armed");
  assert.equal(event.value, true);
  assert.equal(event.previousValue, undefined);
  assert.ok(event.timestamp instanceof Date);
});

test("StateManager set ignores no-op updates", () => {
  const state = new StateManager();

  let eventCount = 0;

  state.onChange(() => {
    eventCount++;
  });

  assert.equal(
    state.set("armed", true),
    true
  );

  assert.equal(
    state.set("armed", true),
    false
  );

  assert.equal(eventCount, 1);
});

test("StateManager delete emits change event", () => {
  const state = new StateManager();

  state.set("armed", true);

  const events: unknown[] = [];

  state.onChange((event) => {
    events.push(event);
  });

  assert.equal(
    state.delete("armed"),
    true
  );

  assert.equal(events.length, 1);

  const event = events[0] as {
    key: string;
    value: unknown;
    previousValue: unknown;
    timestamp: Date;
  };

  assert.equal(event.key, "armed");
  assert.equal(event.value, undefined);
  assert.equal(event.previousValue, true);
  assert.ok(event.timestamp instanceof Date);
});

test("StateManager delete ignores missing keys", () => {
  const state = new StateManager();

  let eventCount = 0;

  state.onChange(() => {
    eventCount++;
  });

  assert.equal(
    state.delete("missing"),
    false
  );

  assert.equal(eventCount, 0);
});

test("StateManager clear emits change event for every key", () => {
  const state = new StateManager();

  state.set("armed", true);
  state.set("mode", "flight");

  const events: unknown[] = [];

  state.onChange((event) => {
    events.push(event);
  });

  state.clear();

  assert.equal(events.length, 2);

  const simplifiedEvents = events.map((event) => {
    const stateEvent = event as {
      key: string;
      value: unknown;
      previousValue: unknown;
      timestamp: Date;
    };

    assert.ok(
      stateEvent.timestamp instanceof Date
    );

    return {
      key: stateEvent.key,
      value: stateEvent.value,
      previousValue: stateEvent.previousValue,
    };
  });

  assert.deepEqual(
    simplifiedEvents,
    [
      {
        key: "armed",
        value: undefined,
        previousValue: true,
      },
      {
        key: "mode",
        value: undefined,
        previousValue: "flight",
      },
    ]
  );
});

test("StateManager clear ignores empty state", () => {
  const state = new StateManager();

  let eventCount = 0;

  state.onChange(() => {
    eventCount++;
  });

  state.clear();

  assert.equal(eventCount, 0);
});

test("StateManager getAll returns a snapshot", () => {
  const state = new StateManager();

  state.set("armed", true);

  const snapshot = state.getAll();

  assert.deepEqual(snapshot, {
    armed: true,
  });

  snapshot.armed = false;

  assert.equal(
    state.get("armed"),
    true
  );
});
