import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createMessage,
  IotKitController
} from "@iotkit/core";

import type {
  Transport,
  TransportMessageHandler,
  TransportPublishOptions
} from "@iotkit/core";

class FakeTransport implements Transport {
  readonly name = "fake";

  private connected = false;

  private readonly handlers =
    new Map<string, TransportMessageHandler>();

  readonly published: Array<{
    topic: string;
    payload: string | Uint8Array;
    options?: TransportPublishOptions;
  }> = [];

  connectCalls = 0;
  disconnectCalls = 0;
  subscribeCalls = 0;

  async connect(): Promise<void> {
    this.connectCalls += 1;
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.disconnectCalls += 1;
    this.connected = false;
  }

  async publish(
    topic: string,
    payload: string | Uint8Array,
    options?: TransportPublishOptions
  ): Promise<void> {
    this.published.push({
      topic,
      payload,
      ...(options !== undefined
        ? { options }
        : {})
    });
  }

  async subscribe(
    topic: string,
    handler: TransportMessageHandler
  ): Promise<() => void> {
    this.subscribeCalls += 1;
    this.handlers.set(topic, handler);

    return () => {
      this.handlers.delete(topic);
    };
  }

  isConnected(): boolean {
    return this.connected;
  }

  async emit(
    topic: string,
    payload: string | Uint8Array
  ): Promise<void> {
    for (const [
      filter,
      handler
    ] of this.handlers) {
      if (
        FakeTransport.matchesTopic(
          filter,
          topic
        )
      ) {
        await handler({
          topic,
          payload
        });
      }
    }
  }

  private static matchesTopic(
    filter: string,
    topic: string
  ): boolean {
    const filterParts =
      filter.split("/");

    const topicParts =
      topic.split("/");

    for (
      let index = 0;
      index < filterParts.length;
      index += 1
    ) {
      const filterPart =
        filterParts[index];

      const topicPart =
        topicParts[index];

      if (filterPart === "#") {
        return (
          index ===
          filterParts.length - 1
        );
      }

      if (filterPart === "+") {
        if (
          topicPart === undefined
        ) {
          return false;
        }

        continue;
      }

      if (
        filterPart !== topicPart
      ) {
        return false;
      }
    }

    return (
      filterParts.length ===
      topicParts.length
    );
  }
}

test(
  "Controller connects and subscribes",
  async () => {
    const transport =
      new FakeTransport();

    const controller =
      new IotKitController(
        transport
      );

    await controller.connect();

    assert.equal(
      controller.isConnected(),
      true
    );

    assert.equal(
      transport.connectCalls,
      1
    );

    assert.equal(
      transport.subscribeCalls,
      1
    );
  }
);

test(
  "Controller connect is idempotent",
  async () => {
    const transport =
      new FakeTransport();

    const controller =
      new IotKitController(
        transport
      );

    await controller.connect();
    await controller.connect();

    assert.equal(
      transport.connectCalls,
      1
    );

    assert.equal(
      transport.subscribeCalls,
      1
    );
  }
);

test(
  "Controller disconnects and becomes disconnected",
  async () => {
    const transport =
      new FakeTransport();

    const controller =
      new IotKitController(
        transport
      );

    await controller.connect();
    await controller.disconnect();

    assert.equal(
      controller.isConnected(),
      false
    );

    assert.equal(
      transport.disconnectCalls,
      1
    );
  }
);

test(
  "Controller routes telemetry, state, twin and event messages",
  async () => {
    const transport =
      new FakeTransport();

    const controller =
      new IotKitController(
        transport
      );

    await controller.connect();

    let telemetryReceived = 0;
    let stateReceived = 0;
    let twinReceived = 0;
    let eventReceived = 0;
    let messageReceived = 0;

    controller.onTelemetry(
      (message) => {
        telemetryReceived += 1;

        assert.equal(
          message.type,
          "telemetry"
        );
      }
    );

    controller.onState(
      (message) => {
        stateReceived += 1;

        assert.equal(
          message.type,
          "state"
        );
      }
    );

    controller.onTwin(
      (message) => {
        twinReceived += 1;

        assert.equal(
          message.type,
          "twin"
        );
      }
    );

    controller.onEvent(
      (message) => {
        eventReceived += 1;

        assert.equal(
          message.type,
          "event"
        );
      }
    );

    controller.onMessage(
      () => {
        messageReceived += 1;
      }
    );

    const telemetryMessage =
      createMessage(
        "drone-1",
        "telemetry",
        {
          key: "temperature",
          value: 25
        }
      );

    const stateMessage =
      createMessage(
        "drone-1",
        "state",
        {
          key: "armed",
          value: true
        }
      );

    const twinMessage =
      createMessage(
        "drone-1",
        "twin",
        {
          running: true
        }
      );

    const eventMessage =
      createMessage(
        "drone-1",
        "event",
        {
          event: "test",
          payload: {}
        }
      );

    await transport.emit(
      "iotkit/drone-1/telemetry/temperature",
      JSON.stringify(
        telemetryMessage
      )
    );

    await transport.emit(
      "iotkit/drone-1/state/armed",
      JSON.stringify(
        stateMessage
      )
    );

    await transport.emit(
      "iotkit/drone-1/twin",
      JSON.stringify(
        twinMessage
      )
    );

    await transport.emit(
      "iotkit/drone-1/events/test",
      JSON.stringify(
        eventMessage
      )
    );

    assert.equal(
      telemetryReceived,
      1
    );

    assert.equal(
      stateReceived,
      1
    );

    assert.equal(
      twinReceived,
      1
    );

    assert.equal(
      eventReceived,
      1
    );

    assert.equal(
      messageReceived,
      4
    );
  }
);

