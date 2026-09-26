import {
  EvoMaxSimulator
} from "@iotkit/core";

// --------------------------------------------------
// Create simulated EVO Max
// --------------------------------------------------

const drone = new EvoMaxSimulator({
  id: "evo-max-01",
  name: "EVO Max Inspection Drone",
  initialBattery: 87,
  initialLatitude: 31.8928,
  initialLongitude: 34.8113
});

const device = drone.device;

// --------------------------------------------------
// Device Events
// --------------------------------------------------

device.events.on(
  "device:start",
  () => {
    console.log(
      "UAV device started"
    );
  }
);

device.events.on(
  "device:stop",
  () => {
    console.log(
      "UAV device stopped"
    );
  }
);

// --------------------------------------------------
// Sensor Events
// --------------------------------------------------

device.events.on(
  "sensor:change",
  (event: any) => {
    console.log(
      `Sensor ${event.sensor.id}:`,
      event.value
    );
  }
);

// --------------------------------------------------
// Telemetry Events
// --------------------------------------------------

device.events.on(
  "telemetry:report",
  (event: any) => {
    console.log(
      `Telemetry ${event.record.key}:`,
      event.record.value
    );
  }
);

// --------------------------------------------------
// Command Events
// --------------------------------------------------

device.events.on(
  "command:executed",
  (event: any) => {
    console.log(
      `Command executed: ${event.command.name}`
    );
  }
);

device.events.on(
  "command:error",
  (event: any) => {
    console.error(
      `Command error: ${event.command.name}`,
      event.error
    );
  }
);

// --------------------------------------------------
// Start
// --------------------------------------------------

drone.start();

console.log(
  "Device:",
  device.id
);

console.log(
  "Type:",
  device.type
);

// --------------------------------------------------
// Initial state
// --------------------------------------------------

console.log(
  "Initial flight mode:",
  drone.getFlightMode()
);

console.log(
  "Initial position:",
  drone.getPosition()
);

console.log(
  "Initial battery:",
  drone.battery.getValue()
);

// --------------------------------------------------
// Arm
// --------------------------------------------------

console.log(
  "Arming UAV..."
);

await device.execute(
  "arm"
);

console.log(
  "Armed:",
  drone.isArmed()
);

console.log(
  "Flight mode:",
  drone.getFlightMode()
);

// --------------------------------------------------
// Takeoff
// --------------------------------------------------

console.log(
  "Taking off..."
);

await device.execute(
  "takeoff",
  {
    altitude: 20
  }
);

await device.waitForRules();

console.log(
  "Altitude:",
  drone.altitude.getValue()
);

console.log(
  "Speed:",
  drone.speed.getValue()
);

console.log(
  "Flight mode:",
  drone.getFlightMode()
);

// --------------------------------------------------
// Simulate flight
// --------------------------------------------------

console.log(
  "Simulating flight..."
);

drone.simulateFlight(
  35,
  8,
  90
);

await device.waitForRules();

drone.setPosition(
  31.8935,
  34.8201,
  35
);

await device.waitForRules();

console.log(
  "Position:",
  drone.getPosition()
);

console.log(
  "Altitude:",
  drone.altitude.getValue()
);

console.log(
  "Speed:",
  drone.speed.getValue()
);

console.log(
  "Heading:",
  drone.heading.getValue()
);

// --------------------------------------------------
// Battery simulation
// --------------------------------------------------

console.log(
  "Battery:",
  drone.battery.getValue()
);

drone.setBattery(45);

await device.waitForRules();

drone.setBattery(19);

await device.waitForRules();

console.log(
  "Battery after simulation:",
  drone.battery.getValue()
);

// --------------------------------------------------
// Return Home
// --------------------------------------------------

console.log(
  "Executing return-home..."
);

await device.execute(
  "return-home"
);

await device.waitForRules();

console.log(
  "Flight mode:",
  drone.getFlightMode()
);

// --------------------------------------------------
// Land
// --------------------------------------------------

console.log(
  "Landing..."
);

await device.execute(
  "land"
);

await device.waitForRules();

console.log(
  "Altitude:",
  drone.altitude.getValue()
);

console.log(
  "Flight mode:",
  drone.getFlightMode()
);

// --------------------------------------------------
// Device Twin
// --------------------------------------------------

console.log(
  "Final Device Twin:"
);

console.dir(
  device.getTwinSnapshot(),
  {
    depth: null
  }
);
