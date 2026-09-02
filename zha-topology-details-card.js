/*
 * ZHA Topology Details Card
 * Version: 1.4
 * Date: 2026-09-02
 *
 * Author: Corey Stup
 * Developed with assistance from ChatGPT (OpenAI GPT-5.6 Sol)
 *
 * Repository: zha-topology-details-card
 *
 * Revision History:
 *   v1.4 - 2026-09-02 - Add inferred route paths, scan-response freshness hints, reported-parent status pills/conflict detection, and clearer empty-route messaging.
 *   v1.3 - 2026-08-31 - Fix progressive topology-scan refreshes, stabilize the header/status layout, and add sortable table columns.
 *   v1.2 - 2026-08-31 - Display depth 15 as Max (15) and add friendly next-hop route-state pills.
 *   v1.1 - 2026-08-31 - Display Zigbee depth 255 (0xFF) as Unknown.
 *   v1.0 - 2026-08-31 - Initial public release.
 */

/*
 * ZHA Topology Details Card v1.4
 * Uses Home Assistant's authenticated frontend WebSocket connection.
 *
 * Dashboard YAML:
 *   type: custom:zha-topology-details-card
 *   title: Zigbee Topology Details
 *   show_end_devices: true
 *   show_route_paths: true
 *
 * Resource:
 *   /local/zha-topology-details-card.js
 *   type: JavaScript Module
 */

class ZhaTopologyDetailsCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._config = {};
    this._devices = [];
    this._loading = false;
    this._loaded = false;
    this._status = "";
    this._lastLoaded = null;
    this._scanTimers = [];
    this._scanStartedAt = null;
    this._scanBaselineLastSeen = new Map();
    this._sortState = new Map();
  }

  setConfig(config) {
    this._config = {
      title: "Zigbee Topology Details",
      show_end_devices: true,
      show_route_paths: true,
      ...config,
    };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._loaded && !this._loading) {
      this._loadDevices();
    }
  }

  getCardSize() {
    return 12;
  }

  disconnectedCallback() {
    this._clearScanTimers();
  }

  _clearScanTimers() {
    for (const timer of this._scanTimers) clearTimeout(timer);
    this._scanTimers = [];
  }

  async _loadDevices(message = "Loading ZHA topology…") {
    if (!this._hass || this._loading) return;
    this._loading = true;
    this._status = message;
    this._render();
    try {
      const devices = await this._hass.connection.sendMessagePromise({
        type: "zha/devices",
      });
      this._devices = Array.isArray(devices) ? devices : [];
      this._lastLoaded = new Date();
      this._loaded = true;
      this._status = "Snapshot loaded";
    } catch (err) {
      this._status = `Error: ${err?.message || err}`;
      console.error("ZHA topology card:", err);
    } finally {
      this._loading = false;
      this._render();
    }
  }

  async _scanTopology() {
    if (!this._hass) return;

    this._clearScanTimers();

    // Home Assistant's zha/topology/update command starts the topology scan
    // asynchronously and does not send a WebSocket result response. Use
    // sendMessage() (fire-and-forget) rather than sendMessagePromise(), or the
    // promise would never resolve and the delayed snapshot reloads below would
    // never be scheduled.
    const delays = [5000, 12000, 25000, 45000];

    // Keep conservative, frontend-only evidence about whether each router has
    // transmitted since this card started the scan. This does NOT prove that a
    // specific Mgmt_Lqi/Mgmt_Rtg response succeeded; it only lets us identify
    // routers that definitely have not responded since the scan began.
    this._scanStartedAt = new Date();
    this._scanBaselineLastSeen = new Map(
      this._devices.map((d) => [
        String(d?.ieee || this._hexNwk(d?.nwk)).toLowerCase(),
        this._timeValue(d?.last_seen),
      ])
    );

    try {
      this._hass.connection.sendMessage({
        type: "zha/topology/update",
      });

      this._status = "Scan running · waiting for refresh 1/4";
      this._render();

      delays.forEach((delay, idx) => {
        const refreshNumber = idx + 1;
        const timer = setTimeout(async () => {
          await this._loadDevices(
            `Scan running · refresh ${refreshNumber}/${delays.length}…`
          );

          // _loadDevices updates the snapshot timestamp after a successful
          // zha/devices read. Replace its generic status with scan progress so
          // it is obvious that the automatic refresh sequence is advancing.
          if (refreshNumber === delays.length) {
            this._status = "Scan refresh complete";
            this._scanTimers = [];
          } else {
            this._status =
              `Scan running · refresh ${refreshNumber}/${delays.length} complete`;
          }
          this._render();
        }, delay);

        this._scanTimers.push(timer);
      });
    } catch (err) {
      this._status = `Scan error: ${err?.message || err}`;
      this._render();
    }
  }

  _statusLine() {
    if (!this._lastLoaded) return this._status || "Ready";

    const time = this._lastLoaded.toLocaleTimeString();

    if (!this._status || this._status === "Snapshot loaded") {
      return `Snapshot ${time}`;
    }

    return `${this._status} · snapshot ${time}`;
  }

  _openMap() {
    history.pushState(null, "", "/config/zha/visualization");
    window.dispatchEvent(new Event("location-changed"));
  }

  _name(d) {
    return (
      d?.user_given_name ||
      d?.name ||
      d?.model ||
      d?.ieee ||
      "Unknown device"
    );
  }

  _relationshipLabel(v) {
    const raw = String(v || "");

    switch (raw) {
      case "NoneOfTheAbove":
        return "Other neighbor";
      case "PreviousChild":
        return "Previous child";
      default:
        return raw || "—";
    }
  }

  _normRelationship(v) {
    return String(v || "").toLowerCase().replaceAll("_", " ");
  }

  _isChild(n) {
    return this._normRelationship(n?.relationship) === "child";
  }

  _isParent(n) {
    return this._normRelationship(n?.relationship) === "parent";
  }

  _isRouterNeighbor(n) {
    const t = String(n?.device_type || "").toLowerCase();
    return t.includes("router") || t.includes("coordinator");
  }

  _isRouterDevice(d) {
    if (d?.active_coordinator) return true;
    const t = String(d?.device_type || "").toLowerCase();
    if (t.includes("router") || t.includes("coordinator")) return true;
    // Routers normally contribute topology data even if a backend reports
    // device_type differently.
    return (d?.neighbors?.length || 0) > 0 || (d?.routes?.length || 0) > 0;
  }

  _hexNwk(value) {
    if (value === undefined || value === null || value === "") return "—";
    if (typeof value === "number") {
      return `0x${value.toString(16).toUpperCase().padStart(4, "0")}`;
    }
    const s = String(value).trim();
    if (/^0x[0-9a-f]+$/i.test(s)) {
      return `0x${parseInt(s, 16).toString(16).toUpperCase().padStart(4, "0")}`;
    }
    if (/^\d+$/.test(s)) {
      return `0x${parseInt(s, 10).toString(16).toUpperCase().padStart(4, "0")}`;
    }
    return s;
  }

  _fmtLastSeen(v) {
    if (!v) return "—";
    try {
      let d;
      if (typeof v === "number") {
        // Handle seconds or milliseconds.
        d = new Date(v < 2e10 ? v * 1000 : v);
      } else {
        d = new Date(v);
      }
      if (Number.isNaN(d.getTime())) return String(v);
      return d.toLocaleString();
    } catch (_) {
      return String(v);
    }
  }

  _escape(v) {
    return String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  _sameNwk(a, b) {
    if (a === null || a === undefined || b === null || b === undefined) {
      return false;
    }

    return this._hexNwk(a).toLowerCase() === this._hexNwk(b).toLowerCase();
  }

  _nwkWithIeee(nwk, ieee) {
    const nwkText = this._escape(this._hexNwk(nwk));
    const ieeeText = ieee ? String(ieee) : "";

    if (!ieeeText) {
      return `<span class="mono">${nwkText}</span>`;
    }

    return `<span class="mono nwk-tooltip" title="IEEE: ${this._escape(
      ieeeText
    )}">${nwkText}</span>`;
  }

  _lqiClass(v) {
    // ZHA uses null when no current device-level LQI is available.
    // Number(null) is 0 in JavaScript, so explicitly reject empty values
    // before numeric conversion or the em dash gets styled as a low LQI.
    if (v === null || v === undefined || v === "") {
      return "";
    }

    const n = Number(v);

    if (!Number.isFinite(n)) return "";
    if (n >= 192) return "lqi-high";
    if (n >= 128) return "lqi-mid";

    return "lqi-low";
  }

  _formatDepth(value) {
    if (value === undefined || value === null || value === "") return "—";

    const numeric = Number(value);

    // 15 (0x0F) is the maximum Zigbee network depth. Some stacks report this
    // maximum value for peer-router entries where the value should not be
    // casually interpreted as an actual 15-hop routing path.
    if (Number.isFinite(numeric) && numeric === 0x0f) return "Max (15)";

    // 255 (0xFF) is used by some stacks as an unknown/not-meaningful sentinel,
    // not an actual 255-hop network depth.
    if (Number.isFinite(numeric) && numeric === 0xff) return "Unknown";

    return String(value);
  }

  _depthHtml(value) {
    const label = this._formatDepth(value);
    const numeric = Number(value);

    if (Number.isFinite(numeric) && numeric === 0x0f) {
      return `<span class="depth-tooltip" title="Reported Zigbee depth 15 — maximum defined network depth; may not represent the actual routing path.">${this._escape(label)}</span>`;
    }

    if (Number.isFinite(numeric) && numeric === 0xff) {
      return `<span class="depth-tooltip" title="Reported Zigbee depth 255 (0xFF) — unknown/not meaningful sentinel, not an actual network depth.">${this._escape(label)}</span>`;
    }

    return this._escape(label);
  }

  _nextHopAnnotation(route) {
    const nextHop = this._hexNwk(route?.next_hop).toUpperCase();
    const status = String(route?.route_status || "").toLowerCase();

    if (nextHop === "0XFFFE") {
      if (status === "discovery_failed") {
        return {
          label: "No route",
          className: "route-no-route",
          title: "No valid next hop is known (0xFFFE); route discovery failed.",
        };
      }
      if (status === "discovery_underway") {
        return {
          label: "Resolving",
          className: "route-resolving",
          title: "No valid next hop is known yet (0xFFFE); route discovery is underway.",
        };
      }
      return {
        label: "Unresolved",
        className: "route-unresolved",
        title: "No valid next hop is currently known (0xFFFE).",
      };
    }

    if (this._sameNwk(route?.dest_nwk, route?.next_hop)) {
      return {
        label: "Direct",
        className: "route-direct",
        title: "Destination and next-hop NWK addresses are the same; this is a direct one-hop route.",
      };
    }

    return null;
  }

  _timeValue(v) {
    if (v === undefined || v === null || v === "") return null;
    try {
      let d;
      if (typeof v === "number") {
        d = new Date(v < 2e10 ? v * 1000 : v);
      } else {
        d = new Date(v);
      }
      const ms = d.getTime();
      return Number.isFinite(ms) ? ms : null;
    } catch (_) {
      return null;
    }
  }

  _scanResponseEvidence(d) {
    if (!this._scanStartedAt) return null;

    const scanMs = this._scanStartedAt.getTime();
    const currentMs = this._timeValue(d?.last_seen);
    const key = String(d?.ieee || this._hexNwk(d?.nwk)).toLowerCase();
    const baselineMs = this._scanBaselineLastSeen.get(key);

    if (currentMs !== null && baselineMs !== null && currentMs > baselineMs) {
      return {
        state: "responded",
        label: "Responded since scan started",
        className: "scan-responded",
        title:
          "The device's last-response timestamp advanced after this card started the topology scan. This proves the device transmitted, but does not prove that every neighbor or routing table was refreshed.",
      };
    }

    // ZHA last_seen is commonly second-resolution. Give the boundary a small
    // tolerance so a response in the same second as the click is not falsely
    // labeled stale.
    if (currentMs !== null && currentMs < scanMs - 2000) {
      return {
        state: "stale",
        label: "Not refreshed this scan",
        className: "scan-stale",
        title:
          "The device has not transmitted since this topology scan began. Any neighbor or routing data shown for this router is cached from an earlier successful scan.",
      };
    }

    return {
      state: "uncertain",
      label: "Response timing uncertain",
      className: "scan-uncertain",
      title:
        "The last-response timestamp is too close to the scan start, or unavailable, to classify conservatively.",
    };
  }

  _routeForDestination(device, destNwk) {
    const matches = (device?.routes || []).filter((r) =>
      this._sameNwk(r?.dest_nwk, destNwk)
    );
    if (!matches.length) return null;

    return (
      matches.find(
        (r) => String(r?.route_status || "").toLowerCase() === "active"
      ) || matches[0]
    );
  }

  _neighborForNwk(device, nwk) {
    return this._uniqueNeighbors(device?.neighbors).find((n) =>
      this._sameNwk(n?.nwk, nwk)
    );
  }

  _pathNode(nwk, indexes) {
    const device = this._lookupNwk(nwk, indexes);
    return {
      nwk,
      device,
      label: device ? this._name(device) : this._hexNwk(nwk),
    };
  }

  _inferRoutePath(source, initialRoute, indexes) {
    const destNwk = initialRoute?.dest_nwk;
    const nodes = [this._pathNode(source?.nwk, indexes)];
    const visited = new Set([this._hexNwk(source?.nwk).toLowerCase()]);
    let current = source;
    let route = initialRoute;
    let hops = 0;
    let status = "complete";
    let note = "";
    const maxHops = 30;

    for (let step = 0; step < maxHops; step += 1) {
      const nextHopHex = this._hexNwk(route?.next_hop).toUpperCase();
      const annotation = this._nextHopAnnotation(route);

      if (nextHopHex === "0XFFFE") {
        status = annotation?.className?.replace("route-", "") || "unresolved";
        note = annotation?.title || "No valid next hop is currently known.";
        break;
      }

      const nextNwk = route?.next_hop;
      hops += 1;
      const nextNode = this._pathNode(nextNwk, indexes);
      nodes.push(nextNode);

      if (this._sameNwk(nextNwk, destNwk)) {
        if (!nextNode.device) {
          status = "unknown-destination";
          note =
            "The reported route reaches this NWK directly, but that destination is not a current ZHA device. The route may be stale.";
        }
        break;
      }

      const nextKey = this._hexNwk(nextNwk).toLowerCase();
      if (visited.has(nextKey)) {
        status = "loop";
        note = "Following reported next hops revisits a router already in this path.";
        break;
      }
      visited.add(nextKey);

      if (!nextNode.device || !this._isRouterDevice(nextNode.device)) {
        status = "incomplete";
        note = `Cannot continue after ${nextNode.label}: the next hop is not a current router with topology data.`;
        break;
      }

      current = nextNode.device;
      const nextRoute = this._routeForDestination(current, destNwk);
      if (nextRoute) {
        route = nextRoute;
        continue;
      }

      // A router may know the destination is a one-hop neighbor without
      // retaining an explicit NWK routing-table entry for it. Use that reported
      // adjacency only for the final hop and mark the inference accordingly.
      const destNeighbor = this._neighborForNwk(current, destNwk);
      if (destNeighbor) {
        hops += 1;
        const destNode = this._pathNode(destNwk, indexes);
        nodes.push(destNode);
        status = destNode.device ? "neighbor-finish" : "unknown-destination";
        note = destNode.device
          ? "The final hop is inferred from the router's neighbor table because no matching routing-table entry was reported."
          : "The final hop is inferred from the neighbor table, but the destination is not a current ZHA device.";
        break;
      }

      status = (current?.routes || []).length ? "incomplete" : "no-routing-info";
      note = (current?.routes || []).length
        ? `No reported route from ${this._name(current)} continues toward ${this._hexNwk(destNwk)}.`
        : `${this._name(current)} reports no routing-table entries, so the inferred path cannot be continued from that router.`;
      break;
    }

    if (hops >= maxHops && status === "complete" && !this._sameNwk(nodes.at(-1)?.nwk, destNwk)) {
      status = "hop-limit";
      note = "Path inference stopped at the 30-hop safety limit.";
    }

    return { nodes, hops, status, note };
  }

  _pathStatusMeta(status) {
    const map = {
      "neighbor-finish": {
        label: "Neighbor finish",
        className: "path-neighbor",
      },
      "unknown-destination": {
        label: "Unknown destination",
        className: "path-warning",
      },
      "no-routing-info": {
        label: "No routing info",
        className: "path-warning",
      },
      incomplete: {
        label: "Path incomplete",
        className: "path-warning",
      },
      loop: {
        label: "Possible loop",
        className: "path-error",
      },
      "hop-limit": {
        label: "Hop limit",
        className: "path-error",
      },
      "no-route": {
        label: "No route",
        className: "route-no-route",
      },
      resolving: {
        label: "Resolving",
        className: "route-resolving",
      },
      unresolved: {
        label: "Unresolved",
        className: "route-unresolved",
      },
    };
    return map[status] || null;
  }

  _pathText(path) {
    return (path?.nodes || []).map((n) => n.label).join(" -> ");
  }

  _pathHtml(path) {
    const nodes = (path?.nodes || [])
      .map(
        (n) =>
          `<span class="path-node" title="${this._escape(n.label)} · ${this._escape(
            this._hexNwk(n.nwk)
          )}">${this._escape(n.label)}</span>`
      )
      .join('<span class="path-arrow">→</span>');
    const meta = this._pathStatusMeta(path?.status);
    const hopLabel = `${path?.hops ?? 0} ${path?.hops === 1 ? "hop" : "hops"}`;

    return `<div class="route-path" title="Inferred from currently reported routing and neighbor tables; this is not a packet trace.">
      ${nodes}
      <span class="badge path-hops">${this._escape(hopLabel)}</span>
      ${
        meta
          ? `<span class="badge ${this._escape(meta.className)}" title="${this._escape(
              path?.note || meta.label
            )}">${this._escape(meta.label)}</span>`
          : ""
      }
    </div>${
      path?.note && meta
        ? `<div class="muted path-note">${this._escape(path.note)}</div>`
        : ""
    }`;
  }

  _indexes() {
    const byIeee = new Map();
    const byNwk = new Map();
    for (const d of this._devices) {
      if (d.ieee != null) byIeee.set(String(d.ieee).toLowerCase(), d);
      if (d.nwk != null) byNwk.set(String(d.nwk), d);
      // Also index normalized decimal/hex representation.
      const h = this._hexNwk(d.nwk);
      byNwk.set(h.toLowerCase(), d);
    }
    return { byIeee, byNwk };
  }

  _lookupNeighbor(n, indexes) {
    return indexes.byIeee.get(String(n?.ieee || "").toLowerCase());
  }

  _lookupNwk(nwk, indexes) {
    const raw = String(nwk ?? "");
    return (
      indexes.byNwk.get(raw) ||
      indexes.byNwk.get(this._hexNwk(raw).toLowerCase())
    );
  }

  _uniqueNeighbors(neighbors) {
    const unique = new Map();
    let anonymous = 0;

    for (const n of neighbors || []) {
      const ieee = String(n?.ieee || "").trim().toLowerCase();

      let key;
      if (ieee) {
        key = `ieee:${ieee}`;
      } else if (n?.nwk !== undefined && n?.nwk !== null && n?.nwk !== "") {
        key = `nwk:${this._hexNwk(n.nwk).toLowerCase()}`;
      } else {
        // Preserve entries that have neither IEEE nor NWK rather than
        // accidentally collapsing unrelated anonymous rows.
        key = `anonymous:${anonymous++}`;
      }

      unique.set(key, n);
    }

    return Array.from(unique.values());
  }

  _summaryStats() {
    const routers = this._devices.filter((d) => this._isRouterDevice(d));
    const endDevices = this._devices.filter((d) => !this._isRouterDevice(d));
    const childLinks = routers.reduce(
      (sum, d) =>
        sum +
        this._uniqueNeighbors(d.neighbors).filter((n) => this._isChild(n)).length,
      0
    );
    const neighborEntries = routers.reduce(
      (sum, d) => sum + this._uniqueNeighbors(d.neighbors).length,
      0
    );
    const routes = routers.reduce(
      (sum, d) => sum + (d.routes || []).length,
      0
    );
    return { routers, endDevices, childLinks, neighborEntries, routes };
  }

  _copyJson() {
    const blob = JSON.stringify(
      {
        generated: new Date().toISOString(),
        devices: this._devices,
      },
      null,
      2
    );
    navigator.clipboard.writeText(blob);
    this._status = "Raw topology JSON copied";
    this._render();
  }

  _textDump() {
    const indexes = this._indexes();
    const routers = this._devices
      .filter((d) => this._isRouterDevice(d))
      .sort((a, b) => {
        if (a.active_coordinator && !b.active_coordinator) return -1;
        if (!a.active_coordinator && b.active_coordinator) return 1;
        return this._name(a).localeCompare(this._name(b));
      });

    const out = [];
    out.push(`ZHA TOPOLOGY DUMP`);
    out.push(`Card version: v1.4`);
    out.push(`Generated: ${new Date().toLocaleString()}`);
    out.push(`Devices: ${this._devices.length}`);
    out.push("");

    for (const d of routers) {
      const neighbors = d.neighbors || [];
      const children = neighbors.filter((n) => this._isChild(n));
      const routes = d.routes || [];
      out.push("=".repeat(88));
      out.push(
        `${this._name(d)}${d.active_coordinator ? " [COORDINATOR]" : ""}`
      );
      out.push(
        `Model: ${d.model || "—"} | Manufacturer: ${d.manufacturer || "—"}`
      );
      out.push(
        `NWK: ${this._hexNwk(d.nwk)} | IEEE: ${d.ieee || "—"} | Device LQI: ${
          d.lqi ?? "—"
        } | RSSI: ${d.rssi ?? "—"}`
      );
      out.push(
        `Neighbors: ${neighbors.length} | Direct children: ${children.length} | Routes: ${routes.length}`
      );
      out.push("");

      out.push("DIRECT CHILDREN");
      if (!children.length) out.push("  (none reported)");
      for (const n of children) {
        const nd = this._lookupNeighbor(n, indexes);
        out.push(
          `  ${this._name(nd || n)} | ${this._hexNwk(n.nwk)} | ${
            n.ieee || "—"
          } | type=${n.device_type || "—"} | LQI=${n.lqi ?? "—"} | depth=${
            this._formatDepth(n.depth)
          } | rx_idle=${n.rx_on_when_idle || "—"}`
        );
      }
      out.push("");

      out.push("NEIGHBOR TABLE");
      if (!neighbors.length) out.push("  (none reported)");
      for (const n of neighbors) {
        const nd = this._lookupNeighbor(n, indexes);
        out.push(
          `  ${this._name(nd || n)} | rel=${n.relationship || "—"} | type=${
            n.device_type || "—"
          } | ${this._hexNwk(n.nwk)} | LQI=${n.lqi ?? "—"} | depth=${
            this._formatDepth(n.depth)
          } | rx_idle=${n.rx_on_when_idle || "—"} | permit=${
            n.permit_joining || "—"
          }`
        );
      }
      out.push("");

      out.push("ROUTING TABLE");
      if (!routes.length) out.push("  (none reported)");
      for (const r of routes) {
        const dest = this._lookupNwk(r.dest_nwk, indexes);
        const hop = this._lookupNwk(r.next_hop, indexes);
        const annotation = this._nextHopAnnotation(r);
        const path = this._inferRoutePath(d, r, indexes);
        out.push(
          `  dest=${this._hexNwk(r.dest_nwk)}${
            dest ? ` (${this._name(dest)})` : ""
          } -> next=${this._hexNwk(r.next_hop)}${
            hop ? ` (${this._name(hop)})` : ""
          }${annotation ? ` [${annotation.label}]` : ""} | status=${r.route_status || "—"} | path=${this._pathText(path)} | hops=${path.hops} | path_state=${path.status} | many_to_one=${
            r.many_to_one
          } | memory_constrained=${r.memory_constrained} | route_record_required=${
            r.route_record_required
          }`
        );
      }
      out.push("");
    }
    return out.join("\n");
  }

  _copyText() {
    navigator.clipboard.writeText(this._textDump());
    this._status = "Detailed text topology dump copied";
    this._render();
  }


  _sortableTh(label, type = "text", className = "") {
    const cls = `sortable${className ? ` ${className}` : ""}`;
    return `<th class="${this._escape(cls)}" data-sort-type="${this._escape(
      type
    )}" tabindex="0" role="button" title="Sort by ${this._escape(
      label
    )}">${this._escape(label)}</th>`;
  }

  _sortAttrs(value, secondary = null) {
    if (value === null || value === undefined || value === "") {
      return ' data-sort-missing="1"';
    }

    const secondaryAttr =
      secondary === null || secondary === undefined || secondary === ""
        ? ""
        : ` data-sort-secondary="${this._escape(secondary)}"`;

    return ` data-sort-value="${this._escape(value)}"${secondaryAttr}`;
  }

  _nwkSortValue(value) {
    if (value === null || value === undefined || value === "") return null;
    const normalized = this._hexNwk(value);
    if (!/^0x[0-9a-f]+$/i.test(normalized)) return null;
    return parseInt(normalized, 16);
  }

  _timeSortValue(value) {
    if (!value) return null;
    try {
      const d =
        typeof value === "number"
          ? new Date(value < 2e10 ? value * 1000 : value)
          : new Date(value);
      const t = d.getTime();
      return Number.isFinite(t) ? t : null;
    } catch (_) {
      return null;
    }
  }

  _depthSortValue(value) {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n === 0xff) return null;
    return n;
  }

  _routeStatusSortValue(value) {
    const status = String(value || "").toLowerCase();
    const ranks = {
      active: 0,
      discovery_underway: 1,
      discovery_failed: 2,
    };
    return Object.prototype.hasOwnProperty.call(ranks, status)
      ? ranks[status]
      : 3;
  }

  _compareSortCells(cellA, cellB, type, direction) {
    const missingA = cellA?.dataset?.sortMissing === "1";
    const missingB = cellB?.dataset?.sortMissing === "1";

    // Missing/unknown values always stay at the bottom, regardless of direction.
    if (missingA !== missingB) return missingA ? 1 : -1;
    if (missingA && missingB) return 0;

    const a = cellA?.dataset?.sortValue ?? "";
    const b = cellB?.dataset?.sortValue ?? "";
    let cmp = 0;

    if (type === "number") {
      const an = Number(a);
      const bn = Number(b);
      cmp = an === bn ? 0 : an < bn ? -1 : 1;
    } else {
      cmp = String(a).localeCompare(String(b), undefined, {
        numeric: true,
        sensitivity: "base",
      });
    }

    if (cmp === 0) {
      const as = cellA?.dataset?.sortSecondary;
      const bs = cellB?.dataset?.sortSecondary;

      if (as !== undefined || bs !== undefined) {
        const an = Number(as);
        const bn = Number(bs);

        if (
          as !== undefined &&
          bs !== undefined &&
          Number.isFinite(an) &&
          Number.isFinite(bn)
        ) {
          cmp = an === bn ? 0 : an < bn ? -1 : 1;
        } else {
          cmp = String(as ?? "").localeCompare(String(bs ?? ""), undefined, {
            numeric: true,
            sensitivity: "base",
          });
        }
      }
    }

    return direction === "desc" ? -cmp : cmp;
  }

  _applySort(table, columnIndex, direction) {
    if (!table) return;

    const headers = Array.from(table.querySelectorAll("thead th.sortable"));
    const allHeaders = Array.from(table.querySelectorAll("thead th"));
    const activeHeader = allHeaders[columnIndex];

    if (!activeHeader?.classList.contains("sortable")) return;

    const type = activeHeader.dataset.sortType || "text";
    const tbody = table.tBodies?.[0];
    if (!tbody) return;

    const rows = Array.from(tbody.rows).map((row, originalIndex) => ({
      row,
      originalIndex,
    }));

    rows.sort((a, b) => {
      const cmp = this._compareSortCells(
        a.row.cells[columnIndex],
        b.row.cells[columnIndex],
        type,
        direction
      );
      return cmp || a.originalIndex - b.originalIndex;
    });

    for (const { row } of rows) tbody.appendChild(row);

    for (const th of headers) {
      th.removeAttribute("aria-sort");
    }
    activeHeader.setAttribute(
      "aria-sort",
      direction === "desc" ? "descending" : "ascending"
    );
  }

  _sortTableFromHeader(th) {
    const table = th?.closest("table");
    const tableKey = table?.dataset?.sortKey;
    if (!table || !tableKey) return;

    const headers = Array.from(table.querySelectorAll("thead th"));
    const columnIndex = headers.indexOf(th);
    if (columnIndex < 0) return;

    const previous = this._sortState.get(tableKey);
    const direction =
      previous?.columnIndex === columnIndex && previous?.direction === "asc"
        ? "desc"
        : "asc";

    this._sortState.set(tableKey, { columnIndex, direction });
    this._applySort(table, columnIndex, direction);
  }

  _wireSorting() {
    const tables = Array.from(
      this.shadowRoot?.querySelectorAll("table[data-sort-key]") || []
    );

    for (const table of tables) {
      for (const th of table.querySelectorAll("thead th.sortable")) {
        th.addEventListener("click", () => this._sortTableFromHeader(th));
        th.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            this._sortTableFromHeader(th);
          }
        });
      }

      const state = this._sortState.get(table.dataset.sortKey);
      if (state) {
        this._applySort(table, state.columnIndex, state.direction);
      }
    }
  }

  _routerSummaryRows(indexes) {
    return this._devices
      .filter((d) => this._isRouterDevice(d))
      .sort((a, b) => {
        if (a.active_coordinator && !b.active_coordinator) return -1;
        if (!a.active_coordinator && b.active_coordinator) return 1;
        return this._name(a).localeCompare(this._name(b));
      })
      .map((d) => {
        const neighbors = this._uniqueNeighbors(d.neighbors);
        const children = neighbors.filter((n) => this._isChild(n));
        const routerNeighbors = neighbors.filter((n) =>
          this._isRouterNeighbor(n)
        );
        const routes = d.routes || [];
        const activeRoutes = routes.filter(
          (r) => String(r.route_status || "").toLowerCase() === "active"
        ).length;
        const scanEvidence = this._scanResponseEvidence(d);

        return `
          <tr>
            <td${this._sortAttrs(this._name(d))}>
              <strong>${this._escape(this._name(d))}</strong>
              ${
                d.active_coordinator
                  ? '<span class="badge coord">Coordinator</span>'
                  : ""
              }
              <div class="muted">${this._escape(
                d.manufacturer || ""
              )} ${this._escape(d.model || "")}</div>
            </td>
            <td class="mono"${this._sortAttrs(this._nwkSortValue(d.nwk))}>${this._escape(
              this._hexNwk(d.nwk)
            )}</td>
            <td class="num strong"${this._sortAttrs(children.length)}>${children.length}</td>
            <td class="num"${this._sortAttrs(routerNeighbors.length)}>${routerNeighbors.length}</td>
            <td class="num"${this._sortAttrs(neighbors.length)}>${neighbors.length}</td>
            <td class="num"${this._sortAttrs(
              activeRoutes,
              routes.length
            )}>${activeRoutes}/${routes.length}</td>
            <td class="num ${this._lqiClass(d.lqi)}"${this._sortAttrs(
              d.lqi
            )}>${this._escape(d.lqi ?? "—")}</td>
            <td class="num"${this._sortAttrs(d.rssi)}>${this._escape(
              d.rssi ?? "—"
            )}</td>
            <td${this._sortAttrs(this._timeSortValue(d.last_seen))}>${this._escape(
              this._fmtLastSeen(d.last_seen)
            )}</td>
            <td${this._sortAttrs(scanEvidence?.state || null)}>${scanEvidence
                ? `<span class="badge ${this._escape(scanEvidence.className)}" title="${this._escape(
                    scanEvidence.title
                  )}">${this._escape(scanEvidence.label)}</span>`
                : "—"}
            </td>
          </tr>`;
      })
      .join("");
  }

  _childrenTable(d, indexes) {
    const children = this._uniqueNeighbors(d.neighbors).filter((n) =>
      this._isChild(n)
    );
    if (!children.length)
      return `<div class="empty">No direct children reported.</div>`;

    const tableKey = `children:${String(d.ieee || this._hexNwk(d.nwk))}`;

    return `
      <div class="table-wrap">
        <table data-sort-key="${this._escape(tableKey)}">
          <thead><tr>
            ${this._sortableTh("Child")}
            ${this._sortableTh("Type")}
            ${this._sortableTh("NWK", "number")}
            ${this._sortableTh("IEEE")}
            ${this._sortableTh("LQI", "number", "num")}
            ${this._sortableTh("Depth", "number", "num")}
            ${this._sortableTh("Rx on idle")}
            ${this._sortableTh("Available", "number")}
            ${this._sortableTh("Last seen", "number")}
          </tr></thead>
          <tbody>
            ${children
              .map((n) => {
                const nd = this._lookupNeighbor(n, indexes);
                const available =
                  nd === undefined || nd === null ? null : nd.available ? 1 : 0;
                return `<tr>
                  <td${this._sortAttrs(this._name(nd || n))}><strong>${this._escape(
                    this._name(nd || n)
                  )}</strong>
                    <div class="muted">${this._escape(
                      nd?.manufacturer || ""
                    )} ${this._escape(nd?.model || "")}</div>
                  </td>
                  <td${this._sortAttrs(
                    n.device_type || nd?.device_type || null
                  )}>${this._escape(
                    n.device_type || nd?.device_type || "—"
                  )}</td>
                  <td class="mono"${this._sortAttrs(
                    this._nwkSortValue(n.nwk)
                  )}>${this._escape(this._hexNwk(n.nwk))}</td>
                  <td class="mono ieee"${this._sortAttrs(n.ieee)}>${this._escape(
                    n.ieee || "—"
                  )}</td>
                  <td class="num ${this._lqiClass(n.lqi)}"${this._sortAttrs(
                    n.lqi
                  )}>${this._escape(n.lqi ?? "—")}</td>
                  <td class="num"${this._sortAttrs(
                    this._depthSortValue(n.depth)
                  )}>${this._depthHtml(n.depth)}</td>
                  <td${this._sortAttrs(n.rx_on_when_idle)}>${this._escape(
                    n.rx_on_when_idle || "—"
                  )}</td>
                  <td${this._sortAttrs(available)}>${
                    nd ? (nd.available ? "Yes" : "No") : "—"
                  }</td>
                  <td${this._sortAttrs(
                    this._timeSortValue(nd?.last_seen)
                  )}>${this._escape(this._fmtLastSeen(nd?.last_seen))}</td>
                </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>`;
  }

  _neighborsTable(d, indexes) {
    const neighbors = this._uniqueNeighbors(d.neighbors);
    if (!neighbors.length)
      return `<div class="empty">No neighbor entries reported.</div>`;

    const tableKey = `neighbors:${String(d.ieee || this._hexNwk(d.nwk))}`;

    return `
      <div class="table-wrap">
        <table data-sort-key="${this._escape(tableKey)}">
          <thead><tr>
            ${this._sortableTh("Neighbor")}
            ${this._sortableTh("Relationship")}
            ${this._sortableTh("Type")}
            ${this._sortableTh("NWK", "number")}
            ${this._sortableTh("LQI", "number", "num")}
            ${this._sortableTh("Depth", "number", "num")}
            ${this._sortableTh("Rx on idle")}
            ${this._sortableTh("Permit joining")}
          </tr></thead>
          <tbody>
            ${neighbors
              .map((n) => {
                const nd = this._lookupNeighbor(n, indexes);
                const rel = this._normRelationship(n.relationship);
                return `<tr>
                  <td${this._sortAttrs(this._name(nd || n))}><strong>${this._escape(
                    this._name(nd || n)
                  )}</strong>
                    <div class="muted">${this._escape(nd?.model || "")}</div>
                  </td>
                  <td${this._sortAttrs(this._relationshipLabel(n.relationship))}><span class="badge rel-${this._escape(
                    rel.replaceAll(" ", "-")
                  )}">${this._escape(
                    this._relationshipLabel(n.relationship)
                  )}</span></td>
                  <td${this._sortAttrs(n.device_type)}>${this._escape(
                    n.device_type || "—"
                  )}</td>
                  <td${this._sortAttrs(
                    this._nwkSortValue(n.nwk)
                  )}>${this._nwkWithIeee(n.nwk, n.ieee)}</td>
                  <td class="num ${this._lqiClass(n.lqi)}"${this._sortAttrs(
                    n.lqi
                  )}>${this._escape(n.lqi ?? "—")}</td>
                  <td class="num"${this._sortAttrs(
                    this._depthSortValue(n.depth)
                  )}>${this._depthHtml(n.depth)}</td>
                  <td${this._sortAttrs(n.rx_on_when_idle)}>${this._escape(
                    n.rx_on_when_idle || "—"
                  )}</td>
                  <td${this._sortAttrs(n.permit_joining)}>${this._escape(
                    n.permit_joining || "—"
                  )}</td>
                </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>`;
  }

  _routesTable(d, indexes) {
    const routes = d.routes || [];

    if (!routes.length)
      return `<div class="empty">No routing entries reported. This does not mean the device is not routing.</div>`;

    const tableKey = `routes:${String(d.ieee || this._hexNwk(d.nwk))}`;
    const showPaths = this._config.show_route_paths !== false;

    return `
      <div class="table-wrap">
        <table data-sort-key="${this._escape(tableKey)}">
          <thead><tr>
            ${this._sortableTh("Destination", "number")}
            ${this._sortableTh("Destination device")}
            ${this._sortableTh("Next hop", "number")}
            ${this._sortableTh("Next-hop device")}
            ${showPaths ? this._sortableTh("Inferred path", "number") : ""}
            ${this._sortableTh("Status", "number")}
            ${this._sortableTh("Many-to-one", "number")}
            ${this._sortableTh("Memory constrained", "number")}
            ${this._sortableTh("Route record req.", "number")}
          </tr></thead>
          <tbody>
            ${routes
              .map((r) => {
                const dest = this._lookupNwk(r.dest_nwk, indexes);
                const hop = this._lookupNwk(r.next_hop, indexes);
                const annotation = this._nextHopAnnotation(r);
                const unresolved =
                  this._hexNwk(r.next_hop).toUpperCase() === "0XFFFE";
                const hopDeviceSort = unresolved
                  ? annotation?.label || "Unresolved"
                  : hop
                  ? this._name(hop)
                  : null;
                const path = showPaths ? this._inferRoutePath(d, r, indexes) : null;

                return `<tr>
                  <td${this._sortAttrs(
                    this._nwkSortValue(r.dest_nwk)
                  )}>${this._nwkWithIeee(r.dest_nwk, dest?.ieee)}</td>
                  <td${this._sortAttrs(dest ? this._name(dest) : null)}>${this._escape(
                    dest ? this._name(dest) : "—"
                  )}${
                    !dest
                      ? '<span class="badge path-warning" title="No current ZHA device has this NWK address; the route may be stale.">Unknown destination</span>'
                      : ""
                  }</td>
                  <td${this._sortAttrs(
                    this._nwkSortValue(r.next_hop)
                  )}>${this._nwkWithIeee(r.next_hop, hop?.ieee)}</td>
                  <td${this._sortAttrs(hopDeviceSort)}>
                    ${unresolved ? "" : this._escape(hop ? this._name(hop) : "—")}
                    ${
                      annotation
                        ? `<span class="badge ${this._escape(
                            annotation.className
                          )}" title="${this._escape(
                            annotation.title
                          )}">${this._escape(annotation.label)}</span>`
                        : ""
                    }
                  </td>
                  ${
                    showPaths
                      ? `<td class="path-cell"${this._sortAttrs(
                          Number.isFinite(path?.hops) ? path.hops : null,
                          this._pathText(path)
                        )}>${this._pathHtml(path)}</td>`
                      : ""
                  }
                  <td${this._sortAttrs(
                    this._routeStatusSortValue(r.route_status),
                    String(r.route_status || "")
                  )}><span class="badge route-${this._escape(
                    String(r.route_status || "").toLowerCase()
                  )}">${this._escape(r.route_status || "—")}</span></td>
                  <td${this._sortAttrs(r.many_to_one ? 1 : 0)}>${
                    r.many_to_one ? "Yes" : "No"
                  }</td>
                  <td${this._sortAttrs(r.memory_constrained ? 1 : 0)}>${
                    r.memory_constrained ? "Yes" : "No"
                  }</td>
                  <td${this._sortAttrs(r.route_record_required ? 1 : 0)}>${
                    r.route_record_required ? "Yes" : "No"
                  }</td>
                </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>`;
  }

  _coordinatorPathsTable(indexes) {
    if (this._config.show_route_paths === false) return "";

    const coordinator = this._devices.find(
      (d) => d?.active_coordinator || this._sameNwk(d?.nwk, 0)
    );
    const routes = coordinator?.routes || [];
    if (!coordinator || !routes.length) return "";

    return `
      <h3>Coordinator inferred route paths</h3>
      <div class="table-wrap">
        <table data-sort-key="coordinator-paths">
          <thead><tr>
            ${this._sortableTh("Destination", "number")}
            ${this._sortableTh("Destination device")}
            ${this._sortableTh("Inferred path", "number")}
            ${this._sortableTh("Route status", "number")}
          </tr></thead>
          <tbody>
            ${routes
              .map((r) => {
                const dest = this._lookupNwk(r.dest_nwk, indexes);
                const path = this._inferRoutePath(coordinator, r, indexes);
                return `<tr>
                  <td${this._sortAttrs(
                    this._nwkSortValue(r.dest_nwk)
                  )}>${this._nwkWithIeee(r.dest_nwk, dest?.ieee)}</td>
                  <td${this._sortAttrs(dest ? this._name(dest) : null)}>${this._escape(
                    dest ? this._name(dest) : "—"
                  )}${
                    !dest
                      ? '<span class="badge path-warning" title="No current ZHA device has this NWK address; the route may be stale.">Unknown destination</span>'
                      : ""
                  }</td>
                  <td class="path-cell"${this._sortAttrs(
                    Number.isFinite(path?.hops) ? path.hops : null,
                    this._pathText(path)
                  )}>${this._pathHtml(path)}</td>
                  <td${this._sortAttrs(
                    this._routeStatusSortValue(r.route_status),
                    String(r.route_status || "")
                  )}><span class="badge route-${this._escape(
                    String(r.route_status || "").toLowerCase()
                  )}">${this._escape(r.route_status || "—")}</span></td>
                </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>
      <div class="muted route-path-help">Paths are inferred by recursively following each router's reported next hop. The final hop may use a reported neighbor relationship when no matching route entry is present. Paths are directional and are not packet traces.</div>`;
  }

  _routerDetails(indexes) {
    return this._devices
      .filter((d) => this._isRouterDevice(d))
      .sort((a, b) => {
        if (a.active_coordinator && !b.active_coordinator) return -1;
        if (!a.active_coordinator && b.active_coordinator) return 1;
        return this._name(a).localeCompare(this._name(b));
      })
      .map((d) => {
        const neighbors = this._uniqueNeighbors(d.neighbors);
        const children = neighbors.filter((n) => this._isChild(n));
        const routes = d.routes || [];
        const scanEvidence = this._scanResponseEvidence(d);
        const stale = scanEvidence?.state === "stale";
        return `
          <details class="router-detail">
            <summary>
              <span>
                <strong>${this._escape(this._name(d))}</strong>
                ${d.active_coordinator ? '<span class="badge coord">Coordinator</span>' : ""}
                <span class="muted">${this._escape(d.model || "")}</span>
              </span>
              <span class="summary-counts">
                ${children.length} children · ${neighbors.length} neighbors · ${routes.length} routes
              </span>
            </summary>
            <div class="detail-body">
              <div class="facts">
                <span><b>IEEE:</b> <span class="mono">${this._escape(d.ieee || "—")}</span></span>
                <span><b>NWK:</b> <span class="mono">${this._escape(this._hexNwk(d.nwk))}</span></span>
                <span><b>Manufacturer:</b> ${this._escape(d.manufacturer || "—")}</span>
                <span><b>Model:</b> ${this._escape(d.model || "—")}</span>
                <span><b>LQI:</b> ${this._escape(d.lqi ?? "—")}</span>
                <span><b>RSSI:</b> ${this._escape(d.rssi ?? "—")}</span>
                <span><b>Available:</b> ${d.available ? "Yes" : "No"}</span>
                <span><b>Last device response:</b> ${this._escape(this._fmtLastSeen(d.last_seen))}</span>
                ${
                  scanEvidence
                    ? `<span><b>Scan evidence:</b> <span class="badge ${this._escape(
                        scanEvidence.className
                      )}" title="${this._escape(scanEvidence.title)}">${this._escape(
                        scanEvidence.label
                      )}</span></span>`
                    : ""
                }
              </div>

              ${
                stale
                  ? `<div class="topology-warning">Cached — router has not responded since this topology scan began. Neighbor and routing data below were not refreshed by this scan.</div>`
                  : ""
              }

              <div class="topology-section${stale ? " topology-cached" : ""}">
                <h4>Direct children (${children.length})</h4>
                ${this._childrenTable(d, indexes)}

                <h4>Full neighbor table (${neighbors.length})</h4>
                ${this._neighborsTable(d, indexes)}

                <h4>Routing table (${routes.length})</h4>
                ${this._routesTable(d, indexes)}
              </div>
            </div>
          </details>`;
      })
      .join("");
  }

  _endDeviceTable(indexes) {
    if (!this._config.show_end_devices) return "";

    const ends = this._devices
      .filter((d) => !this._isRouterDevice(d))
      .sort((a, b) => this._name(a).localeCompare(this._name(b)));

    if (!ends.length) return "";

    // Find reported parents by searching router neighbor tables for Child
    // relationships. Keep all reporters so stale child tables can be surfaced
    // instead of silently letting the last router overwrite earlier claims.
    const parentMap = new Map();
    for (const r of this._devices.filter((d) => this._isRouterDevice(d))) {
      for (const n of this._uniqueNeighbors(r.neighbors)) {
        if (this._isChild(n) && n.ieee) {
          const key = String(n.ieee).toLowerCase();
          const parents = parentMap.get(key) || [];
          if (!parents.some((p) => String(p?.ieee || "").toLowerCase() === String(r?.ieee || "").toLowerCase())) {
            parents.push(r);
          }
          parentMap.set(key, parents);
        }
      }
    }

    return `
      <h3>End devices / reported parents</h3>
      <div class="table-wrap">
        <table data-sort-key="end-devices">
          <thead><tr>
            ${this._sortableTh("End device")}
            ${this._sortableTh("NWK", "number")}
            ${this._sortableTh("Reported parent")}
            ${this._sortableTh("Device LQI", "number", "num")}
            ${this._sortableTh("RSSI", "number", "num")}
            ${this._sortableTh("Available", "number")}
            ${this._sortableTh("Last seen", "number")}
          </tr></thead>
          <tbody>
            ${ends
              .map((d) => {
                const parents = parentMap.get(String(d.ieee || "").toLowerCase()) || [];
                const parentNames = parents.map((p) => this._name(p));
                const parentSort = parentNames.length
                  ? parentNames.join(" | ")
                  : "Not reported";
                let parentHtml;
                if (!parents.length) {
                  parentHtml = '<span class="badge parent-not-reported" title="No router in the current reported neighbor tables claims this end device as a Child.">Not reported</span>';
                } else if (parents.length === 1) {
                  parentHtml = this._escape(parentNames[0]);
                } else {
                  parentHtml = `${parentNames.map((name) => this._escape(name)).join(" · ")}<span class="badge parent-conflict" title="More than one router currently reports this end device as a Child. At least one child-table entry may be stale.">Multiple reported (${parents.length})</span>`;
                }
                return `<tr>
                  <td${this._sortAttrs(this._name(d))}><strong>${this._escape(
                    this._name(d)
                  )}</strong>
                    <div class="muted">${this._escape(
                      d.manufacturer || ""
                    )} ${this._escape(d.model || "")}</div>
                  </td>
                  <td class="mono"${this._sortAttrs(
                    this._nwkSortValue(d.nwk)
                  )}>${this._escape(this._hexNwk(d.nwk))}</td>
                  <td${this._sortAttrs(parentSort)}>${parentHtml}</td>
                  <td class="num ${this._lqiClass(d.lqi)}"${this._sortAttrs(
                    d.lqi
                  )}>${this._escape(d.lqi ?? "—")}</td>
                  <td class="num"${this._sortAttrs(d.rssi)}>${this._escape(
                    d.rssi ?? "—"
                  )}</td>
                  <td${this._sortAttrs(d.available ? 1 : 0)}>${
                    d.available ? "Yes" : "No"
                  }</td>
                  <td${this._sortAttrs(
                    this._timeSortValue(d.last_seen)
                  )}>${this._escape(this._fmtLastSeen(d.last_seen))}</td>
                </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>`;
  }

  _render() {
    if (!this.shadowRoot) return;
    const indexes = this._indexes();
    const s = this._summaryStats();

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card { padding: 16px; overflow: hidden; }
        .header {
          display:grid;
          grid-template-columns:minmax(0, 1fr) auto;
          grid-template-areas:
            "title toolbar"
            "status status";
          column-gap:12px;
          row-gap:5px;
          align-items:start;
          margin-bottom:12px;
        }
        .header-title { grid-area:title; min-width:0; }
        .header-status { grid-area:status; min-width:0; }
        h2 { margin:0; font-size:1.35rem; }
        h3 { margin:22px 0 10px; font-size:1.1rem; }
        h4 { margin:18px 0 8px; }
        .toolbar { grid-area:toolbar; display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
        button {
          border:1px solid var(--divider-color);
          background:var(--card-background-color);
          color:var(--primary-text-color);
          border-radius:8px; padding:8px 11px; cursor:pointer;
        }
        button.primary {
          background:var(--primary-color);
          color:var(--text-primary-color, white);
          border-color:var(--primary-color);
        }
        button:disabled { opacity:.55; cursor:default; }
        .status { color:var(--secondary-text-color); font-size:.88rem; }
        .stats {
          display:grid; grid-template-columns:repeat(auto-fit,minmax(125px,1fr));
          gap:8px; margin:12px 0 18px;
        }
        .stat {
          border:1px solid var(--divider-color);
          border-radius:10px; padding:10px 12px;
        }
        .stat .value { font-size:1.35rem; font-weight:700; }
        .stat .label { color:var(--secondary-text-color); font-size:.82rem; }
        .table-wrap { overflow-x:auto; width:100%; }
        table { width:100%; border-collapse:collapse; font-size:.88rem; }
        th, td {
          padding:7px 8px; border-bottom:1px solid var(--divider-color);
          text-align:left; white-space:nowrap; vertical-align:top;
        }
        th {
          color:var(--secondary-text-color); font-size:.78rem;
          text-transform:uppercase; letter-spacing:.02em;
        }
        th.sortable {
          cursor:pointer;
          user-select:none;
          -webkit-user-select:none;
        }
        th.sortable:hover, th.sortable:focus-visible {
          color:var(--primary-text-color);
        }
        th.sortable::after {
          content:"↕";
          display:inline-block;
          margin-left:.35em;
          font-size:.78em;
          opacity:.28;
          vertical-align:.08em;
        }
        th.sortable[aria-sort="ascending"]::after {
          content:"▲";
          opacity:.85;
        }
        th.sortable[aria-sort="descending"]::after {
          content:"▼";
          opacity:.85;
        }
        td.num, th.num { text-align:right; }
        .strong { font-weight:700; }
        .mono {
          font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;
        }
        .ieee { font-size:.8rem; }
        .nwk-tooltip, .depth-tooltip { cursor:help; text-decoration:underline dotted; text-underline-offset:3px; }
        .muted { color:var(--secondary-text-color); font-size:.78rem; margin-top:2px; }
        .badge {
          display:inline-block; border-radius:999px; padding:2px 7px;
          font-size:.72rem; margin-left:5px; background:var(--secondary-background-color);
        }
        .coord { background:color-mix(in srgb,var(--primary-color) 20%,transparent); }
        .parent-not-reported {
          margin-left:0;
          color:var(--secondary-text-color);
          background:var(--secondary-background-color);
        }
        .parent-conflict, .scan-stale, .path-warning {
          font-weight:700;
          background:color-mix(in srgb,var(--warning-color, #ffa600) 18%,var(--secondary-background-color));
        }
        .scan-responded {
          margin-left:0;
          font-weight:700;
          background:color-mix(in srgb,var(--primary-color) 16%,var(--secondary-background-color));
        }
        .scan-uncertain {
          margin-left:0;
          color:var(--secondary-text-color);
        }
        .path-error {
          font-weight:700;
          background:color-mix(in srgb,var(--error-color, #db4437) 18%,var(--secondary-background-color));
        }
        .path-neighbor {
          background:color-mix(in srgb,var(--primary-color) 10%,var(--secondary-background-color));
        }
        .path-hops { margin-left:2px; font-weight:700; }
        .path-cell { white-space:normal; min-width:300px; }
        .route-path { display:flex; align-items:center; gap:4px; flex-wrap:wrap; }
        .path-node {
          display:inline-block;
          max-width:155px;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
          border:1px solid var(--divider-color);
          border-radius:999px;
          padding:2px 7px;
          background:var(--secondary-background-color);
          font-size:.76rem;
        }
        .path-arrow { color:var(--secondary-text-color); }
        .path-note { white-space:normal; max-width:620px; }
        .route-path-help { margin-top:6px; }
        .topology-warning {
          margin-top:10px;
          padding:8px 10px;
          border-left:3px solid var(--warning-color, #ffa600);
          background:color-mix(in srgb,var(--warning-color, #ffa600) 10%,var(--secondary-background-color));
          font-size:.82rem;
        }
        .topology-cached { opacity:.82; }
        .rel-child { font-weight:700; }
        .route-active { font-weight:700; }
        .route-direct {
          font-weight:700;
          background:color-mix(in srgb,var(--primary-color) 16%,var(--secondary-background-color));
        }
        .route-no-route {
          font-weight:700;
          background:color-mix(in srgb,var(--error-color, #db4437) 18%,var(--secondary-background-color));
        }
        .route-resolving {
          font-weight:700;
          background:color-mix(in srgb,var(--warning-color, #ffa600) 18%,var(--secondary-background-color));
        }
        .route-unresolved {
          font-weight:700;
        }
        .lqi-high { }
        .lqi-mid { }
        .lqi-low { font-weight:700; }
        details.router-detail {
          border:1px solid var(--divider-color); border-radius:10px;
          margin:9px 0; overflow:hidden;
        }
        details.router-detail > summary {
          cursor:pointer; padding:11px 12px; display:flex;
          justify-content:space-between; gap:12px; align-items:center;
          background:var(--secondary-background-color);
        }
        .summary-counts { color:var(--secondary-text-color); font-size:.82rem; }
        .detail-body { padding:10px 12px 14px; }
        .facts {
          display:flex; flex-wrap:wrap; gap:7px 18px;
          color:var(--secondary-text-color); font-size:.84rem;
        }
        .facts b { color:var(--primary-text-color); }
        .empty { color:var(--secondary-text-color); padding:8px 0; font-style:italic; }
        .note {
          margin-top:14px; padding:10px 12px; border-left:3px solid var(--primary-color);
          background:var(--secondary-background-color); font-size:.84rem;
        }
        .version-footer {
          margin-top:12px; text-align:right;
          color:var(--secondary-text-color); font-size:.72rem;
        }
        @media (max-width: 700px) {
          ha-card { padding:12px; }
          .header {
            grid-template-columns:1fr;
            grid-template-areas:
              "title"
              "status"
              "toolbar";
          }
          .toolbar { justify-content:flex-start; }
          th, td { padding:6px; }
          .summary-counts { display:none; }
        }
      </style>

      <ha-card>
        <div class="header">
          <div class="header-title">
            <h2>${this._escape(this._config.title)}</h2>
          </div>
          <div class="toolbar">
            <button id="open-map">ZHA map</button>
            <button id="reload" ${this._loading ? "disabled" : ""}>Reload snapshot</button>
            <button id="scan" class="primary">Scan topology</button>
            <button id="copy-text" ${!this._devices.length ? "disabled" : ""}>Copy text</button>
            <button id="copy-json" ${!this._devices.length ? "disabled" : ""}>Copy JSON</button>
          </div>
          <div class="header-status">
            <div class="status">${this._escape(this._statusLine())}</div>
          </div>
        </div>

        <div class="stats">
          <div class="stat"><div class="value">${this._devices.length}</div><div class="label">ZHA devices</div></div>
          <div class="stat"><div class="value">${s.routers.length}</div><div class="label">Routers + coordinator</div></div>
          <div class="stat"><div class="value">${s.endDevices.length}</div><div class="label">End devices</div></div>
          <div class="stat"><div class="value">${s.childLinks}</div><div class="label">Reported child links</div></div>
          <div class="stat"><div class="value">${s.neighborEntries}</div><div class="label">Neighbor entries</div></div>
          <div class="stat"><div class="value">${s.routes}</div><div class="label">Route entries</div></div>
        </div>

        <h3>Router summary</h3>
        <div class="table-wrap">
          <table data-sort-key="router-summary">
            <thead><tr>
              ${this._sortableTh("Router")}
              ${this._sortableTh("NWK", "number")}
              ${this._sortableTh("Children", "number", "num")}
              ${this._sortableTh("Router nbrs", "number", "num")}
              ${this._sortableTh("All nbrs", "number", "num")}
              ${this._sortableTh("Active/Routes", "number", "num")}
              ${this._sortableTh("LQI", "number", "num")}
              ${this._sortableTh("RSSI", "number", "num")}
              ${this._sortableTh("Last response", "number")}
              ${this._sortableTh("Scan response")}
            </tr></thead>
            <tbody>${this._routerSummaryRows(indexes)}</tbody>
          </table>
        </div>

        ${this._coordinatorPathsTable(indexes)}

        ${this._endDeviceTable(indexes)}

        <h3>Per-router raw topology</h3>
        ${this._routerDetails(indexes)}

        <div class="note">
          <b>Interpretation:</b> “Child” is the relationship reported in that router's
          Zigbee neighbor table. “Sibling”/“Parent” entries are one-hop router relationships.
          “Other neighbor” is the friendly display name for ZHA's raw
          “NoneOfTheAbove” relationship value. Zigbee depth 15 is displayed as
          “Max (15)” because 15 is the maximum defined network depth and may not reflect the
          actual routing path; depth 255 (0xFF) is displayed as “Unknown”. In routing tables,
          0xFFFE remains visible as the raw next-hop value while the Next-hop device column
          labels it “No route”, “Resolving”, or “Unresolved” according to route status.
          Click or tap any table heading to sort that table; click again to reverse
          the sort. Sort choices are kept independently for each table while the card is loaded.
          Visible neighbor/child tables and counts are de-duplicated by IEEE address (NWK fallback);
          Copy JSON preserves the raw ZHA data.
          Route-table destinations and next hops are separate from the neighbor table.
          Inferred route paths recursively follow reported next hops and may use a neighbor-table
          relationship for the final hop; they are directional inferences, not packet traces.
          An “Unknown destination” path badge usually means the route points to a NWK address that
          is no longer registered in ZHA and may therefore be stale. A router that reports no
          routing entries may still route traffic. After a topology scan started from this card,
          “Not refreshed this scan” means the router has not transmitted since the scan began, so
          its displayed topology is cached; “Responded since scan started” proves only that the
          device transmitted, not that both management tables refreshed successfully. A missing
          sleepy child is not absolute proof of a different parent, and multiple routers may
          temporarily report the same child when one child table is stale.
        </div>

        <div class="version-footer">ZHA Topology Details Card v1.4</div>
      </ha-card>
    `;

    this.shadowRoot.getElementById("open-map")?.addEventListener("click", () => this._openMap());
    this.shadowRoot.getElementById("reload")?.addEventListener("click", () => this._loadDevices());
    this.shadowRoot.getElementById("scan")?.addEventListener("click", () => this._scanTopology());
    this.shadowRoot.getElementById("copy-text")?.addEventListener("click", () => this._copyText());
    this.shadowRoot.getElementById("copy-json")?.addEventListener("click", () => this._copyJson());
    this._wireSorting();
  }
}

if (!customElements.get("zha-topology-details-card")) {
  customElements.define("zha-topology-details-card", ZhaTopologyDetailsCard);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: "zha-topology-details-card",
  name: "ZHA Topology Details",
  description: "Detailed sortable ZHA child, neighbor, routing, and inferred-path tables with topology scan controls.",
  preview: false,
});
