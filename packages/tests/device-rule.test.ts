import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  Device,
  Rule
} from "@iotkit/core";

describe("Device Rule Integration", () => {
  it("queues rule evaluations and waits for completion", async () => {
    const device = new Device({
      id: "rule-device"
    });

    const executions: number[] = [];

    const rule = new Rule({
      id: "sequence-rule",
      condition: ({ event }) => {
        const value =
          (event as { value: number }).value;

        return value > 0;
      },
      action: async ({ event }) => {
        const value =
          (event as { value: number }).value;

        await new Promise<void>((resolve) =>
          setTimeout(resolve, 5)
        );

        executions.push(value);
      }
    });

    device.addRule(rule);

    device.setState("value", 1);
    device.setState("value", 2);
    device.setState("value", 3);

    await device.waitForRules();

    assert.deepEqual(
      executions,
      [1, 2, 3]
    );
  });

  it("emits rule:executed at the device level", async () => {
    const device = new Device({
      id: "executed-event-device"
    });

    let executedRuleId:
      string | undefined;

    let executedEventType:
      string | undefined;

    device.events.on(
      "rule:executed",
      (event) => {
        executedRuleId =
          event.rule.id;

        executedEventType =
          event.eventType;
      }
    );

    const rule = new Rule({
      id: "executed-rule",
      trigger: "state:change",
      condition: () => true,
      action: () => {}
    });

    device.addRule(rule);

    device.setState(
      "temperature",
      30
    );

    await device.waitForRules();

    assert.equal(
      executedRuleId,
      "executed-rule"
    );

    assert.equal(
      executedEventType,
      "state:change"
    );
  });

  it("isolates rule errors and keeps the queue alive", async () => {
    const device = new Device({
      id: "error-device"
    });

    let errorReceived = false;
    let successfulExecutions = 0;

    device.events.on(
      "rule:error",
      (event) => {
        errorReceived =
          event.error instanceof Error &&
          event.error.message ===
            "rule failure";
      }
    );

    const failingRule = new Rule({
      id: "failing-rule",
      condition: () => true,
      action: () => {
        throw new Error(
          "rule failure"
        );
      }
    });

    const successfulRule = new Rule({
      id: "successful-rule",
      condition: () => true,
      action: () => {
        successfulExecutions++;
      }
    });

    device
      .addRule(failingRule)
      .addRule(successfulRule);

    device.setState(
      "test",
      true
    );

    await device.waitForRules();

    assert.equal(
      errorReceived,
      true
    );

    assert.equal(
      successfulExecutions,
      1
    );
  });
});
