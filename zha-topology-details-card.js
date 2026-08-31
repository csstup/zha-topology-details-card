/*
 * ZHA Topology Details Card
 * Version: 1.2
 * Date: 2026-08-31
 *
 * Author: Corey Stup
 * Developed with assistance from ChatGPT (OpenAI GPT-5.6 Sol)
 *
 * Repository: zha-topology-details-card
 *
 * Revision History:
 *   v1.2 - 2026-08-31 - Display depth 15 as Max (15) and add friendly next-hop route-state pills.
 *   v1.1 - 2026-08-31 - Display Zigbee depth 255 (0xFF) as Unknown.
 *   v1.0 - 2026-08-31 - Initial public release.
 */

/*
 * ZHA Topology Details Card v1.2
 * Uses Home Assistant's authenticated frontend WebSocket connection.
 *
 * Dashboard YAML:
 *   type: custom:zha-topology-details-card
 *   title: Zigbee Topology Details
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
  }

  setConfig(config) {
    this._config = {
      title: "Zigbee Topology Details",
      show_end_devices: true,
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
      this._status = `Loaded ${this._devices.length} devices`;
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
    this._status = "Topology scan requested…";
    this._render();
    try {
      await this._hass.connection.sendMessagePromise({
        type: "zha/topology/update",
      });
      // The API starts the scan asynchronously; it does not return a "scan complete"
      // event. Re-read the snapshot a few times while routers reply.
      const delays = [5000, 12000, 25000, 45000];
      delays.forEach((delay, idx) => {
        const timer = setTimeout(() => {
          this._loadDevices(
            idx === delays.length - 1
              ? "Loading final scan snapshot…"
              : `Loading scan snapshot ${idx + 1}/${delays.length}…`
          );
        }, delay);
        this._scanTimers.push(timer);
      });
    } catch (err) {
      this._status = `Scan error: ${err?.message || err}`;
      this._render();
    }
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
    out.push(`Card version: v1.2`);
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
        out.push(
          `  dest=${this._hexNwk(r.dest_nwk)}${
            dest ? ` (${this._name(dest)})` : ""
          } -> next=${this._hexNwk(r.next_hop)}${
            hop ? ` (${this._name(hop)})` : ""
          }${annotation ? ` [${annotation.label}]` : ""} | status=${r.route_status || "—"} | many_to_one=${
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
        const routerNeighbors = neighbors.filter((n) => this._isRouterNeighbor(n));
        const routes = d.routes || [];
        const activeRoutes = routes.filter(
          (r) => String(r.route_status || "").toLowerCase() === "active"
        ).length;

        return `
          <tr>
            <td>
              <strong>${this._escape(this._name(d))}</strong>
              ${d.active_coordinator ? '<span class="badge coord">Coordinator</span>' : ""}
              <div class="muted">${this._escape(d.manufacturer || "")} ${this._escape(d.model || "")}</div>
            </td>
            <td class="mono">${this._escape(this._hexNwk(d.nwk))}</td>
            <td class="num strong">${children.length}</td>
            <td class="num">${routerNeighbors.length}</td>
            <td class="num">${neighbors.length}</td>
            <td class="num">${activeRoutes}/${routes.length}</td>
            <td class="num ${this._lqiClass(d.lqi)}">${this._escape(d.lqi ?? "—")}</td>
            <td class="num">${this._escape(d.rssi ?? "—")}</td>
            <td>${this._escape(this._fmtLastSeen(d.last_seen))}</td>
          </tr>`;
      })
      .join("");
  }

  _childrenTable(d, indexes) {
    const children = this._uniqueNeighbors(d.neighbors).filter((n) =>
      this._isChild(n)
    );
    if (!children.length) return `<div class="empty">No direct children reported.</div>`;
    return `
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Child</th><th>Type</th><th>NWK</th><th>IEEE</th>
            <th>LQI</th><th>Depth</th><th>Rx on idle</th><th>Available</th><th>Last seen</th>
          </tr></thead>
          <tbody>
            ${children
              .map((n) => {
                const nd = this._lookupNeighbor(n, indexes);
                return `<tr>
                  <td><strong>${this._escape(this._name(nd || n))}</strong>
                    <div class="muted">${this._escape(nd?.manufacturer || "")} ${this._escape(nd?.model || "")}</div>
                  </td>
                  <td>${this._escape(n.device_type || nd?.device_type || "—")}</td>
                  <td class="mono">${this._escape(this._hexNwk(n.nwk))}</td>
                  <td class="mono ieee">${this._escape(n.ieee || "—")}</td>
                  <td class="num ${this._lqiClass(n.lqi)}">${this._escape(n.lqi ?? "—")}</td>
                  <td class="num">${this._depthHtml(n.depth)}</td>
                  <td>${this._escape(n.rx_on_when_idle || "—")}</td>
                  <td>${nd ? (nd.available ? "Yes" : "No") : "—"}</td>
                  <td>${this._escape(this._fmtLastSeen(nd?.last_seen))}</td>
                </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>`;
  }

  _neighborsTable(d, indexes) {
    const neighbors = this._uniqueNeighbors(d.neighbors);
    if (!neighbors.length) return `<div class="empty">No neighbor entries reported.</div>`;
    return `
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Neighbor</th><th>Relationship</th><th>Type</th><th>NWK</th>
            <th>LQI</th><th>Depth</th><th>Rx on idle</th><th>Permit joining</th>
          </tr></thead>
          <tbody>
            ${neighbors
              .map((n) => {
                const nd = this._lookupNeighbor(n, indexes);
                const rel = this._normRelationship(n.relationship);
                return `<tr>
                  <td><strong>${this._escape(this._name(nd || n))}</strong>
                    <div class="muted">${this._escape(nd?.model || "")}</div>
                  </td>
                  <td><span class="badge rel-${this._escape(rel.replaceAll(" ", "-"))}">${this._escape(this._relationshipLabel(n.relationship))}</span></td>
                  <td>${this._escape(n.device_type || "—")}</td>
                  <td>${this._nwkWithIeee(n.nwk, n.ieee)}</td>
                  <td class="num ${this._lqiClass(n.lqi)}">${this._escape(n.lqi ?? "—")}</td>
                  <td class="num">${this._depthHtml(n.depth)}</td>
                  <td>${this._escape(n.rx_on_when_idle || "—")}</td>
                  <td>${this._escape(n.permit_joining || "—")}</td>
                </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>`;
  }

  _routesTable(d, indexes) {
    const routes = d.routes || [];
    if (!routes.length) return `<div class="empty">No route entries reported.</div>`;
    return `
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Destination</th><th>Destination device</th>
            <th>Next hop</th><th>Next-hop device</th><th>Status</th>
            <th>Many-to-one</th><th>Memory constrained</th><th>Route record req.</th>
          </tr></thead>
          <tbody>
            ${routes
              .map((r) => {
                const dest = this._lookupNwk(r.dest_nwk, indexes);
                const hop = this._lookupNwk(r.next_hop, indexes);
                const annotation = this._nextHopAnnotation(r);
                const unresolved = this._hexNwk(r.next_hop).toUpperCase() === "0XFFFE";
                return `<tr>
                  <td>${this._nwkWithIeee(r.dest_nwk, dest?.ieee)}</td>
                  <td>${this._escape(dest ? this._name(dest) : "—")}</td>
                  <td>${this._nwkWithIeee(r.next_hop, hop?.ieee)}</td>
                  <td>
                    ${unresolved ? "" : this._escape(hop ? this._name(hop) : "—")}
                    ${annotation ? `<span class="badge ${this._escape(annotation.className)}" title="${this._escape(annotation.title)}">${this._escape(annotation.label)}</span>` : ""}
                  </td>
                  <td><span class="badge route-${this._escape(String(r.route_status || "").toLowerCase())}">${this._escape(r.route_status || "—")}</span></td>
                  <td>${r.many_to_one ? "Yes" : "No"}</td>
                  <td>${r.memory_constrained ? "Yes" : "No"}</td>
                  <td>${r.route_record_required ? "Yes" : "No"}</td>
                </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>`;
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
                <span><b>Last seen:</b> ${this._escape(this._fmtLastSeen(d.last_seen))}</span>
              </div>

              <h4>Direct children (${children.length})</h4>
              ${this._childrenTable(d, indexes)}

              <h4>Full neighbor table (${neighbors.length})</h4>
              ${this._neighborsTable(d, indexes)}

              <h4>Routing table (${routes.length})</h4>
              ${this._routesTable(d, indexes)}
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
    // Find reported parent by searching router neighbor tables for Child relationship.
    const parentMap = new Map();
    for (const r of this._devices.filter((d) => this._isRouterDevice(d))) {
      for (const n of this._uniqueNeighbors(r.neighbors)) {
        if (this._isChild(n) && n.ieee) {
          parentMap.set(String(n.ieee).toLowerCase(), r);
        }
      }
    }
    return `
      <h3>End devices / reported parents</h3>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>End device</th><th>NWK</th><th>Reported parent</th><th>Device LQI</th>
            <th>RSSI</th><th>Available</th><th>Last seen</th>
          </tr></thead>
          <tbody>
            ${ends
              .map((d) => {
                const p = parentMap.get(String(d.ieee || "").toLowerCase());
                return `<tr>
                  <td><strong>${this._escape(this._name(d))}</strong>
                    <div class="muted">${this._escape(d.manufacturer || "")} ${this._escape(d.model || "")}</div>
                  </td>
                  <td class="mono">${this._escape(this._hexNwk(d.nwk))}</td>
                  <td>${this._escape(p ? this._name(p) : "Not reported")}</td>
                  <td class="num ${this._lqiClass(d.lqi)}">${this._escape(d.lqi ?? "—")}</td>
                  <td class="num">${this._escape(d.rssi ?? "—")}</td>
                  <td>${d.available ? "Yes" : "No"}</td>
                  <td>${this._escape(this._fmtLastSeen(d.last_seen))}</td>
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
          display:flex; gap:12px; justify-content:space-between; align-items:flex-start;
          flex-wrap:wrap; margin-bottom:12px;
        }
        h2 { margin:0; font-size:1.35rem; }
        h3 { margin:22px 0 10px; font-size:1.1rem; }
        h4 { margin:18px 0 8px; }
        .toolbar { display:flex; gap:8px; flex-wrap:wrap; }
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
        .status { color:var(--secondary-text-color); font-size:.88rem; margin-top:5px; }
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
          th, td { padding:6px; }
          .summary-counts { display:none; }
        }
      </style>

      <ha-card>
        <div class="header">
          <div>
            <h2>${this._escape(this._config.title)}</h2>
            <div class="status">
              ${this._escape(this._status || "Ready")}
              ${
                this._lastLoaded
                  ? ` · snapshot ${this._escape(this._lastLoaded.toLocaleTimeString())}`
                  : ""
              }
            </div>
          </div>
          <div class="toolbar">
            <button id="open-map">ZHA map</button>
            <button id="reload" ${this._loading ? "disabled" : ""}>Reload snapshot</button>
            <button id="scan" class="primary">Scan topology</button>
            <button id="copy-text" ${!this._devices.length ? "disabled" : ""}>Copy text</button>
            <button id="copy-json" ${!this._devices.length ? "disabled" : ""}>Copy JSON</button>
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
          <table>
            <thead><tr>
              <th>Router</th><th>NWK</th><th class="num">Children</th>
              <th class="num">Router nbrs</th><th class="num">All nbrs</th>
              <th class="num">Active/Routes</th><th class="num">LQI</th>
              <th class="num">RSSI</th><th>Last seen</th>
            </tr></thead>
            <tbody>${this._routerSummaryRows(indexes)}</tbody>
          </table>
        </div>

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
          Visible neighbor/child tables and counts are
          de-duplicated by IEEE address (NWK fallback); Copy JSON preserves the raw ZHA data.
          Route-table destinations and next hops are separate from the neighbor table.
          A missing sleepy child is not absolute proof of a different parent: topology scans
          depend on each device answering Zigbee management requests correctly.
        </div>

        <div class="version-footer">ZHA Topology Details Card v1.2</div>
      </ha-card>
    `;

    this.shadowRoot.getElementById("open-map")?.addEventListener("click", () => this._openMap());
    this.shadowRoot.getElementById("reload")?.addEventListener("click", () => this._loadDevices());
    this.shadowRoot.getElementById("scan")?.addEventListener("click", () => this._scanTopology());
    this.shadowRoot.getElementById("copy-text")?.addEventListener("click", () => this._copyText());
    this.shadowRoot.getElementById("copy-json")?.addEventListener("click", () => this._copyJson());
  }
}

if (!customElements.get("zha-topology-details-card")) {
  customElements.define("zha-topology-details-card", ZhaTopologyDetailsCard);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: "zha-topology-details-card",
  name: "ZHA Topology Details",
  description: "Detailed ZHA child, neighbor, and routing tables with topology scan controls.",
  preview: false,
});
