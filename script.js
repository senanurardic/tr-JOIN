/* ============================================================================
 * LOCATION-SHARING SOCIAL DISCONNECTION PARADIGM
 * Condition: JOIN Condition
 * Total sequence: 33 s
 * ========================================================================== */

const CONDITION = "JOIN";
const CONDITION_LABEL = "Join Condition";

// Map & Camera Settings
const MAP_CENTER = [32.888735, 39.929456];
const SCENE_ROTATION_DEG = 41;
function rot(bearingDeg) { return (bearingDeg + SCENE_ROTATION_DEG + 360) % 360; }
const MAP_ZOOM = 17.3;

const WALK_SPEED_MPS = 1.3;

// Timeline parameters in milliseconds (Total = 33,000 ms)
const T_STABLE = 4000;   // 0-4s: Hold
const T_BLOCK1 = 12000;  // 4-16s: Move to meeting point
const T_BLOCK2 = 2000;   // 16-18s: Hold at meeting point
const T_BLOCK3 = 12000;  // 18-30s: Move in diverging directions
const T_BLOCK4 = 3000;   // 30-33s: Final hold
const TOTAL_ANIMATION_DURATION = T_STABLE + T_BLOCK1 + T_BLOCK2 + T_BLOCK3 + T_BLOCK4;
const FINAL_HOLD_DURATION = 0;

function calculateBearing(start, end) {
    const startLat = start[1] * Math.PI / 180;
    const startLng = start[0] * Math.PI / 180;
    const endLat   = end[1]   * Math.PI / 180;
    const endLng   = end[0]   * Math.PI / 180;
    const dLng = endLng - startLng;
    const y = Math.sin(dLng) * Math.cos(endLat);
    const x = Math.cos(startLat) * Math.sin(endLat) - Math.sin(startLat) * Math.cos(endLat) * Math.cos(dLng);
    let brng = Math.atan2(y, x) * 180 / Math.PI;
    return (brng + 360) % 360;
}

// Konumlar [Lng, Lat]
const START_G = [32.888409, 39.929681];
const START_M = [32.889090, 39.929422];
const START_U = [32.888559, 39.929150];

// JOIN koşuluna özel koordinatlar
const MEET_POINT  = [32.888755, 39.929568]; // 4-16s arası buluşma hedefi
const DIR_G_AFTER = [32.888541, 39.930243]; // 18-30s G'nin yön hedefi
const DIR_M_AFTER = [32.889936, 39.929889]; // 18-30s M'nin yön hedefi

// Virtual roads için (görsel)
const ROAD_START    = [32.888752, 39.929566];
const ROAD_TARGET_1 = [32.888541, 39.930241];
const ROAD_TARGET_2 = [32.889835, 39.929885];

const EARTH_RADIUS_M = 6378137;

function offsetMeters(origin, bearingDeg, meters) {
    const b = bearingDeg * Math.PI / 180;
    const dNorth = meters * Math.cos(b);
    const dEast  = meters * Math.sin(b);
    const dLat = (dNorth / EARTH_RADIUS_M) * 180 / Math.PI;
    const dLng = (dEast / (EARTH_RADIUS_M * Math.cos(origin[1] * Math.PI / 180))) * 180 / Math.PI;
    return [origin[0] + dLng, origin[1] + dLat];
}

const positions = { leftNode: START_G, rightNode: START_M, mainNode: START_U };

const people = [
    { id: "leftNode",  markerType: "grey-letter-dot", initial: "G" },
    { id: "rightNode", markerType: "grey-letter-dot", initial: "M" },
    { id: "mainNode",  markerType: "blue-pulse-dot" }
];

const EASE_MIX = 0.30;
function easeFraction(f) {
    const smooth = f * f * (3 - 2 * f);
    return (1 - EASE_MIX) * f + EASE_MIX * smooth;
}

// GPS tween sabitleri
const GPS_UPDATE_MS = 1000;
const GPS_TWEEN_MS  = 900;
const GPS_OFFSET_MS = { G: 0, M: 500 };

