#!/usr/bin/env node

import {
  Device,
  FleetManager
} from "@iotkit/core";

const fleet = new FleetManager();

fleet.register(
  new Device({
    id: "evo-max-01",
    name: "Evo Max 01",
    type: "uav"
  })
);

const command = process.argv[2];

if (command === "devices") {
  console.log("");
  console.log("IoTKit Devices");
  console.log("");

  const devices = fleet.getAll();

  if (devices.length === 0) {
    console.log("No devices registered.");
    process.exit(0);
  }

  console.log(
    "DEVICE".padEnd(16) +
    "STATUS".padEnd(12) +
    "TYPE".padEnd(10)
  );

  console.log(
    "-".repeat(38)
  );

  for (const device of devices) {
    const status = device.isRunning()
      ? "ONLINE"
      : "OFFLINE";

    console.log(
      device.id.padEnd(16) +
      status.padEnd(12) +
      device.type.padEnd(10)
    );
  }

  console.log("");
  process.exit(0);
}

console.log("IoTKit CLI");
console.log("IoT device management toolkit");
console.log("");
console.log("Commands:");
console.log("  devices    List registered devices");