test(
  "Controller filters messages by configured deviceId",
  async () => {
    const transport =
      new FakeTransport();

    const controller =
      new IotKitController(
        transport,
        {
          deviceId: "drone-1"
        }
      );

    await controller.connect();

    let received = 0;

    controller.onMessage(
      () => {
        received += 1;
      }
    );

    const accepted =
      createMessage(
        "drone-1",
        "twin",
        {
          running: true
        }
      );

    const rejected =
      createMessage(
        "drone-2",
        "twin",
        {
          running: true
        }
      );

    await transport.emit(
      "iotkit/drone-1/twin",
      JSON.stringify(accepted)
    );

    await transport.emit(
      "iotkit/drone-2/twin",
      JSON.stringify(rejected)
    );

    assert.equal(
      received,
      1
    );
  }
);

test(
  "Controller publishes command to the correct topic",
  async () => {
    const transport =
      new FakeTransport();

    const controller =
      new IotKitController(
        transport
      );

    await controller.connect();

    const commandPromise =
      controller.sendCommand(
        "drone-1",
        "takeoff",
        {
          altitude: 20
        }
      );

    assert.equal(
      transport.published.length,
      1
    );

    const published =
      transport.published[0];

    assert.ok(
      published !== undefined
    );

    assert.equal(
      published.topic,
      "iotkit/drone-1/commands/takeoff"
    );

    const payload =
      JSON.parse(
        String(published.payload)
      ) as {
        deviceId: string;
        type: string;
        data: unknown;
        messageId: string;
      };

    assert.equal(
      payload.deviceId,
      "drone-1"
    );

    assert.equal(
      payload.type,
      "command"
    );

    assert.deepEqual(
      payload.data,
      {
        altitude: 20
      }
    );

    const result =
      createMessage(
        "drone-1",
        "command-result",
        {
          command: "takeoff",
          success: true,
          result: {
            accepted: true
          }
        },
        {
          correlationId:
            payload.messageId
        }
      );

    await transport.emit(
      "iotkit/drone-1/commands/takeoff/result",
      JSON.stringify(result)
    );

    await commandPromise;
  }
);

test(
  "Controller resolves command from command-result correlationId",
  async () => {
    const transport =
      new FakeTransport();

    const controller =
      new IotKitController(
        transport
      );

    await controller.connect();

    const commandPromise =
      controller.sendCommand(
        "drone-1",
        "arm"
      );

    const published =
      transport.published[0];

    assert.ok(
      published !== undefined
    );

    const command =
      JSON.parse(
        String(published.payload)
      ) as {
        messageId: string;
      };

    const result =
      createMessage(
        "drone-1",
        "command-result",
        {
          command: "arm",
          success: true,
          result: {
            armed: true
          }
        },
        {
          correlationId:
            command.messageId
        }
      );

    await transport.emit(
      "iotkit/drone-1/commands/arm/result",
      JSON.stringify(result)
    );

    const response =
      await commandPromise;

    assert.equal(
      response.correlationId,
      command.messageId
    );

    assert.equal(
      response.data.success,
      true
    );

    assert.deepEqual(
      response.data.result,
      {
        armed: true
      }
    );
  }
);

test(
  "Controller command times out",
  async () => {
    const transport =
      new FakeTransport();

    const controller =
      new IotKitController(
        transport,
        {
          commandTimeoutMs: 30
        }
      );

    await controller.connect();

    await assert.rejects(
      controller.sendCommand(
        "drone-1",
        "land"
      ),
      /timed out after 30ms/i
    );
  }
);

test(
  "Controller rejects command when publish fails",
  async () => {
    const transport =
      new FakeTransport();

    transport.publish =
      async () => {
        throw new Error(
          "publish failed"
        );
      };

    const controller =
      new IotKitController(
        transport
      );

    await controller.connect();

    await assert.rejects(
      controller.sendCommand(
        "drone-1",
        "arm"
      ),
      /publish failed/
    );
  }
);

test(
  "Controller emits protocol:error for malformed payload",
  async () => {
    const transport =
      new FakeTransport();

    const controller =
      new IotKitController(
        transport
      );

    await controller.connect();

    let protocolErrorReceived = 0;

    controller.onProtocolError(
      (event) => {
        protocolErrorReceived += 1;

        assert.equal(
          event.topic,
          "iotkit/drone-1/twin"
        );

        assert.ok(
          event.error instanceof Error
        );
      }
    );

    await transport.emit(
      "iotkit/drone-1/twin",
      "{ invalid json"
    );

    assert.equal(
      protocolErrorReceived,
      1
    );
  }
);

test(
  "Controller disconnect rejects pending commands",
  async () => {
    const transport =
      new FakeTransport();

    const controller =
      new IotKitController(
        transport
      );

    await controller.connect();

    const commandPromise =
      controller.sendCommand(
        "drone-1",
        "takeoff"
      );

    await controller.disconnect();

    await assert.rejects(
      commandPromise,
      /IotKitController disconnected/
    );

    assert.equal(
      controller.isConnected(),
      false
    );
  }
);