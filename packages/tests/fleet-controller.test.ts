import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  FleetController,
  IotKitController,
  createMessage
} from "@iotkit/core";

describe("FleetController", () => {
  it("discovers devices and tracks firstSeen correctly", () => {
    const controller = new IotKitController();
    const fleet = new FleetController(controller);

    const events: Array<{
      deviceId: string;
      firstSeen: boolean;
    }> = [];

    fleet.onTwin((event) => {
      events.push({
        deviceId: event.deviceId,
        firstSeen: event.firstSeen
      });
    });

    const twin1 = createMessage(
      "drone-1",
      "twin",
      {
        status: "ready"
      }
    );

    const twin2 = createMessage(
      "drone-1",
      "twin",
      {
        status: "flying"
      }
    );

    controller.events.emit("twin", twin1);
    controller.events.emit("twin", twin2);

    assert.deepEqual(
      fleet.list(),
      ["drone-1"]
    );

    assert.deepEqual(
      events,
      [
        {
          deviceId: "drone-1",
          firstSeen: true
        },
        {
          deviceId: "drone-1",
          firstSeen: false
        }
      ]
    );

    assert.equal(
      fleet.getTwin("drone-1")?.data.status,
      "flying"
    );
  });

  it("returns known devices and requires known Twins", () => {
    const controller = new IotKitController();
    const fleet = new FleetController(controller);

    const twin = createMessage(
      "device-1",
      "twin",
      {
        online: true
      }
    );

    controller.events.emit("twin", twin);

    assert.deepEqual(
      fleet.listDevices(),
      ["device-1"]
    );

    assert.equal(
      fleet.getDevices().length,
      1
    );

    assert.equal(
      fleet.requireTwin("device-1").deviceId,
      "device-1"
    );

    assert.throws(
      () => fleet.requireTwin("missing"),
      /not known to the fleet/
    );
  });

  it("waits for a matching Twin and ignores non-matching Twins", async () => {
    const controller = new IotKitController();
    const fleet = new FleetController(controller);

    const waiting = fleet.waitForTwin(
      "drone-1",
      (twin) => twin.data.status === "ready",
      1000
    );

    controller.events.emit(
      "twin",
      createMessage(
        "other-device",
        "twin",
        {
          status: "ready"
        }
      )
    );

    controller.events.emit(
      "twin",
      createMessage(
        "drone-1",
        "twin",
        {
          status: "landing"
        }
      )
    );

    controller.events.emit(
      "twin",
      createMessage(
        "drone-1",
        "twin",
        {
          status: "ready"
        }
      )
    );

    const result = await waiting;

    assert.equal(
      result.deviceId,
      "drone-1"
    );

    assert.equal(
      result.data.status,
      "ready"
    );
  });

  it("returns an existing matching Twin immediately", async () => {
    const controller = new IotKitController();
    const fleet = new FleetController(controller);

    controller.events.emit(
      "twin",
      createMessage(
        "cached-device",
        "twin",
        {
          ready: true
        }
      )
    );

    const result = await fleet.waitForTwin(
      "cached-device",
      (twin) => twin.data.ready === true
    );

    assert.equal(
      result.deviceId,
      "cached-device"
    );
  });

  it("times out when the requested Twin never arrives", async () => {
    const controller = new IotKitController();
    const fleet = new FleetController(controller);

    await assert.rejects(
      fleet.waitForDevice(
        "never-seen",
        20
      ),
      /Timed out waiting for Twin/
    );
  });

  it("emits device discovery only for firstSeen devices", () => {
    const controller = new IotKitController();
    const fleet = new FleetController(controller);

    const discovered: string[] = [];

    fleet.onDeviceDiscovered((event) => {
      discovered.push(event.deviceId);
    });

    controller.events.emit(
      "twin",
      createMessage(
        "drone-1",
        "twin",
        {}
      )
    );

    controller.events.emit(
      "twin",
      createMessage(
        "drone-1",
        "twin",
        {
          changed: true
        }
      )
    );

    controller.events.emit(
      "twin",
      createMessage(
        "drone-2",
        "twin",
        {}
      )
    );

    assert.deepEqual(
      discovered,
      ["drone-1", "drone-2"]
    );
  });

  it("clears the Twin cache", () => {
    const controller = new IotKitController();
    const fleet = new FleetController(controller);

    controller.events.emit(
      "twin",
      createMessage(
        "drone-1",
        "twin",
        {}
      )
    );

    assert.deepEqual(
      fleet.list(),
      ["drone-1"]
    );

    fleet.clearCache();

    assert.deepEqual(
      fleet.list(),
      []
    );

    assert.equal(
      fleet.getTwin("drone-1"),
      undefined
    );
  });

  it("disposes its Controller subscription", () => {
    const controller = new IotKitController();
    const fleet = new FleetController(controller);

    fleet.dispose();

    controller.events.emit(
      "twin",
      createMessage(
        "after-dispose",
        "twin",
        {}
      )
    );

    assert.deepEqual(
      fleet.list(),
      []
    );
  });
});
