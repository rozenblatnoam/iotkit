import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  Rule
} from "@iotkit/core";

describe("Rule", () => {
  it("level mode executes whenever the condition is true", async () => {
    let executions = 0;

    const rule = new Rule({
      id: "level-test",
      mode: "level",
      condition: () => true,
      action: () => {
        executions++;
      }
    });

    assert.equal(
      await rule.evaluate({
        device: {},
        event: undefined,
        eventType: undefined
      }),
      true
    );

    assert.equal(
      await rule.evaluate({
        device: {},
        event: undefined,
        eventType: undefined
      }),
      true
    );

    assert.equal(executions, 2);
  });

  it("rising mode executes only on false -> true", async () => {
    let executions = 0;
    let condition = false;

    const rule = new Rule({
      id: "rising-test",
      mode: "rising",
      condition: () => condition,
      action: () => {
        executions++;
      }
    });

    assert.equal(
      await rule.evaluate({
        device: {},
        event: undefined,
        eventType: undefined
      }),
      false
    );

    condition = true;

    assert.equal(
      await rule.evaluate({
        device: {},
        event: undefined,
        eventType: undefined
      }),
      true
    );

    condition = true;

    assert.equal(
      await rule.evaluate({
        device: {},
        event: undefined,
        eventType: undefined
      }),
      false
    );

    assert.equal(executions, 1);
  });

  it("falling mode executes only on true -> false", async () => {
    let executions = 0;
    let condition = true;

    const rule = new Rule({
      id: "falling-test",
      mode: "falling",
      condition: () => condition,
      action: () => {
        executions++;
      }
    });

    assert.equal(
      await rule.evaluate({
        device: {},
        event: undefined,
        eventType: undefined
      }),
      false
    );

    condition = false;

    assert.equal(
      await rule.evaluate({
        device: {},
        event: undefined,
        eventType: undefined
      }),
      true
    );

    condition = false;

    assert.equal(
      await rule.evaluate({
        device: {},
        event: undefined,
        eventType: undefined
      }),
      false
    );

    assert.equal(executions, 1);
  });

  it("changed mode executes when the condition changes", async () => {
    let executions = 0;
    let condition = false;

    const rule = new Rule({
      id: "changed-test",
      mode: "changed",
      condition: () => condition,
      action: () => {
        executions++;
      }
    });

    assert.equal(
      await rule.evaluate({
        device: {},
        event: undefined,
        eventType: undefined
      }),
      false
    );

    condition = true;

    assert.equal(
      await rule.evaluate({
        device: {},
        event: undefined,
        eventType: undefined
      }),
      true
    );

    condition = false;

    assert.equal(
      await rule.evaluate({
        device: {},
        event: undefined,
        eventType: undefined
      }),
      true
    );

    assert.equal(executions, 2);
  });

  it("trigger matches a single event type", async () => {
    let executions = 0;

    const rule = new Rule({
      id: "trigger-test",
      trigger: "sensor:change",
      condition: () => true,
      action: () => {
        executions++;
      }
    });

    assert.equal(
      await rule.evaluate({
        device: {},
        event: {},
        eventType: "state:change"
      }),
      false
    );

    assert.equal(
      await rule.evaluate({
        device: {},
        event: {},
        eventType: "sensor:change"
      }),
      true
    );

    assert.equal(executions, 1);
  });

  it("trigger matches any event type in a trigger array", async () => {
    let executions = 0;

    const rule = new Rule({
      id: "trigger-array-test",
      trigger: [
        "sensor:change",
        "state:change"
      ],
      condition: () => true,
      action: () => {
        executions++;
      }
    });

    assert.equal(
      await rule.evaluate({
        device: {},
        event: {},
        eventType: "sensor:change"
      }),
      true
    );

    assert.equal(
      await rule.evaluate({
        device: {},
        event: {},
        eventType: "state:change"
      }),
      true
    );

    assert.equal(
      await rule.evaluate({
        device: {},
        event: {},
        eventType: "actuator:stateChange"
      }),
      false
    );

    assert.equal(executions, 2);
  });

  it("disable prevents evaluation and enable starts a fresh edge cycle", async () => {
    let executions = 0;
    let condition = false;

    const rule = new Rule({
      id: "enable-disable-test",
      mode: "rising",
      condition: () => condition,
      action: () => {
        executions++;
      }
    });

    await rule.evaluate({
      device: {},
      event: undefined,
      eventType: undefined
    });

    rule.disable();
    condition = true;

    assert.equal(
      await rule.evaluate({
        device: {},
        event: undefined,
        eventType: undefined
      }),
      false
    );

    assert.equal(executions, 0);
    assert.equal(rule.isEnabled(), false);

    rule.enable();

    assert.equal(
      await rule.evaluate({
        device: {},
        event: undefined,
        eventType: undefined
      }),
      false
    );

    assert.equal(executions, 0);
    assert.equal(rule.isEnabled(), true);

    condition = false;

    await rule.evaluate({
      device: {},
      event: undefined,
      eventType: undefined
    });

    condition = true;

    assert.equal(
      await rule.evaluate({
        device: {},
        event: undefined,
        eventType: undefined
      }),
      true
    );

    assert.equal(executions, 1);
  });

  it("reset clears the previous condition", async () => {
    let condition = false;

    const rule = new Rule({
      id: "reset-test",
      mode: "rising",
      condition: () => condition,
      action: () => {}
    });

    await rule.evaluate({
      device: {},
      event: undefined,
      eventType: undefined
    });

    assert.equal(
      rule.getPreviousCondition(),
      false
    );

    condition = true;

    await rule.evaluate({
      device: {},
      event: undefined,
      eventType: undefined
    });

    assert.equal(
      rule.getPreviousCondition(),
      true
    );

    rule.reset();

    assert.equal(
      rule.getPreviousCondition(),
      undefined
    );

    assert.equal(
      await rule.evaluate({
        device: {},
        event: undefined,
        eventType: undefined
      }),
      false
    );
  });

  it("emits matched and executed events in order", async () => {
    const events: string[] = [];
    const context = {
      device: {},
      event: { value: 42 },
      eventType: "sensor:change"
    };

    const rule = new Rule({
      id: "events-test",
      condition: () => true,
      action: () => {
        events.push("action");
      }
    });

    rule.on("matched", () => {
      events.push("matched");
    });

    rule.on("executed", () => {
      events.push("executed");
    });

    assert.equal(
      await rule.evaluate(context),
      true
    );

    assert.deepEqual(
      events,
      [
        "matched",
        "action",
        "executed"
      ]
    );
  });

  it("supports async conditions and actions", async () => {
    const events: string[] = [];

    const rule = new Rule({
      id: "async-test",
      condition: async () => {
        await Promise.resolve();
        events.push("condition");
        return true;
      },
      action: async () => {
        await Promise.resolve();
        events.push("action");
      }
    });

    const result = await rule.evaluate({
      device: {},
      event: undefined,
      eventType: undefined
    });

    assert.equal(result, true);

    assert.deepEqual(
      events,
      [
        "condition",
        "action"
      ]
    );
  });
});
