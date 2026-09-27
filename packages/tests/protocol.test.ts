import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createMessage,
  decodeMessage,
  encodeMessage,
  isEncodedMessage,
  MessageProtocolError
} from "@iotkit/core";

test(
  "encodeMessage returns valid JSON",
  () => {
    const message =
      createMessage(
        "device-1",
        "telemetry",
        {
          temperature: 25
        }
      );

    const encoded =
      encodeMessage(message);

    assert.equal(
      typeof encoded,
      "string"
    );

    assert.deepEqual(
      JSON.parse(encoded),
      message
    );
  }
);

test(
  "decodeMessage decodes a string payload",
  () => {
    const message =
      createMessage(
        "device-1",
        "state",
        {
          armed: true
        }
      );

    const decoded =
      decodeMessage(
        JSON.stringify(message)
      );

    assert.deepEqual(
      decoded,
      message
    );
  }
);

test(
  "decodeMessage decodes Uint8Array payload",
  () => {
    const message =
      createMessage(
        "device-1",
        "twin",
        {
          running: true
        }
      );

    const payload =
      new TextEncoder().encode(
        JSON.stringify(message)
      );

    const decoded =
      decodeMessage(payload);

    assert.deepEqual(
      decoded,
      message
    );
  }
);

test(
  "encode and decode preserve the complete envelope",
  () => {
    const message =
      createMessage(
        "device-1",
        "command-result",
        {
          command: "takeoff",
          success: true,
          result: {
            altitude: 20
          }
        },
        {
          messageId: "message-123",
          correlationId: "command-123",
          timestamp:
            new Date(
              "2026-01-01T12:00:00.000Z"
            )
        }
      );

    const decoded =
      decodeMessage(
        encodeMessage(message)
      );

    assert.deepEqual(
      decoded,
      message
    );
  }
);

test(
  "encodeMessage rejects an invalid envelope",
  () => {
    const invalid = {
      version: 2,
      messageId: "message-123",
      deviceId: "device-1",
      timestamp:
        new Date().toISOString(),
      type: "twin",
      data: {}
    };

    assert.throws(
      () =>
        encodeMessage(
          invalid as never
        ),
      (error: unknown) => {
        assert.ok(
          error instanceof MessageProtocolError
        );

        assert.equal(
          error.message,
          "Invalid iotkit message envelope."
        );

        return true;
      }
    );
  }
);

test(
  "decodeMessage rejects invalid JSON",
  () => {
    assert.throws(
      () =>
        decodeMessage(
          "{ invalid json"
        ),
      (error: unknown) => {
        assert.ok(
          error instanceof MessageProtocolError
        );

        assert.equal(
          error.message,
          "Invalid JSON message."
        );

        return true;
      }
    );
  }
);

test(
  "decodeMessage rejects an empty payload",
  () => {
    assert.throws(
      () =>
        decodeMessage(""),
      (error: unknown) => {
        assert.ok(
          error instanceof MessageProtocolError
        );

        assert.equal(
          error.message,
          "Cannot decode an empty message."
        );

        return true;
      }
    );

    assert.throws(
      () =>
        decodeMessage("   "),
      (error: unknown) => {
        assert.ok(
          error instanceof MessageProtocolError
        );

        assert.equal(
          error.message,
          "Cannot decode an empty message."
        );

        return true;
      }
    );
  }
);

test(
  "decodeMessage rejects invalid envelope",
  () => {
    const invalid = {
      version: 1,
      messageId: "message-123",
      deviceId: "device-1",
      timestamp:
        new Date().toISOString(),
      type: "invalid",
      data: {}
    };

    assert.throws(
      () =>
        decodeMessage(
          JSON.stringify(invalid)
        ),
      (error: unknown) => {
        assert.ok(
          error instanceof MessageProtocolError
        );

        assert.equal(
          error.message,
          "Invalid iotkit message envelope."
        );

        return true;
      }
    );
  }
);

test(
  "isEncodedMessage returns true for valid messages",
  () => {
    const message =
      createMessage(
        "device-1",
        "event",
        {
          event: "test",
          payload: {}
        }
      );

    const encoded =
      encodeMessage(message);

    assert.equal(
      isEncodedMessage(encoded),
      true
    );

    assert.equal(
      isEncodedMessage(
        new TextEncoder().encode(
          encoded
        )
      ),
      true
    );
  }
);

test(
  "isEncodedMessage returns false for invalid messages",
  () => {
    assert.equal(
      isEncodedMessage(""),
      false
    );

    assert.equal(
      isEncodedMessage("{ invalid"),
      false
    );

    assert.equal(
      isEncodedMessage(
        JSON.stringify({
          version: 2
        })
      ),
      false
    );
  }
);

test(
  "MessageProtocolError has the expected name",
  () => {
    const error =
      new MessageProtocolError(
        "test error"
      );

    assert.ok(
      error instanceof Error
    );

    assert.equal(
      error.name,
      "MessageProtocolError"
    );

    assert.equal(
      error.message,
      "test error"
    );
  }
);
