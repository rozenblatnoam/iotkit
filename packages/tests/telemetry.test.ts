import test from "node:test";
import assert from "node:assert/strict";

import {
  TelemetryManager,
} from "@iotkit/core";

test("TelemetryManager report stores the latest record", () => {
  const telemetry = new TelemetryManager();

  telemetry.report(
    "temperature",
    24.5,
    {
      unit: "°C",
    }
  );

  const record =
    telemetry.get<number>("temperature");

  assert.ok(record);
  assert.equal(record.key, "temperature");
  assert.equal(record.value, 24.5);
  assert.equal(record.unit, "°C");
  assert.ok(record.timestamp instanceof Date);
});

test("TelemetryManager report replaces the previous value for the same key", () => {
  const telemetry = new TelemetryManager();

  telemetry.report(
    "temperature",
    24.5
  );

  telemetry.report(
    "temperature",
    25.1
  );

  assert.equal(
    telemetry.getValue<number>("temperature"),
    25.1
  );

  assert.equal(
    telemetry.getAll().length,
    1
  );
});

test("TelemetryManager onReport receives reported records", () => {
  const telemetry = new TelemetryManager();

  const records: unknown[] = [];

  telemetry.onReport((record) => {
    records.push(record);
  });

  telemetry.report(
    "battery",
    87,
    {
      unit: "%",
    }
  );

  assert.equal(records.length, 1);

  const record =
    records[0] as {
      key: string;
      value: unknown;
      unit?: string;
    };

  assert.equal(record.key, "battery");
  assert.equal(record.value, 87);
  assert.equal(record.unit, "%");
});

test("TelemetryManager preserves timestamp and metadata", () => {
  const telemetry = new TelemetryManager();

  const timestamp =
    new Date("2026-01-01T12:00:00.000Z");

  const metadata = {
    source: "sensor",
    quality: "good",
  };

  telemetry.report(
    "temperature",
    22.3,
    {
      timestamp,
      metadata,
    }
  );

  const record =
    telemetry.get<number>("temperature");

  assert.ok(record);
  assert.equal(
    record.timestamp,
    timestamp
  );
  assert.deepEqual(
    record.metadata,
    metadata
  );
});

test("TelemetryManager getAll returns the latest record for each key", () => {
  const telemetry = new TelemetryManager();

  telemetry.report("temperature", 24);
  telemetry.report("humidity", 60);

  const records =
    telemetry.getAll();

  assert.equal(records.length, 2);

  assert.deepEqual(
    records.map((record) => ({
      key: record.key,
      value: record.value,
    })),
    [
      {
        key: "temperature",
        value: 24,
      },
      {
        key: "humidity",
        value: 60,
      },
    ]
  );
});

test("TelemetryManager delete removes a record", () => {
  const telemetry = new TelemetryManager();

  telemetry.report(
    "temperature",
    24
  );

  assert.equal(
    telemetry.delete("temperature"),
    true
  );

  assert.equal(
    telemetry.has("temperature"),
    false
  );

  assert.equal(
    telemetry.get("temperature"),
    undefined
  );
});

test("TelemetryManager clear removes all records", () => {
  const telemetry = new TelemetryManager();

  telemetry.report("temperature", 24);
  telemetry.report("humidity", 60);

  telemetry.clear();

  assert.equal(
    telemetry.getAll().length,
    0
  );
});

test("TelemetryManager copies metadata from report options", () => {
  const telemetry = new TelemetryManager();

  const metadata = {
    source: "sensor",
  };

  telemetry.report(
    "temperature",
    24,
    {
      metadata,
    }
  );

  metadata.source = "modified";

  const record =
    telemetry.get<number>("temperature");

  assert.ok(record);

  assert.equal(
    record.metadata.source,
    "sensor"
  );
});
