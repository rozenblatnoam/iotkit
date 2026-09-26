import {
  Device,
  Sensor,
  Actuator,
  Capability,
  Rule,
  DeviceRegistry
} from "@iotkit/core";

// --------------------------------------------------
// Device Registry
// --------------------------------------------------

const registry = new DeviceRegistry();

registry.events.on(
  "device:registered",
  (event: any) => {
    console.log(
      `Registered device: ${event.device.id}`
    );
  }
);

// --------------------------------------------------
// Greenhouse Device
// --------------------------------------------------

const greenhouse = new Device({
  id: "greenhouse-01",
  name: "Greenhouse Controller",
  type: "greenhouse"
});

// --------------------------------------------------
// Temperature Sensor
// --------------------------------------------------

const temperature = new Sensor<number>({
  id: "temperature",
  type: "temperature",
  unit: "°C"
});

// --------------------------------------------------
// Fan Actuator
// --------------------------------------------------

const fan = new Actuator({
  id: "fan",
  type: "fan"
});

// --------------------------------------------------
// Temperature Capability
// --------------------------------------------------

const temperatureCapability = new Capability({
  id: "temperature-monitoring",
  type: "temperature",
  metadata: {
    min: -20,
    max: 80,
    precision: 0.1
  }
});

// --------------------------------------------------
// Register Greenhouse Components
// --------------------------------------------------

greenhouse
  .addSensor(temperature)
  .addActuator(fan)
  .addCapability(temperatureCapability);

// --------------------------------------------------
// Commands
// --------------------------------------------------

greenhouse.addCommand(
  "fan-on",
  () => {
    console.log(
      "Command received: fan-on"
    );

    fan.turnOn();
  },
  "Turn the fan on"
);

greenhouse.addCommand(
  "fan-off",
  () => {
    console.log(
      "Command received: fan-off"
    );

    fan.turnOff();
  },
  "Turn the fan off"
);

// --------------------------------------------------
// Rules
// --------------------------------------------------

const highTemperatureRule = new Rule({
  id: "high-temperature",

  name:
    "Turn fan on when temperature is high",

  trigger: "sensor:change",

  mode: "rising",

  condition: ({ event }) => {
    const sensorEvent = event as {
      sensor: Sensor<number>;
      value: number;
    };

    return (
      sensorEvent.sensor.id ===
        "temperature" &&
      sensorEvent.value > 30
    );
  },

  action: () => {
    fan.turnOn();
  }
});

const lowTemperatureRule = new Rule({
  id: "low-temperature",

  name:
    "Turn fan off when temperature drops",

  trigger: "sensor:change",

  mode: "rising",

  condition: ({ event }) => {
    const sensorEvent = event as {
      sensor: Sensor<number>;
      value: number;
    };

    return (
      sensorEvent.sensor.id ===
        "temperature" &&
      sensorEvent.value < 28
    );
  },

  action: () => {
    fan.turnOff();
  }
});

greenhouse
  .addRule(highTemperatureRule)
  .addRule(lowTemperatureRule);

// --------------------------------------------------
// Device Events
// --------------------------------------------------

greenhouse.events.on(
  "device:start",
  () => {
    console.log(
      "Greenhouse started"
    );
  }
);

// --------------------------------------------------
// Sensor Events
// --------------------------------------------------

greenhouse.events.on(
  "sensor:change",
  (event: any) => {
    console.log(
      `Temperature: ${event.value}${temperature.unit}`
    );
  }
);

// --------------------------------------------------
// Telemetry Events
// --------------------------------------------------

greenhouse.onTelemetry(
  (record) => {
    console.log(
      `Telemetry: ${record.key} = ${record.value}${record.unit ?? ""}`
    );
  }
);

// --------------------------------------------------
// Actuator Events
// --------------------------------------------------

fan.onStateChange(
  (active) => {
    console.log(
      `Fan: ${active ? "ON" : "OFF"}`
    );
  }
);

// --------------------------------------------------
// Rule Events
// --------------------------------------------------

greenhouse.events.on(
  "rule:executed",
  (event: any) => {
    console.log(
      `Rule executed: ${event.rule.name}`
    );
  }
);

greenhouse.events.on(
  "rule:error",
  (event: any) => {
    console.error(
      `Rule error: ${event.rule.name}`,
      event.error
    );
  }
);