// Gerçek pozisyon hesabı (JOIN mantığı)
function truePosition(who, elapsedMs) {
    const tStableEnd = T_STABLE;                        // 4000
    const tBlock1End = T_STABLE + T_BLOCK1;             // 16000
    const tBlock2End = T_STABLE + T_BLOCK1 + T_BLOCK2;  // 18000
    const tBlock3End = tBlock2End + T_BLOCK3;            // 30000

    const startPos   = who === "G" ? START_G   : START_M;
    const dirTarget  = who === "G" ? DIR_G_AFTER : DIR_M_AFTER;

    // Faz 1 (0-4s): Başlangıç konumu, sabit
    if (elapsedMs <= tStableEnd) {
        return startPos;
    }

    // Faz 2 (4-16s): Başlangıç → MEET_POINT doğrusal
    if (elapsedMs <= tBlock1End) {
        const f = easeFraction((elapsedMs - tStableEnd) / T_BLOCK1);
        return [
            startPos[0] + (MEET_POINT[0] - startPos[0]) * f,
            startPos[1] + (MEET_POINT[1] - startPos[1]) * f
        ];
    }

    // Faz 3 (16-18s): MEET_POINT'te sabit
    if (elapsedMs <= tBlock2End) {
        return MEET_POINT;
    }

    // Faz 4 (18-30s): MEET_POINT'ten yön hedefine doğru, normal yürüyüş hızı
    if (elapsedMs <= tBlock3End) {
        const elapsed4 = elapsedMs - tBlock2End;
        const bearing = calculateBearing(MEET_POINT, dirTarget);
        const distanceTraveled = WALK_SPEED_MPS * (elapsed4 / 1000);
        return offsetMeters(MEET_POINT, bearing, distanceTraveled);
    }

    // Faz 5 (30-33s): Faz 4'ün bittiği konumda sabit
    const bearing = calculateBearing(MEET_POINT, dirTarget);
    const distanceTraveled = WALK_SPEED_MPS * (T_BLOCK3 / 1000);
    return offsetMeters(MEET_POINT, bearing, distanceTraveled);
}

// GPS tween ile pürüzsüz marker hareketi
function agentPosition(who, elapsedMs) {
    const offset = GPS_OFFSET_MS[who];
    const k = Math.floor((elapsedMs - offset) / GPS_UPDATE_MS);
    const tFix  = offset + k * GPS_UPDATE_MS;
    const tPrev = tFix - GPS_UPDATE_MS;
    const from = truePosition(who, Math.max(0, tPrev));
    const to   = truePosition(who, Math.max(0, tFix));
    const since = elapsedMs - tFix;
    const f = (since >= GPS_TWEEN_MS) ? 1 : easeFraction(since / GPS_TWEEN_MS);
    return [from[0] + (to[0] - from[0]) * f,
            from[1] + (to[1] - from[1]) * f];
}

let animationStarted = false;
let userNickname = "";
let map = null;
const markerInstances = {};
let startTime = null;
let animationStartWallClock = null;

function createMarkerElement(person) {
    const clusterEl = document.createElement("div");
    clusterEl.className = "marker-cluster";
    const agentEl = document.createElement("div");
    agentEl.className = "agent-node";

    if (person.markerType === "blue-pulse-dot") {
        const mapsDotContainer = document.createElement("div");
        mapsDotContainer.className = "google-maps-dot-container";
        const breathingPulse = document.createElement("div");
        breathingPulse.className = "google-maps-pulse";
        const solidCore = document.createElement("div");
        solidCore.className = "google-maps-core";
        mapsDotContainer.appendChild(breathingPulse);
        mapsDotContainer.appendChild(solidCore);
        agentEl.appendChild(mapsDotContainer);
        const labelEl = document.createElement("div");
        labelEl.className = "agent-label";
        labelEl.textContent = userNickname || "User";
        agentEl.appendChild(labelEl);
        agentEl.setAttribute("role", "img");
        agentEl.setAttribute("aria-label", (userNickname || "User") + " location on map");
    } else if (person.markerType === "grey-letter-dot") {
        const greyDot = document.createElement("div");
        greyDot.className = "experimental-grey-letter-dot";
        greyDot.textContent = person.initial;
        agentEl.appendChild(greyDot);
        agentEl.setAttribute("role", "img");
        agentEl.setAttribute("aria-label", "Participant " + person.initial + " location on map");
    }
    clusterEl.appendChild(agentEl);
    return clusterEl;
}

function initMarkers() {
    if (!map) return;
    people.forEach(person => {
        const marker = new maplibregl.Marker({ element: createMarkerElement(person), anchor: "center" })
            .setLngLat(positions[person.id])
            .addTo(map);
        markerInstances[person.id] = marker;
    });
}

