import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createMessage,
  isMessageEnvelope,
  isMessageType
} from "@iotkit/core";

test(
  "createMessage creates a valid telemetry envelope",
  () => {
    const message =
      createMessage(
        "device-1",
        "telemetry",
        {
          key: "temperature",
          value: 25
        }
      );

    assert.equal(
      message.version,
      1
    );

    assert.equal(
      message.deviceId,
      "device-1"
    );

    assert.equal(
      message.type,
      "telemetry"
    );

    assert.equal(
      typeof message.messageId,
      "string"
    );

    assert.ok(
      message.messageId.length > 0
    );

    assert.equal(
      typeof message.timestamp,
      "string"
    );

    assert.ok(
      !Number.isNaN(
        Date.parse(
          message.timestamp
        )
      )
    );

    assert.deepEqual(
      message.data,
      {
        key: "temperature",
        value: 25
      }
    );

    assert.equal(
      isMessageEnvelope(message),
      true
    );
  }
);

test(
  "createMessage generates unique message IDs",
  () => {
    const first =
      createMessage(
        "device-1",
        "event",
        {}
      );

    const second =
      createMessage(
        "device-1",
        "event",
        {}
      );

    assert.notEqual(
      first.messageId,
      second.messageId
    );
  }
);

test(
  "createMessage supports correlationId",
  () => {
    const message =
      createMessage(
        "device-1",
        "command-result",
        {
          success: true
        },
        {
          correlationId: "command-123"
        }
      );

    assert.equal(
      message.correlationId,
      "command-123"
    );

    assert.equal(
      isMessageEnvelope(message),
      true
    );
  }
);

test(
  "createMessage supports custom messageId",
  () => {
    const message =
      createMessage(
        "device-1",
        "command",
        {},
        {
          messageId: "message-123"
        }
      );

    assert.equal(
      message.messageId,
      "message-123"
    );
  }
);

test(
  "createMessage supports custom timestamp",
  () => {
    const timestamp =
      new Date(
        "2026-01-01T12:00:00.000Z"
      );

    const message =
      createMessage(
        "device-1",
        "state",
        {
          armed: true
        },
        {
          timestamp
        }
      );

    assert.equal(
      message.timestamp,
      timestamp.toISOString()
    );
  }
);

test(
  "isMessageType accepts all supported message types",
  () => {
    const types = [
      "telemetry",
      "state",
      "command",
      "command-result",
      "twin",
      "event"
    ] as const;

    for (const type of types) {
      assert.equal(
        isMessageType(type),
        true
      );
    }
  }
);

test(
  "isMessageType rejects invalid values",
  () => {
    assert.equal(
      isMessageType("unknown"),
      false
    );

    assert.equal(
      isMessageType(""),
      false
    );

    assert.equal(
      isMessageType(null),
      false
    );

    assert.equal(
      isMessageType(undefined),
      false
    );

    assert.equal(
      isMessageType(123),
      false
    );
  }
);

test(
  "isMessageEnvelope accepts a valid envelope",
  () => {
    const message =
      createMessage(
        "device-1",
        "twin",
        {
          running: true
        }
      );

    assert.equal(
      isMessageEnvelope(message),
      true
    );
  }
);

test(
  "isMessageEnvelope rejects invalid version",
  () => {
    const message =
      createMessage(
        "device-1",
        "twin",
        {}
      );

    const invalid = {
      ...message,
      version: 2
    };

    assert.equal(
      isMessageEnvelope(invalid),
      false
    );
  }
);

test(
  "isMessageEnvelope rejects missing messageId",
  () => {
    const message =
      createMessage(
        "device-1",
        "twin",
        {}
      );

    const invalid = {
      ...message
    } as Record<string, unknown>;

    delete invalid.messageId;

    assert.equal(
      isMessageEnvelope(invalid),
      false
    );
  }
);

test(
  "isMessageEnvelope rejects empty messageId",
  () => {
    const message =
      createMessage(
        "device-1",
        "twin",
        {}
      );

    const invalid = {
      ...message,
      messageId: ""
    };

    assert.equal(
      isMessageEnvelope(invalid),
      false
    );
  }
);

test(
  "isMessageEnvelope rejects missing deviceId",
  () => {
    const message =
      createMessage(
        "device-1",
        "twin",
        {}
      );

    const invalid = {
      ...message
    } as Record<string, unknown>;

    delete invalid.deviceId;

    assert.equal(
      isMessageEnvelope(invalid),
      false
    );
  }
);

test(
  "isMessageEnvelope rejects empty deviceId",
  () => {
    const message =
      createMessage(
        "device-1",
        "twin",
        {}
      );

    const invalid = {
      ...message,
      deviceId: ""
    };

    assert.equal(
      isMessageEnvelope(invalid),
      false
    );
  }
);

test(
  "isMessageEnvelope rejects invalid timestamp",
  () => {
    const message =
      createMessage(
        "device-1",
        "twin",
        {}
      );

    const invalid = {
      ...message,
      timestamp: "not-a-date"
    };

    assert.equal(
      isMessageEnvelope(invalid),
      false
    );
  }
);

test(
  "isMessageEnvelope rejects invalid message type",
  () => {
    const message =
      createMessage(
        "device-1",
        "twin",
        {}
      );

    const invalid = {
      ...message,
      type: "invalid"
    };

    assert.equal(
      isMessageEnvelope(invalid),
      false
    );
  }
);

test(
  "isMessageEnvelope requires data property",
  () => {
    const message =
      createMessage(
        "device-1",
        "twin",
        {}
      );

    const invalid = {
      ...message
    } as Record<string, unknown>;

    delete invalid.data;

    assert.equal(
      isMessageEnvelope(invalid),
      false
    );
  }
);

test(
  "isMessageEnvelope rejects invalid correlationId",
  () => {
    const message =
      createMessage(
        "device-1",
        "command-result",
        {},
        {
          correlationId: "command-123"
        }
      );

    const invalid = {
      ...message,
      correlationId: 123
    };

    assert.equal(
      isMessageEnvelope(invalid),
      false
    );
  }
);

test(
  "isMessageEnvelope accepts envelope without correlationId",
  () => {
    const message =
      createMessage(
        "device-1",
        "telemetry",
        {}
      );

    assert.equal(
      "correlationId" in message,
      false
    );

    assert.equal(
      isMessageEnvelope(message),
      true
    );
  }
);

test(
  "isMessageEnvelope accepts arbitrary data",
  () => {
    const values = [
      null,
      true,
      123,
      "hello",
      [],
      {
        nested: {
          value: 42
        }
      }
    ];

    for (const data of values) {
      const message =
        createMessage(
          "device-1",
          "event",
          data
        );

      assert.equal(
        isMessageEnvelope(message),
        true
      );

      assert.deepEqual(
        message.data,
        data
      );
    }
  }
);