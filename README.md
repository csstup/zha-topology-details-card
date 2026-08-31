# ZHA Topology Details Card

A Home Assistant Lovelace custom card for inspecting detailed ZHA Zigbee topology information.

## Features

- Router and coordinator summary
- Direct child devices
- Full neighbor tables
- Routing tables with resolved device names
- Click/tap column sorting on all data tables
- Independent sort state for each table
- Numeric sorting for NWK addresses, LQI, RSSI, counts, depth, and timestamps
- Direct-route identification
- Friendly next-hop route-state pills:
  - **Direct**
  - **No route**
  - **Resolving**
  - **Unresolved**
- Zigbee depth helpers:
  - `15` displays as **Max (15)**
  - `255` displays as **Unknown**
- LQI and RSSI details
- ZHA topology scan control
- Progressive automatic snapshot reloads during a topology scan
- Stable header/status layout while scans are running
- Text and JSON topology export
- Visible neighbor/child de-duplication by IEEE address, with NWK fallback
- IEEE addresses available as tooltips on wider tables

## Requirements

- Home Assistant
- ZHA integration

## Installation

### Option 1: Install with HACS

This card can be installed and kept up to date through HACS.

If **ZHA Topology Details Card** is already available in your HACS repository list:

1. Open **HACS** from the Home Assistant sidebar.
2. Search for **ZHA Topology Details Card**.
3. Open the repository.
4. Click **Download** in the lower-right corner.
5. Confirm the latest version and complete the download.
6. Refresh the Home Assistant frontend if the card does not appear immediately.

If this repository has not yet been added to your HACS installation:

1. Open **HACS**.
2. Click the **three-dot menu** in the upper-right.
3. Select **Custom repositories**.
4. Enter the GitHub repository URL.
5. Select **Dashboard** as the repository type.
6. Click **Add**.
7. Return to the HACS repository list and search for **ZHA Topology Details Card**.
8. Open the repository.
9. Click **Download** and install the latest version.
10. Refresh the Home Assistant frontend if needed.

HACS stores dashboard elements under:

```text
/config/www/community/
```

and normally registers the JavaScript resource automatically.

### Option 2: Manual Install

1. Copy `zha-topology-details-card.js` to:

```text
/config/www/zha-topology-details-card.js
```

2. In Home Assistant, go to:

```text
Settings → Dashboards → three-dot menu → Resources
```

3. Add a new JavaScript module resource:

```text
/local/zha-topology-details-card.js
```

4. Refresh the Home Assistant frontend.

If you replace the JavaScript file manually and the browser continues to load an older cached copy, temporarily append a cache-busting query string such as:

```text
/local/zha-topology-details-card.js?v=13
```

## Configuration / Dashboard creation

You can add the card to any existing Home Assistant dashboard, or create a separate dashboard just for Zigbee diagnostics and topology information.

Creating a dedicated dashboard is optional, but it can be useful because the topology tables benefit from a wide layout.

To create a new dashboard:

1. Go to **Settings → Dashboards**.
2. Create a new dashboard, for example **Zigbee** or **Zigbee Diagnostics**.
3. Open the new dashboard and enter edit mode.
4. Add a card and choose **Manual**.
5. Paste the card configuration below.

To add the card to an existing dashboard, simply edit that dashboard, add a **Manual** card, and use the same configuration.

```yaml
type: custom:zha-topology-details-card
title: Zigbee Topology Details
show_end_devices: true
grid_options:
  columns: 30
  rows: auto
```

The `grid_options` section is useful with Home Assistant Sections dashboards and allows the topology report to use a wide layout. It may be omitted if your dashboard layout does not use Sections.

## Updating with HACS

After a new GitHub release is published, HACS normally detects the new version automatically.

1. Open **HACS**.
2. Find **ZHA Topology Details Card**.
3. Open the repository.
4. Download/install the available update.

If HACS has not noticed a newly published release yet, use the repository menu and choose **Update information**. If necessary, use **Redownload** and select the desired release.

After updating, refresh the Home Assistant frontend. A hard browser refresh may be useful if an older JavaScript file is still cached.

## Sorting

Click or tap a table heading to sort by that column. Click or tap the same heading again to reverse the sort direction.

Sorting is applied only to the displayed table. It does not modify the underlying ZHA data, the JSON export, or the Zigbee network.

The card uses data-aware sorting where appropriate:

- NWK addresses sort numerically instead of alphabetically.
- LQI, RSSI, depth, and counts sort numerically.
- Last-seen values sort chronologically.
- Missing or unknown values remain at the bottom.
- `Max (15)` sorts as depth `15`.
- `Unknown` depth (`255`) is treated as unknown rather than as the largest valid depth.
- Route status uses a meaningful order: `Active`, `Discovery_Underway`, `Discovery_Failed`, then other values.
- Router-summary `Active/Routes` sorting uses active-route count first and total route count as a tie-breaker.

Each table keeps its own sort state while the card remains loaded.

## Topology scanning

**Scan topology** starts a ZHA topology scan and then automatically reloads the current topology snapshot several times while devices respond.

The card currently reloads at approximately:

```text
+5 seconds
+12 seconds
+25 seconds
+45 seconds
```

The status line shows scan progress and the time of the most recently loaded snapshot.

**Reload snapshot** only re-reads the current ZHA topology data. It does not start a new topology scan.

## Routing-table annotations

The raw Zigbee next-hop address remains visible in the **Next hop** column. The **Next-hop device** column adds a friendly annotation when useful:

| Annotation | Meaning |
| --- | --- |
| **Direct** | The destination NWK and next-hop NWK are the same. |
| **No route** | `next_hop` is `0xFFFE` and route discovery failed. |
| **Resolving** | `next_hop` is `0xFFFE` and route discovery is underway. |
| **Unresolved** | `next_hop` is `0xFFFE` with another route state. |

`0xFFFE` is preserved in the raw table and JSON data.

## Zigbee depth display

The card preserves the underlying ZHA value while making special depth values easier to interpret:

| Raw depth | Display |
| ---: | --- |
| `0–14` | Numeric depth |
| `15` | **Max (15)** |
| `255` | **Unknown** |
| Missing | `—` |

Depth describes the reported Zigbee tree depth. It should not be interpreted as the current packet-routing hop count.

## Export behavior

**Copy text** creates a human-readable topology report.

**Copy JSON** preserves the raw ZHA topology data. UI-only presentation changes such as de-duplication, friendly depth labels, route pills, and table sorting do not alter the raw JSON export.

## Version history

### v1.3 — 2026-08-31

- Added click/tap sorting to all topology data tables.
- Added independent per-table sort state.
- Added data-aware numeric, timestamp, route-status, and depth sorting.
- Fixed **Scan topology** so progressive snapshot reloads run after the asynchronous ZHA scan request.
- Added automatic snapshot reloads at approximately 5, 12, 25, and 45 seconds.
- Stabilized the header layout so changing scan-status text does not move the toolbar.
- Simplified the header status line.

### v1.2 — 2026-08-31

- Added **Max (15)** and **Unknown** depth presentation.
- Added **Direct**, **No route**, **Resolving**, and **Unresolved** next-hop annotations.

### v1.1 — 2026-08-31

- Added friendly handling for Zigbee depth `255`.
- Continued UI cleanup and topology-data presentation improvements.

### v1.0 — 2026-08-31

- Initial public release.

## Current release

**v1.3**

## Author

Written by **Corey Stup**, with assistance from ChatGPT / OpenAI GPT-5.6 Sol.