function animateNodes(timestamp) {
    if (!animationStarted) return;
    if (!startTime) startTime = timestamp;
    const elapsed = timestamp - startTime;

    const g = agentPosition("G", elapsed);
    const m = agentPosition("M", elapsed);

    if (markerInstances["leftNode"])  markerInstances["leftNode"].setLngLat(g);
    if (markerInstances["rightNode"]) markerInstances["rightNode"].setLngLat(m);

    if (elapsed < TOTAL_ANIMATION_DURATION) {
        requestAnimationFrame(animateNodes);
    } else {
        sendCompletionSignal("normal");
    }
}

const SESSION_ID = "sess_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
let hasSentCompletion = false;

function buildPayload(reason) {
    return {
        type: "MAP_ANIMATION_COMPLETE",
        condition: CONDITION,
        conditionLabel: CONDITION_LABEL,
        sessionId: SESSION_ID,
        status: "complete",
        reason: reason,
        elapsedMs: TOTAL_ANIMATION_DURATION,
        timestamp: Date.now()
    };
}

function sendCompletionSignal(reason) {
    if (hasSentCompletion) return;
    hasSentCompletion = true;
    const payload = buildPayload(reason);
    try {
        if (window.parent) window.parent.postMessage(payload, "*");
    } catch (e) {
        console.warn("postMessage failed:", e);
    }
}

const GLOBAL_TIMEOUT_MS = 240 * 1000;
const ANIMATION_TIMEOUT_MS = TOTAL_ANIMATION_DURATION + 15000;

function injectUIDesignStyles() {
    if (document.getElementById("study-ui-styles")) return;
    const style = document.createElement('style');
    style.id = "study-ui-styles";
    style.innerHTML = `
        :root {
            --brand-green: rgba(220, 242, 224, 0.95);
        }
        body, html {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif;
            background-color: #f2efe6;
        }

        #experiment-flow-screen {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 3000;
            transition: opacity 0.5s ease, transform 0.5s ease;
        }
        .flow-step {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 20px;
            text-align: center;
            padding: 0 20px;
        }
        .flow-step.hidden {
            display: none !important;
        }

        .spinner {
            width: 60px;
            height: 60px;
            border: 4px solid rgba(43, 108, 176, 0.15);
            border-top: 4px solid #2b6cb0;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .modern-success-badge {
            width: 56px;
            height: 56px;
            background: #e6f4ea;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto;
            box-shadow: 0 4px 12px rgba(46, 125, 50, 0.12);
        }
        .modern-success-badge svg {
            width: 28px;
            height: 28px;
            color: #137333;
            stroke-width: 3.8;
        }

        .flow-text {
            font-size: 16px;
            font-weight: 600;
            color: #1a1a1a;
            letter-spacing: -0.3px;
            margin: 0;
        }

        .nickname-container {
            display: flex;
            flex-direction: column;
            gap: 12px;
            width: 280px;
        }
        .nickname-input {
            padding: 12px 16px;
            border: 1px solid #cbd5e1;
            border-radius: 12px;
            font-size: 16px;
            outline: none;
            transition: border-color 0.2s;
            text-align: center;
        }
        .nickname-input:focus {
            border-color: #2b6cb0;
            box-shadow: 0 0 0 3px rgba(43, 108, 176, 0.15);
        }
        .nickname-btn {
            padding: 12px;
            background: #2b6cb0;
            color: white;
            border: none;
            border-radius: 12px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.2s, transform 0.1s;
        }
        .nickname-btn:active {
            transform: scale(0.98);
            background: #2c5282;
        }

        #modern-app-header {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 64px;
            background: #ffffff;
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border-bottom: 1px solid rgba(0, 0, 0, 0.06);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2000;
            box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
        }
        .header-logo {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 19px;
            font-weight: 700;
            letter-spacing: -0.4px;
            color: #1a1a1a;
        }
        .logo-icon-wrapper {
            width: 34px;
            height: 34px;
            background: #f0f4f8;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: inset 0 1px 2px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.04);
        }
        .logo-icon-wrapper svg {
            color: #2b6cb0;
        }

        #container {
            width: 100%;
            height: 100%;
            position: relative;
        }
        #map {
            width: 100%;
            height: 100%;
        }

        .experimental-grey-letter-dot {
            width: 37.8px;
            height: 37.8px;
            background: #64748b;
            color: white;
            border: 2.25px solid #ffffff;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 17px;
            box-shadow: 0 3px 8px rgba(0,0,0,0.3);
        }
        .google-maps-dot-container {
            position: relative;
            width: 48px;
            height: 48px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .google-maps-pulse {
            position: absolute;
            width: 48px;
            height: 48px;
            background: rgba(66, 133, 244, 0.4);
            border-radius: 50%;
            animation: google-pulse 2s infinite ease-out;
        }
        .google-maps-core {
            position: relative;
            width: 21px;
            height: 21px;
            background: #4285F4;
            border: 3px solid #ffffff;
            border-radius: 50%;
            box-shadow: 0 3px 8px rgba(0,0,0,0.35);
        }
        @keyframes google-pulse {
            0% { transform: scale(0.6); opacity: 1; }
            100% { transform: scale(2.2); opacity: 0; }
        }
        .agent-label {
            position: absolute;
            bottom: -24px;
            background: rgba(255, 255, 255, 0.95);
            padding: 3px 9px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            color: #1a1a1a;
            box-shadow: 0 2px 6px rgba(0,0,0,0.15);
            white-space: nowrap;
        }
    `;
    document.head.appendChild(style);
}