// --------------------------------------------------
// State Events
// --------------------------------------------------

greenhouse.onStateChange(
  (event) => {
    console.log(
      `STATE: ${event.key} = ${event.value}`
    );
  }
);

// --------------------------------------------------
// Drone Device
// --------------------------------------------------

const drone = new Device({
  id: "drone-01",
  name: "Inspection Drone",
  type: "uav"
});

// --------------------------------------------------
// Drone Capabilities
// --------------------------------------------------

drone
  .addCapability(
    new Capability({
      id: "gps",
      type: "gps",
      metadata: {
        accuracy: 1.5,
        satellites: 14
      }
    })
  )
  .addCapability(
    new Capability({
      id: "battery",
      type: "battery",
      metadata: {
        chemistry: "LiPo",
        cells: 6
      }
    })
  );

// --------------------------------------------------
// Register Devices
// --------------------------------------------------

registry
  .register(greenhouse)
  .register(drone);

// --------------------------------------------------
// Registry Queries
// --------------------------------------------------

console.log(
  "Registry size:",
  registry.size
);

console.log(
  "All devices:",
  registry
    .getAll()
    .map(
      (device) => device.id
    )
);

console.log(
  "UAV devices:",
  registry
    .findByType("uav")
    .map(
      (device) => device.id
    )
);

console.log(
  "GPS devices:",
  registry
    .findByCapability("gps")
    .map(
      (device) => device.id
    )
);

console.log(
  "Temperature monitoring devices:",
  registry
    .findByCapability(
      "temperature-monitoring"
    )
    .map(
      (device) => device.id
    )
);

// --------------------------------------------------
// Start Greenhouse
// --------------------------------------------------

greenhouse.start();

// --------------------------------------------------
// State
// --------------------------------------------------

greenhouse
  .setState(
    "battery",
    87
  )
  .setState(
    "mode",
    "automatic"
  );

// --------------------------------------------------
// Sensor Simulation
// --------------------------------------------------

// First reading initializes the Rules.
// Since mode = "rising", no rule action
// happens until the condition transitions
// from false -> true.
temperature.setValue(25);
await greenhouse.waitForRules();

// High temperature:
// highTemperatureRule: false -> true
temperature.setValue(31);
await greenhouse.waitForRules();

// Still high:
// highTemperatureRule: true -> true
temperature.setValue(32);
await greenhouse.waitForRules();

// Back below threshold:
// lowTemperatureRule: false -> true
temperature.setValue(27);
await greenhouse.waitForRules();

// Another low value:
// lowTemperatureRule: true -> true
temperature.setValue(26);
await greenhouse.waitForRules();

// Back into normal range
temperature.setValue(29);
await greenhouse.waitForRules();

// High again:
// highTemperatureRule: false -> true
temperature.setValue(31);
await greenhouse.waitForRules();

// --------------------------------------------------
// Manual Telemetry
// --------------------------------------------------

greenhouse.reportTelemetry(
  "humidity",
  64,
  {
    unit: "%",
    metadata: {
      source:
        "virtual-sensor"
    }
  }
);

// --------------------------------------------------
// Read Telemetry
// --------------------------------------------------

console.log(
  "Temperature telemetry:",
  greenhouse.getTelemetry(
    "temperature"
  )
);

console.log(
  "Humidity telemetry:",
  greenhouse.getTelemetry(
    "humidity"
  )
);

// --------------------------------------------------
// Device Twin
// --------------------------------------------------

console.log(
  "Device Twin:"
);

console.dir(
  greenhouse.getTwinSnapshot(),
  {
    depth: null
  }
);

// --------------------------------------------------
// Drone Twin
// --------------------------------------------------

console.log(
  "Drone Twin:"
);

console.dir(
  drone.getTwinSnapshot(),
  {
    depth: null
  }
);

// --------------------------------------------------
// Command Test
// --------------------------------------------------

console.log(
  "Testing fan-on command..."
);

await greenhouse.execute(
  "fan-on"
);

await greenhouse.waitForRules();

console.log(
  "Testing fan-off command..."
);

await greenhouse.execute(
  "fan-off"
);

await greenhouse.waitForRules();

// --------------------------------------------------
// Final Snapshot
// --------------------------------------------------

console.log(
  "Final greenhouse state:"
);

console.dir(
  greenhouse.getTwinSnapshot(),
  {
    depth: null
  }
);
