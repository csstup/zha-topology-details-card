# ZHA Topology Details Card

A Home Assistant Lovelace custom card for inspecting detailed ZHA Zigbee topology information.



## v1.6 changes

- In router routing tables, direct next hops now show only a `Direct` pill instead of repeating the device name.
- In router Path columns, direct routes show `Direct`; multi-hop routes begin with the hop-count pill, followed by `via ...`.
- Coordinator inferred routes now have a separate **Hops** column before **Path**.
- Coordinator direct routes show `Direct` in **Hops** and leave **Path** blank.
- Coordinator multi-hop/incomplete routes show the hop-count pill in **Hops** and only the intermediate `via ...` route plus status badges in **Path**.
- These changes align direct/hop indicators vertically and make longer routes easier to scan.

## Features

- Router and coordinator summary
- Direct child devices
- Full neighbor tables
- Routing tables with resolved device names
- Inferred multi-hop route paths built from reported next hops
- Coordinator route-path summary with hop-count pills
- Path diagnostics for incomplete paths, possible loops, unknown/stale destinations, and routers that report no routing table
- Click/tap column sorting on all data tables
- Independent sort state for each table
- Numeric sorting for NWK addresses, LQI, RSSI, counts, depth, and timestamps
- Direct-route identification
- Conservative scan-response freshness hints for router topology data
- Cached-topology warning when a router definitely has not responded since the card started the current scan
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
- **Not reported** parent status pill for end devices with no reported parent
- Multiple-reported-parent warning when more than one router currently claims the same end device as a child

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
/local/zha-topology-details-card.js?v=14
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
show_route_paths: true
grid_options:
  columns: 30
  rows: auto
```

`show_route_paths` defaults to `true`. Set it to `false` if you want to hide the coordinator path summary and the inferred-path column in per-router routing tables.

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

When a scan is started from this card, v1.4 also tracks conservative response evidence from each router's `last_seen` value:

- **Responded since scan started** means the device transmitted after the card started the scan. This does **not** prove that both its neighbor and routing tables were refreshed.
- **Not refreshed this scan** means the router has not transmitted since the scan began. In that case, displayed neighbor/routing data are cached from an earlier successful scan and the card labels them accordingly.
- **Response timing uncertain** is used around timestamp-resolution boundaries where the card cannot classify the result conservatively.

The card intentionally labels this field as device-response evidence rather than a topology-update timestamp because the current ZHA devices payload does not expose per-table topology freshness timestamps.

## Routing-table annotations

The raw Zigbee next-hop address remains visible in the **Next hop** column. The **Next-hop device** column adds a friendly annotation when useful:

| Annotation | Meaning |
| --- | --- |
| **Direct** | The destination NWK and next-hop NWK are the same. |
| **No route** | `next_hop` is `0xFFFE` and route discovery failed. |
| **Resolving** | `next_hop` is `0xFFFE` and route discovery is underway. |
| **Unresolved** | `next_hop` is `0xFFFE` with another route state. |

`0xFFFE` is preserved in the raw table and JSON data.

## Inferred route paths

v1.6 keeps the v1.4 route inference engine but presents the result more compactly by omitting the already-known source and destination from each path.

For example, a two-hop route is shown as:

```text
via Bedroom Router   2 hops
```

rather than repeating `Coordinator → Bedroom Router → Destination`. A direct one-hop route is shown simply as **Direct**. For three or more hops, only the intermediate routers are listed.

The inference is directional and is **not** a packet trace. Route tables can be stale, and the return path may be different.

When an intermediate router has no matching route entry but reports the destination as a direct neighbor, the card may use that neighbor relationship for the final hop and adds a compact **Neighbor** pill. The longer explanation is available as hover text/legend instead of being repeated below every row.

The Zigbee special broadcast destinations `0xFFFC`, `0xFFFD`, and `0xFFFF` are recognized explicitly. They are labeled as broadcasts and are not treated as unknown devices or assigned a single inferred unicast path.

Path-status pills include:

| Annotation | Meaning |
| --- | --- |
| **Neighbor** | Final hop was inferred from a reported neighbor relationship because no matching route entry was reported. |
| **Unknown destination** | The route reaches a NWK address that does not currently belong to a registered ZHA device; the route may be stale. |
| **No routing info** | The next router reports no routing-table entries, so the path cannot be continued. |
| **Incomplete** | A reported next hop was found, but the remaining path cannot be resolved from current topology data. |
| **Loop** | Following reported next hops revisits a router already in the inferred path. |
| **Hop limit** | Path inference reached the card's 30-hop safety limit. |

A router that reports an empty routing table can still be functioning as a Zigbee router. The card therefore says **No routing entries reported** rather than implying that the device is not routing traffic.

## Reported parents

The **End devices / reported parents** section is derived from routers that currently report an end device with neighbor relationship `Child`.

- If no router reports the end device as a child, v1.4 displays a neutral **Not reported** pill.
- If more than one router reports the same end device as a child, the card shows all reported parent names plus a **Multiple reported (N)** warning pill. An end device cannot actually have multiple simultaneous Zigbee parents, so at least one reported child-table entry may be stale.

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

### v1.6 — 2026-09-26

- Compacted route-path display: direct routes now show **Direct** and multi-hop paths list only intermediate routers.
- Removed repeated source and destination names from every inferred path row.
- Shortened path-state pills such as **Neighbor**, **Incomplete**, and **Loop**, with detailed explanations moved to tooltip/legend text.
- Reduced the minimum path-column width for a denser routing table.
- Added explicit handling for Zigbee broadcast destinations `0xFFFC`, `0xFFFD`, and `0xFFFF`; these are no longer shown as unknown destinations or given a unicast path/hop count.

### v1.4 — 2026-09-02

- Added coordinator and per-router inferred route paths with hop-count pills.
- Added path diagnostics for neighbor-finished paths, unknown/stale destinations, missing routing information, incomplete paths, possible loops, and the inference hop limit.
- Added conservative scan-response freshness hints based on router `last_seen` evidence.
- Added cached-topology warnings for routers that definitely did not respond after the card started a topology scan.
- Changed router detail wording to **Last device response** to avoid implying a topology-table timestamp.
- Added a neutral **Not reported** pill in the end-device reported-parent column.
- Added multiple-reported-parent conflict detection and warning pills.
- Clarified that an empty reported routing table does not mean a device is not routing.
- Added `show_route_paths` configuration option, enabled by default.

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

**v1.6**

## Author

Written by **Corey Stup**, with assistance from ChatGPT / OpenAI GPT-5.6 Sol.
