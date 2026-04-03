(()=>{
  const app=window.BolusApp;
  if(!app){return}

  const elements={
    wearableType:document.querySelector("#wearable-type"),
    wearableSyncMode:document.querySelector("#wearable-sync-mode"),
    wearableHeartRate:document.querySelector("#wearable-heart-rate"),
    wearableSpo2:document.querySelector("#wearable-spo2"),
    wearableSystolic:document.querySelector("#wearable-systolic"),
    wearableDiastolic:document.querySelector("#wearable-diastolic"),
    wearableTemperature:document.querySelector("#wearable-temperature"),
    wearableResponsiveness:document.querySelector("#wearable-responsiveness"),
    wearableFallDetected:document.querySelector("#wearable-fall-detected"),
    saveWearableReading:document.querySelector("#save-wearable-reading"),
    runEmergencyCheck:document.querySelector("#run-emergency-check"),
    wearableStatus:document.querySelector("#wearable-status"),
    emergencyContactName:document.querySelector("#emergency-contact-name"),
    emergencyContactRelationship:document.querySelector("#emergency-contact-relationship"),
    emergencyContactPhone:document.querySelector("#emergency-contact-phone"),
    emergencyContactEmail:document.querySelector("#emergency-contact-email"),
    emergencyContactMethod:document.querySelector("#emergency-contact-method"),
    saveEmergencyContact:document.querySelector("#save-emergency-contact"),
    emergencyContactStatus:document.querySelector("#emergency-contact-status"),
    wearableAlertOutput:document.querySelector("#wearable-alert-output"),
  };

  const localState={readings:[],contact:null,alerts:[]};
  const nowIso=()=>new Date().toISOString();
  const localKey=suffix=>app.storageKey(`wearable:${suffix}`);
  const fmt=(value,suffix="")=>value!==null&&value!==undefined&&value!==""?`${value}${suffix}`:"Not set";

  function loadLocal(){
    try{localState.readings=JSON.parse(localStorage.getItem(localKey("readings"))||"[]")}catch{localState.readings=[]}
    try{localState.contact=JSON.parse(localStorage.getItem(localKey("contact"))||"null")}catch{localState.contact=null}
    try{localState.alerts=JSON.parse(localStorage.getItem(localKey("alerts"))||"[]")}catch{localState.alerts=[]}
  }

  function saveLocal(){
    localStorage.setItem(localKey("readings"),JSON.stringify(localState.readings.slice(-30)));
    localStorage.setItem(localKey("contact"),JSON.stringify(localState.contact));
    localStorage.setItem(localKey("alerts"),JSON.stringify(localState.alerts.slice(-20)));
  }

  function getReadingFromForm(){
    return{
      id:`reading-${Date.now()}`,
      type:elements.wearableType.value,
      syncMode:elements.wearableSyncMode.value,
      heartRate:Number(elements.wearableHeartRate.value)||null,
      spo2:Number(elements.wearableSpo2.value)||null,
      systolic:Number(elements.wearableSystolic.value)||null,
      diastolic:Number(elements.wearableDiastolic.value)||null,
      temperature:Number(elements.wearableTemperature.value)||null,
      responsiveness:elements.wearableResponsiveness.value,
      fallDetected:elements.wearableFallDetected.checked,
      capturedAt:nowIso(),
    };
  }

  function populateContact(contact){
    elements.emergencyContactName.value=contact?.name||"";
    elements.emergencyContactRelationship.value=contact?.relationship||"";
    elements.emergencyContactPhone.value=contact?.phone||"";
    elements.emergencyContactEmail.value=contact?.email||"";
    elements.emergencyContactMethod.value=contact?.notificationMethod||"sms";
  }

  function renderAlerts(){
    const latestReading=localState.readings[localState.readings.length-1];
    const cards=[];
    if(latestReading){
      cards.push(`<div class="recommendation-card"><div><p class="section-kicker">Latest wearable sample</p><strong>${app.escapeHtml(latestReading.type)}</strong></div><div class="panel-copy">HR ${fmt(latestReading.heartRate," bpm")} · SpO2 ${fmt(latestReading.spo2,"%")} · BP ${latestReading.systolic&&latestReading.diastolic?`${latestReading.systolic}/${latestReading.diastolic}`:"Not set"} · Response ${app.escapeHtml(latestReading.responsiveness)}</div><div class="result-meta">${new Date(latestReading.capturedAt).toLocaleString()}</div></div>`);
    }
    if(!localState.alerts.length){
      cards.push('<div class="recommendation-card"><span class="result-meta">No emergency alerts recorded yet.</span></div>');
    }else{
      cards.push(...localState.alerts.slice().reverse().map(alert=>`<div class="recommendation-card"><div><p class="section-kicker">${app.escapeHtml(alert.level)}</p><strong>${app.escapeHtml(alert.reason)}</strong></div><div class="panel-copy">${app.escapeHtml(alert.summary)}</div><div class="result-meta">${new Date(alert.createdAt).toLocaleString()}</div></div>`));
    }
    elements.wearableAlertOutput.innerHTML=cards.join("");
  }

  function analyzeReading(reading){
    const reasons=[];
    if(reading.responsiveness==="unresponsive") reasons.push("User marked as unresponsive");
    if(reading.fallDetected&&reading.responsiveness!=="responsive") reasons.push("Fall detected with reduced responsiveness");
    if(reading.spo2!==null&&reading.spo2<88) reasons.push("Oxygen saturation below 88%");
    if(reading.heartRate!==null&&(reading.heartRate<40||reading.heartRate>160)) reasons.push("Heart rate in critical range");
    if(reading.systolic!==null&&(reading.systolic<80||reading.systolic>200)) reasons.push("Systolic blood pressure in critical range");
    if(reading.diastolic!==null&&(reading.diastolic<50||reading.diastolic>120)) reasons.push("Diastolic blood pressure in critical range");
    if(reading.temperature!==null&&reading.temperature<90) reasons.push("Skin temperature suggests collapse or poor perfusion");

    let level="Monitoring only";
    if(reasons.length>=2||reading.responsiveness==="unresponsive"){
      level="Emergency contact trigger";
    }else if(reasons.length===1){
      level="Urgent follow-up";
    }

    return{
      shouldTrigger:level==="Emergency contact trigger",
      level,
      reason:reasons[0]||"No critical risk pattern detected",
      summary:reasons.length?reasons.join(" | "):"Current wearable data does not cross the prototype emergency thresholds.",
      metrics:{
        heartRate:reading.heartRate,
        spo2:reading.spo2,
        systolic:reading.systolic,
        diastolic:reading.diastolic,
        temperature:reading.temperature,
        responsiveness:reading.responsiveness,
        fallDetected:reading.fallDetected,
      },
    };
  }

  async function syncEmergencyContactFromServer(){
    if(app.isGuest()){populateContact(localState.contact);return}
    try{
      const payload=await app.api("/api/emergency-contacts",{method:"GET",headers:{}});
      if(payload.contact){
        localState.contact=payload.contact;
        saveLocal();
      }
      populateContact(localState.contact);
    }catch{
      populateContact(localState.contact);
    }
  }

  async function saveEmergencyContact(){
    const contact={
      name:elements.emergencyContactName.value.trim(),
      relationship:elements.emergencyContactRelationship.value.trim(),
      phone:elements.emergencyContactPhone.value.trim(),
      email:elements.emergencyContactEmail.value.trim(),
      notificationMethod:elements.emergencyContactMethod.value,
    };
    if(!contact.name||!contact.relationship||(!contact.phone&&!contact.email)){
      elements.emergencyContactStatus.textContent="Enter a name, relationship, and at least one phone or email.";
      return;
    }
    localState.contact=contact;
    saveLocal();
    if(app.isGuest()){
      elements.emergencyContactStatus.textContent="Guest mode saved the emergency contact locally in this browser.";
      return;
    }
    try{
      const payload=await app.api("/api/emergency-contacts",{method:"POST",body:JSON.stringify(contact)});
      localState.contact=payload.contact;
      saveLocal();
      elements.emergencyContactStatus.textContent="Emergency contact saved.";
    }catch(error){
      elements.emergencyContactStatus.textContent=error.message;
    }
  }

  function saveWearableReading(){
    const reading=getReadingFromForm();
    localState.readings.push(reading);
    saveLocal();
    renderAlerts();
    elements.wearableStatus.textContent="Wearable reading saved.";
  }

  async function runEmergencyCheck(){
    const reading=getReadingFromForm();
    localState.readings.push(reading);
    const result=analyzeReading(reading);
    const alertEntry={id:`alert-${Date.now()}`,createdAt:nowIso(),...result};
    localState.alerts.push(alertEntry);
    saveLocal();
    renderAlerts();

    if(result.shouldTrigger){
      if(app.isGuest()){
        elements.wearableStatus.textContent="Prototype emergency trigger detected. In guest mode, this alert is local only.";
        return;
      }
      try{
        const payload=await app.api("/api/emergency-alerts",{method:"POST",body:JSON.stringify({reason:result.reason,metrics:result.metrics})});
        elements.wearableStatus.textContent=payload.message;
      }catch(error){
        elements.wearableStatus.textContent=error.message;
      }
      return;
    }

    elements.wearableStatus.textContent=result.level==="Urgent follow-up"?"Vitals need attention, but the emergency trigger did not fire.":"No emergency trigger detected.";
  }

  function handleUserChange(){
    loadLocal();
    populateContact(localState.contact);
    renderAlerts();
    syncEmergencyContactFromServer();
  }

  elements.saveEmergencyContact.addEventListener("click",saveEmergencyContact);
  elements.saveWearableReading.addEventListener("click",saveWearableReading);
  elements.runEmergencyCheck.addEventListener("click",runEmergencyCheck);
  window.addEventListener("bolus-app:user-changed",handleUserChange);

  loadLocal();
  populateContact(localState.contact);
  renderAlerts();
})();
