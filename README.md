# ZHA Topology Details Card

A Home Assistant Lovelace custom card for inspecting ZHA Zigbee topology details.

## Features

- Router summary
- Direct child devices
- Full neighbor tables
- Routing tables
- Direct-route identification
- LQI and RSSI details
- ZHA topology scan control
- Text and JSON topology export
- De-duplication of duplicate neighbor entries in the visible report
- IEEE addresses available as tooltips on wider tables

## Requirements

- Home Assistant
- ZHA integration

## Installation with HACS

This repository is intended to be installed as a HACS **Dashboard** custom repository.

1. Open **HACS**.
2. Open the menu and choose **Custom repositories**.
3. Add this GitHub repository URL.
4. Select **Dashboard** as the repository type.
5. Install **ZHA Topology Details Card**.
6. Reload the Home Assistant frontend if required.

## Manual installation

Copy:

```text
zha-topology-details-card.js
```

to:

```text
/config/www/zha-topology-details-card.js
```

Then add it to Home Assistant as a JavaScript module resource:

```text
/local/zha-topology-details-card.js
```

If you are manually replacing the JavaScript file and your browser is still using
an older copy, temporarily append a cache-busting query string such as:

```text
/local/zha-topology-details-card.js?v=1
```

## Manual card configuration

The card can be added manually with the following YAML:

```yaml
type: custom:zha-topology-details-card
title: Zigbee Topology Details
show_end_devices: true
grid_options:
  columns: 30
  rows: auto
```

The `grid_options` section is useful with Home Assistant Sections dashboards and
allows the topology report to use a wide layout.

## Version

Current public release: **v1.0**

## Author

Written by **Corey Stup**, with assistance from ChatGPT / OpenAI GPT-5.6 Sol.
