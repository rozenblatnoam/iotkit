import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  Device,
  FleetManager,
  Capability
} from "@iotkit/core";

describe("FleetManager", () => {
  it("registers and unregisters devices with events", () => {
    const fleet = new FleetManager({
      name: "test-fleet"
    });

    const device = new Device({
      id: "device-1",
      type: "uav"
    });

    const registered: string[] = [];
    const unregistered: string[] = [];

    fleet.onDeviceRegistered(({ device }) => {
      registered.push(device.id);
    });

    fleet.onDeviceUnregistered(({ device }) => {
      unregistered.push(device.id);
    });

    fleet.register(device);

    assert.equal(fleet.size, 1);
    assert.equal(fleet.has("device-1"), true);
    assert.equal(fleet.get("device-1"), device);
    assert.deepEqual(registered, ["device-1"]);

    assert.equal(fleet.unregister("device-1"), true);
    assert.equal(fleet.size, 0);
    assert.deepEqual(unregistered, ["device-1"]);

    assert.equal(fleet.unregister("missing"), false);
    assert.deepEqual(unregistered, ["device-1"]);
  });

  it("rejects duplicate device registration", () => {
    const fleet = new FleetManager();
    const first = new Device({ id: "duplicate" });
    const second = new Device({ id: "duplicate" });

    fleet.register(first);

    assert.throws(
      () => fleet.register(second),
      /already exists/
    );

    assert.equal(fleet.size, 1);
    assert.equal(fleet.get("duplicate"), first);
  });

  it("finds devices by type, capability and predicate", () => {
    const fleet = new FleetManager();

    const drone = new Device({
      id: "drone-1",
      type: "uav"
    });

    drone.addCapability(
      new Capability({
        id: "gps",
        type: "navigation"
      })
    );

    const sensor = new Device({
      id: "sensor-1",
      type: "sensor"
    });

    sensor.addCapability(
      new Capability({
        id: "temperature",
        type: "measurement"
      })
    );

    fleet.register(drone);
    fleet.register(sensor);

    assert.deepEqual(
      fleet.findByType("uav").map((device) => device.id),
      ["drone-1"]
    );

    assert.deepEqual(
      fleet.findByCapability("gps").map((device) => device.id),
      ["drone-1"]
    );

    assert.deepEqual(
      fleet.find((device) => device.id.endsWith("-1"))
        .map((device) => device.id),
      ["drone-1", "sensor-1"]
    );
  });

  it("emits command:executed only after a successful command", async () => {
    const fleet = new FleetManager();
    const device = new Device({ id: "command-device" });

    let executions = 0;

    device.addCommand("ping", () => {});
    device.addCommand("fail", () => {
      throw new Error("command failure");
    });

    fleet.register(device);

    fleet.onCommandExecuted(({ command }) => {
      assert.equal(command, "ping");
      executions++;
    });

    await fleet.executeCommand("command-device", "ping");

    assert.equal(executions, 1);

    await assert.rejects(
      fleet.executeCommand("command-device", "fail"),
      /command failure/
    );

    assert.equal(executions, 1);
  });

  it("throws when executing a command on an unknown device", async () => {
    const fleet = new FleetManager({
      name: "test-fleet"
    });

    await assert.rejects(
      fleet.executeCommand("missing", "ping"),
      /not registered in fleet "test-fleet"/
    );
  });

  it("aggregates device twin snapshots", () => {
    const fleet = new FleetManager();

    const first = new Device({ id: "twin-1" });
    const second = new Device({ id: "twin-2" });

    first.setState("status", "ready");
    second.setState("status", "idle");

    fleet.register(first);
    fleet.register(second);

    const twins = fleet.getTwins();

    assert.equal(twins.length, 2);
    assert.deepEqual(
      twins.map((twin) => twin.id),
      ["twin-1", "twin-2"]
    );
    assert.equal(twins[0]?.state.status, "ready");
    assert.equal(twins[1]?.state.status, "idle");
  });

  it("clears all devices and emits unregistration events", () => {
    const fleet = new FleetManager();

    const unregistered: string[] = [];

    fleet.onDeviceUnregistered(({ device }) => {
      unregistered.push(device.id);
    });

    fleet.register(new Device({ id: "clear-1" }));
    fleet.register(new Device({ id: "clear-2" }));

    fleet.clear();

    assert.equal(fleet.size, 0);
    assert.deepEqual(unregistered, ["clear-1", "clear-2"]);

    fleet.clear();

    assert.deepEqual(unregistered, ["clear-1", "clear-2"]);
  });
});


