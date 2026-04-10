(() => {
  const app = window.BolusApp;
  if (!app) return;

  const elements = {
    wearablePlatform: document.querySelector("#wearable-platform"),
    wearablePlatformSyncMode: document.querySelector("#wearable-platform-sync-mode"),
    wearablePlatformNotesInput: document.querySelector("#wearable-platform-notes-input"),
    saveWearableIntegration: document.querySelector("#save-wearable-integration"),
    connectHealthConnect: document.querySelector("#connect-health-connect"),
    syncHealthConnect: document.querySelector("#sync-health-connect"),
    loadLatestSyncedReading: document.querySelector("#load-latest-synced-reading"),
    wearableIntegrationStatus: document.querySelector("#wearable-integration-status"),
    wearablePlatformNotes: document.querySelector("#wearable-platform-notes"),
    wearableType: document.querySelector("#wearable-type"),
    wearableSyncMode: document.querySelector("#wearable-sync-mode"),
    wearableHeartRate: document.querySelector("#wearable-heart-rate"),
    wearableSpo2: document.querySelector("#wearable-spo2"),
    wearableSystolic: document.querySelector("#wearable-systolic"),
    wearableDiastolic: document.querySelector("#wearable-diastolic"),
    wearableTemperature: document.querySelector("#wearable-temperature"),
    wearableResponsiveness: document.querySelector("#wearable-responsiveness"),
    wearableFallDetected: document.querySelector("#wearable-fall-detected"),
    saveWearableReading: document.querySelector("#save-wearable-reading"),
    runEmergencyCheck: document.querySelector("#run-emergency-check"),
    wearableStatus: document.querySelector("#wearable-status"),
    emergencyContactName: document.querySelector("#emergency-contact-name"),
    emergencyContactRelationship: document.querySelector("#emergency-contact-relationship"),
    emergencyContactPhone: document.querySelector("#emergency-contact-phone"),
    emergencyContactEmail: document.querySelector("#emergency-contact-email"),
    emergencyContactMethod: document.querySelector("#emergency-contact-method"),
    saveEmergencyContact: document.querySelector("#save-emergency-contact"),
    emergencyContactStatus: document.querySelector("#emergency-contact-status"),
    wearableAlertOutput: document.querySelector("#wearable-alert-output"),
  };

  const localState = {
    readings: [],
    contact: null,
    alerts: [],
    integration: {
      platform: "manual",
      syncMode: "manual",
      notes: "",
      updatedAt: "",
    },
    supportedPlatforms: [],
    nativeHealthConnectStatus: null,
  };

  const defaultUsPrefix = "+1";
  const nowIso = () => new Date().toISOString();
  const localKey = (suffix) => app.storageKey(`wearable:${suffix}`);
  const fmt = (value, suffix = "") => (value !== null && value !== undefined && value !== "" ? `${value}${suffix}` : "Not set");

  function platformToWearableType(platform) {
    if (platform === "apple-health") return "apple-watch";
    if (platform === "health-connect" || platform === "samsung-health") return "wear-os";
    if (platform === "oura-cloud") return "smart-ring";
    return "generic";
  }

  function normalizePhoneNumber(value) {
    const raw = String(value || "").trim();
    if (!raw) return defaultUsPrefix;
    if (raw.startsWith("+")) return raw;
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
    return raw;
  }

  function loadLocal() {
    try {
      localState.readings = JSON.parse(localStorage.getItem(localKey("readings")) || "[]");
    } catch {
      localState.readings = [];
    }
    try {
      localState.contact = JSON.parse(localStorage.getItem(localKey("contact")) || "null");
    } catch {
      localState.contact = null;
    }
    try {
      localState.alerts = JSON.parse(localStorage.getItem(localKey("alerts")) || "[]");
    } catch {
      localState.alerts = [];
    }
    try {
      localState.integration = {
        platform: "manual",
        syncMode: "manual",
        notes: "",
        ...(JSON.parse(localStorage.getItem(localKey("integration")) || "null") || {}),
      };
    } catch {
      localState.integration = { platform: "manual", syncMode: "manual", notes: "", updatedAt: "" };
    }
  }

  function saveLocal() {
    localStorage.setItem(localKey("readings"), JSON.stringify(localState.readings.slice(-30)));
    localStorage.setItem(localKey("contact"), JSON.stringify(localState.contact));
    localStorage.setItem(localKey("alerts"), JSON.stringify(localState.alerts.slice(-20)));
    localStorage.setItem(localKey("integration"), JSON.stringify(localState.integration));
  }

  function getIntegrationMeta(platform) {
    return (
      localState.supportedPlatforms.find((item) => item.id === platform) || {
        id: platform,
        label: platform,
        worksToday: "Prototype path",
        summary: "This integration path still needs native or provider-specific work before it can sync automatically.",
      }
    );
  }

  function getHealthConnectBridge() {
    return window.Capacitor?.Plugins?.HealthConnectBridge || null;
  }

  function canUseNativeHealthConnect() {
    return Boolean(getHealthConnectBridge());
  }

  function renderIntegrationCards() {
    const current = getIntegrationMeta(localState.integration.platform);
    const items = [
      {
        title: `${current.label}`,
        body: `${current.worksToday}. ${current.summary}`,
      },
      {
        title: "What works right now",
        body:
          localState.integration.platform === "manual"
            ? "Manual entry works today in both guest and signed-in modes."
            : "Signed-in accounts can now save a sync profile and store incoming wearable readings on the server. Automatic collection still depends on native or cloud integration work for the selected platform.",
      },
      {
        title: "Emergency trigger path",
        body:
          "Once readings reach this app, the same emergency threshold engine can evaluate heart rate, oxygen saturation, blood pressure, temperature, falls, and responsiveness for alerting.",
      },
    ];

    if (localState.integration.notes) {
      items.push({
        title: "Saved integration note",
        body: localState.integration.notes,
      });
    }

    if (localState.nativeHealthConnectStatus) {
      const native = localState.nativeHealthConnectStatus;
      items.push({
        title: "Android native Health Connect status",
        body:
          native.sdkStatus === "available"
            ? `Health Connect is available in this Android app. Permissions granted: ${native.allPermissionsGranted ? "yes" : "not yet"}.`
            : native.sdkStatus === "provider_update_required"
              ? "Health Connect needs to be installed or updated on this device before native sync can run."
              : "This device or browser session cannot use the Android native Health Connect bridge.",
      });
    }

    elements.wearablePlatformNotes.innerHTML = items
      .map(
        (item) => `
          <div class="recommendation-card">
            <div>
              <p class="section-kicker">${app.escapeHtml(item.title)}</p>
              <div class="panel-copy">${app.escapeHtml(item.body)}</div>
            </div>
          </div>`,
      )
      .join("");

    const showNativeButtons = localState.integration.platform === "health-connect";
    elements.connectHealthConnect.classList.toggle("is-hidden", !showNativeButtons);
    elements.syncHealthConnect.classList.toggle("is-hidden", !showNativeButtons);
  }

  function populateIntegration() {
    elements.wearablePlatform.value = localState.integration.platform || "manual";
    elements.wearablePlatformSyncMode.value = localState.integration.syncMode || "manual";
    elements.wearablePlatformNotesInput.value = localState.integration.notes || "";
    renderIntegrationCards();
  }

  function populateContact(contact) {
    elements.emergencyContactName.value = contact?.name || "";
    elements.emergencyContactRelationship.value = contact?.relationship || "";
    elements.emergencyContactPhone.value = contact?.phone || defaultUsPrefix;
    elements.emergencyContactEmail.value = contact?.email || "";
    elements.emergencyContactMethod.value = contact?.notificationMethod || "sms";
  }

  function populateReading(reading) {
    if (!reading) return;
    elements.wearableType.value = reading.type || platformToWearableType(reading.sourcePlatform);
    elements.wearableSyncMode.value = reading.syncMode || "manual";
    elements.wearableHeartRate.value = reading.heartRate ?? "";
    elements.wearableSpo2.value = reading.spo2 ?? "";
    elements.wearableSystolic.value = reading.systolic ?? "";
    elements.wearableDiastolic.value = reading.diastolic ?? "";
    elements.wearableTemperature.value = reading.temperature ?? "";
    elements.wearableResponsiveness.value = reading.responsiveness || "unknown";
    elements.wearableFallDetected.checked = Boolean(reading.fallDetected);
  }

  function getReadingFromForm() {
    return {
      id: `reading-${Date.now()}`,
      type: elements.wearableType.value,
      sourcePlatform: localState.integration.platform || elements.wearableType.value || "manual",
      syncMode: elements.wearableSyncMode.value,
      heartRate: Number(elements.wearableHeartRate.value) || null,
      spo2: Number(elements.wearableSpo2.value) || null,
      systolic: Number(elements.wearableSystolic.value) || null,
      diastolic: Number(elements.wearableDiastolic.value) || null,
      temperature: Number(elements.wearableTemperature.value) || null,
      responsiveness: elements.wearableResponsiveness.value,
      fallDetected: elements.wearableFallDetected.checked,
      capturedAt: nowIso(),
    };
  }

  function renderAlerts() {
    const latestReading = localState.readings[localState.readings.length - 1];
    const cards = [];

    if (latestReading) {
      cards.push(`
        <div class="recommendation-card">
          <div>
            <p class="section-kicker">Latest wearable sample</p>
            <strong>${app.escapeHtml(latestReading.sourcePlatform || latestReading.type || "manual")}</strong>
          </div>
          <div class="panel-copy">
            HR ${fmt(latestReading.heartRate, " bpm")} ·
            SpO2 ${fmt(latestReading.spo2, "%")} ·
            BP ${latestReading.systolic && latestReading.diastolic ? `${latestReading.systolic}/${latestReading.diastolic}` : "Not set"} ·
            Temp ${fmt(latestReading.temperature, " F")} ·
            Response ${app.escapeHtml(latestReading.responsiveness)}
          </div>
          <div class="result-meta">
            ${new Date(latestReading.capturedAt).toLocaleString()} · ${app.escapeHtml(latestReading.syncMode || "manual")}
          </div>
        </div>`);
    }

    if (!localState.alerts.length) {
      cards.push('<div class="recommendation-card"><span class="result-meta">No emergency alerts recorded yet.</span></div>');
    } else {
      cards.push(
        ...localState.alerts
          .slice()
          .reverse()
          .map(
            (alert) => `
              <div class="recommendation-card">
                <div>
                  <p class="section-kicker">${app.escapeHtml(alert.level)}</p>
                  <strong>${app.escapeHtml(alert.reason)}</strong>
                </div>
                <div class="panel-copy">${app.escapeHtml(alert.summary)}</div>
                <div class="result-meta">${new Date(alert.createdAt).toLocaleString()}</div>
              </div>`,
          ),
      );
    }

    elements.wearableAlertOutput.innerHTML = cards.join("");
  }

  function analyzeReading(reading) {
    const reasons = [];
    if (reading.responsiveness === "unresponsive") reasons.push("User marked as unresponsive");
    if (reading.fallDetected && reading.responsiveness !== "responsive") reasons.push("Fall detected with reduced responsiveness");
    if (reading.spo2 !== null && reading.spo2 < 88) reasons.push("Oxygen saturation below 88%");
    if (reading.heartRate !== null && (reading.heartRate < 40 || reading.heartRate > 160)) reasons.push("Heart rate in critical range");
    if (reading.systolic !== null && (reading.systolic < 80 || reading.systolic > 200)) reasons.push("Systolic blood pressure in critical range");
    if (reading.diastolic !== null && (reading.diastolic < 50 || reading.diastolic > 120)) reasons.push("Diastolic blood pressure in critical range");
    if (reading.temperature !== null && reading.temperature < 90) reasons.push("Skin temperature suggests collapse or poor perfusion");

    let level = "Monitoring only";
    if (reasons.length >= 2 || reading.responsiveness === "unresponsive") {
      level = "Emergency contact trigger";
    } else if (reasons.length === 1) {
      level = "Urgent follow-up";
    }

    return {
      shouldTrigger: level === "Emergency contact trigger",
      level,
      reason: reasons[0] || "No critical risk pattern detected",
      summary: reasons.length ? reasons.join(" | ") : "Current wearable data does not cross the prototype emergency thresholds.",
      metrics: {
        heartRate: reading.heartRate,
        spo2: reading.spo2,
        systolic: reading.systolic,
        diastolic: reading.diastolic,
        temperature: reading.temperature,
        responsiveness: reading.responsiveness,
        fallDetected: reading.fallDetected,
      },
    };
  }

  async function syncEmergencyContactFromServer() {
    if (app.isGuest()) {
      populateContact(localState.contact);
      return;
    }

    try {
      const payload = await app.api("/api/emergency-contacts", { method: "GET", headers: {} });
      if (payload.contact) {
        localState.contact = payload.contact;
        saveLocal();
      }
      populateContact(localState.contact);
    } catch {
      populateContact(localState.contact);
    }
  }

  async function syncIntegrationFromServer() {
    if (app.isGuest()) {
      populateIntegration();
      return;
    }

    try {
      const payload = await app.api("/api/wearable-integrations", { method: "GET", headers: {} });
      localState.integration = payload.integration || localState.integration;
      localState.supportedPlatforms = Array.isArray(payload.supportedPlatforms) ? payload.supportedPlatforms : [];
      saveLocal();
      populateIntegration();
    } catch {
      populateIntegration();
    }
  }

  async function syncReadingsFromServer() {
    if (app.isGuest()) {
      renderAlerts();
      return;
    }

    try {
      const payload = await app.api("/api/wearable-readings", { method: "GET", headers: {} });
      localState.readings = Array.isArray(payload.readings) ? payload.readings.slice().reverse() : localState.readings;
      saveLocal();
      renderAlerts();
    } catch {
      renderAlerts();
    }
  }

  async function refreshNativeHealthConnectStatus() {
    if (!canUseNativeHealthConnect()) {
      localState.nativeHealthConnectStatus = {
        sdkStatus: "unavailable",
        allPermissionsGranted: false,
      };
      renderIntegrationCards();
      return;
    }

    try {
      localState.nativeHealthConnectStatus = await getHealthConnectBridge().getStatus();
    } catch (error) {
      localState.nativeHealthConnectStatus = {
        sdkStatus: "unavailable",
        allPermissionsGranted: false,
        detail: error?.message || "Unable to read native Health Connect status.",
      };
    }
    renderIntegrationCards();
  }

  async function saveEmergencyContact() {
    const contact = {
      name: elements.emergencyContactName.value.trim(),
      relationship: elements.emergencyContactRelationship.value.trim(),
      phone: normalizePhoneNumber(elements.emergencyContactPhone.value),
      email: elements.emergencyContactEmail.value.trim(),
      notificationMethod: elements.emergencyContactMethod.value,
    };

    elements.emergencyContactPhone.value = contact.phone;
    if (!contact.name || !contact.relationship || (!contact.phone && !contact.email)) {
      elements.emergencyContactStatus.textContent = "Enter a name, relationship, and at least one phone or email.";
      return;
    }

    localState.contact = contact;
    saveLocal();
    if (app.isGuest()) {
      elements.emergencyContactStatus.textContent = "Guest mode saved the emergency contact locally in this browser.";
      return;
    }

    try {
      const payload = await app.api("/api/emergency-contacts", { method: "POST", body: JSON.stringify(contact) });
      localState.contact = payload.contact;
      saveLocal();
      elements.emergencyContactStatus.textContent = "Emergency contact saved.";
    } catch (error) {
      elements.emergencyContactStatus.textContent = error.message;
    }
  }

  async function saveWearableIntegration() {
    const integration = {
      platform: elements.wearablePlatform.value,
      syncMode: elements.wearablePlatformSyncMode.value,
      notes: elements.wearablePlatformNotesInput.value.trim(),
      updatedAt: nowIso(),
    };

    localState.integration = integration;
    saveLocal();
    populateIntegration();

    if (integration.platform === "health-connect") {
      elements.wearableType.value = "wear-os";
      elements.wearableSyncMode.value = "bridge";
    } else if (integration.platform === "apple-health") {
      elements.wearableType.value = "apple-watch";
      elements.wearableSyncMode.value = "bridge";
    } else if (integration.platform === "samsung-health") {
      elements.wearableType.value = "wear-os";
      elements.wearableSyncMode.value = "bridge";
    } else if (integration.platform === "oura-cloud") {
      elements.wearableType.value = "smart-ring";
      elements.wearableSyncMode.value = "bridge";
    }

    if (app.isGuest()) {
      elements.wearableIntegrationStatus.textContent =
        "Guest mode saved this sync profile locally. Sign in to keep integration settings on the server.";
      return;
    }

    try {
      await app.api("/api/wearable-integrations", { method: "POST", body: JSON.stringify(integration) });
      elements.wearableIntegrationStatus.textContent = "Wearable sync profile saved.";
      await syncIntegrationFromServer();
    } catch (error) {
      elements.wearableIntegrationStatus.textContent = error.message;
    }
  }

  async function connectHealthConnect() {
    if (!canUseNativeHealthConnect()) {
      elements.wearableIntegrationStatus.textContent = "Health Connect bridging only works inside the Android app shell.";
      return;
    }

    try {
      const status = await getHealthConnectBridge().getStatus();
      localState.nativeHealthConnectStatus = status;
      if (status.sdkStatus === "provider_update_required") {
        await getHealthConnectBridge().openHealthConnectSettings();
        elements.wearableIntegrationStatus.textContent = "Opening Health Connect so you can install or update it.";
        renderIntegrationCards();
        return;
      }
      if (status.sdkStatus !== "available") {
        elements.wearableIntegrationStatus.textContent = "Health Connect is not available on this device.";
        renderIntegrationCards();
        return;
      }

      const result = await getHealthConnectBridge().requestHealthPermissions();
      localState.nativeHealthConnectStatus = {
        ...localState.nativeHealthConnectStatus,
        allPermissionsGranted: Boolean(result.allGranted),
        grantedPermissions: result.grantedPermissions || [],
      };
      elements.wearableIntegrationStatus.textContent = result.allGranted
        ? "Health Connect permissions granted."
        : "Health Connect permissions were not fully granted.";
      renderIntegrationCards();
    } catch (error) {
      elements.wearableIntegrationStatus.textContent = error.message || "Unable to connect Health Connect.";
    }
  }

  async function syncFromHealthConnect() {
    if (!canUseNativeHealthConnect()) {
      elements.wearableIntegrationStatus.textContent = "Health Connect syncing only works inside the Android app shell.";
      return;
    }

    try {
      const payload = await getHealthConnectBridge().syncLatestVitals();
      if (!payload?.reading) {
        elements.wearableIntegrationStatus.textContent = "No Health Connect vitals were returned.";
        return;
      }

      localState.nativeHealthConnectStatus = payload.status || localState.nativeHealthConnectStatus;
      const reading = {
        ...payload.reading,
        type: "wear-os",
      };
      populateReading(reading);
      await persistReading(reading);
      elements.wearableIntegrationStatus.textContent = app.isGuest()
        ? "Health Connect vitals pulled into the app and saved locally."
        : "Health Connect vitals synced into your account.";
      renderIntegrationCards();
    } catch (error) {
      elements.wearableIntegrationStatus.textContent = error.message || "Unable to sync Health Connect vitals.";
    }
  }

  async function persistReading(reading) {
    localState.readings.push(reading);
    saveLocal();
    renderAlerts();

    if (app.isGuest()) return reading;
    const payload = await app.api("/api/wearable-readings", { method: "POST", body: JSON.stringify(reading) });
    localState.readings[localState.readings.length - 1] = payload.reading;
    saveLocal();
    renderAlerts();
    return payload.reading;
  }

  async function saveWearableReading() {
    const reading = getReadingFromForm();
    try {
      await persistReading(reading);
      elements.wearableStatus.textContent = app.isGuest()
        ? "Wearable reading saved locally."
        : "Wearable reading saved and synced to your account.";
    } catch (error) {
      elements.wearableStatus.textContent = error.message;
    }
  }

  async function loadLatestSyncedReading() {
    const latest = localState.readings[localState.readings.length - 1];
    if (!latest) {
      elements.wearableIntegrationStatus.textContent = app.isGuest()
        ? "No locally saved wearable reading is available yet."
        : "No synced wearable reading is available yet.";
      return;
    }

    populateReading(latest);
    elements.wearableIntegrationStatus.textContent = `Loaded the latest ${latest.sourcePlatform || latest.type || "wearable"} sample into the form.`;
  }

  async function runEmergencyCheck() {
    const reading = getReadingFromForm();
    const result = analyzeReading(reading);
    const alertEntry = { id: `alert-${Date.now()}`, createdAt: nowIso(), ...result };

    try {
      await persistReading(reading);
    } catch (error) {
      elements.wearableStatus.textContent = error.message;
      return;
    }

    localState.alerts.push(alertEntry);
    saveLocal();
    renderAlerts();

    if (result.shouldTrigger) {
      if (app.isGuest()) {
        elements.wearableStatus.textContent = "Prototype emergency trigger detected. In guest mode, this alert is local only.";
        return;
      }
      try {
        const payload = await app.api("/api/emergency-alerts", {
          method: "POST",
          body: JSON.stringify({ reason: result.reason, metrics: result.metrics }),
        });
        elements.wearableStatus.textContent = payload.message;
      } catch (error) {
        elements.wearableStatus.textContent = error.message;
      }
      return;
    }

    elements.wearableStatus.textContent =
      result.level === "Urgent follow-up"
        ? "Vitals need attention, but the emergency trigger did not fire."
        : "No emergency trigger detected.";
  }

  function handleUserChange() {
    loadLocal();
    populateContact(localState.contact);
    populateIntegration();
    renderAlerts();
    syncEmergencyContactFromServer();
    syncIntegrationFromServer();
    syncReadingsFromServer();
    refreshNativeHealthConnectStatus();
  }

  elements.emergencyContactPhone.addEventListener("focus", () => {
    if (!elements.emergencyContactPhone.value.trim()) elements.emergencyContactPhone.value = defaultUsPrefix;
  });
  elements.emergencyContactPhone.addEventListener("blur", () => {
    elements.emergencyContactPhone.value = normalizePhoneNumber(elements.emergencyContactPhone.value);
  });
  elements.saveEmergencyContact.addEventListener("click", saveEmergencyContact);
  elements.saveWearableIntegration.addEventListener("click", saveWearableIntegration);
  elements.connectHealthConnect.addEventListener("click", connectHealthConnect);
  elements.syncHealthConnect.addEventListener("click", syncFromHealthConnect);
  elements.loadLatestSyncedReading.addEventListener("click", loadLatestSyncedReading);
  elements.saveWearableReading.addEventListener("click", saveWearableReading);
  elements.runEmergencyCheck.addEventListener("click", runEmergencyCheck);
  window.addEventListener("bolus-app:user-changed", handleUserChange);

  loadLocal();
  populateContact(localState.contact);
  populateIntegration();
  renderAlerts();
  refreshNativeHealthConnectStatus();
})();
