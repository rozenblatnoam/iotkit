import test from "node:test";
import assert from "node:assert/strict";

import {
  createMessage,
  decodeMessage,
  encodeMessage,
} from "@iotkit/core";

// NOTE: this file is intended to live under the project root at /tests.
// The generated file uses ../packages/... relative to /tests.

test("Message protocol round-trip", () => {
  const original = createMessage(
    "protocol-test-device",
    "event",
    {
      event: "integration-test",
      value: 42,
    },
    { correlationId: "corr-123" },
  );

  const encoded = encodeMessage(original);
  const decoded = decodeMessage(encoded);

  assert.deepEqual(decoded, original);
  assert.equal(decoded.version, 1);
  assert.equal(decoded.deviceId, "protocol-test-device");
  assert.equal(decoded.type, "event");
  assert.equal(decoded.correlationId, "corr-123");
  assert.deepEqual(decoded.data, {
    event: "integration-test",
    value: 42,
  });
});