function bootstrap() {
    injectUIDesignStyles();

    setTimeout(() => {
        if (!hasSentCompletion) {
            sendCompletionSignal("timeout");
        }
    }, GLOBAL_TIMEOUT_MS);

    const flowScreen     = document.getElementById("experiment-flow-screen");
    const stepConnecting = document.getElementById("step-connecting");
    const stepWaiting    = document.getElementById("step-waiting");
    const stepJoined     = document.getElementById("step-joined");
    const stepNickname   = document.getElementById("step-nickname");
    const nicknameInput  = document.getElementById("nickname-input");
    const submitBtn      = document.getElementById("submit-btn");

    if (stepJoined) {
        let badge = stepJoined.querySelector('.modern-success-badge');
        if (!badge) {
            badge = document.createElement('div');
            badge.className = 'modern-success-badge';
            badge.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            stepJoined.insertBefore(badge, stepJoined.firstChild);
        }
    }

    function startExperimentFlow() {
        setTimeout(() => {
            if (stepConnecting) stepConnecting.classList.add("hidden");
            if (stepWaiting) stepWaiting.classList.remove("hidden");
            setTimeout(() => {
                if (stepWaiting) stepWaiting.classList.add("hidden");
                if (stepJoined) stepJoined.classList.remove("hidden");
                setTimeout(() => {
                    if (stepJoined) stepJoined.classList.add("hidden");
                    if (stepNickname) stepNickname.classList.remove("hidden");
                    if (nicknameInput) nicknameInput.focus();
                }, 4000);
            }, 5000);
        }, 3000);
    }

    function beginAnimation() {
        animationStarted = true;
        animationStartWallClock = Date.now();

        const modernHeader = document.createElement('div');
        modernHeader.id = 'modern-app-header';
        modernHeader.innerHTML = `
            <div class="header-logo">
                <div class="logo-icon-wrapper">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                </div>
                NeredeApp
            </div>
        `;
        document.body.appendChild(modernHeader);

        setTimeout(() => {
            if (!hasSentCompletion) {
                sendCompletionSignal("timeout");
            }
        }, ANIMATION_TIMEOUT_MS);
        requestAnimationFrame(animateNodes);
    }

    function handleLoginSubmit() {
        const val = nicknameInput ? nicknameInput.value.trim() : "Participant";
        if (val === "") { alert("Lütfen geçerli bir takma ad girin."); return; }
        userNickname = val;
        if (flowScreen) {
            flowScreen.style.opacity = "0";
            flowScreen.style.transform = "scale(0.95)";
        }
        setTimeout(() => {
            if (flowScreen) flowScreen.style.display = "none";
            initMarkers();
            beginAnimation();
        }, 500);
    }

    if (submitBtn) {
        submitBtn.addEventListener("click", handleLoginSubmit);
        submitBtn.setAttribute("aria-label", "Submit nickname and continue");
    }
    if (nicknameInput) {
        nicknameInput.setAttribute("aria-label", "Enter your nickname");
        nicknameInput.addEventListener("keypress", (e) => { if (e.key === "Enter") handleLoginSubmit(); });
    }

    let mapHasLoaded = false;
    let mapLoadTimeoutId = null;

    function showMapLoadFallback() {
        if (mapHasLoaded) return;
        const mapContainer = document.getElementById("map");
        if (mapContainer) mapContainer.style.visibility = "hidden";

        const fallback = document.createElement("div");
        fallback.id = "map-load-fallback";
        fallback.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;" +
            "display:flex;align-items:center;justify-content:center;background:#f7f7f7;" +
            "font-family:sans-serif;text-align:center;padding:24px;box-sizing:border-box;z-index:5000;";
        fallback.innerHTML =
            '<div style="max-width:420px;">' +
            '<p style="font-size:17px;color:#333;margin-bottom:8px;">Harita şu anda yüklenemedi.</p>' +
            '<p style="font-size:14px;color:#666;">Bağlantınız kontrol ediliyor, lütfen bekleyiniz.</p>' +
            "</div>";
        document.body.appendChild(fallback);

        if (!animationStarted) {
            animationStarted = true;
            animationStartWallClock = Date.now();
            setTimeout(() => sendCompletionSignal("map-load-failed"), TOTAL_ANIMATION_DURATION);
        }
    }

    const HIDDEN_SOURCE_LAYERS = ["poi", "housenumber", "mountain_peak", "aerodrome_label", "aeroway"];
    const KEEP_VISIBLE = /park|garden|playground|pitch|forest|wood|water_name|nature|recreation/;

    function declutterBasemap() {
        try {
            const layers = (map.getStyle() && map.getStyle().layers) || [];
            layers.forEach(layer => {
                const id = String(layer.id || "").toLowerCase();
                const srcLayer = String(layer["source-layer"] || "").toLowerCase();
                const isExtrusion = layer.type === "fill-extrusion";

                if (KEEP_VISIBLE.test(id) || srcLayer === "park") {
                    if (!isExtrusion) return;
                }
                if (isExtrusion || HIDDEN_SOURCE_LAYERS.indexOf(srcLayer) !== -1) {
                    try { map.setLayoutProperty(layer.id, "visibility", "none"); } catch (e) {}
                }
            });
        } catch (e) {}
    }

    const PALETTE = {
        land:      "#f2efe6",
        green:     "#bfe3ab",
        greenSoft: "#d6ead0",
        greenDeep: "#a8d493",
        water:     "#a9d8f0",
        road:      "#ffffff",
        roadCase:  "#e4dfd3",
        building:  "#e8e3d8",
        text:      "#5a6b5e",
        textHalo:  "#ffffff"
    };

    function paint(id, prop, value) {
        try { map.setPaintProperty(id, prop, value); } catch (e) {}
    }

    function applyFindMyPalette() {
        try {
            const layers = (map.getStyle() && map.getStyle().layers) || [];
            layers.forEach(layer => {
                const id = String(layer.id || "").toLowerCase();
                const sl = String(layer["source-layer"] || "").toLowerCase();
                const t  = layer.type;
                const isGreen = sl === "park" || /park|grass|wood|forest|garden|pitch|golf|cemetery|scrub|meadow|orchard/.test(id);
                const isWater = sl === "water" || sl === "waterway" || /water|ocean|river|lake|sea|bay/.test(id);

                if (t === "background") { paint(id, "background-color", PALETTE.land); return; }
                if (isWater) {
                    if (t === "fill") paint(id, "fill-color", PALETTE.water);
                    if (t === "line") paint(id, "line-color", PALETTE.water);
                    return;
                }
                if (isGreen) {
                    if (t === "fill") { paint(id, "fill-color", PALETTE.green); paint(id, "fill-opacity", 1); }
                    if (t === "line") paint(id, "line-color", PALETTE.greenDeep);
                    return;
                }
                if (sl === "landcover") {
                    if (t === "fill") { paint(id, "fill-color", PALETTE.greenSoft); paint(id, "fill-opacity", 0.9); }
                    return;
                }
                if (sl === "landuse") {
                    if (t === "fill") paint(id, "fill-color", PALETTE.land);
                    return;
                }
                if (sl === "building") {
                    if (t === "fill") { paint(id, "fill-color", PALETTE.building); paint(id, "fill-opacity", 0.85); }
                    return;
                }
                if (sl === "transportation") {
                    if (t === "line") {
                        const casing = /casing|outline|bridge|tunnel/.test(id);
                        paint(id, "line-color", casing ? PALETTE.roadCase : PALETTE.road);
                    }
                    return;
                }
                if (t === "symbol") {
                    paint(id, "text-color", PALETTE.text);
                    paint(id, "text-halo-color", PALETTE.textHalo);
                    paint(id, "text-halo-width", 1.4);
                }
            });
        } catch (e) {}
    }

    startExperimentFlow();

    const MAP_LOAD_TIMEOUT_MS = 8000;
    try {
        if (typeof maplibregl !== "undefined") {
            map = new maplibregl.Map({
                container: "map",
                style: "https://tiles.openfreemap.org/styles/liberty",
                center: MAP_CENTER,
                zoom: MAP_ZOOM,
                minZoom: MAP_ZOOM,
                maxZoom: MAP_ZOOM,
                dragPan: false, doubleClickZoom: false, boxZoom: false,
                keyboard: false, touchZoomRotate: false,
                pixelRatio: window.devicePixelRatio || 2,
                attributionControl: true
            });

            mapLoadTimeoutId = setTimeout(() => {
                if (!mapHasLoaded) showMapLoadFallback();
            }, MAP_LOAD_TIMEOUT_MS);

            map.on("load", () => {
                mapHasLoaded = true;
                if (mapLoadTimeoutId) clearTimeout(mapLoadTimeoutId);

                declutterBasemap();
                applyFindMyPalette();

                map.addSource('virtual-roads', {
    'type': 'geojson',
    'data': {
        'type': 'FeatureCollection',
        'features': [
            { 'type': 'Feature', 'geometry': { 'type': 'LineString', 'coordinates': [START_G, [32.888455, 39.930278]] } },
            { 'type': 'Feature', 'geometry': { 'type': 'LineString', 'coordinates': [START_M, [32.890168, 39.929707]] } },
            { 'type': 'Feature', 'geometry': { 'type': 'LineString', 'coordinates': [ROAD_START, ROAD_TARGET_1] } },
            { 'type': 'Feature', 'geometry': { 'type': 'LineString', 'coordinates': [ROAD_START, ROAD_TARGET_2] } },
            { 'type': 'Feature', 'geometry': { 'type': 'LineString', 'coordinates': [[32.888292, 39.930351], [32.887327, 39.930721]] } }
        ]
    }
});

                let firstRoadCoreId = null;
                let firstBuildingOrTextId = null;

                const layers = map.getStyle().layers;
                for (const layer of layers) {
                    const id = (layer.id || "").toLowerCase();
                    const sl = (layer['source-layer'] || "").toLowerCase();
                    if (!firstBuildingOrTextId && (layer.type === 'symbol' || sl === 'building' || layer.type === 'fill-extrusion')) {
                        firstBuildingOrTextId = layer.id;
                    }
                    if (sl === 'transportation' && layer.type === 'line') {
                        const isCasing = /casing|outline|bridge|tunnel/.test(id);
                        if (!isCasing && !firstRoadCoreId) {
                            firstRoadCoreId = layer.id;
                        }
                    }
                }

                map.addLayer({
                    'id': 'virtual-roads-casing',
                    'type': 'line',
                    'source': 'virtual-roads',
                    'layout': { 'line-join': 'round', 'line-cap': 'round' },
                    'paint': { 'line-color': '#e4dfd3', 'line-width': 12 }
                }, firstRoadCoreId || firstBuildingOrTextId);

                map.addLayer({
                    'id': 'virtual-roads-core',
                    'type': 'line',
                    'source': 'virtual-roads',
                    'layout': { 'line-join': 'round', 'line-cap': 'round' },
                    'paint': { 'line-color': '#ffffff', 'line-width': 8 }
                }, firstBuildingOrTextId);

                map.getCanvas().style.filter = "none";
            });

            map.on("error", () => {
                if (!mapHasLoaded) showMapLoadFallback();
            });
        }
    } catch (error) {
        showMapLoadFallback();
    }
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
    bootstrap();
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        CONDITION, CONDITION_LABEL,
        START_G, START_M, START_U, MEET_POINT, DIR_G_AFTER, DIR_M_AFTER,
        MAP_CENTER, MAP_ZOOM, WALK_SPEED_MPS,
        SCENE_ROTATION_DEG,
        T_STABLE, T_BLOCK1, T_BLOCK2, T_BLOCK3, T_BLOCK4, TOTAL_ANIMATION_DURATION,
        agentPosition, truePosition, offsetMeters,
        GPS_UPDATE_MS, GPS_TWEEN_MS
    };
}