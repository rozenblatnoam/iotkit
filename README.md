# IoTKit

A TypeScript framework for building modular IoT applications.

IoTKit provides a unified programming model for devices, sensors, actuators, state, telemetry, rules, fleets, and communication transports.

## Features

* Device abstraction
* Sensors and actuators
* Commands and capabilities
* State management and state change events
* Telemetry and telemetry events
* Rules and automation
* Device Twin snapshots
* Device registry and fleet management
* Pluggable transport layer
* MQTT transport
* TypeScript-first API
* UAV / drone simulation support

## Packages

| Package        | Description            |
| -------------- | ---------------------- |
| `@iotkit/core` | Core IoT framework     |
| `@iotkit/mqtt` | MQTT transport         |
| `@iotkit/cli`  | Command-line interface |

## Quick Start

Install the core package:

```bash
npm install @iotkit/core
```

Create a device:

```ts
import { Device } from "@iotkit/core";

const drone = new Device({
  id: "drone-01",
  name: "Test Drone",
  type: "uav"
});

drone.setState("armed", false);
drone.reportTelemetry("altitude", 120);

console.log(drone.getTwinSnapshot());
```

## MQTT

Install the MQTT transport:

```bash
npm install @iotkit/mqtt
```

Example:

```ts
import { MqttTransport } from "@iotkit/mqtt";

const transport = new MqttTransport({
  brokerUrl: "mqtt://localhost:1883"
});
```

The transport layer is separated from the IoTKit core, allowing applications to communicate through MQTT without coupling the device model to a specific transport protocol.

## Architecture

```text
Application
    |
    v
@iotkit/core
    |
    +-- Devices
    +-- Sensors
    +-- Actuators
    +-- Commands
    +-- State
    +-- Telemetry
    +-- Rules
    +-- Fleet Management
           |
           v
       Transports
           |
           +-- @iotkit/mqtt
```

## Development

Install dependencies:

```bash
npm install
```

Build all packages:

```bash
npm run build
```

Run tests:

```bash
npm test
```

## Project Status

IoTKit is currently in early development (`0.1.x`).

The core framework and MQTT transport have been tested both inside the monorepo and as externally installed npm packages.

APIs may change before the `1.0.0` release.

## Roadmap

* Additional transport implementations
* UAV / drone integrations
* MAVLink integration
* Fleet management improvements
* Cloud and edge integrations
* CLI improvements
* Documentation and examples


## License

ISC
