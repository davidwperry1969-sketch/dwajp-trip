const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('index.html', 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
assert.doesNotThrow(() => new Function(script), 'embedded app script should parse');
assert.match(html, /#alterModal \.sheet\{width:min\(100%,1080px\)/, 'Alter Trip has no fixed modal width');
assert.match(html, /@media \(min-width:721px\) and \(max-width:1024px\)/, 'tablet-specific Alter Trip layout is present');
assert.match(html, /@media \(max-width:720px\)\{#alterModal/, 'phone-specific Alter Trip layout is present');
assert.match(html, /#alterModal \.btn\{min-height:44px/, 'Alter Trip buttons meet a practical touch target');
const elements = {};
const makeElement = () => ({
  innerHTML: '', value: '', dataset: {}, removed: false, remove() { this.removed = true; this.dataset.removed = 'true' },
  classList: { open: false, add(name) { if (name === 'open') this.open = true }, remove(name) { if (name === 'open') this.open = false } },
  scrollCalls: [], scrollIntoView(options) { this.scrollCalls.push(options) }
});
const localStorage = { data: {}, getItem(key) { return this.data[key] || null }, setItem(key, value) { this.data[key] = value }, removeItem(key) { delete this.data[key] } };
const context = {
  alert() {}, confirm: () => true, localStorage, window: { addEventListener() {}, scrollTo() {}, print() { this.printCalls = (this.printCalls || 0) + 1 } },
  document: { body: { classList: { values: new Set(), add(name) { this.values.add(name) }, remove(name) { this.values.delete(name) }, contains(name) { return this.values.has(name) } } }, getElementById(id) { return elements[id] || (elements[id] = makeElement()) }, querySelectorAll() { return [] }, querySelector() { return null }, documentElement: { style: { setProperty() {} } } },
  requestAnimationFrame: fn => fn(), encodeURIComponent, JSON, String, Date, Set, Math, parseInt
};

vm.createContext(context);
vm.runInContext(script, context);
const run = code => vm.runInContext(code, context);
const modal = context.document.getElementById('alterModal');

// Canonical Friends/Family private stay: one record drives itinerary, contacts,
// navigation, print and Alter Trip protection without render-time persistence.
assert.equal(run("privateStayById('anne-tim-oconomowoc').displayName"), 'Anne & Tim');
assert.equal(run("privateStayFullAddress(privateStayById('anne-tim-oconomowoc'))"), '1190 N Griffith Road, Oconomowoc, WI 53066, USA');
for (const date of ['2026-09-10','2026-09-11','2026-09-12','2026-09-13','2026-09-14']) {
  assert.equal(run(`privateStaysForDate('${date}').length`), 1, `${date} is an occupied Anne & Tim night`);
  assert.equal(run(`alter2Affected('${date}','test').locked`), true, `${date} is protected by the canonical private stay`);
}
assert.equal(run("privateStaysForDate('2026-09-15').length"), 0, 'departure is checkout-exclusive');
assert.equal(run("alter2Affected('2026-09-15','test').locked"), false, 'departure day is not locked by the private stay');
const privateStayCard = run("dayCard(mergedDays().find(day=>day.date==='2026-09-12'))");
assert.match(privateStayCard, /PRIVATE STAY — FRIENDS &amp; FAMILY[\s\S]*Anne &amp; Tim[\s\S]*1190 N Griffith Road, Oconomowoc, WI 53066, USA[\s\S]*CONFIRMED \/ PROTECTED/);
assert.match(privateStayCard, /query=1190%20N%20Griffith%20Road%2C%20Oconomowoc%2C%20WI%2053066%2C%20USA/);
assert.doesNotMatch(privateStayCard, /private-stay-call/, 'Call is omitted until a phone exists');
assert.doesNotMatch(run("dayCard(mergedDays().find(day=>day.date==='2026-09-15'))"), /data-private-stay-id/, 'departure day has no occupied-stay panel');
const sep11MapButtons=run("mapButtons(mergedDays().find(day=>day.date==='2026-09-11'))");
assert.match(sep11MapButtons,/contact-address-map[^>]*href="https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=1190%20N%20Griffith%20Road%2C%20Oconomowoc%2C%20WI%2053066%2C%20USA"/,'11 Sep Contact/address uses the canonical structured address');
assert.doesNotMatch(sep11MapButtons,/query=Anne%20%26%20Tim|Private%20stay%20details%20below/,'private-stay Contact/address never searches the free-text contact label');
const sep15MapButtons=run("mapButtons(mergedDays().find(day=>day.date==='2026-09-15'))");
assert.doesNotMatch(sep15MapButtons,/1190%20N%20Griffith%20Road/,'15 Sep remains outside private-stay address resolution');
run('showContacts(); globalThis.privateStayContacts=document.getElementById("content").innerHTML');
assert.match(context.privateStayContacts, /PRIVATE STAY \/ FRIENDS &amp; FAMILY[\s\S]*Anne &amp; Tim[\s\S]*1190 N Griffith Road/);
assert.doesNotMatch(context.privateStayContacts, /private-stay-call/);
assert.match(run("printAccommodation(mergedDays().find(day=>day.date==='2026-09-12'))"), /PRIVATE STAY \/ FRIENDS &amp; FAMILY — CONFIRMED \/ PROTECTED[\s\S]*1190 N Griffith Road/);
run("state={days:{'2026-09-12':{contact:'Wrong override address',privateStayAddress:'Wrong duplicate'}}}; localStorage.setItem(STORE,JSON.stringify(state)); globalThis.privateStayBytes=localStorage.getItem(STORE); renderHome(); globalThis.privateStayColdMarkup=document.getElementById('content').innerHTML");
assert.equal((context.privateStayColdMarkup.match(/<article class="card"/g)||[]).length,57,'all itinerary cards render with persisted overrides');
const privatePersistedCard=context.privateStayColdMarkup.match(/<article class="card" id="day-2026-09-12">[\s\S]*?<\/article>/)[0];
assert.match(privatePersistedCard,/1190 N Griffith Road, Oconomowoc, WI 53066, USA/,'canonical address wins at render time');
assert.doesNotMatch(privatePersistedCard,/Wrong override address|Wrong duplicate/);
assert.equal(run('localStorage.getItem(STORE)'),context.privateStayBytes,'rendering is read-only');
run("globalThis.privateStayImpact=analyseAlter2Request('Leave Anne and Tim on 12 September');");
assert.equal(context.privateStayImpact.status,'RED');
assert.match(context.privateStayImpact.summary,/Anne & Tim/);
assert.equal(context.privateStayImpact.changes.length,0,'protected private stay is never silently rewritten');
run('resetEdits(); globalThis.privateStayReset=privateStayById("anne-tim-oconomowoc"); renderHome(); globalThis.privateStayResetCards=(document.getElementById("content").innerHTML.match(/<article class="card"/g)||[]).length');
assert.equal(context.privateStayReset.address.street,'1190 N Griffith Road');
assert.equal(context.privateStayResetCards,57);

// Phone-first Friends/Family editor: user data is persisted separately from
// itinerary experiments and every existing private-stay consumer sees the
// same effective record.
run("privateStayUserData={overrides:{'anne-tim-oconomowoc':{phone:'2624245492'}},records:{}}; localStorage.setItem(PRIVATE_STAY_STORE,JSON.stringify(privateStayUserData)); privateStayUserData=loadPrivateStayUserData()");
assert.deepEqual(JSON.parse(run("JSON.stringify(privateStayById('anne-tim-oconomowoc').phones)")),[{label:'Phone',number:'2624245492'}],'legacy single-phone storage is read as one labelled phone without data loss');
run("openPrivateStayForm('anne-tim-oconomowoc')");
assert.match(modal.innerHTML,/EDIT FRIEND \/ FAMILY[\s\S]*value="Anne &amp; Tim"[\s\S]*value="1190 N Griffith Road"/,'Anne & Tim form is pre-filled from the canonical master');
assert.match(modal.innerHTML,/id="ps-phone-number-0" type="tel"/,'phone row requests a phone keyboard');
assert.match(modal.innerHTML,/id="ps-phone-number-0" type="tel" value="2624245492"/,'the currently saved legacy phone is pre-filled automatically');
assert.match(modal.innerHTML,/\+ ADD ANOTHER PHONE/,'editor offers unlimited additional phone rows');
const privateBytesBeforeCancel=localStorage.getItem('dwajp-trip-private-stays-v1');
run('closePrivateStayForm()');
assert.equal(localStorage.getItem('dwajp-trip-private-stays-v1'),privateBytesBeforeCancel,'opening and cancelling the editor writes nothing');
function setPrivateField(id,value,checked){const el=context.document.getElementById(id);el.value=value;if(checked!==undefined)el.checked=checked}
function fillPrivateStayForm({id='',name,phone='',phones=null,street='',city='',state='',postcode='',country='USA',type='OVERNIGHT',arrival='',departure='',priority='IMPORTANT',status='CONFIRMED',protectedValue=true,notes=''}){
  for(const [key,value] of Object.entries({'ps-id':id,'ps-name':name,'ps-street':street,'ps-city':city,'ps-state':state,'ps-postcode':postcode,'ps-country':country,'ps-type':type,'ps-arrival':arrival,'ps-departure':departure,'ps-priority':priority,'ps-status':status,'ps-notes':notes}))setPrivateField(key,value);
  const entries=phones||(phone?[{label:'Phone',number:phone}]:[]);setPrivateField('ps-phone-count',String(entries.length));entries.forEach((entry,index)=>{setPrivateField(`ps-phone-label-${index}`,entry.label);setPrivateField(`ps-phone-number-${index}`,entry.number)});
  setPrivateField('ps-protected','',protectedValue);
}
fillPrivateStayForm({id:'anne-tim-oconomowoc',name:'Anne & Tim',phone:'+1 262-555-0100',street:'1190 N Griffith Road',city:'Oconomowoc',state:'WI',postcode:'53066',arrival:'2026-09-10',departure:'2026-09-15'});
assert.equal(run('savePrivateStay()'),true);
assert.equal(run("effectivePrivateStays().filter(stay=>stay.displayName==='Anne & Tim').length"),1,'editing the master does not duplicate Anne & Tim');
assert.equal(run("privateStayById('anne-tim-oconomowoc').phones[0].number"),'+1 262-555-0100');
assert.match(run("privateStayContactCard(privateStayById('anne-tim-oconomowoc'))"),/href="tel:\+12625550100"/,'SAVE creates a Call action');
run('privateStayUserData=loadPrivateStayUserData()');
assert.equal(run("privateStayById('anne-tim-oconomowoc').phones[0].number"),'+1 262-555-0100','saved phone survives a cold reload of the user-data layer');
const savedFriendBytes=localStorage.getItem('dwajp-trip-private-stays-v1');
run('resetEdits()');
assert.equal(localStorage.getItem('dwajp-trip-private-stays-v1'),savedFriendBytes,'Reset Edits preserves real Friends/Family user data');
fillPrivateStayForm({id:'anne-tim-oconomowoc',name:'Anne & Tim',phones:[{label:'Anne - Mobile',number:'2624245492'},{label:'Tim - Mobile',number:'+1 262-555-0199'},{label:'Home',number:'+1 262-555-0188'}],street:'1190 N Griffith Road',city:'Oconomowoc',state:'WI',postcode:'53066',arrival:'2026-09-10',departure:'2026-09-15'});
assert.equal(run('savePrivateStay()'),true);
assert.deepEqual(JSON.parse(run("JSON.stringify(privateStayById('anne-tim-oconomowoc').phones)")),[{label:'Anne - Mobile',number:'2624245492'},{label:'Tim - Mobile',number:'+1 262-555-0199'},{label:'Home',number:'+1 262-555-0188'}],'multiple labelled phones save in order');
const multiPhoneContact=run("privateStayContactCard(privateStayById('anne-tim-oconomowoc'))");
assert.match(multiPhoneContact,/Call Anne - Mobile[\s\S]*tel:\+12625550199[\s\S]*Call Tim - Mobile[\s\S]*tel:\+12625550188[\s\S]*Call Home/,'each labelled phone gets its own Call action');
assert.match(run("privateStayPanel(mergedDays().find(day=>day.date==='2026-09-11'))"),/Call Anne - Mobile[\s\S]*Call Tim - Mobile[\s\S]*Call Home/,'itinerary private-stay panel exposes compact labelled Call actions');
assert.match(run("printAccommodation(mergedDays().find(day=>day.date==='2026-09-11'))"),/Anne - Mobile: 2624245492 • Tim - Mobile: \+1 262-555-0199 • Home: \+1 262-555-0188/,'print renders labelled phones compactly');
run('privateStayUserData=loadPrivateStayUserData()');
assert.equal(run("privateStayById('anne-tim-oconomowoc').phones.length"),3,'multiple phones survive reload');
const multiPhoneBytes=localStorage.getItem('dwajp-trip-private-stays-v1');run('resetEdits()');assert.equal(localStorage.getItem('dwajp-trip-private-stays-v1'),multiPhoneBytes,'multiple phones survive Reset Edits');
fillPrivateStayForm({id:'anne-tim-oconomowoc',name:'Anne & Tim',phones:[{label:'Anne - Mobile',number:'2624245492'},{label:'Tim - Mobile',number:'+1 262-555-0199'}],street:'1190 N Griffith Road',city:'Oconomowoc',state:'WI',postcode:'53066',arrival:'2026-09-10',departure:'2026-09-15'});
run('removePrivateStayPhone(0)');assert.equal(run('savePrivateStay()'),true);
assert.deepEqual(JSON.parse(run("JSON.stringify(privateStayById('anne-tim-oconomowoc').phones)")),[{label:'Tim - Mobile',number:'+1 262-555-0199'}],'removing one phone preserves the Friends/Family record and remaining phone');
assert.equal(run("effectivePrivateStays().filter(stay=>stay.displayName==='Anne & Tim').length"),1,'phone removal never removes or duplicates the contact');
fillPrivateStayForm({name:'Lauren & Brett',street:'User supplied street',city:'Ortonville',state:'MI',postcode:'00000',arrival:'2026-09-08',departure:'2026-09-10',notes:'Entered entirely in app'});
assert.equal(run('savePrivateStay()'),true);
assert.equal(run("privateStaysForDate('2026-09-08').some(stay=>stay.displayName==='Lauren & Brett')"),true);
assert.equal(run("privateStaysForDate('2026-09-09').some(stay=>stay.displayName==='Lauren & Brett')"),true);
assert.equal(run("privateStaysForDate('2026-09-10').some(stay=>stay.displayName==='Lauren & Brett')"),false,'departure remains exclusive for a user-created stay');
assert.equal(run("alter2Affected('2026-09-09','test').locked"),true,'effective confirmed/protected user stay protects Alter Trip');
run("globalThis.userStayImpact=analyseAlter2Request('Change the stay with Lauren & Brett')");
assert.equal(context.userStayImpact.status,'RED');assert.match(context.userStayImpact.summary,/Lauren & Brett/,'Alter Trip identifies the effective Friends\/Family record by name');
assert.match(run("printAccommodation(mergedDays().find(day=>day.date==='2026-09-09'))"),/Lauren &amp; Brett[\s\S]*User supplied street/,'print consumes the effective user-created record');
assert.match(run("mapButtons(mergedDays().find(day=>day.date==='2026-09-09'))"),/User%20supplied%20street%2C%20Ortonville%2C%20MI%2000000%2C%20USA/,'Maps consumes the same structured address');
fillPrivateStayForm({name:'Visit Only Friend',street:'Visit address',city:'Detroit',state:'MI',postcode:'00000',type:'VISIT_ONLY',arrival:'2026-09-07',departure:'2026-09-08',status:'CONFIRMED',protectedValue:true});
assert.equal(run('savePrivateStay()'),true);
assert.equal(run("privateStaysForDate('2026-09-07').some(stay=>stay.displayName==='Visit Only Friend')"),false,'visit-only never creates an occupied night');
assert.equal(run("effectivePrivateStays().find(stay=>stay.displayName==='Visit Only Friend').protected"),false,'visit-only does not assume protection');
run("showContacts(); globalThis.friendEditorContacts=document.getElementById('content').innerHTML");
assert.match(context.friendEditorContacts,/\+ ADD FRIEND \/ FAMILY[\s\S]*Lauren &amp; Brett[\s\S]*EDIT/);
assert.equal((context.friendEditorContacts.match(/Anne &amp; Tim/g)||[]).length,1,'Contacts has no duplicate Anne & Tim card');
const userId=run("effectivePrivateStays().find(stay=>stay.displayName==='Visit Only Friend').id");
assert.equal(run(`deletePrivateStay('${userId}')`),true,'explicit Delete removes a selected user-created record');
assert.equal(run("privateStayById('anne-tim-oconomowoc').displayName"),'Anne & Tim','deleting user data cannot remove the master record');
run("delete privateStayUserData.overrides['anne-tim-oconomowoc']; for(const id of Object.keys(privateStayUserData.records))delete privateStayUserData.records[id]; localStorage.removeItem(PRIVATE_STAY_STORE); privateStayUserData=loadPrivateStayUserData(); renderHome(); globalThis.friendEditorCardCount=(document.getElementById('content').innerHTML.match(/<article class=\"card\"/g)||[]).length");
assert.equal(context.friendEditorCardCount,57,'all 57 cards render after editor operations and master recovery');
assert.equal(run("privateStayById('anne-tim-oconomowoc').phones.length"),0,'master Anne & Tim base remains recoverable');

// A saved approved destination must be safe during the script's initial render,
// before the later route-intelligence registry declarations have initialized.
const startupElements = {};
const startupStorage = { data: { 'dwajp-trip-v5': JSON.stringify({ days: { '2026-09-24': { dest: 'NEW ORLEANS → Winnie, Texas', dest_query: 'Winnie, Texas' }, '2026-09-25': { dest: 'Winnie, Texas → Mason, Texas', dest_query: 'Mason, Texas' } } }) }, getItem(key) { return this.data[key] || null }, setItem(key, value) { this.data[key] = value }, removeItem(key) { delete this.data[key] } };
const startupContext = {
  alert() {}, confirm: () => true, localStorage: startupStorage, window: { addEventListener() {}, scrollTo() {}, print() {} },
  document: { body: { classList: { add() {}, remove() {} } }, getElementById(id) { return startupElements[id] || (startupElements[id] = makeElement()) }, querySelectorAll() { return [] }, querySelector() { return null }, documentElement: { style: { setProperty() {} } } },
  requestAnimationFrame: fn => fn(), encodeURIComponent, JSON, String, Date, Set, Math, parseInt
};
vm.createContext(startupContext);
assert.doesNotThrow(() => vm.runInContext(script, startupContext), 'approved Winnie state must not break initial renderHome');
const startupMarkup = startupContext.document.getElementById('content').innerHTML;
assert.equal((startupMarkup.match(/<article class="card"/g) || []).length, 57, 'initial Home render retains all 57 itinerary day cards');
assert.match(startupMarkup, /Winnie, Texas RV park \/ campground search/, 'initial approved Winnie card uses its current destination suggestions');
assert.equal(startupStorage.data['dwajp-trip-v5'], JSON.stringify({ days: { '2026-09-24': { dest: 'NEW ORLEANS → Winnie, Texas', dest_query: 'Winnie, Texas' }, '2026-09-25': { dest: 'Winnie, Texas → Mason, Texas', dest_query: 'Mason, Texas' } } }), 'startup rendering does not overwrite saved Alter Trip state');

// A cold app start must reconcile legacy/incomplete approved overrides at render
// time without rewriting the already-persisted state.
const persistedNashvilleState = { days: { '2026-09-19': {
  dest: 'NASHVILLE → MEMPHIS', weather: '17–27°C • 332.4 km', status: 'MUST DO',
  plan: 'MUST: Graceland drive-through / stop • Continue toward Bristol',
  detour: 'Optional Bristol town / speedway only',
  contact: 'Bristol Motor Speedway\n151 Speedway Blvd\n+1 423-989-6900',
  dest_query: 'MEMPHIS', maps: 'https://www.google.com/maps/search/?api=1&query=MEMPHIS',
  route_maps: 'https://www.google.com/maps/dir/?api=1&origin=NASHVILLE&destination=MEMPHIS',
  verifiedRoute: { distanceKm: 332.4, durationMinutes: 189, pressure: 'GREEN', verification: 'verified', routeSequence: ['NASHVILLE','MEMPHIS'], legs: [{ origin: 'NASHVILLE', destination: 'MEMPHIS', distanceKm: 332.4, durationMinutes: 189, pressure: 'GREEN' }] }
}, '2026-09-20': { dest: 'MEMPHIS → Birmingham' }, '2026-09-21': { dest: 'Birmingham → NEW ORLEANS' } } };
const persistedStartupElements = {};
const persistedStartupBytes = JSON.stringify(persistedNashvilleState);
const persistedStartupStorage = { data: { 'dwajp-trip-v5': persistedStartupBytes }, getItem(key) { return this.data[key] || null }, setItem(key, value) { this.data[key] = value }, removeItem(key) { delete this.data[key] } };
const persistedStartupContext = {
  alert() {}, confirm: () => true, localStorage: persistedStartupStorage, window: { addEventListener() {}, scrollTo() {}, print() {} },
  document: { body: { classList: { add() {}, remove() {} } }, getElementById(id) { return persistedStartupElements[id] || (persistedStartupElements[id] = makeElement()) }, querySelectorAll() { return [] }, querySelector() { return null }, documentElement: { style: { setProperty() {} } } },
  requestAnimationFrame: fn => fn(), encodeURIComponent, JSON, String, Date, Set, Math, parseInt
};
vm.createContext(persistedStartupContext);
assert.doesNotThrow(() => vm.runInContext(script, persistedStartupContext), 'persisted approved extra-Nashville state renders through normal startup');
const persistedStartupMarkup = persistedStartupContext.document.getElementById('content').innerHTML;
const persistedSep19Card = persistedStartupMarkup.match(/<article class="card" id="day-2026-09-19">[\s\S]*?<\/article>/)[0];
assert.equal((persistedStartupMarkup.match(/<article class="card"/g) || []).length, 57, 'all 57 cards render from persisted approved state');
assert.match(persistedSep19Card, /NASHVILLE → MEMPHIS[\s\S]*332\.4 km[\s\S]*3 hr 9 min[\s\S]*VERIFIED[\s\S]*GREEN/);
assert.match(persistedSep19Card, /Graceland/i, 'MUST Graceland survives persisted-state reconciliation');
assert.doesNotMatch(persistedSep19Card, /Bristol|Bristol Motor Speedway|151 Speedway Blvd|423-989-6900/i, 'all stale dropped-destination details are absent after a cold load');
assert.match(persistedSep19Card, /MEMPHIS[\s\S]*Travel stop information — verify locally/i, 'safe destination-aware contact content replaces stale Bristol contact data');
assert.match(persistedSep19Card, /Memphis RV park \/ campground search/i, 'overnight suggestions remain Memphis-targeted');
assert.match(persistedStartupMarkup, /Sun 20 Sep[\s\S]*MEMPHIS → Birmingham[\s\S]*Mon 21 Sep[\s\S]*Birmingham → NEW ORLEANS/);
assert.equal(persistedStartupStorage.data['dwajp-trip-v5'], persistedStartupBytes, 'normal startup rendering leaves persisted localStorage byte-for-byte unchanged');
assert.equal(vm.runInContext('JSON.stringify(state)', persistedStartupContext), persistedStartupBytes, 'normal startup rendering leaves in-memory state byte-for-byte unchanged');
vm.runInContext("resetEdits(); globalThis.persistedReset19=mergedDays().find(day=>day.date==='2026-09-19')", persistedStartupContext);
assert.equal(persistedStartupStorage.data['dwajp-trip-v5'], undefined, 'Reset Edits removes the persisted approved override');
assert.match(persistedStartupContext.persistedReset19.plan, /Bass Pro Shops Night Race target/i, 'Reset Edits restores the original Bristol plan exactly from master data');
assert.match(persistedStartupContext.persistedReset19.detour, /Bristol town \/ speedway/i, 'Reset Edits restores the original Bristol detour');
assert.match(persistedStartupContext.persistedReset19.contact, /Bristol Motor Speedway[\s\S]*151 Speedway Blvd[\s\S]*423-989-6900/i, 'Reset Edits restores the original Bristol contact');

const vegasColdBytes = JSON.stringify({ days: { '2026-09-24': { dest: 'NEW ORLEANS → Winnie, Texas', dest_query: 'Winnie, Texas' } } });
const vegasColdElements = {};
const vegasColdStorage = { data: { 'dwajp-trip-v5': vegasColdBytes }, getItem(key) { return this.data[key] || null }, setItem(key, value) { this.data[key] = value }, removeItem(key) { delete this.data[key] } };
const vegasColdContext = {
  alert() {}, confirm: () => true, localStorage: vegasColdStorage, window: { addEventListener() {}, scrollTo() {}, print() {} },
  document: { body: { classList: { add() {}, remove() {} } }, getElementById(id) { return vegasColdElements[id] || (vegasColdElements[id] = makeElement()) }, querySelectorAll() { return [] }, querySelector() { return null }, documentElement: { style: { setProperty() {} } } },
  requestAnimationFrame: fn => fn(), encodeURIComponent, JSON, String, Date, Set, Math, parseInt
};
vm.createContext(vegasColdContext);
assert.doesNotThrow(() => vm.runInContext(script, vegasColdContext), 'app cold-starts with the current persisted override before Las Vegas analysis');
vm.runInContext("globalThis.vegasColdAnalysis=analyseAlter2Request('I want to stay an extra day in Las Vegas. Make it work without changing any confirmed bookings or MUST DO items.')", vegasColdContext);
assert.equal(vegasColdContext.vegasColdAnalysis.proposalValidation.valid, true, 'cold-start proposal uses the consistent compressed repair');
vm.runInContext("globalThis.yellowstoneColdAnalysis=analyseAlter2Request('I want an extra day in Yellowstone. Make it work without changing any confirmed bookings or MUST DO items.')", vegasColdContext);
assert.match(vegasColdContext.yellowstoneColdAnalysis.summary, /cannot be fitted safely/i, 'cold-start persisted state produces the truthful Yellowstone no-safe-fit result');
vm.runInContext("globalThis.transferColdAnalysis=analyseAlter2Request('I want to leave Yellowstone one day earlier and spend the extra day in Seattle. Make it work without changing confirmed bookings or MUST DO items.')", vegasColdContext);
assert.equal(vegasColdContext.transferColdAnalysis.kind, 'day-transfer', 'cold-start parser recognises the paired zero-net transfer');
assert.equal(vegasColdContext.transferColdAnalysis.proposalValidation.valid, true, 'cold-start persisted state constructs coherent transfer metadata');
vm.runInContext("globalThis.reallocationColdAnalysis=analyseAlter2Request('I want to spend one less day in Las Vegas and use that day to break up a long driving day later in the trip. Keep all confirmed bookings and MUST DO items unchanged.')", vegasColdContext);
assert.equal(vegasColdContext.reallocationColdAnalysis.kind, 'source-reallocation', 'cold-start parser honours the explicitly named source location');
assert.equal(vegasColdContext.reallocationColdAnalysis.target, '2026-10-03');
assert.equal(vegasColdStorage.data['dwajp-trip-v5'], vegasColdBytes, 'cold-start Las Vegas analysis leaves saved overrides byte-for-byte unchanged');
assert.equal((vegasColdContext.document.getElementById('content').innerHTML.match(/<article class="card"/g) || []).length, 57, 'cold-start persisted itinerary still renders all 57 cards');

// A failure in one optional day-card helper is isolated to that date.
const renderGuardState = JSON.stringify({ days: { '2026-09-24': { dest: 'NEW ORLEANS → Winnie, Texas', dest_query: 'Winnie, Texas' }, '2026-09-25': { dest: 'Winnie, Texas → Mason, Texas', dest_query: 'Mason, Texas' } } });
run(`state=${renderGuardState}; localStorage.setItem(STORE,JSON.stringify(state)); renderHome(); globalThis.renderGuardNormal=document.getElementById('content').innerHTML; globalThis.renderGuardOriginal=overnightSuggestions`);
assert.equal((context.renderGuardNormal.match(/<article class="card/g) || []).length, 57, 'normal guarded rendering still contains all 57 days');
assert.doesNotMatch(context.renderGuardNormal, /render-error-card/, 'normal rendering is unchanged when helpers succeed');
run(`overnightSuggestions=function(day){if(day.date==='2026-09-24')throw new Error('Forced overnight suggestion failure');return globalThis.renderGuardOriginal(day)}; globalThis.renderGuardStateBefore=JSON.stringify(state); globalThis.renderGuardStorageBefore=localStorage.getItem(STORE); renderHome(); globalThis.renderGuardFailure=document.getElementById('content').innerHTML; globalThis.renderGuardStateAfter=JSON.stringify(state); globalThis.renderGuardStorageAfter=localStorage.getItem(STORE); overnightSuggestions=globalThis.renderGuardOriginal`);
assert.equal((context.renderGuardFailure.match(/<article class="card/g) || []).length, 57, 'a helper exception cannot remove any of the 57 day containers');
assert.equal((context.renderGuardFailure.match(/render-error-card/g) || []).length, 1, 'only the broken day receives a fallback card');
const brokenDayMarkup = context.renderGuardFailure.match(/<article class="card render-error-card" id="day-2026-09-24">[\s\S]*?<\/article>/)[0];
for (const expected of ['Thu 24 Sep', 'NEW ORLEANS → Winnie, Texas', 'PLANNED', 'Display error — itinerary data is still safe', 'Forced overnight suggestion failure']) assert.match(brokenDayMarkup, new RegExp(expected));
assert.match(context.renderGuardFailure, /Fri 25 Sep[\s\S]*Winnie, Texas → Mason, Texas/, 'subsequent approved days continue rendering normally');
assert.equal(context.renderGuardStateAfter, context.renderGuardStateBefore, 'render failure leaves in-memory state byte-for-byte unchanged');
assert.equal(context.renderGuardStorageAfter, context.renderGuardStorageBefore, 'render failure leaves localStorage byte-for-byte unchanged');
run(`renderHome(); globalThis.renderGuardRestored=document.getElementById('content').innerHTML`);
assert.equal(context.renderGuardRestored, context.renderGuardNormal, 'normal rendering is identical after the failed helper is restored');
run(`state={}; localStorage.removeItem(STORE); renderHome()`);

// 1. Alter Trip opens with the four plain-language modes.
run('showAlter()');
for (const label of ['FIND SOMETHING', 'CHANGE MY TRIP', 'ADD SOMETHING', 'REMOVE SOMETHING']) assert.match(modal.innerHTML, new RegExp(label));
assert.equal(modal.classList.open, true);

// Every dashboard section receives the shared mobile return control, while
// Home and the existing W1–W9 / All Days nav remain separately available.
for (const section of ['showToday', 'showActions', 'showTransport', 'showCamping', 'showSummary', 'showBookings', 'showRv', 'showContacts', 'showMust', 'showExpenses', 'showDiary', 'showServices', 'showMaps']) {
  run(`${section}()`);
  assert.match(context.document.getElementById('content').innerHTML, /← Back to Trip/, `${section} provides a clear return to Home`);
}
assert.match(html, /\.dashboard-back\{display:none\}@media\(max-width:720px\)/, 'the extra dashboard return control is phone-only');
assert.match(html, /\.pill,\.backbtn\{min-height:44px\}/, 'phone navigation controls retain touch targets');
assert.match(html, /function scrollDashboardSectionIntoView\(\)\{[\s\S]*scrollIntoView\(\{behavior:'smooth',block:'start'\}\)/, 'dashboard sections snap below the sticky navigation after opening');
run('renderHome()');
assert.match(context.document.getElementById('nav').innerHTML, /Home[\s\S]*W1[\s\S]*W9[\s\S]*All days/);

// PRINT CALENDAR builds a dedicated chronological 57-day calendar, not Home.
const printMarkup = run('buildPrintCalendarMarkup()');
assert.equal((printMarkup.match(/data-print-page=/g) || []).length, 9, '57 days are divided across nine print pages');
assert.equal((printMarkup.match(/data-print-date=/g) || []).length, 57, 'every itinerary day is included');
assert.match(printMarkup, /data-print-page="1"[\s\S]*Tue 1 Sep[\s\S]*Mon 7 Sep/, 'the first page contains the first seven chronological days');
assert.match(printMarkup, /data-print-page="9"[\s\S]*Tue 27 Oct/, 'the final trip day is included on page nine');
assert.match(printMarkup, /<b>Temperature<\/b>[\s\S]*<b>Distance<\/b>[\s\S]*<b>Driving time<\/b>[\s\S]*<b>Pressure<\/b>/, 'day columns include all required travel values in vertical order');
assert.match(printMarkup, /Plan \/ logistics \/ important booking details[\s\S]*Accommodation \/ overnight \/ address \/ contact/, 'day columns include plan, booking, overnight and contact details');
assert.match(printMarkup, /UNCONFIRMED \/ CHECK OR ARRANGE/, 'unconfirmed accommodation remains explicit');
assert.match(printMarkup, /CONFIRMED \/ BOOKED/, 'confirmed accommodation remains explicit');
assert.doesNotMatch(printMarkup, /TRIP CONTROL CENTRE|The rules for this trip|MAPS|ALTER TRIP|RESET EDITS/, 'dashboard-only and editing UI is excluded');
assert.match(html, /@page\{size:landscape/, 'print calendar uses landscape pages');
assert.match(html, /\.print-calendar-days\{display:grid;grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/, 'each weekly page uses seven equal vertical day columns');
assert.equal((printMarkup.match(/class="print-calendar-days"/g) || []).length, 9, 'every print page has its own day-column grid');
assert.equal((printMarkup.match(/class="print-day-section"/g) || []).length, 57 * 8, 'each day column has the eight required labelled sections');
assert.match(html, /\.print-calendar-page\{[^}]*break-after:page/, 'page breaks occur between calendar weeks');
assert.match(html, /\.print-day\{[^}]*break-inside:avoid!important/, 'individual day entries avoid splitting across pages');
run('showPrintCalendar()');
assert.equal(context.document.body.classList.contains('print-calendar-mode'), true, 'dedicated calendar mode is shown before printing');
assert.doesNotMatch(context.document.getElementById('app').innerHTML, /TRIP CONTROL CENTRE|The rules for this trip/);
run('printCalendar()');
assert.equal(context.window.printCalls, 1, 'the browser print dialog is invoked after building the calendar');
run('closePrintCalendar()');
assert.equal(context.document.body.classList.contains('print-calendar-mode'), false, 'closing print calendar restores normal mode');

// Unconfirmed overnight suggestions cover the trip and never upgrade a booking.
const confirmedAccommodationDates = ['2026-09-22','2026-09-23'];
const privateStayDates = ['2026-09-10','2026-09-11','2026-09-12','2026-09-13','2026-09-14'];
const suggestionDates = run("DAYS.map(day=>day.date).filter(date=>date!=='2026-10-27'&&!['2026-09-10','2026-09-11','2026-09-12','2026-09-13','2026-09-14','2026-09-22','2026-09-23'].includes(date))");
assert.equal(suggestionDates.length, 49, 'all remaining unconfirmed overnight dates are audited');
for (const date of suggestionDates) {
  const suggestionCard = run(`dayCard(mergedDays().find(day=>day.date==='${date}'))`);
  assert.match(suggestionCard, /OVERNIGHT — NOT BOOKED/, `${date} shows unconfirmed overnight options`);
  assert.match(suggestionCard, /USE THIS STOP/);
  assert.match(suggestionCard, /google\.com\/maps\/search/);
}
for (const date of privateStayDates) assert.doesNotMatch(run(`dayCard(mergedDays().find(day=>day.date==='${date}'))`), /OVERNIGHT — NOT BOOKED/, `${date} uses the confirmed private stay instead of suggestions`);
for (const date of confirmedAccommodationDates) {
  assert.equal(run(`DAYS.find(day=>day.date==='${date}').status`), 'CONFIRMED');
  assert.doesNotMatch(run(`dayCard(mergedDays().find(day=>day.date==='${date}'))`), /OVERNIGHT — NOT BOOKED/, `${date} keeps its confirmed booking distinct`);
}
assert.doesNotMatch(run("overnightSuggestions({...DAYS.find(day=>day.date==='2026-09-06'),status:'CONFIRMED'})"), /OVERNIGHT — NOT BOOKED/, 'confirmed status suppresses suggestions even when a date has registered options');
assert.equal(run("Object.values(OVERNIGHT_SUGGESTIONS).filter(Array.isArray).flat().filter(option=>/walmart|overnight parking/i.test(option.name+' '+option.type)).every(option=>option.warning===OVERNIGHT_PARKING_WARNING)"), true, 'every retail or parking option carries the exact arrival warning');
assert.equal(run("Object.values(OVERNIGHT_SUGGESTIONS).filter(Array.isArray).flat().every(option=>option.name&&option.detail&&option.query)"), true, 'every suggestion has a name, description and map query');
assert.match(run("dayCard(mergedDays().find(day=>day.date==='2026-09-06'))"), /CHECK BEFORE ARRIVAL/);
assert.match(run("dayCard(mergedDays().find(day=>day.date==='2026-10-13'))"), /Designated campground required/);
assert.match(html, /@media\(max-width:720px\)\{\.overnight-suggestions[\s\S]*\.overnight-grid\{grid-template-columns:1fr\}/, 'overnight suggestions collapse to one column on phones');
run("state={}; globalThis.overnightStateBefore=JSON.stringify(state); overnightSuggestionNotice(); globalThis.overnightStateAfter=JSON.stringify(state)");
assert.equal(context.overnightStateAfter, context.overnightStateBefore, 'the future Use this stop action does not alter itinerary state');
assert.equal(localStorage.getItem('dwajp-trip-v5'), null, 'the future Use this stop action does not persist a booking');

// 2. Find Something is research-only: results do not update itinerary or storage.
const beforeFind = JSON.stringify(localStorage.data);
run("showAlterMode('find'); document.getElementById('findText').value='Find the best deli sandwich in NYC'; findSomething();");
assert.match(modal.innerHTML, /Katz's Delicatessen/);
assert.match(modal.innerHTML, /Add this to my itinerary/);
assert.equal(JSON.stringify(localStorage.data), beforeFind);
assert.equal(run("mergedDays().find(d=>d.date==='2026-09-01').plan"), 'The Gallivant Times Square • Arrive / settle in • Battery Park ferry / Statue of Liberty');

// Extra-night wording anchors to the requested destination stay before generic matching.
run("state={}; localStorage.removeItem(STORE); globalThis.extraNightBeforeState=JSON.stringify(state); globalThis.extraNightBeforeDays=JSON.stringify(mergedDays()); globalThis.milwaukeeAnotherNight=analyseTripChange('Stay another night in Milwaukee.'); globalThis.milwaukeeOneMoreNight=analyseTripChange('Stay one more night in Milwaukee.'); globalThis.milwaukeeExtraDay=analyseTripChange('Add an extra day in Milwaukee.'); globalThis.extraNightAfterState=JSON.stringify(state); globalThis.extraNightAfterDays=JSON.stringify(mergedDays())");
for (const anchored of [context.milwaukeeAnotherNight, context.milwaukeeOneMoreNight, context.milwaukeeExtraDay]) {
  assert.ok(anchored.extraDay, 'extra night/day intent is recognised');
  assert.equal(anchored.extraDay.name, 'MILWAUKEE');
  assert.equal(anchored.affected[0].day.date, '2026-09-10', 'analysis starts at the Milwaukee arrival/stay');
  assert.equal(anchored.extraDay.nextLockedIndex >= 0, true, 'analysis stops against a genuine protected commitment');
  assert.equal(anchored.affected.at(-1).day.date, '2026-09-22', 'the next confirmed booking bounds the forward scan');
  assert.ok(anchored.affected.every(item => item.day.date >= '2026-09-10'), 'New York, Washington, Niagara and earlier unrelated days are excluded');
  assert.ok(anchored.affected.some(item => item.day.date === '2026-09-22' && item.label === '🔴 LOCKED'), 'the next confirmed booking remains protected');
}
for (const wording of ['Another night in Milwaukee.', 'One more night in Milwaukee.', 'Extra night in Milwaukee.', 'Stay an extra day in Milwaukee.']) {
  const target = run(`extraDayTarget(mergedDays(),${JSON.stringify(wording)})`);
  assert.equal(target.name, 'MILWAUKEE', `${wording} identifies Milwaukee before scanning`);
  assert.equal(target.start, 9, `${wording} anchors to 10 Sep, the start of the contiguous Milwaukee run`);
  assert.equal(target.end, 13, `${wording} includes the contiguous Milwaukee stay through 14 Sep`);
}
assert.equal(context.extraNightAfterState, context.extraNightBeforeState, 'extra-night analysis does not mutate itinerary state');
assert.equal(context.extraNightAfterDays, context.extraNightBeforeDays, 'extra-night analysis does not change merged itinerary data');
assert.equal(localStorage.getItem('dwajp-trip-v5'), null, 'extra-night analysis does not persist before approval');

// Stage 2 Change My Trip analyses multiple itinerary days without modifying state.
const beforeAnalysis = JSON.stringify(localStorage.data);
run("globalThis.milwaukeeAnalysis=analyseTripChange(\"We don't need to get to Milwaukee until later on Friday and we can leave earlier on Monday.\"); renderTripImpact(\"We don't need to get to Milwaukee until later on Friday and we can leave earlier on Monday.\");");
const analysis = context.milwaukeeAnalysis;
assert.ok(analysis.affected.length > 3, 'analysis covers multiple surrounding days');
assert.ok(analysis.affected.some(item => item.day.date === '2026-09-10' && item.label === '⚠️ HIGH PRESSURE'));
assert.ok(analysis.affected.some(item => item.day.date === '2026-09-11' && item.label === '🟢 AVAILABLE'));
assert.ok(analysis.proposals.some(item => /split the 610 km drive/.test(item.title)));
assert.ok(analysis.proposals.some(item => /earlier departure opportunity/.test(item.title)));
assert.equal(run("impactClass(mergedDays().find(d=>d.date==='2026-09-22')).label"), '🔴 LOCKED');
assert.equal(run("DAYS.find(day=>day.date==='2026-09-23').status"), 'CONFIRMED', 'the second booked night is confirmed in the itinerary source');
assert.match(run("DAYS.find(day=>day.date==='2026-09-23').contact"), /French Quarter RV Resort/);
assert.equal(run("travelKm(DAYS.find(day=>day.date==='2026-09-23'))"), 0, 'the local second night has no stale driving distance');
assert.equal(run("pressure(DAYS.find(day=>day.date==='2026-09-23'))"), 'easy', 'the local second night is not marked busy');
assert.equal(run("DAYS.find(day=>day.date==='2026-09-24').status"), 'PLANNED', 'the checkout day remains unchanged');
assert.match(run("dayCard(mergedDays().find(day=>day.date==='2026-09-23'))"), /French Quarter RV Resort/);
assert.doesNotMatch(run("dayCard(mergedDays().find(day=>day.date==='2026-09-23'))"), /accommodation to be confirmed/i);
assert.equal(run("confirmedBookingNight('2026-09-22').confirmation"), '2026075827', 'check-in night is occupied by the confirmed booking');
assert.equal(run("confirmedBookingNight('2026-09-23').confirmation"), '2026075827', 'the night before checkout remains occupied');
assert.equal(run("confirmedBookingNight('2026-09-24')"), null, 'checkout day is not an occupied booking night');
run("globalThis.bookingGuardState=JSON.stringify(state); state.days=state.days||{}; state.days['2026-09-23']={dest:'NEW ORLEANS → TEXAS / TRAVEL BUFFER',weather:'22–30°C • 560 km',status:'PLANNED',plan:'Depart during the occupied booking night'}");
assert.equal(run("mergedDays().find(day=>day.date==='2026-09-23').dest"), 'NEW ORLEANS', 'stale mutable state cannot replace the confirmed second-night itinerary day');
assert.equal(run("mergedDays().find(day=>day.date==='2026-09-23').status"), 'CONFIRMED');
assert.equal(run("proposalIsSafe({changes:[{date:'2026-09-23',changes:{dest:'NEW ORLEANS → TEXAS'}}]})"), false, 'write-back cannot schedule travel on an occupied confirmed night');
run("state=JSON.parse(globalThis.bookingGuardState)");
assert.equal(run("isLocked(mergedDays().find(d=>d.date==='2026-09-21'))"), false, 'a buffer day that mentions a future booking is not itself protected');
assert.equal(run("isLocked({status:'PLANNED',plan:'Confirmed campground check-in',contact:''})"), true, 'a genuine confirmed stay remains protected');
assert.equal(run("isLocked({status:'PLANNED',plan:'RV pickup at 13:00',contact:''})"), true, 'a timed vehicle pickup remains protected');
assert.equal(run("isLocked({status:'PLANNED',plan:'Travel day with confirmed details for tomorrow',contact:''})"), false, 'an ordinary day with a bare confirmed reference remains flexible');
assert.match(modal.innerHTML, /Trip Impact Analysis/);
assert.match(modal.innerHTML, /OPTION 1 — SPLIT THE DRIVE/);
assert.match(modal.innerHTML, /ROUTE CHECKING/);
assert.match(modal.innerHTML, /OK — USE THIS OPTION/);
assert.match(modal.innerHTML, /OPTION 2 — KEEP ORIGINAL/);
assert.match(modal.innerHTML, /CURRENT: ORTONVILLE → MILWAUKEE[\s\S]*PROPOSED: ORTONVILLE → Indiana Dunes/);
assert.match(modal.innerHTML, /Fri 11 Sep[\s\S]*CURRENT: MILWAUKEE local day[\s\S]*PROPOSED: Indiana Dunes → MILWAUKEE/);
assert.match(modal.innerHTML, /Sat 12 Sep[\s\S]*UNCHANGED — MILWAUKEE/);
assert.match(modal.innerHTML, /Sun 13 Sep[\s\S]*UNCHANGED — MILWAUKEE/);
assert.match(modal.innerHTML, /Mon 14 Sep/);
assert.match(modal.innerHTML, /MILWAUKEE/);
assert.match(modal.innerHTML, /Tue 15 Sep/);
assert.match(modal.innerHTML, /BLOOMINGTON/);
assert.match(modal.innerHTML, /Wed 16 Sep[\s\S]*CURRENT: BLOOMINGTON → NASHVILLE[\s\S]*PROPOSED: NASHVILLE local\/recovery day/);
assert.match(modal.innerHTML, /NEXT PROTECTED COMMITMENT:/);
assert.match(modal.innerHTML, /Tue 22 Sep — NEW ORLEANS/);
assert.match(modal.innerHTML, /BUFFER:/);
assert.match(modal.innerHTML, /PROTECTED BOOKINGS AFFECTED:[\s\S]*NONE/);
const optionOne = modal.innerHTML.slice(modal.innerHTML.indexOf('OPTION 1 — SPLIT THE DRIVE'), modal.innerHTML.indexOf('OPTION 2 — KEEP ORIGINAL'));
assert.match(optionOne, /ROUTE CHECKING/, 'proposal legs wait for verified routing instead of initially showing inherited static kilometres');
assert.doesNotMatch(optionOne, /approx\. 305 km|approx\. 435 km|approx\. 485 km/, 'proposal cards do not display stale static route legs while verification is pending');
assert.doesNotMatch(optionOne, /Mon 21 Sep — TRAVEL \/ NEW ORLEANS BUFFER/);
assert.match(optionOne, /5 day\(s\) remain before this commitment — SAFE\./);
assert.match(optionOne, /Mon 14 Sep &mdash; &#128994;/);
assert.match(optionOne, /Tue 15 Sep &mdash; &#128993;/);
assert.match(optionOne, /Wed 16 Sep &mdash; &#128994;/);
assert.doesNotMatch(optionOne, /Mon 14 Sep &mdash; &#128994; GREEN|Tue 15 Sep &mdash; &#128993; YELLOW|Wed 16 Sep &mdash; &#128994; GREEN/);
for (const label of ['Thu 10 Sep', 'Fri 11 Sep', 'Sat 12 Sep', 'Sun 13 Sep', 'Mon 14 Sep', 'Tue 15 Sep', 'Wed 16 Sep']) assert.ok(optionOne.includes(label), `Option 1 visibly includes ${label}`);
assert.ok(optionOne.indexOf('Thu 10 Sep') < optionOne.indexOf('Fri 11 Sep') && optionOne.indexOf('Fri 11 Sep') < optionOne.indexOf('Sat 12 Sep') && optionOne.indexOf('Sun 13 Sep') < optionOne.indexOf('Mon 14 Sep') && optionOne.indexOf('Tue 15 Sep') < optionOne.indexOf('Wed 16 Sep'), 'Option 1 presents the complete chain in chronological order');
assert.match(modal.innerHTML, /SEE RECOMMENDED CHANGE/);
assert.match(modal.innerHTML, /id="proposed-solutions"/);
assert.equal((modal.innerHTML.match(/SEE RECOMMENDED CHANGE/g) || []).length, 1);
assert.match(modal.innerHTML, /Thu 10 Sep[\s\S]*HIGH PRESSURE[\s\S]*SEE RECOMMENDED CHANGE/);
assert.doesNotMatch(modal.innerHTML, /Fri 11 Sep[\s\S]*SEE RECOMMENDED CHANGE/);
assert.doesNotMatch(modal.innerHTML, /SEE RECOMMENDED CHANGES/);
run('scrollToRecommendedChanges()');
assert.equal(elements['proposed-solutions'].scrollCalls[0].behavior, 'smooth');
assert.equal(elements['proposed-solutions'].scrollCalls[0].block, 'start');
assert.equal(JSON.stringify(localStorage.data), beforeAnalysis);

// Exact production/iPhone wording retains the established Milwaukee split
// and must not be reduced to a generic text append or false booking release.
run("state={}; localStorage.removeItem(STORE); renderTripImpact('We don’t need to get to Milwaukee until later Friday and can leave earlier on Monday.'); globalThis.exactPhoneMilwaukeeModal=document.getElementById('alterModal').innerHTML; globalThis.exactPhoneMilwaukeeProposal=pendingTripProposals[0]");
assert.ok(context.exactPhoneMilwaukeeProposal,'exact phone command constructs the Milwaukee repair');
assert.match(context.exactPhoneMilwaukeeModal,/OPTION 1 — SPLIT THE DRIVE[\s\S]*ORTONVILLE → Indiana Dunes[\s\S]*Indiana Dunes → MILWAUKEE/);
assert.match(context.exactPhoneMilwaukeeModal,/PROTECTED BOOKINGS AFFECTED:[\s\S]*NONE/);
assert.doesNotMatch(context.exactPhoneMilwaukeeModal,/Cruise America|RELEASE THESE BOOKINGS|No automatic option is safe/,'exact phone command does not misclassify the ongoing RV hire');
assert.equal(localStorage.getItem('dwajp-trip-v5'),null,'exact command analysis remains read-only');

// Stage 3 proposal approval is the only point at which itinerary state is changed.
run("state={}; localStorage.removeItem(STORE); renderTripImpact(\"We don't need to get to Milwaukee until later on Friday and we can leave earlier on Monday.\"); globalThis.proposalBefore=JSON.stringify(state);");
assert.equal(context.proposalBefore, '{}');
assert.equal(localStorage.getItem('dwajp-trip-v5'), null);
run("applyTripProposal('split-2026-09-10'); globalThis.thursdayChange=state.days['2026-09-10']; globalThis.fridayChange=state.days['2026-09-11']; globalThis.mondayChange=state.days['2026-09-14']; globalThis.tuesdayChange=state.days['2026-09-15']; globalThis.wednesdayChange=state.days['2026-09-16']; globalThis.fridayContact=mergedDays().find(d=>d.date==='2026-09-11').contact;");
assert.match(context.thursdayChange.dest, /Indiana Dunes/);
assert.match(context.thursdayChange.weather, /~305 km/);
assert.match(context.thursdayChange.contact, /Indiana Dunes/);
assert.doesNotMatch(context.thursdayChange.contact, /Anne & Tim|Milwaukee friends/);
assert.match(context.thursdayChange.maps, /Indiana%20Dunes/);
assert.match(context.thursdayChange.route_maps, /Indiana%20Dunes/);
assert.match(context.fridayChange.dest, /MILWAUKEE/i);
assert.match(context.fridayChange.weather, /~305 km/);
assert.match(context.fridayContact, /Anne & Tim/);
assert.match(context.mondayChange.dest, /MILWAUKEE → BLOOMINGTON/i);
assert.match(context.tuesdayChange.dest, /BLOOMINGTON → NASHVILLE/i);
assert.equal(context.wednesdayChange.dest, 'NASHVILLE');
assert.equal(run("state.days['2026-09-22']"), undefined);
assert.ok(localStorage.getItem('dwajp-trip-v5'));
assert.equal(modal.classList.open, false);

// Re-opening analysis after approval reports the persisted split rather than a false safety warning.
run("renderTripImpact(\"We don't need to get to Milwaukee until later on Friday and we can leave earlier on Monday.\"); globalThis.appliedResult=appliedSplitDrive();");
assert.ok(context.appliedResult);
assert.match(modal.innerHTML, /THIS CHANGE IS ALREADY APPLIED/);
assert.match(modal.innerHTML, /ORTONVILLE → Indiana Dunes/);
assert.match(modal.innerHTML, /Indiana Dunes → MILWAUKEE/);
assert.match(modal.innerHTML, /Use RESET EDITS if you want to restore the original itinerary and reconsider this change/);
assert.doesNotMatch(modal.innerHTML, /No automatic option is safe/);

// A new destination request must not reuse the already-applied Milwaukee proposal.
run("renderTripImpact('I want an extra day in Nashville. Rearrange the travel days after Nashville if needed, but do not change any confirmed bookings or fixed events.'); globalThis.nashvilleAfterMilwaukee=document.getElementById('alterModal').innerHTML;");
assert.match(context.nashvilleAfterMilwaukee, /ADD AN EXTRA DAY IN NASHVILLE/);
assert.doesNotMatch(context.nashvilleAfterMilwaukee, /THIS CHANGE IS ALREADY APPLIED|ORTONVILLE → Indiana Dunes|Indiana Dunes → MILWAUKEE/);

// Keep Original clears the pending option and makes no change.
run("state={}; localStorage.removeItem(STORE); renderTripImpact(\"We don't need to get to Milwaukee until later on Friday and we can leave earlier on Monday.\"); keepOriginalProposal();");
assert.equal(localStorage.getItem('dwajp-trip-v5'), null);
assert.equal(modal.classList.open, false);

// Protected bookings are never accepted by automatic proposal application.
assert.equal(run("proposalIsSafe({changes:[{date:'2026-09-22',changes:{plan:'Move confirmed stay'}}]})"), false);
run("state={}; localStorage.removeItem(STORE); pendingTripProposals=[{id:'locked-proposal',changes:[{date:'2026-09-22',changes:{plan:'Move confirmed stay'}}]}]; applyTripProposal('locked-proposal'); globalThis.lockedState=JSON.stringify(state);");
assert.equal(context.lockedState, '{}');
assert.equal(localStorage.getItem('dwajp-trip-v5'), null);

// An extra-day request is scoped to its destination and only cascades forward until a genuine protected commitment.
run("state={}; localStorage.removeItem(STORE); globalThis.nashvilleAnalysis=analyseTripChange('I want an extra day in Nashville. Rearrange the travel days after Nashville if needed, but do not change any confirmed bookings or fixed events.'); renderTripImpact('I want an extra day in Nashville. Rearrange the travel days after Nashville if needed, but do not change any confirmed bookings or fixed events.'); globalThis.nashvilleProposal=pendingTripProposals[0]; globalThis.nashvilleModal=document.getElementById('alterModal').innerHTML;");
assert.ok(context.nashvilleProposal, 'a destination-scoped extra-day proposal is created');
assert.equal(context.nashvilleProposal.type, 'extra-day');
assert.ok(context.nashvilleProposal.changes.every(change => change.date >= '2026-09-18'), 'the Nashville proposal does not alter earlier Milwaukee or Ortonville days');
assert.deepEqual([...context.nashvilleProposal.changes.map(change => change.date)], ['2026-09-18'], 'only the extra Nashville day is actionable until the new route is confirmed');
assert.equal(context.nashvilleProposal.nextProtected.date, '2026-09-22');
assert.equal(context.nashvilleProposal.arrivalWindow.checkIn, '14:00', 'accommodation defaults to an afternoon check-in window');
assert.equal(context.nashvilleProposal.arrivalWindow.checkOut, '10:00', 'accommodation defaults to a 10:00 checkout');
assert.equal(context.nashvilleProposal.changes.some(change => change.date === '2026-09-22'), false, 'the confirmed accommodation day is not rewritten');
assert.equal(context.nashvilleProposal.routeUnknown, true, 'a changed route without a direct itinerary distance is never inferred from unrelated days');
assert.ok(context.nashvilleProposal.cascade.slice(1, -1).every(item => item.routeUnknown && /DISTANCE TO VERIFY/.test(item.proposed.weather)), 'unknown route legs are clearly marked instead of inheriting old daily kilometres');
assert.ok(context.nashvilleProposal.cascade.at(-1).protectedArrival, 'the final accommodation arrival is displayed without changing the booking');
assert.match(context.nashvilleProposal.cascade.at(-1).proposed.weather, /DISTANCE TO VERIFY/);
assert.ok(context.nashvilleProposal.cascade.slice(1, -1).every(item => !/^NEW ORLEANS$/i.test(item.proposed.dest)), 'no unbooked prior night is placed at the booked destination');
assert.equal(run("isLocked(mergedDays().find(d=>d.date==='2026-09-18'))"), false, 'ordinary post-Nashville travel remains flexible');
assert.match(context.nashvilleModal, /ADD AN EXTRA DAY IN NASHVILLE/);
assert.doesNotMatch(context.nashvilleModal, /ORTONVILLE → Indiana Dunes|Indiana Dunes → MILWAUKEE/);
assert.match(context.nashvilleModal, /Tue 22 Sep — NEW ORLEANS/);
assert.equal(run("proposalIsSafe(pendingTripProposals[0])"), true, 'the draft itself does not touch the protected booking');
assert.match(context.nashvilleModal, /ROUTE CONFIRMATION REQUIRED/);
assert.match(context.nashvilleModal, /DISTANCE TO VERIFY/);
assert.doesNotMatch(context.nashvilleModal, /975 km|260 km|Route overnight area/);
assert.match(context.nashvilleModal, /BOOKING UNCHANGED/);
run("applyTripProposal(pendingTripProposals[0].id); globalThis.nashvilleApplied=state.days; ");
assert.equal(context.nashvilleApplied, undefined, 'an unknown replacement route cannot be approved automatically');
assert.equal(localStorage.getItem('dwajp-trip-v5'), null, 'an unconfirmed route does not write itinerary overrides');

// A route distance is usable only when it belongs to the same new origin/destination pair.
const directRoute = run("routeDistanceForChange([{short:'Example',dest:'ALPHA → BETA',weather:'18–24°C • 420 km'}],'Alpha','Beta')");
assert.equal(directRoute.km, 420);
assert.equal(run("routeDistanceForChange([{short:'Other route',dest:'ALPHA → GAMMA',weather:'18–24°C • 420 km'}],'Alpha','Beta')"), null);
assert.equal(run("allocatedLegs(420,2).legs.reduce((sum,km)=>sum+km,0)+allocatedLegs(420,2).finalLeg"), 420, 'known route distance is distributed without creating extra driving');

// Route Intelligence is provider-neutral: it exposes maps handoff and a safe result contract without an API key.
assert.notEqual(run('RouteIntelligence.provider'), null, 'the browser is configured to use the isolated route Worker');
const storedRoute = run("RouteIntelligence.resolve({origin:'Alpha',destination:'Beta',days:[{short:'Example',dest:'ALPHA → BETA',weather:'18–24°C • 420 km'}]})");
assert.equal(storedRoute.status, 'available');
assert.equal(storedRoute.distanceKm, 420);
assert.match(storedRoute.mapUrl, /origin=Alpha&destination=Beta/);
const unknownRoute = run("RouteIntelligence.resolve({origin:'Alpha',destination:'Gamma',days:[{short:'Example',dest:'ALPHA → BETA',weather:'18–24°C • 420 km'}]})");
assert.equal(unknownRoute.status, 'route_confirmation_required');
assert.equal(unknownRoute.distanceKm, null);
const plannedRoute = run("RouteIntelligence.schedule({route:{reliable:true,distanceKm:1000,durationMinutes:600,overnightAreas:[]},availableDays:3,arrivalWindow:{checkIn:'14:00',checkOut:'10:00'}})");
assert.equal(plannedRoute.status, 'ready');
assert.equal(plannedRoute.days.reduce((sum,day)=>sum+day.distanceKm,0), 1000);
assert.ok(plannedRoute.days.at(-1).distanceKm < plannedRoute.days[0].distanceKm, 'Route Intelligence reserves a shorter final accommodation-arrival leg');
assert.equal(plannedRoute.days[0].overnightStatus, 'route location unavailable');
const bufferPlan = run("RouteIntelligence.schedule({route:{reliable:true,distanceKm:420,durationMinutes:null,overnightAreas:[]},availableDays:3,arrivalWindow:{checkIn:'14:00',checkOut:'10:00'}})");
assert.equal(bufferPlan.days.filter(day => day.kind === 'buffer').length, 2, 'extra calendar days stay as buffers instead of manufacturing driving');
assert.equal(run("RouteIntelligence.schedule({route:{reliable:false},availableDays:2}).status"), 'route_confirmation_required');
run("RouteIntelligence.setProvider({route(){return {reliable:true,distanceKm:300,durationMinutes:210,source:'test route provider',overnightAreas:[{name:'Example Town'}]}}})");
const providerRoute = run("RouteIntelligence.resolve({origin:'Origin',destination:'Destination',days:[]})");
assert.equal(providerRoute.source, 'test route provider');
assert.equal(providerRoute.overnightAreas[0].name, 'Example Town');
run('RouteIntelligence.setProvider(null)');

// Stored accommodation times override defaults; transportation retains its actual deadline rather than using accommodation rules.
assert.equal(run("arrivalWindow({plan:'Campground check-in from 16:30; checkout 11:00',contact:''}).checkIn"), '16:30');
assert.equal(run("arrivalWindow({plan:'Campground check-in from 16:30; checkout 11:00',contact:''}).checkOut"), '11:00');
assert.equal(run("isAccommodationCommitment({status:'CONFIRMED',plan:'Flight departs 13:55',contact:''})"), false, 'transport is not treated as accommodation');
assert.deepEqual([...run("commitmentTimes({plan:'Flight departs 13:55; vehicle return 20:00',contact:''})")], ['13:55', '20:00']);

// Clickable itinerary places use one safely encoded Maps destination for both name and address.
const linksBefore = JSON.stringify(localStorage.data);
const contactLinks = run("renderContact(\"Katz's Delicatessen\\n205 E Houston St, New York, NY\")");
assert.equal((contactLinks.match(/class="placeLink"/g) || []).length, 2);
assert.match(contactLinks, /Katz%27s%20Delicatessen%20205%20E%20Houston%20St%2C%20New%20York%2C%20NY/);
const contactHrefs = [...contactLinks.matchAll(/href="([^"]+)"/g)].map(match => match[1]);
assert.equal(contactHrefs[0], contactHrefs[1]);
assert.equal(JSON.stringify(localStorage.data), linksBefore);

// A Find Something result added through the existing Add handler receives the same links.
run("state={}; let found=findOptions('Find the best deli sandwich in NYC')[0]; applyAlter(found.day,'add',found.name+' — '+found.address+' — '+found.why); globalThis.findAddedCard=dayCard(mergedDays().find(d=>d.date===found.day));");
assert.match(context.findAddedCard, /Katz's Delicatessen/);
assert.match(context.findAddedCard, /205 E Houston St, New York, NY/);
assert.ok((context.findAddedCard.match(/class="placeLink"/g) || []).length >= 3);

// Existing Navigate and Route actions remain in each card.
const originalCard = run("dayCard(mergedDays().find(d=>d.date==='2026-09-01'))");
assert.match(originalCard, /class="btn blue"[^>]*>📍 Navigate/);
assert.match(originalCard, /class="btn navy"[^>]*>🚐 Route/);

// 3–5. Existing handlers still add, change and remove through the original state model.
run("state={}; applyAlter('2026-09-01','add','Add BBQ stop'); globalThis.addPlan=state.days['2026-09-01'].plan;");
assert.match(context.addPlan, /Arrive \/ settle in/);
assert.match(context.addPlan, /Added: Add BBQ stop/);
run("state={}; applyAlter('2026-09-01','change','New plan'); globalThis.changePlan=state.days['2026-09-01'].plan;");
assert.equal(context.changePlan, 'New plan');
run("state={}; applyAlter('2026-09-01','remove','Remove NYC'); globalThis.dayRemoved=!mergedDays().some(d=>d.date==='2026-09-01');");
assert.equal(context.dayRemoved, true);

// Existing day-selection behavior still forwards the selected suggestion to the handler.
run("state={}; document.getElementById('alterModal').classList.add('open'); applyAlterFromSuggestion({dataset:{date:'2026-09-01',action:'add',text:'Selected stop'}}); globalThis.selectedPlan=state.days['2026-09-01'].plan;");
assert.match(context.selectedPlan, /Added: Selected stop/);
assert.equal(modal.classList.open, false);

// 6. Cancel closes the modal and clears pending UI back to the four modes.
modal.classList.add('open');
modal.innerHTML = '<div class="sheet"><h2>Choose a day</h2></div>';
run('closeAlter()');
assert.equal(modal.classList.open, false);
assert.match(modal.innerHTML, /FIND SOMETHING/);
assert.doesNotMatch(modal.innerHTML, /Choose a day/);

// 7. Reset Edits removes the same persisted state that Add/Change/Remove use.
run("state={days:{'2026-09-01':{plan:'Temporary'}},removedDays:['2026-09-02']}; localStorage.setItem(STORE,JSON.stringify(state)); resetEdits();");
assert.equal(localStorage.getItem('dwajp-trip-v5'), null);
assert.equal(run("mergedDays().some(d=>d.date==='2026-09-02')"), true);
assert.equal(run("mergedDays().find(d=>d.date==='2026-09-01').plan"), 'The Gallivant Times Square • Arrive / settle in • Battery Park ferry / Statue of Liberty');

// Alter Trip 2.0 A-J: every command is analysed before a separately approved write.
run("state={}; localStorage.removeItem(STORE); globalThis.alter2Green=analyseAlter2Request('Skip Tijuana.'); globalThis.alter2GreenBefore=JSON.stringify(state)");
assert.equal(context.alter2Green.status, 'GREEN', 'A. an isolated optional change is GREEN');
assert.deepEqual([...context.alter2Green.affected.map(item => item.date)], ['2026-10-24']);
assert.equal(context.alter2GreenBefore, '{}', 'analysis never mutates itinerary state');
run("renderAlter2Analysis(globalThis.alter2Green)");
assert.match(modal.innerHTML, /GREEN[\s\S]*Affected days[\s\S]*Sat 24 Oct/);
assert.match(modal.innerHTML, /LEAVE IT[\s\S]*MAKE A CHANGE/);

run("globalThis.alter2Yellow=analyseAlter2Request('Stay another night in Milwaukee.')");
assert.equal(context.alter2Yellow.status, 'YELLOW', 'B. a cascading extra night is YELLOW');
assert.deepEqual([...context.alter2Yellow.affected.map(item => item.date)], ['2026-09-14', '2026-09-15', '2026-09-16']);
assert.equal(context.alter2Yellow.requiresRouteVerification, true);
assert.match(context.alter2Yellow.summary, /following travel chain/i);

run("globalThis.alter2AccommodationRed=analyseAlter2Request('Move the confirmed French Quarter accommodation.')");
assert.equal(context.alter2AccommodationRed.status, 'RED', 'C. confirmed accommodation conflicts are RED');
assert.deepEqual([...context.alter2AccommodationRed.affected.slice(0, 2).map(item => item.date)], ['2026-09-22', '2026-09-23']);
assert.equal(context.alter2AccommodationRed.changes.length, 0);

run("globalThis.alter2TransportRed=analyseAlter2Request('Move the Qantas flight and Hertz vehicle return later.')");
assert.equal(context.alter2TransportRed.status, 'RED', 'D. flights and vehicle returns are RED');
assert.ok(context.alter2TransportRed.affected.some(item => item.date === '2026-10-27'));

run("state={}; localStorage.removeItem(STORE); renderAlter2Analysis(analyseAlter2Request('Skip Tijuana.')); showAlter2FinalProposal(); globalThis.alter2CancelBefore=JSON.stringify(state); cancelAlter2(); globalThis.alter2CancelAfter=JSON.stringify(state)");
assert.equal(context.alter2CancelAfter, context.alter2CancelBefore, 'E. CANCEL leaves itinerary state unchanged');
assert.equal(localStorage.getItem('dwajp-trip-v5'), null);

run("state={}; localStorage.removeItem(STORE); renderAlter2Analysis(analyseAlter2Request('Skip Tijuana.')); showAlter2FinalProposal(); globalThis.alter2FinalHtml=document.getElementById('alterModal').innerHTML; globalThis.alter2Applied=approveAlter2Changes(); globalThis.alter2AppliedDates=Object.keys(state.days||{}); globalThis.alter2AppliedPlan=state.days['2026-10-24'].plan");
assert.match(context.alter2FinalHtml, /Final proposed changes[\s\S]*APPROVE CHANGES[\s\S]*CANCEL|Final proposed changes[\s\S]*CANCEL[\s\S]*APPROVE CHANGES/);
assert.equal(context.alter2Applied, true, 'F. explicit approval applies the proposal');
assert.deepEqual([...context.alter2AppliedDates], ['2026-10-24'], 'approval changes only proposed dates');
assert.match(context.alter2AppliedPlan, /Tijuana skipped/);
assert.equal(run("state.days['2026-09-22']"), undefined);

assert.equal(run("alter2ProtectedCommitments().filter(item=>item.multiNight).map(item=>item.date).join(',')"), '2026-09-22,2026-09-23', 'G. both nights of the booking are protected');
run("globalThis.checkoutDepartureBefore=JSON.stringify(state); globalThis.checkoutDepartureStorageBefore=JSON.stringify(localStorage.data); globalThis.checkoutDeparture=analyseAlter2Request('Leave New Orleans on 24 September and drive toward Texas'); globalThis.checkoutDepartureAfter=JSON.stringify(state); globalThis.checkoutDepartureStorageAfter=JSON.stringify(localStorage.data); globalThis.occupiedNightDeparture=analyseAlter2Request('Leave New Orleans on 23 September and drive toward Texas')");
assert.equal(context.checkoutDeparture.target, '2026-09-24');
assert.notEqual(context.checkoutDeparture.status, 'RED', `24 Sep checkout/departure is not blocked by the 22–24 Sep accommodation booking: ${JSON.stringify(context.checkoutDeparture)}`);
assert.doesNotMatch(context.checkoutDeparture.summary, /French Quarter|touch(?:es|ing) a protected/i);
assert.equal(context.checkoutDeparture.affected.some(item => item.date === '2026-09-24' && item.locked), false);
assert.equal(context.checkoutDeparture.kind, 'departure-travel');
assert.equal(context.checkoutDeparture.scannedDays, 57, 'departure planning scans the complete current itinerary');
assert.deepEqual([...context.checkoutDeparture.changes.map(change=>change.date)], ['2026-09-24','2026-09-25']);
assert.deepEqual([...context.checkoutDeparture.routeLegs.map(leg=>`${leg.origin} -> ${leg.destination}`)], ['NEW ORLEANS -> Beaumont, Texas','Beaumont, Texas -> Mason, Texas']);
assert.match(context.checkoutDeparture.changes[0].changes.plan, /30-ft RV[\s\S]*fuel[\s\S]*rest[\s\S]*setup/i);
assert.doesNotMatch(context.checkoutDeparture.changes[0].changes.plan, /User-approved change:/i, 'the command is converted into a coherent travel day rather than appended verbatim');
assert.equal(context.checkoutDeparture.changes[0].bookingContext.confirmation, '2026075827');
assert.ok(context.checkoutDeparture.changes.every(change=>change.overnightOptions.length>=3));
assert.ok(context.checkoutDeparture.changes.flatMap(change=>change.overnightOptions).every(option=>!/\bavailable\b|availability (?:is )?confirmed/i.test(option.detail||'')), 'suggestions do not claim verified availability');
assert.equal(context.checkoutDeparture.affected.some(item=>item.date==='2026-09-26'), true, 'following Hill Country day is scanned for continuity without being rewritten');
assert.equal(context.checkoutDepartureBefore, context.checkoutDepartureAfter, 'departure impact analysis does not mutate itinerary state');
assert.equal(context.checkoutDepartureStorageBefore, context.checkoutDepartureStorageAfter, 'departure impact analysis does not write localStorage');
assert.equal(context.occupiedNightDeparture.target, '2026-09-23');
assert.equal(context.occupiedNightDeparture.status, 'RED', '23 Sep remains protected as an occupied booking night');
assert.match(context.occupiedNightDeparture.summary, /protected commitment/i);
run("state={}; localStorage.removeItem(STORE); document.getElementById('alter2Command').value='Leave New Orleans on 24 September and drive toward Texas'; globalThis.checkoutButtonStateBefore=JSON.stringify(state); globalThis.checkoutButtonStorageBefore=JSON.stringify(localStorage.data); submitAlter2Command(); globalThis.checkoutButtonImpact=alter2Pending; globalThis.checkoutButtonImpactHtml=document.getElementById('alterModal').innerHTML");
assert.equal(context.checkoutButtonImpact.kind, 'departure-travel', 'the actual command-submit path invokes the flexible travel-day planner');
assert.deepEqual([...context.checkoutButtonImpact.changes.map(change=>change.date)], ['2026-09-24','2026-09-25']);
assert.doesNotMatch(context.checkoutButtonImpactHtml, /flexible date matched/i, 'Impact Result describes the constructed plan rather than a generic date match');
assert.doesNotMatch(context.checkoutButtonImpact.changes.map(change=>change.changes.plan).join('\n'), /User-approved change:/i);
assert.equal(run('JSON.stringify(state)'), context.checkoutButtonStateBefore);
assert.equal(JSON.stringify(localStorage.data), context.checkoutButtonStorageBefore, 'command submission does not write localStorage');
run("state={}; localStorage.removeItem(STORE); renderAlter2Analysis(analyseAlter2Request('Move the confirmed French Quarter accommodation.')); globalThis.alter2RedBefore=JSON.stringify(state); showAlter2FinalProposal(); globalThis.alter2RedApply=approveAlter2Changes(); globalThis.alter2RedAfter=JSON.stringify(state)");
assert.equal(context.alter2RedApply, false);
assert.equal(context.alter2RedAfter, context.alter2RedBefore);

run("globalThis.alter2Continuity=analyseAlter2Request('Change this overnight to Parkers Crossroads.')");
assert.equal(context.alter2Continuity.status, 'YELLOW', 'H. a changed location triggers continuity review');
assert.ok(context.alter2Continuity.affected.length >= 2);
assert.match(context.alter2Continuity.affected[1].reason, /Next-day origin/);
assert.equal(context.alter2Continuity.requiresRouteVerification, true);

run("state={}; localStorage.removeItem(STORE); globalThis.overnightMaster=mergedDays().find(day=>day.date==='2026-09-06'); globalThis.overnightBefore=JSON.stringify(state); beginOvernightAlter2('2026-09-06',0); globalThis.overnightAnalysis=alter2Pending; globalThis.overnightAfterAnalysis=JSON.stringify(state)");
assert.equal(context.overnightAnalysis.kind, 'overnight', 'I. Use this stop enters Alter Trip 2.0');
assert.equal(context.overnightAnalysis.status, 'GREEN');
assert.equal(context.overnightAfterAnalysis, context.overnightBefore, 'overnight analysis does not write state');
assert.match(modal.innerHTML, /Four Mile Creek State Park[\s\S]*Nothing has changed/);
assert.match(run("dayCard(mergedDays().find(day=>day.date==='2026-09-06'))"), /beginOvernightAlter2\('2026-09-06',0\)/);
run("showAlter2FinalProposal(); globalThis.overnightReview=document.getElementById('alterModal').innerHTML; globalThis.overnightReviewState=JSON.stringify(state); globalThis.overnightReviewStorage=localStorage.getItem(STORE); globalThis.overnightApproved=approveAlter2Changes(); globalThis.overnightSaved=state.days['2026-09-06']; globalThis.overnightRendered=document.getElementById('content').innerHTML");
assert.match(context.overnightReview, /Review Before Approval[\s\S]*DATE:[\s\S]*Sun 6 Sep[\s\S]*CURRENT ROUTE \/ DESTINATION:[\s\S]*WASHINGTON → NIAGARA FALLS[\s\S]*SELECTED OVERNIGHT STOP:[\s\S]*Four Mile Creek State Park[\s\S]*SUGGESTED \/ NOT BOOKED[\s\S]*Availability or overnight permission has NOT been verified/);
assert.equal(context.overnightReviewState, context.overnightBefore, 'review does not write itinerary state');
assert.equal(context.overnightReviewStorage, null, 'review does not write localStorage');
assert.equal(context.overnightApproved, true);
assert.equal(context.overnightSaved.overnightSelection.name, 'Four Mile Creek State Park');
assert.equal(context.overnightSaved.overnightSelection.status, 'SUGGESTED / NOT BOOKED');
assert.equal(context.overnightSaved.overnightSelection.availabilityVerified, false);
assert.equal(context.overnightSaved.plan, undefined, 'approval does not overwrite Plan / Logistics');
assert.equal(context.overnightSaved.contact, undefined, 'approval does not overwrite Contact / address');
assert.equal(context.overnightSaved.status, undefined, 'selecting a suggestion never upgrades booking status');
assert.equal((context.overnightRendered.match(/<article class="card/g)||[]).length, 57, 'all 57 days render after overnight approval');

assert.equal(run("DAYS.find(day=>day.date==='2026-09-22').status"), 'CONFIRMED', 'J. first New Orleans booked night remains confirmed');
assert.equal(run("DAYS.find(day=>day.date==='2026-09-23').status"), 'CONFIRMED', 'J. second New Orleans booked night remains confirmed');
assert.match(run("DAYS.find(day=>day.date==='2026-09-22').plan"), /Confirmation 2026075827/);
assert.match(run("DAYS.find(day=>day.date==='2026-09-23').plan"), /Confirmation 2026075827/);

// A departure requested during the second occupied French Quarter night is RED
// until the separate protected-booking release flow is explicitly completed.
run("state={}; localStorage.removeItem(STORE); globalThis.fq23Command='Leave New Orleans on 23 September and drive toward Texas.'; globalThis.fq23StateBefore=JSON.stringify(state); globalThis.fq23StorageBefore=JSON.stringify(localStorage.data); globalThis.fq23BookingsBefore=JSON.stringify(CONFIRMED_BOOKING_WINDOWS); globalThis.fq23Analysis=analyseAlter2Request(globalThis.fq23Command); globalThis.fq23StateAfterScan=JSON.stringify(state); globalThis.fq23StorageAfterScan=JSON.stringify(localStorage.data)");
assert.equal(context.fq23Analysis.status, 'RED');
assert.equal(context.fq23Analysis.target, '2026-09-23');
assert.deepEqual([...context.fq23Analysis.affected.map(item=>item.date)], ['2026-09-23']);
assert.equal(context.fq23Analysis.affected[0].locked, true, '23 Sep is identified as a protected occupied night');
assert.equal(run("!!confirmedBookingNight('2026-09-22')"), true);
assert.equal(run("!!confirmedBookingNight('2026-09-23')"), true);
assert.equal(run("!!confirmedBookingNight('2026-09-24')"), false, '24 Sep remains checkout/departure');
assert.match(run("CONFIRMED_BOOKING_WINDOWS.find(item=>item.checkIn==='2026-09-22'&&item.checkOut==='2026-09-24').name"), /French Quarter RV Resort/);
assert.equal(context.fq23StateAfterScan, context.fq23StateBefore, 'command entry and impact scan do not mutate itinerary state');
assert.equal(context.fq23StorageAfterScan, context.fq23StorageBefore, 'command entry and impact scan do not mutate localStorage');
run("renderAlter2Analysis(globalThis.fq23Analysis); globalThis.fq23ImpactHtml=document.getElementById('alterModal').innerHTML; globalThis.fq23StateAfterImpact=JSON.stringify(state); showAlter2FinalProposal(); globalThis.fq23ReviewHtml=document.getElementById('alterModal').innerHTML; globalThis.fq23Ready=alter2ApprovalReady(globalThis.fq23Analysis); globalThis.fq23Approval=approveAlter2Changes(); globalThis.fq23StateAfterReview=JSON.stringify(state); globalThis.fq23StorageAfterReview=JSON.stringify(localStorage.data)");
assert.match(context.fq23ImpactHtml, /RED[\s\S]*Wed 23 Sep[\s\S]*PROTECTED COMMITMENT/);
assert.equal(context.fq23Ready, false, 'MAKE A CHANGE cannot become approvable before protected-booking release');
assert.equal(context.fq23Approval, false, 'approval is blocked before protected-booking release');
assert.match(context.fq23ReviewHtml, /RED: protected commitments cannot be changed automatically[\s\S]*APPROVE CHANGES/);
assert.equal(context.fq23StateAfterImpact, context.fq23StateBefore);
assert.equal(context.fq23StateAfterReview, context.fq23StateBefore, 'impact, repair/review and blocked approval leave state unchanged');
assert.equal(context.fq23StorageAfterReview, context.fq23StorageBefore, 'impact, repair/review and blocked approval leave localStorage unchanged');
run("renderAlter2Analysis(globalThis.fq23Analysis); leaveAlter2(); renderHome(); globalThis.fq23AfterLeaveState=JSON.stringify(state); globalThis.fq23AfterLeaveStorage=JSON.stringify(localStorage.data); globalThis.fq23Cards=(document.getElementById('content').innerHTML.match(/<article class=\"card/g)||[]).length; globalThis.fq23BookingsAfter=JSON.stringify(CONFIRMED_BOOKING_WINDOWS); resetEdits(); globalThis.fq23Reset23=mergedDays().find(day=>day.date==='2026-09-23')");
assert.equal(context.fq23AfterLeaveState, context.fq23StateBefore, 'LEAVE IT exits with itinerary state unchanged');
assert.equal(context.fq23AfterLeaveStorage, context.fq23StorageBefore, 'LEAVE IT exits with localStorage unchanged');
assert.equal(context.fq23Cards, 57, 'all 57 itinerary day cards still render after leaving the RED request');
assert.equal(context.fq23BookingsAfter, context.fq23BookingsBefore, 'confirmed booking definitions remain byte-for-byte unchanged');
assert.match(context.fq23Reset23.plan, /French Quarter RV Resort[\s\S]*Confirmation 2026075827/, 'Reset Edits still restores the protected master itinerary');

assert.match(html, /\.alter2-grid\{display:grid;grid-template-columns:repeat\(auto-fit,minmax\(250px,1fr\)\)/, 'Alter Trip 2.0 is responsive on desktop/tablet');
assert.match(html, /@media\(max-width:720px\)\{\.alter2-grid\{grid-template-columns:1fr\}/, 'Alter Trip 2.0 collapses safely on phones');
assert.match(html, /\.alter2-warning\{[^}]*display:block[^}]*width:100%[^}]*max-width:100%[^}]*height:auto[^}]*white-space:normal[^}]*overflow-wrap:anywhere[^}]*line-height:1\.4[^}]*padding:10px/, 'Alter Trip warnings expand, wrap and retain padding at desktop/tablet widths');
assert.match(html, /@media\(max-width:720px\)\{\.alter2-grid\{grid-template-columns:1fr\}\.alter2-status strong\{font-size:18px\}\.alter2-warning\{position:static;width:100%;padding:10px;margin:8px 0\}/, 'Alter Trip warnings remain in normal flow and full-width on phones');
assert.match(html, /\.alter2-route-component\{min-width:0;max-width:100%\}/, 'overnight review cards allow warning content to shrink without horizontal overflow');

async function runRouteIntelligenceAsyncTests() {
  // Mapbox and planning retain minutes internally; only visible text is formatted.
  assert.equal(run('formatDrivingDuration(372)'), '6 hr 12 min');
  assert.equal(run('formatDrivingDuration(203)'), '3 hr 23 min');
  assert.equal(run('formatDrivingDuration(394)'), '6 hr 34 min');
  assert.equal(run('formatDrivingDuration(60)'), '1 hr');
  assert.equal(run('formatDrivingDuration(45)'), '45 min');

  // A flexible checkout-day command is reconstructed into verified RV travel days before approval.
  run("globalThis.checkoutTravel=analyseAlter2Request('Leave New Orleans on 24 September and drive toward Texas'); globalThis.checkoutTravelStateBefore=JSON.stringify(state); globalThis.checkoutTravelStorageBefore=JSON.stringify(localStorage.data); globalThis.checkoutRouteCalls=[]; globalThis.checkoutRouteIntelligence={async resolveAsync({origin,destination}){globalThis.checkoutRouteCalls.push(origin.key+'>'+destination.key);let values={'new orleans>beaumont':[445,285],'beaumont>mason':[570,390]}[origin.key+'>'+destination.key];return values?{reliable:true,distanceKm:values[0],durationMinutes:values[1],origin,destination,geometry:{type:'LineString',coordinates:[origin.coordinates,destination.coordinates]},waypoints:[],source:'mapbox-directions'}:{reliable:false}}}");
  const checkoutRouteStatus = await run("verifyAlter2Routes(globalThis.checkoutTravel,{routeIntelligence:globalThis.checkoutRouteIntelligence})");
  assert.equal(checkoutRouteStatus.status, 'verified');
  assert.deepEqual(Array.from(checkoutRouteStatus.legs.map(leg=>[leg.origin,leg.destination,leg.distanceKm,leg.durationMinutes,leg.pressure])), [['NEW ORLEANS','Beaumont, Texas',445,285,'GREEN'],['Beaumont, Texas','Mason, Texas',570,390,'YELLOW']]);
  assert.equal(context.checkoutRouteCalls.some(call=>call.includes('birmingham')), false, 'checkout balancing never asks for a Birmingham/backtracking route');
  assert.equal(run("alter2ForwardRouteSequence('NEW ORLEANS','Mason, Texas',globalThis.checkoutTravel.routeVerification.legs)"), true, 'every selected leg progresses through the westbound corridor');
  assert.equal(run('alter2ApprovalReady(globalThis.checkoutTravel)'), true, 'only the fully verified non-RED departure sequence becomes approval-ready');
  const checkoutReview = run('renderAlter2ChangeRows(globalThis.checkoutTravel)');
  assert.equal((checkoutReview.match(/class="findOption alter2-diff"/g)||[]).length, 2, 'review lists exactly the two proposed changed days');
  assert.match(checkoutReview, /Thu 24 Sep — NEW ORLEANS → Beaumont, Texas[\s\S]*445 km[\s\S]*4 hr 45 min[\s\S]*GREEN/);
  assert.match(checkoutReview, /Fri 25 Sep — Beaumont, Texas → Mason, Texas[\s\S]*570 km[\s\S]*6 hr 30 min[\s\S]*YELLOW/);
  assert.doesNotMatch(checkoutReview, /protected New Orleans booking (?:ahead|is reached)|before (?:the )?protected New Orleans/i);
  assert.match(checkoutReview, /CONFIRMED \/ BOOKED — UNCHANGED[\s\S]*French Quarter RV Resort[\s\S]*Confirmation 2026075827/);
  assert.match(checkoutReview, /OVERNIGHT OPTIONS — SUGGESTED \/ NOT BOOKED/);
  assert.match(checkoutReview, /Availability has not been verified[\s\S]*30-ft RV/);
  assert.match(checkoutReview, /CHECK BEFORE ARRIVAL/);
  assert.doesNotMatch(checkoutReview, /availability (?:is )?confirmed/i);
  assert.equal(run("state.days&&state.days['2026-09-24']"), undefined, 'verified review does not write the checkout day');
  assert.equal(run("state.days&&state.days['2026-09-25']"), undefined, 'verified review does not write the following day');
  assert.equal(run('JSON.stringify(state)'), context.checkoutTravelStateBefore);
  assert.equal(JSON.stringify(localStorage.data), context.checkoutTravelStorageBefore, 'verified departure review does not write localStorage');
  assert.equal(run("DAYS.find(day=>day.date==='2026-09-22').status"), 'CONFIRMED');
  assert.equal(run("DAYS.find(day=>day.date==='2026-09-23').status"), 'CONFIRMED');

  // A failed departure balance cannot fall back to the global Birmingham repair candidate.
  run("globalThis.backwardCheckout={...globalThis.checkoutTravel,routeSafety:{redDays:[{date:'2026-09-25',distanceKm:1455.5,durationMinutes:655}]},routeVerification:{status:'verified',legs:[{origin:'NEW ORLEANS',destination:'Henderson, Louisiana',verification:'verified',distanceKm:214,durationMinutes:150,pressure:'GREEN'},{origin:'Henderson, Louisiana',destination:'Birmingham',verification:'verified',distanceKm:700,durationMinutes:470,pressure:'YELLOW'},{origin:'Birmingham',destination:'Mason, Texas',verification:'verified',distanceKm:1455.5,durationMinutes:655,pressure:'RED'}]},requiresRouteVerification:false,repairs:null,selectedRepairIndex:undefined}");
  const backwardRepairs = await run("alter2GenerateRepairSuggestions(globalThis.backwardCheckout,{routeIntelligence:globalThis.checkoutRouteIntelligence})");
  assert.equal(backwardRepairs.length, 1);
  assert.equal(backwardRepairs[0].id, 'keep-original');
  assert.doesNotMatch(JSON.stringify(backwardRepairs), /Birmingham/i, 'backward/eastward repair stops are never generated for the Texas departure command');
  assert.doesNotMatch(JSON.stringify(backwardRepairs), /protected New Orleans booking (?:ahead|is reached)|before (?:the )?protected New Orleans/i);
  assert.equal(run('alter2ApprovalReady(globalThis.backwardCheckout)'), false, 'a backward or RED departure repair cannot become approval-ready');

  // Approval reconciles the following local day and week header without changing the master itinerary.
  run("state={}; localStorage.removeItem(STORE); alter2Pending=globalThis.checkoutTravel; globalThis.checkoutApproved=approveAlter2Changes(); globalThis.checkoutApproved24=mergedDays().find(day=>day.date==='2026-09-24'); globalThis.checkoutApproved25=mergedDays().find(day=>day.date==='2026-09-25'); globalThis.checkoutApproved26=mergedDays().find(day=>day.date==='2026-09-26'); globalThis.checkoutWeek4Route=state.weekRoutes[4]; globalThis.checkoutApprovedStorage=localStorage.getItem(STORE); globalThis.checkoutMaster26=DAYS.find(day=>day.date==='2026-09-26'); globalThis.checkoutHomeHtml=document.getElementById('app').innerHTML");
  assert.equal(context.checkoutApproved, true);
  assert.match(context.checkoutApproved24.dest, /NEW ORLEANS → Beaumont, Texas/);
  assert.match(context.checkoutApproved25.dest, /Beaumont, Texas → Mason, Texas/);
  assert.equal(context.checkoutApproved26.weather, '17–28°C • LOCAL', 'the following relaxed day no longer carries the stale Houston distance');
  assert.doesNotMatch([context.checkoutApproved24,context.checkoutApproved25,context.checkoutApproved26].map(day=>[day.dest,day.weather,day.dest_query,day.route].join(' ')).join('\n'), /Houston/i, '24–26 Sep route display metadata contains no stale Houston origin');
  assert.match(context.checkoutWeek4Route, /MEMPHIS → NEW ORLEANS → Beaumont, Texas → Mason, Texas → TEXAS HILL COUNTRY/i);
  assert.doesNotMatch(context.checkoutWeek4Route, /Houston/i);
  assert.match(context.checkoutHomeHtml, /Houston is <b>skipped<\/b>/i, 'the intentional trip-decision rule remains visible');
  assert.equal(context.checkoutMaster26.weather, '17–28°C • ~570 km from Houston', 'the immutable master itinerary remains available to Reset Edits');
  assert.equal(run("state.days['2026-09-22']"), undefined);
  assert.equal(run("state.days['2026-09-23']"), undefined);
  assert.match(context.checkoutApprovedStorage, /17–28°C • LOCAL/);
  run("resetEdits(); globalThis.checkoutReset26=mergedDays().find(day=>day.date==='2026-09-26'); globalThis.checkoutResetWeekRoute=state.weekRoutes");
  assert.equal(context.checkoutReset26.weather, '17–28°C • ~570 km from Houston', 'Reset Edits restores the original downstream master text');
  assert.equal(context.checkoutResetWeekRoute, undefined, 'Reset Edits clears the approved week-route override');

  // Existing phones may hold an approval created before downstream reconciliation existed.
  run("state={days:{}}; for(let change of globalThis.checkoutTravel.changes){state.days[change.date]=alter2CommittedValue({...change.changes,...alter2VerifiedRoutePatch(globalThis.checkoutTravel,change)})} localStorage.setItem(STORE,JSON.stringify(state)); globalThis.legacyApprovedStateBefore=JSON.stringify(state); globalThis.legacyRendered26=mergedDays().find(day=>day.date==='2026-09-26'); globalThis.legacyRendered26Card=dayCard(globalThis.legacyRendered26); globalThis.legacyApprovedStateAfter=JSON.stringify(state); globalThis.legacyApprovedStorageAfter=localStorage.getItem(STORE)");
  assert.equal(run("state.days['2026-09-26']"), undefined, 'legacy approved state reproduces the missing persisted day-26 patch');
  assert.equal(context.legacyRendered26.weather, '17–28°C • LOCAL', 'render-time compatibility fixes an already-approved legacy route');
  assert.doesNotMatch(context.legacyRendered26Card.match(/<div class="cardhead">[\s\S]*?<\/div><div class="grid">/)[0], /Houston|~570 km/i, 'the actual Saturday card header contains no stale Houston distance');
  assert.match(context.legacyRendered26Card, /17–28°C • LOCAL[\s\S]*Pressure: EASY/);
  assert.equal(context.legacyApprovedStateAfter, context.legacyApprovedStateBefore, 'render reconciliation does not mutate itinerary state');
  assert.equal(context.legacyApprovedStorageAfter, JSON.stringify(JSON.parse(context.legacyApprovedStateBefore)), 'render reconciliation does not write localStorage');
  run("resetEdits(); globalThis.legacyReset26=mergedDays().find(day=>day.date==='2026-09-26')");
  assert.equal(context.legacyReset26.weather, '17–28°C • ~570 km from Houston');

  // Rebalancing an approved flexible route scans 24–26 Sep, verifies both changed
  // legs, rejects RED candidates and retains the Texas Hill Country objective.
  run("state={days:{}}; for(let change of globalThis.checkoutTravel.changes){state.days[change.date]=alter2CommittedValue({...change.changes,...alter2VerifiedRoutePatch(globalThis.checkoutTravel,change)})} localStorage.setItem(STORE,JSON.stringify(state)); globalThis.halfwayStateBefore=JSON.stringify(state); globalThis.halfwayStorageBefore=localStorage.getItem(STORE); globalThis.halfwayBookingsBefore=JSON.stringify(CONFIRMED_BOOKING_WINDOWS); globalThis.halfwayLaterBefore=JSON.stringify(mergedDays().filter(day=>day.date>='2026-09-27')); globalThis.halfwayRequest='On 24 September, drive farther west than the current overnight and rebalance 24–26 September so the two driving days are as even as practical before the Texas Hill Country day.'; globalThis.halfwayAnalysis=analyseAlter2Request(globalThis.halfwayRequest); globalThis.halfwayStateAfterAnalysis=JSON.stringify(state); globalThis.halfwayStorageAfterAnalysis=localStorage.getItem(STORE); globalThis.halfwayCalls=[]; globalThis.halfwayRoutes={async resolveAsync({origin,destination}){globalThis.halfwayCalls.push(origin.key+'>'+destination.key);let values={'new orleans>winnie':[481.4,274],'winnie>mason':[545,360],'new orleans>henderson':[214,150],'henderson>mason':[811.9,500]}[origin.key+'>'+destination.key];return values?{reliable:true,distanceKm:values[0],durationMinutes:values[1],origin,destination,geometry:{type:'LineString',coordinates:[origin.coordinates,destination.coordinates]},waypoints:[],source:'mapbox-directions'}:{reliable:false}}}");
  assert.equal(context.halfwayAnalysis.kind, 'route-balance');
  assert.equal(context.halfwayAnalysis.scannedDays, 57);
  assert.deepEqual([...context.halfwayAnalysis.affected.map(item=>item.date)], ['2026-09-24','2026-09-25','2026-09-26']);
  assert.deepEqual([...context.halfwayAnalysis.changes.map(change=>change.date)], ['2026-09-24','2026-09-25']);
  assert.match(context.halfwayAnalysis.affected[2].reason, /Continuity checked[\s\S]*Texas Hill Country/i);
  assert.match(context.halfwayAnalysis.summary, /overnight is the variable to optimise[\s\S]*Mason, Texas remains/i);
  assert.equal(context.halfwayStateAfterAnalysis, context.halfwayStateBefore);
  assert.equal(context.halfwayStorageAfterAnalysis, context.halfwayStorageBefore);
  const halfwayStatus = await run("verifyAlter2Routes(globalThis.halfwayAnalysis,{routeIntelligence:globalThis.halfwayRoutes})");
  assert.equal(halfwayStatus.status, 'verified');
  assert.deepEqual([...context.halfwayAnalysis.affected.map(item=>item.date)], ['2026-09-24','2026-09-25','2026-09-26']);
  assert.deepEqual(Array.from(halfwayStatus.legs.map(leg=>[leg.origin,leg.destination,leg.distanceKm,leg.durationMinutes,leg.pressure])), [['NEW ORLEANS','Winnie, Texas',481.4,274,'GREEN'],['Winnie, Texas','Mason, Texas',545,360,'YELLOW']]);
  assert.equal(context.halfwayAnalysis.routeBalanceAttempts.some(attempt=>attempt.candidate==='Henderson, Louisiana'&&!attempt.safe&&attempt.legs.some(leg=>leg.pressure==='RED')), true, 'a RED candidate is rejected when the verified Winnie alternative is non-RED');
  assert.equal(context.halfwayAnalysis.routeBalanceAttempts.some(attempt=>attempt.candidate==='Winnie, Texas'&&attempt.safe), true, 'the selected westbound Winnie split is fully verified and non-RED');
  assert.deepEqual(Array.from(context.halfwayAnalysis.changes.map(change=>change.date)), ['2026-09-24','2026-09-25']);
  assert.match(context.halfwayAnalysis.changes[1].changes.dest, /Winnie, Texas → Mason, Texas/);
  assert.equal(context.halfwayAnalysis.changes.some(change=>change.date==='2026-09-26'), false, 'Saturday and later days are not rewritten');
  assert.equal(run("alter2ForwardRouteSequence('NEW ORLEANS','Mason, Texas',globalThis.halfwayAnalysis.routeVerification.legs)"), true);
  assert.equal(run('alter2ApprovalReady(globalThis.halfwayAnalysis)'), true);
  const halfwayReview = run('renderAlter2ChangeRows(globalThis.halfwayAnalysis)');
  assert.match(halfwayReview, /Thu 24 Sep — NEW ORLEANS → Winnie, Texas[\s\S]*481\.4 km[\s\S]*4 hr 34 min[\s\S]*GREEN/);
  assert.match(halfwayReview, /Fri 25 Sep — Winnie, Texas → Mason, Texas[\s\S]*545 km[\s\S]*6 hr[\s\S]*YELLOW/);
  assert.match(halfwayReview, /PADDED RV TRAVEL:[\s\S]*approximately 6 hr 30 min[\s\S]*PADDED RV TRAVEL:[\s\S]*approximately 8 hr 15 min/);
  assert.doesNotMatch(halfwayReview, /Sat 26 Sep/, 'Review changes only the two driving days; Saturday is continuity-checked only');
  assert.match(halfwayReview, /OVERNIGHT OPTIONS — SUGGESTED \/ NOT BOOKED/);
  assert.equal(run('JSON.stringify(state)'), context.halfwayStateBefore, 'route optimisation and review do not write itinerary state');
  assert.equal(localStorage.getItem('dwajp-trip-v5'), context.halfwayStorageBefore, 'route optimisation and review do not write localStorage');
  assert.equal(run("state.days['2026-09-22']"), undefined);
  assert.equal(run("state.days['2026-09-23']"), undefined);
  run("alter2Pending=globalThis.halfwayAnalysis; globalThis.halfwayApproved=approveAlter2Changes(); globalThis.approvedWinnieDay=mergedDays().find(day=>day.date==='2026-09-24'); globalThis.approvedMasonDay=mergedDays().find(day=>day.date==='2026-09-25'); globalThis.approvedHillCountryDay=mergedDays().find(day=>day.date==='2026-09-26'); globalThis.halfwayBookingsAfter=JSON.stringify(CONFIRMED_BOOKING_WINDOWS); globalThis.halfwayLaterAfter=JSON.stringify(mergedDays().filter(day=>day.date>='2026-09-27')); globalThis.approvedWinnieOvernights=overnightSuggestions(globalThis.approvedWinnieDay); globalThis.approvedMasonOvernights=overnightSuggestions(globalThis.approvedMasonDay); globalThis.approvedWinnieOptions=overnightOptionsForDay(globalThis.approvedWinnieDay)");
  assert.equal(context.halfwayApproved, true);
  assert.match(context.approvedWinnieDay.dest, /Winnie, Texas/);
  assert.match(context.approvedMasonDay.dest, /Winnie, Texas → Mason, Texas/);
  assert.match(context.approvedHillCountryDay.dest, /TEXAS HILL COUNTRY/);
  assert.equal(context.halfwayBookingsAfter, context.halfwayBookingsBefore, 'confirmed bookings remain byte-for-byte unchanged');
  assert.equal(context.halfwayLaterAfter, context.halfwayLaterBefore, '27 Sep and later itinerary days remain byte-for-byte unchanged');
  assert.match(context.approvedWinnieOvernights, /Winnie, Texas RV park \/ campground search[\s\S]*Public campground search near Winnie, Texas[\s\S]*Authorised overnight RV parking near Winnie, Texas/);
  assert.match(context.approvedWinnieOvernights, /query=Winnie%2C%20Texas|near%20Winnie%2C%20Texas/);
  assert.doesNotMatch(context.approvedWinnieOvernights, /Dos Rios|Hill Country State Natural Area|Walmart near the selected Hill Country route/i, 'approved Winnie day cannot retain Mason/Hill Country cards');
  assert.equal(context.approvedWinnieOptions.some(option=>option.phone||/\bavailable\b|availability (?:is )?confirmed/i.test(option.detail||'')), false, 'generic Winnie leads invent no phone or availability');
  assert.match(context.approvedMasonOvernights, /Mason, Texas RV park \/ campground search[\s\S]*Public campground search near Mason, Texas/, 'Friday retains destination-appropriate Mason suggestions');
  assert.doesNotMatch(context.approvedMasonOvernights, /Winnie/i);
  assert.match(context.approvedWinnieOvernights, /USE THIS STOP/);
  assert.match(context.approvedMasonOvernights, /USE THIS STOP/);
  run("globalThis.masonUseStateBefore=JSON.stringify(state); beginOvernightAlter2('2026-09-25',0); showAlter2FinalProposal(); globalThis.masonUseReview=document.getElementById('alterModal').innerHTML; cancelAlter2(); globalThis.masonUseStateAfter=JSON.stringify(state)");
  assert.match(context.masonUseReview, /Fri 25 Sep[\s\S]*Winnie, Texas → Mason, Texas[\s\S]*Mason, Texas RV park \/ campground search[\s\S]*SUGGESTED \/ NOT BOOKED/);
  assert.equal(context.masonUseStateAfter, context.masonUseStateBefore, 'Mason selection review does not write state');
  run("globalThis.winnieUseStateBefore=JSON.stringify(state); globalThis.winnieStorageBefore=localStorage.getItem(STORE); globalThis.winnieDayBefore=JSON.stringify(state.days['2026-09-24']); globalThis.winnieRouteBefore=JSON.stringify(state.days['2026-09-24'].verifiedRoute); globalThis.masonDayBefore=JSON.stringify(state.days['2026-09-25']); globalThis.confirmedWindowsBefore=JSON.stringify(CONFIRMED_BOOKING_WINDOWS); beginOvernightAlter2('2026-09-24',0); globalThis.winnieUseAnalysis=alter2Pending; globalThis.winnieUseStateAfter=JSON.stringify(state); globalThis.winnieStorageAfterSelection=localStorage.getItem(STORE); showAlter2FinalProposal(); globalThis.winnieUseReview=document.getElementById('alterModal').innerHTML; globalThis.winnieUseStorageBeforeApproval=localStorage.getItem(STORE)");
  assert.match(context.winnieUseAnalysis.request, /Winnie, Texas RV park \/ campground search/);
  assert.deepEqual([...context.winnieUseAnalysis.changes.map(change=>change.date)], ['2026-09-24'], 'the overnight review identifies only Thu 24 Sep');
  assert.equal(context.winnieUseStateAfter, context.winnieUseStateBefore, 'the destination-correct Use this stop action still enters approval without writing');
  assert.equal(context.winnieStorageAfterSelection, context.winnieStorageBefore, 'selecting USE THIS STOP leaves localStorage byte-for-byte unchanged');
  assert.match(context.winnieUseReview, /Thu 24 Sep[\s\S]*NEW ORLEANS → Winnie, Texas[\s\S]*Winnie, Texas RV park \/ campground search[\s\S]*Availability or overnight permission has NOT been verified/);
  assert.doesNotMatch(context.winnieUseReview, /Fri 25 Sep/, 'Review Before Approval does not identify Friday as a changed day');
  assert.equal(context.winnieUseStorageBeforeApproval, context.winnieStorageBefore, 'opening Winnie review does not write localStorage');
  run("globalThis.winnieUseApproved=approveAlter2Changes(); globalThis.winnieSelected=state.days['2026-09-24']; globalThis.winnieDayAfterWithoutSelection=JSON.stringify(Object.fromEntries(Object.entries(state.days['2026-09-24']).filter(([key])=>key!=='overnightSelection'))); globalThis.winnieSelectedCard=dayCard(mergedDays().find(day=>day.date==='2026-09-24')); globalThis.masonDayAfter=JSON.stringify(state.days['2026-09-25']); globalThis.confirmedWindowsAfter=JSON.stringify(CONFIRMED_BOOKING_WINDOWS); globalThis.winnieApprovedCards=(document.getElementById('content').innerHTML.match(/<article class=\"card/g)||[]).length");
  assert.equal(context.winnieUseApproved, true);
  assert.equal(context.winnieSelected.dest, 'NEW ORLEANS → Winnie, Texas');
  assert.equal(context.winnieSelected.verifiedRoute.distanceKm, 481.4);
  assert.equal(context.winnieSelected.verifiedRoute.durationMinutes, 274);
  assert.equal(context.winnieSelected.verifiedRoute.verification, 'verified');
  assert.equal(context.winnieSelected.verifiedRoute.pressure, 'GREEN');
  assert.equal(context.winnieSelected.overnightSelection.name, 'Winnie, Texas RV park / campground search');
  assert.equal(context.winnieSelected.overnightSelection.status, 'SUGGESTED / NOT BOOKED');
  assert.equal(context.winnieSelected.overnightSelection.availabilityVerified, false);
  assert.match(context.winnieSelectedCard, /SELECTED OVERNIGHT LEAD — NOT BOOKED[\s\S]*Winnie, Texas RV park \/ campground search/);
  assert.equal(JSON.stringify(context.winnieSelected.verifiedRoute), context.winnieRouteBefore, 'overnight approval preserves the already-verified route result');
  assert.equal(context.winnieDayAfterWithoutSelection, context.winnieDayBefore, 'the selected lead is the only Thu 24 Sep field added by approval');
  assert.equal(context.masonDayAfter, context.masonDayBefore, 'overnight approval leaves the following Mason day byte-for-byte unchanged');
  assert.equal(context.confirmedWindowsAfter, context.confirmedWindowsBefore, 'confirmed booking definitions remain byte-for-byte unchanged');
  assert.equal(context.winnieApprovedCards, 57);
  assert.equal(run("state.days['2026-09-22']"), undefined);
  assert.equal(run("state.days['2026-09-23']"), undefined);
  run("resetEdits(); globalThis.resetSep24=mergedDays().find(day=>day.date==='2026-09-24'); globalThis.resetSep24Overnights=overnightSuggestions(globalThis.resetSep24); globalThis.resetSep24Selection=globalThis.resetSep24.overnightSelection");
  assert.equal(context.resetSep24.dest, 'TEXAS / TRAVEL BUFFER');
  assert.equal(context.resetSep24Selection, undefined, 'Reset Edits removes the selected overnight lead');
  assert.match(context.resetSep24Overnights, /Dos Rios RV Park|Hill Country State Natural Area/, 'Reset Edits restores the original date-based overnight suggestions');

  // The MAKE A CHANGE runtime boundary reconstructs stale generic state, then renders that plan.
  run("state={}; localStorage.removeItem(STORE); globalThis.checkoutRuntimeBefore=JSON.stringify(state); globalThis.checkoutRuntimeStorageBefore=JSON.stringify(localStorage.data); globalThis.checkoutRuntimeCommand='Leave New Orleans on 24 September and drive toward Texas'; alter2Pending={...analyseAlter2Request(globalThis.checkoutRuntimeCommand),kind:'direct',summary:'The flexible date matched.',changes:[{date:'2026-09-24',changes:{plan:'User-approved change: '+globalThis.checkoutRuntimeCommand+'\\nUser-approved change: '+globalThis.checkoutRuntimeCommand},reason:'Matched flexible date.'}],routeLegs:[],requiresRouteVerification:false,routeVerification:null}; globalThis.checkoutRuntimeCalls=[]; RouteIntelligence.setProvider({async routeAsync({origin,destination}){globalThis.checkoutRuntimeCalls.push(origin.key+'>'+destination.key);let values={'new orleans>beaumont':[445,285],'beaumont>mason':[570,390]}[origin.key+'>'+destination.key];return values?{reliable:true,distanceKm:values[0],durationMinutes:values[1],origin,destination,geometry:{type:'LineString',coordinates:[origin.coordinates,destination.coordinates]},waypoints:[],source:'mapbox-directions'}:{reliable:false}}}); showAlter2FinalProposal(); globalThis.checkoutRuntimeInitialHtml=document.getElementById('alterModal').innerHTML");
  await new Promise(resolve => setImmediate(resolve));
  run("globalThis.checkoutRuntimeReview=renderAlter2ChangeRows(alter2Pending); globalThis.checkoutRuntimeKind=alter2Pending.kind; globalThis.checkoutRuntimeDates=alter2Pending.changes.map(change=>change.date); globalThis.checkoutRuntimeReady=alter2ApprovalReady(alter2Pending)");
  assert.equal(context.checkoutRuntimeKind, 'departure-travel', 'MAKE A CHANGE cannot carry stale generic analysis into Review Before Approval');
  assert.deepEqual([...context.checkoutRuntimeDates], ['2026-09-24','2026-09-25']);
  assert.deepEqual([...context.checkoutRuntimeCalls.filter(call=>call==='new orleans>beaumont'||call==='beaumont>mason')], ['new orleans>beaumont','beaumont>mason'], 'the constructed checkout legs are the routes sent for verification');
  assert.match(context.checkoutRuntimeInitialHtml, /Review Before Approval[\s\S]*START:[\s\S]*NEW ORLEANS[\s\S]*DESTINATION \/ STOPPING AREA:[\s\S]*Beaumont, Texas/);
  assert.match(context.checkoutRuntimeReview, /ROUTE:[\s\S]*NEW ORLEANS → Beaumont, Texas[\s\S]*DISTANCE:[\s\S]*445 km[\s\S]*DRIVING TIME:[\s\S]*4 hr 45 min/);
  assert.match(context.checkoutRuntimeReview, /PADDED RV TRAVEL:[\s\S]*fuel, rest and setup allowance[\s\S]*PRESSURE:[\s\S]*GREEN/i);
  assert.match(context.checkoutRuntimeReview, /selected as a validated, manageable first stopping area toward Texas Hill Country[\s\S]*protected commitments/i);
  assert.match(context.checkoutRuntimeReview, /OVERNIGHT OPTIONS — SUGGESTED \/ NOT BOOKED/);
  assert.doesNotMatch(context.checkoutRuntimeReview, /User-approved change:/i, 'Review renders the constructed travel plan instead of appending the command');
  assert.equal(context.checkoutRuntimeReady, true);
  assert.equal(run('JSON.stringify(state)'), context.checkoutRuntimeBefore);
  assert.equal(JSON.stringify(localStorage.data), context.checkoutRuntimeStorageBefore, 'MAKE A CHANGE and route review do not write localStorage');

  // Alter Trip 2.0 final review gates approval on every changed route leg.
  run("state={}; localStorage.removeItem(STORE); globalThis.reviewAnalysis=analyseAlter2Request('Stay another night in Milwaukee.'); renderAlter2Analysis(globalThis.reviewAnalysis); globalThis.pendingStateBefore=JSON.stringify(state); globalThis.pendingStorageBefore=JSON.stringify(localStorage.data); globalThis.pendingRouteResolvers=[]; RouteIntelligence.setProvider({routeAsync(){return new Promise(resolve=>globalThis.pendingRouteResolvers.push(resolve))}}); showAlter2FinalProposal(); globalThis.pendingReviewHtml=document.getElementById('alterModal').innerHTML; globalThis.pendingApply=approveAlter2Changes()");
  assert.match(context.pendingReviewHtml, /ROUTE CHECKING/);
  assert.match(context.pendingReviewHtml, /id="alter2ApproveButton"[\s\S]*disabled/);
  assert.equal(context.pendingApply, false, 'approval is blocked while route verification is pending');
  assert.equal(run('JSON.stringify(state)'), context.pendingStateBefore);
  assert.equal(JSON.stringify(localStorage.data), context.pendingStorageBefore, 'route checking does not mutate localStorage');

  run("globalThis.failedReview=analyseAlter2Request('Stay another night in Milwaukee.'); globalThis.failedReviewBefore=JSON.stringify(state); globalThis.failedStorageBefore=JSON.stringify(localStorage.data); globalThis.failedRouteIntelligence={async resolveAsync(){return {reliable:false,status:'route_confirmation_required'}}}");
  const failedReview = await run('verifyAlter2Routes(globalThis.failedReview,{routeIntelligence:globalThis.failedRouteIntelligence})');
  assert.equal(failedReview.status, 'failed');
  assert.equal(run('alter2RouteCheckReady(globalThis.failedReview)'), false);
  assert.match(run('renderAlter2RouteVerification(globalThis.failedReview)'), /DISTANCE TO VERIFY \/ ROUTE VERIFICATION REQUIRED/);
  assert.equal(run('JSON.stringify(state)'), context.failedReviewBefore);
  assert.equal(JSON.stringify(localStorage.data), context.failedStorageBefore, 'failed verification remains read-only');

  run("globalThis.verifiedReview=analyseAlter2Request('Stay another night in Milwaukee.'); globalThis.verifiedReviewBefore=JSON.stringify(state); globalThis.verifiedStorageBefore=JSON.stringify(localStorage.data); globalThis.reviewRouteCalls=[]; globalThis.verifiedRouteIntelligence={async resolveAsync({origin,destination}){globalThis.reviewRouteCalls.push(origin.label+' -> '+destination.label);return {reliable:true,distanceKm:destination.key==='bloomington'?324.7:688.4,durationMinutes:destination.key==='bloomington'?203:394,origin,destination,geometry:{type:'LineString',coordinates:[origin.coordinates,destination.coordinates]},waypoints:[],source:'mapbox-directions'}}}");
  const verifiedReview = await run('verifyAlter2Routes(globalThis.verifiedReview,{routeIntelligence:globalThis.verifiedRouteIntelligence})');
  assert.equal(verifiedReview.status, 'verified');
  assert.equal(verifiedReview.legs.length, 2, 'every changed Milwaukee travel-chain leg is verified');
  assert.deepEqual(Array.from(context.reviewRouteCalls), ['Milwaukee, Wisconsin -> Bloomington, Illinois', 'Bloomington, Illinois -> Nashville, Tennessee']);
  assert.equal(run('alter2RouteCheckReady(globalThis.verifiedReview)'), true, `approval is enabled only after all required legs verify: ${JSON.stringify({validation:context.verifiedReview.proposalValidation,safety:context.verifiedReview.routeSafety,verification:context.verifiedReview.routeVerification})}`);
  const verifiedReviewHtml = run('renderAlter2RouteVerification(globalThis.verifiedReview)');
  assert.match(verifiedReviewHtml, /Milwaukee → Bloomington[\s\S]*324\.7 km[\s\S]*3 hr 23 min[\s\S]*VERIFIED[\s\S]*(GREEN|YELLOW|RED)/);
  assert.match(verifiedReviewHtml, /Bloomington → Nashville[\s\S]*688\.4 km[\s\S]*6 hr 34 min[\s\S]*VERIFIED/);
  run("alter2Pending=globalThis.verifiedReview; showAlter2FinalProposal(); globalThis.verifiedFinalHtml=document.getElementById('alterModal').innerHTML");
  assert.doesNotMatch(context.verifiedFinalHtml, /id="alter2ApproveButton"[^>]*disabled/, 'the final button is enabled after every route succeeds');
  assert.match(context.verifiedFinalHtml, /ROUTES VERIFIED: all changed driving legs have been checked\./, 'the completed review replaces the checking banner');
  assert.doesNotMatch(context.verifiedFinalHtml, /ROUTE CHECKING/, 'no pending banner remains after all routes verify');
  assert.doesNotMatch(context.verifiedFinalHtml, /REQUIRES ROUTE VERIFICATION/, 'verified changed-day cards remove stale verification placeholders');
  assert.match(context.verifiedFinalHtml, /Tue 15 Sep[\s\S]*ROUTE:[\s\S]*Milwaukee → Bloomington[\s\S]*324\.7 km[\s\S]*3 hr 23 min[\s\S]*VERIFIED[\s\S]*DAY PRESSURE:[\s\S]*GREEN/);
  assert.match(context.verifiedFinalHtml, /Wed 16 Sep[\s\S]*ROUTE:[\s\S]*Bloomington → Nashville[\s\S]*688\.4 km[\s\S]*6 hr 34 min[\s\S]*VERIFIED[\s\S]*DAY PRESSURE:[\s\S]*YELLOW/);
  assert.equal(run('JSON.stringify(state)'), context.verifiedReviewBefore);
  assert.equal(JSON.stringify(localStorage.data), context.verifiedStorageBefore, 'verified review does not mutate localStorage before approval');

  // Approval persists the exact verified route snapshots into only their mapped
  // itinerary days; it does not call the route provider again after approval.
  run("alter2Pending=globalThis.verifiedReview; globalThis.routeCallsBeforeApproval=globalThis.reviewRouteCalls.length; globalThis.verifiedApprovalApplied=approveAlter2Changes(); globalThis.approvedTuesday=mergedDays().find(day=>day.date==='2026-09-15'); globalThis.approvedWednesday=mergedDays().find(day=>day.date==='2026-09-16'); globalThis.approvedTuesdayCard=dayCard(globalThis.approvedTuesday); globalThis.approvedWednesdayCard=dayCard(globalThis.approvedWednesday)");
  assert.equal(context.verifiedApprovalApplied, true);
  assert.equal(context.reviewRouteCalls.length, context.routeCallsBeforeApproval, 'approval reuses verified route objects without another route request');
  assert.equal(context.approvedTuesday.verifiedRoute.distanceKm, 324.7);
  assert.equal(context.approvedTuesday.verifiedRoute.durationMinutes, 203);
  assert.equal(context.approvedTuesday.verifiedRoute.pressure, 'GREEN');
  assert.equal(context.approvedWednesday.verifiedRoute.distanceKm, 688.4);
  assert.equal(context.approvedWednesday.verifiedRoute.durationMinutes, 394);
  assert.equal(context.approvedWednesday.verifiedRoute.pressure, 'YELLOW');
  assert.match(context.approvedTuesdayCard, /MILWAUKEE → BLOOMINGTON[\s\S]*324\.7 km[\s\S]*3 hr 23 min[\s\S]*VERIFIED[\s\S]*Route pressure: GREEN/);
  assert.match(context.approvedWednesdayCard, /BLOOMINGTON → NASHVILLE[\s\S]*688\.4 km[\s\S]*6 hr 34 min[\s\S]*VERIFIED[\s\S]*Route pressure: YELLOW/);
  assert.doesNotMatch(context.approvedTuesdayCard + context.approvedWednesdayCard, /435 km|REQUIRES ROUTE VERIFICATION/);
  assert.equal(run("state.days['2026-09-22']"), undefined, 'confirmed New Orleans booking is untouched by Milwaukee approval');
  assert.equal(run("JSON.parse(localStorage.getItem(STORE)).days['2026-09-15'].verifiedRoute.distanceKm"), 324.7, 'verified route survives persistence');

  // Each later command derives its location from its own wording and the
  // currently approved itinerary, never from the previous Alter Trip request.
  run("globalThis.afterMilwaukeeState=JSON.stringify(state); globalThis.afterMilwaukeeStorage=JSON.stringify(localStorage.data); globalThis.nashvilleProtectedBefore=JSON.stringify(CONFIRMED_BOOKING_WINDOWS); globalThis.nashvilleMasterProtectedBefore=JSON.stringify(DAYS.filter(day=>day.date>='2026-09-22'&&day.date<='2026-09-23')); globalThis.stalePreviousAnalysis=globalThis.verifiedReview; alter2Pending=globalThis.stalePreviousAnalysis; globalThis.nashvilleFresh=analyseAlter2Request('I want an extra day in Nashville. Make it work without changing any confirmed bookings.'); globalThis.afterNashvilleAnalysisState=JSON.stringify(state); globalThis.afterNashvilleAnalysisStorage=JSON.stringify(localStorage.data)");
  assert.equal(context.nashvilleFresh.target, '2026-09-16', 'the current Nashville arrival is the new command anchor');
  assert.equal(context.nashvilleFresh.affected[0].date, '2026-09-16');
  assert.equal(context.nashvilleFresh.affected.at(-1).date, '2026-09-22', 'analysis scans to the next genuine protected commitment');
  assert.ok(context.nashvilleFresh.affected.every(item => item.date >= '2026-09-16'), 'earlier Milwaukee days are excluded');
  assert.match(context.nashvilleFresh.summary, /extra night in nashville/i);
  assert.equal(context.nashvilleFresh.request, 'I want an extra day in Nashville. Make it work without changing any confirmed bookings.');
  assert.equal(context.nashvilleFresh.routeVerification, undefined, 'previous route verification state is not inherited');
  assert.ok(context.nashvilleFresh.routeLegs.length > 0, 'shifted driving legs enter the existing verification stage');
  assert.equal(context.nashvilleFresh.proposalValidation.valid, true, 'the completed Nashville sequence is coherent before review');
  assert.deepEqual(Array.from(context.nashvilleFresh.changes.map(change => change.date)), ['2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21']);
  const nashvilleExtraDay = context.nashvilleFresh.changes[0].changes;
  const memphisTravelDay = context.nashvilleFresh.changes[1].changes;
  const bristolDay = context.nashvilleFresh.changes[2].changes;
  const newOrleansApproach = context.nashvilleFresh.changes[3].changes;
  assert.equal(nashvilleExtraDay.dest.toLowerCase(), 'nashville');
  assert.match(nashvilleExtraDay.plan, /extra night in nashville/i);
  assert.match(nashvilleExtraDay.contact, /Nashville/i);
  assert.doesNotMatch(nashvilleExtraDay.contact, /Memphis/i, 'the extra Nashville day does not inherit the stale Memphis contact');
  assert.match(nashvilleExtraDay.dest_query, /Nashville/i);
  assert.match(memphisTravelDay.dest, /NASHVILLE → MEMPHIS → BRISTOL/i);
  assert.match(memphisTravelDay.plan, /Memphis[\s\S]*GRACELAND[\s\S]*Bristol/i);
  assert.match(memphisTravelDay.contact, /Graceland|Memphis/i);
  assert.match(memphisTravelDay.dest_query, /Bristol/i, 'the multi-stop day queries its final overnight destination');
  assert.equal(bristolDay.dest.toLowerCase(), 'bristol');
  assert.match(bristolDay.plan, /Bristol|Night Race/i);
  assert.match(bristolDay.contact, /Bristol Motor Speedway/i);
  assert.match(bristolDay.dest_query, /Bristol/i);
  assert.doesNotMatch(bristolDay.dest_query, /Memphis/i, 'the shifted Bristol day does not retain its stale original query');
  assert.match(newOrleansApproach.dest, /BRISTOL → NEW ORLEANS/i);
  assert.match(newOrleansApproach.dest_query, /New Orleans/i);
  assert.deepEqual(Array.from(context.nashvilleFresh.routeLegs.map(leg => `${leg.origin} -> ${leg.destination}`)), ['NASHVILLE -> MEMPHIS', 'MEMPHIS -> BRISTOL', 'BRISTOL -> NEW ORLEANS'], 'route legs come from the reconstructed proposed sequence');
  assert.equal(run("state.days['2026-09-22']"), undefined, 'the protected New Orleans booking remains outside proposal writes');
  assert.match(run('renderAlter2ChangeRows(globalThis.nashvilleFresh)'), /Fri 18 Sep — nashville/i, 'review headings display the proposed day rather than the stale current route');
  assert.equal(context.afterNashvilleAnalysisState, context.afterMilwaukeeState, 'Nashville impact analysis does not mutate approved itinerary state');
  assert.equal(context.afterNashvilleAnalysisStorage, context.afterMilwaukeeStorage, 'Nashville impact analysis does not write localStorage');
  assert.equal(run("state.days['2026-09-15'].verifiedRoute.distanceKm"), 324.7, 'approved Milwaukee route data remains present');
  assert.equal(run("state.days['2026-09-16'].verifiedRoute.distanceKm"), 688.4, 'approved Milwaukee downstream route remains present');

  run("globalThis.nashvilleRouteCalls=[]; globalThis.nashvilleRouteIntelligence={async resolveAsync({origin,destination}){globalThis.nashvilleRouteCalls.push({origin,destination});let key=origin.key+'>'+destination.key,values={'nashville>memphis':[332.4,190],'memphis>bristol':[799.1,453],'bristol>new orleans':[1128.3,635],'memphis>birmingham':[370.2,210],'birmingham>new orleans':[538.7,291],'bristol>birmingham':[591.4,339]}[key];return values?{reliable:true,distanceKm:values[0],durationMinutes:values[1],origin,destination,geometry:{type:'LineString',coordinates:[origin.coordinates,destination.coordinates]},waypoints:[],source:'mapbox-directions'}:{reliable:false}}}");
  const nashvilleRouteStatus = await run("verifyAlter2Routes(globalThis.nashvilleFresh,{routeIntelligence:globalThis.nashvilleRouteIntelligence})");
  assert.equal(nashvilleRouteStatus.status, 'verified');
  assert.deepEqual(Array.from(nashvilleRouteStatus.legs.map(leg => [leg.origin, leg.destination, leg.distanceKm, leg.durationMinutes, leg.pressure])), [['NASHVILLE','MEMPHIS',332.4,190,'GREEN'],['MEMPHIS','BRISTOL',799.1,453,'YELLOW'],['BRISTOL','NEW ORLEANS',1128.3,635,'RED']]);
  assert.deepEqual(Array.from(context.nashvilleRouteCalls.slice(0,3).map(call => [call.origin.key, call.destination.key])), [['nashville','memphis'],['memphis','bristol'],['bristol','new orleans']], 'base proposal legs use validated registry coordinates through the existing route provider');
  assert.equal(context.nashvilleRouteCalls.some(call => call.origin.key === 'nashville' && call.destination.key === 'bristol'), false, 'a direct Nashville/Bristol route is never substituted for the Memphis stop');
  assert.equal(run('alter2RouteCheckReady(globalThis.nashvilleFresh)'), false, 'verified but extreme RED driving days remain blocked');
  assert.equal(memphisTravelDay.verifiedRoute.distanceKm, 1131.5, 'multi-stop verified legs aggregate onto the correct Memphis/Bristol proposed day');
  assert.equal(memphisTravelDay.verifiedRoute.durationMinutes, 643);
  assert.equal(memphisTravelDay.verifiedRoute.pressure, 'RED');
  assert.deepEqual(Array.from(memphisTravelDay.verifiedRoute.routeSequence), ['NASHVILLE','MEMPHIS','BRISTOL']);
  assert.deepEqual(Array.from(memphisTravelDay.verifiedRoute.legs.map(leg => `${leg.origin} -> ${leg.destination}`)), ['NASHVILLE -> MEMPHIS','MEMPHIS -> BRISTOL']);
  assert.equal(newOrleansApproach.verifiedRoute.distanceKm, 1128.3, 'the Bristol/New Orleans result maps to the approach day');
  assert.equal(newOrleansApproach.verifiedRoute.durationMinutes, 635);
  assert.equal(newOrleansApproach.verifiedRoute.pressure, 'RED');
  const nashvilleReviewHtml = run('renderAlter2ChangeRows(globalThis.nashvilleFresh)');
  assert.match(nashvilleReviewHtml, /NASHVILLE → MEMPHIS[\s\S]*332\.4 km[\s\S]*3 hr 10 min[\s\S]*VERIFIED[\s\S]*GREEN/);
  assert.match(nashvilleReviewHtml, /MEMPHIS → BRISTOL[\s\S]*799\.1 km[\s\S]*7 hr 33 min[\s\S]*VERIFIED[\s\S]*YELLOW/);
  assert.match(nashvilleReviewHtml, /TOTAL DRIVING:[\s\S]*1131\.5 km[\s\S]*10 hr 43 min[\s\S]*DAY PRESSURE:[\s\S]*RED/);
  assert.doesNotMatch(nashvilleReviewHtml, /VERIFIED ROUTE:[\s\S]*NASHVILLE → BRISTOL/);
  assert.doesNotMatch(nashvilleReviewHtml, /DEST_QUERY:|ROUTE_MAPS:|MAPS:/, 'traveller review hides internal routing fields');
  assert.match(nashvilleReviewHtml, /Nashville Visitor Center<br>/, 'contact line breaks render as line breaks');
  assert.match(run('alter2ReviewBanner(globalThis.nashvilleFresh).text'), /RED DRIVING DAY[\s\S]*buffer day[\s\S]*split the leg/i);
  assert.equal(context.nashvilleFresh.repairStatus, 'ready', 'RED proposal automatically triggers repair generation');
  assert.equal(context.nashvilleFresh.repairs.length, 3);
  const bufferRepair = context.nashvilleFresh.repairs.find(option => option.id === 'use-buffer');
  const overnightRepair = context.nashvilleFresh.repairs.find(option => option.id === 'insert-overnight');
  const keepOriginalRepair = context.nashvilleFresh.repairs.find(option => option.id === 'keep-original');
  assert.equal(bufferRepair.viable, true, 'a safe buffer repair is generated when flexible days are available');
  assert.deepEqual(Array.from(bufferRepair.legs.map(leg => [leg.origin,leg.destination,leg.distanceKm,leg.durationMinutes,leg.pressure])), [['NASHVILLE','MEMPHIS',332.4,190,'GREEN'],['MEMPHIS','Birmingham',370.2,210,'GREEN'],['Birmingham','NEW ORLEANS',538.7,291,'YELLOW']]);
  assert.ok(bufferRepair.legs.every(leg => leg.verification === 'verified' && leg.pressure !== 'RED'), 'every repair leg verifies and recalculates below RED');
  assert.match(bufferRepair.optionalImpact, /OPTIONAL stop removed: BRISTOL/i, 'optional removal is disclosed');
  assert.match(bufferRepair.mustImpact, /MUST Graceland.*preserved/i, 'MUST priority is retained');
  assert.equal(run("lookupLocationCoordinates('Birmingham').status"), 'validated', 'inserted overnight is a validated real city');
  assert.match(bufferRepair.changes.find(change => /NASHVILLE → MEMPHIS/i.test(change.changes.dest)).changes.plan, /GRACELAND/i, 'repair keeps the Graceland plan on its verified day');
  assert.equal(bufferRepair.changes.find(change => /NASHVILLE → MEMPHIS/i.test(change.changes.dest)).changes.status, 'MUST DO', 'MUST status moves with Graceland');
  assert.match(bufferRepair.changes.find(change => /MEMPHIS → Birmingham/i.test(change.changes.dest)).changes.contact, /Birmingham, Alabama[\s\S]*SUGGESTION — NOT BOOKED/);
  assert.match(bufferRepair.changes[0].changes.plan, /extra night in nashville/i, 'selected repair includes the requested extra Nashville night');
  assert.equal(bufferRepair.changes[0].changes.status, 'PLANNED', 'extra Nashville local night does not inherit the shifted MUST status');
  assert.equal(bufferRepair.changes.some(change => change.date === '2026-09-22'), false, 'repair never writes the protected New Orleans day');
  assert.equal(overnightRepair.viable, false, 'retaining Bristol plus an inserted overnight cannot fit before the protected commitment');
  assert.ok(overnightRepair.legs.every(leg => leg.verification === 'verified' && leg.pressure !== 'RED'), 'even the non-viable timing option shows verified component legs');
  assert.match(overnightRepair.failureReason, /cannot fit[\s\S]*protected booking day/i);
  assert.equal(keepOriginalRepair.viable, true);
  const repairHtml = run('renderAlter2RepairOptions(globalThis.nashvilleFresh)');
  assert.match(repairHtml, /RED DRIVING CONFLICT[\s\S]*OPTION 1[\s\S]*RECOMMENDED[\s\S]*OPTIONAL stop removed: BRISTOL[\s\S]*OPTION 2[\s\S]*NOT SAFE TO APPLY[\s\S]*OPTION 3 — KEEP ORIGINAL/i);
  assert.doesNotMatch(repairHtml, /overflow-x|white-space:\s*nowrap/i, 'repair cards retain natural responsive wrapping');
  assert.match(html, /#alterModal \.btn\{min-height:44px/);
  assert.match(html, /@media\(max-width:720px\)[\s\S]*\.alter2-grid\{grid-template-columns:1fr\}/, 'phone repair cards stack naturally');
  assert.equal(run('alter2ApprovalReady(globalThis.nashvilleFresh)'), false, 'unrepaired RED proposal has no approval path');
  run("alter2Pending=globalThis.nashvilleFresh; showAlter2FinalProposal(); globalThis.bufferRepairIndex=globalThis.nashvilleFresh.repairs.findIndex(option=>option.id==='use-buffer'); globalThis.repairSelected=selectAlter2Repair(globalThis.bufferRepairIndex); globalThis.selectedRepairReady=alter2ApprovalReady(globalThis.nashvilleFresh); globalThis.selectedRepairReview=document.getElementById('alter2ChangeRows').innerHTML; globalThis.stateAfterRepairSelection=JSON.stringify(state); globalThis.storageAfterRepairSelection=JSON.stringify(localStorage.data); delete globalThis.nashvilleFresh.selectedRepairIndex");
  assert.equal(context.repairSelected, true);
  assert.equal(context.selectedRepairReady, true, 'only a selected fully verified repair exposes approval readiness');
  assert.equal(context.stateAfterRepairSelection, context.afterMilwaukeeState, 'repair selection does not mutate itinerary state');
  assert.equal(context.storageAfterRepairSelection, context.afterMilwaukeeStorage, 'repair selection does not write localStorage');
  assert.match(context.selectedRepairReview, /Fri 18 Sep — nashville[\s\S]*extra night in nashville/i, 'selected review shows the concrete added Nashville day');
  assert.match(context.selectedRepairReview, /Sat 19 Sep — NASHVILLE → MEMPHIS[\s\S]*332\.4 km[\s\S]*3 hr 10 min[\s\S]*PADDED RV TRAVEL:[\s\S]*4 hr 45 min[\s\S]*GREEN/i);
  assert.match(context.selectedRepairReview, /Sun 20 Sep — MEMPHIS → Birmingham[\s\S]*370\.2 km[\s\S]*3 hr 30 min[\s\S]*PADDED RV TRAVEL:[\s\S]*5 hr 10 min[\s\S]*GREEN/i);
  assert.match(context.selectedRepairReview, /Mon 21 Sep — Birmingham → NEW ORLEANS[\s\S]*538\.7 km[\s\S]*4 hr 51 min[\s\S]*PADDED RV TRAVEL:[\s\S]*6 hr 50 min[\s\S]*YELLOW/i);
  assert.match(context.selectedRepairReview, /OPTIONAL stop removed: BRISTOL/i, 'day-by-day review explicitly discloses the sacrificed OPTIONAL Bristol stop');
  assert.doesNotMatch(context.selectedRepairReview, /Tue 22 Sep/, 'the protected New Orleans check-in day is not proposed for write-back');
  run("alter2Pending=globalThis.nashvilleFresh; selectAlter2Repair(globalThis.bufferRepairIndex); globalThis.repairReviewPlan=alter2SelectedRepair(globalThis.nashvilleFresh).changes[0].changes.plan; globalThis.safeRepairApplied=approveAlter2Changes(); globalThis.committedRepairPlans=Object.values(state.days).map(day=>day.plan||'').join('\\n'); globalThis.committedRepairStorage=localStorage.getItem(STORE); globalThis.nashvilleApproved19=mergedDays().find(day=>day.date==='2026-09-19'); globalThis.nashvilleApproved20=mergedDays().find(day=>day.date==='2026-09-20'); globalThis.nashvilleApproved21=mergedDays().find(day=>day.date==='2026-09-21'); globalThis.nashvilleApproved19Card=dayCard(globalThis.nashvilleApproved19); globalThis.nashvilleProtectedAfter=JSON.stringify(CONFIRMED_BOOKING_WINDOWS); globalThis.nashvilleMasterProtectedAfter=JSON.stringify(DAYS.filter(day=>day.date>='2026-09-22'&&day.date<='2026-09-23')); globalThis.nashvilleApprovedCards=(document.getElementById('content').innerHTML.match(/<article class=\"card/g)||[]).length");
  assert.match(context.repairReviewPlan, /PROPOSED ONLY/i, 'proposal-only wording remains visible in repair review before approval');
  assert.equal(context.safeRepairApplied, true, 'the selected fully verified non-RED repair can be approved');
  assert.doesNotMatch(context.committedRepairPlans, /PROPOSED ONLY/i, 'approved repair write-back removes proposal-only wording');
  assert.doesNotMatch(context.committedRepairStorage, /PROPOSED ONLY/i, 'persisted approved repair data contains no proposal-only wording');
  assert.match(context.committedRepairStorage, /SUGGESTION — NOT BOOKED/i, 'unconfirmed overnight wording remains explicit after approval');
  assert.equal(context.nashvilleApproved19.dest, 'NASHVILLE → MEMPHIS');
  assert.equal(context.nashvilleApproved19.verifiedRoute.distanceKm, 332.4);
  assert.equal(context.nashvilleApproved19.verifiedRoute.durationMinutes, 190);
  assert.equal(context.nashvilleApproved19.verifiedRoute.pressure, 'GREEN');
  assert.equal(context.nashvilleApproved19.verifiedRoute.verification, 'verified');
  assert.doesNotMatch(context.nashvilleApproved19Card, /Bristol|Bristol Motor Speedway/i, 'the rendered 19 Sep card contains no stale dropped destination data');
  assert.match(context.nashvilleApproved19Card, /NASHVILLE → MEMPHIS[\s\S]*GRACELAND[\s\S]*Graceland \/ Memphis/i, '19 Sep retains MUST Graceland and destination-appropriate contact content');
  assert.match(context.nashvilleApproved19Card, /query=Memphis|destination=MEMPHIS|near%20MEMPHIS/i, 'maps and overnight searches target Memphis rather than Bristol');
  assert.match(context.nashvilleApproved19.detour, /Graceland only/i);
  assert.equal(context.nashvilleApproved20.dest, 'MEMPHIS → Birmingham');
  assert.equal(context.nashvilleApproved21.dest, 'Birmingham → NEW ORLEANS');
  assert.equal(run("mergedDays().find(day=>day.date==='2026-09-23').dest"), 'NEW ORLEANS', 'repair approval retains the occupied second night as a New Orleans stay');
  assert.equal(run("mergedDays().find(day=>day.date==='2026-09-23').status"), 'CONFIRMED');
  assert.equal(run("state.days['2026-09-22']"), undefined, 'repair approval does not write the confirmed check-in night');
  assert.equal(run("state.days['2026-09-23']"), undefined, 'repair approval does not write the confirmed second night');
  assert.equal(context.nashvilleProtectedAfter, context.nashvilleProtectedBefore, 'confirmed booking windows remain byte-for-byte unchanged');
  assert.equal(context.nashvilleMasterProtectedAfter, context.nashvilleMasterProtectedBefore, '22 Sep onward protected master fields remain byte-for-byte unchanged');
  assert.equal(context.nashvilleApprovedCards, 57, 'all 57 itinerary cards render after approval');
  run("resetEdits(); globalThis.nashvilleReset18=mergedDays().find(day=>day.date==='2026-09-18'); globalThis.nashvilleReset22=mergedDays().find(day=>day.date==='2026-09-22')");
  assert.match(context.nashvilleReset18.dest, /NASHVILLE → MEMPHIS → BRISTOL/, 'Reset Edits restores the original master route');
  assert.equal(context.nashvilleReset22.status, 'CONFIRMED');
  run("state=JSON.parse(globalThis.afterMilwaukeeState); localStorage.data=JSON.parse(globalThis.afterMilwaukeeStorage); delete globalThis.nashvilleFresh.selectedRepairIndex");
  run("alter2Pending=globalThis.nashvilleFresh; globalThis.extremeNashvilleApply=approveAlter2Changes()");
  assert.equal(context.extremeNashvilleApply, false, 'an extreme verified route cannot be approved silently');
  assert.equal(run('JSON.stringify(state)'), context.afterMilwaukeeState);
  assert.equal(JSON.stringify(localStorage.data), context.afterMilwaukeeStorage);

  run("globalThis.mismatchedNashville=analyseAlter2Request('Stay one extra night in Nashville'); globalThis.mismatchedNashville.changes[1].changes.dest='NASHVILLE → BRISTOL'");
  await run("verifyAlter2Routes(globalThis.mismatchedNashville,{routeIntelligence:globalThis.nashvilleRouteIntelligence})");
  assert.equal(context.mismatchedNashville.proposalValidation.valid, false, 'displayed route/component mismatch invalidates the proposal');
  assert.match(run('alter2ReviewBanner(globalThis.mismatchedNashville).text'), /displayed route does not match verified component legs/);
  assert.equal(run('alter2RouteCheckReady(globalThis.mismatchedNashville)'), false, 'route/day mismatch blocks approval');

  run("globalThis.failedNashville=analyseAlter2Request('Stay one extra night in Nashville'); globalThis.oneFailedRouteIntelligence={async resolveAsync({origin,destination}){if(origin.key==='memphis'&&destination.key==='bristol')return {reliable:false};return {reliable:true,distanceKm:300,durationMinutes:180,origin,destination,geometry:{type:'LineString',coordinates:[origin.coordinates,destination.coordinates]},waypoints:[],source:'mapbox-directions'}}}");
  const oneFailedStatus = await run("verifyAlter2Routes(globalThis.failedNashville,{routeIntelligence:globalThis.oneFailedRouteIntelligence})");
  assert.equal(oneFailedStatus.status, 'failed');
  assert.equal(run('alter2RouteCheckReady(globalThis.failedNashville)'), false);
  run("alter2Pending=globalThis.failedNashville; globalThis.nashvilleApplyBlocked=approveAlter2Changes()");
  assert.equal(context.nashvilleApplyBlocked, false, 'one failed route keeps approval blocked');
  assert.equal(run('JSON.stringify(state)'), context.afterMilwaukeeState);
  assert.equal(JSON.stringify(localStorage.data), context.afterMilwaukeeStorage);

  run("globalThis.invalidProposal=analyseAlter2Request('Stay one extra night in Nashville'); globalThis.invalidProposal.changes[0].changes.dest_query='Unrelated location'; globalThis.invalidProposal.proposalValidation=alter2ValidateProposal(globalThis.invalidProposal.changes); alter2Pending=globalThis.invalidProposal; globalThis.invalidApply=approveAlter2Changes()");
  assert.equal(context.invalidProposal.proposalValidation.valid, false);
  assert.match(run('alter2ReviewBanner(globalThis.invalidProposal).text'), /INVALID PROPOSAL/);
  assert.equal(context.invalidApply, false, 'inconsistent proposed-day objects cannot be approved');
  assert.equal(run('JSON.stringify(state)'), context.afterMilwaukeeState);
  assert.equal(JSON.stringify(localStorage.data), context.afterMilwaukeeStorage);

  run("globalThis.beforeThirdAnalysis=JSON.stringify(state); globalThis.thirdFresh=analyseAlter2Request('Stay one extra night in Yellowstone'); globalThis.afterThirdAnalysis=JSON.stringify(state)");
  assert.equal(context.thirdFresh.target, '2026-10-13', 'a third unrelated request derives Yellowstone afresh');
  assert.equal(context.thirdFresh.affected[0].date, '2026-10-13');
  assert.ok(context.thirdFresh.affected.every(item => item.date >= '2026-10-13'));
  assert.equal(context.afterThirdAnalysis, context.beforeThirdAnalysis, 'third-location impact analysis is also read-only');

  context.mockMapboxFetch = async (url, options) => {
    context.mockMapboxRequest = { url, options };
    return {
      ok: true,
      async json() {
        return {
          routes: [{
            distance: 487600,
            duration: 18000,
            geometry: { type: 'LineString', coordinates: [[-86.78, 36.16], [-90.07, 29.95]] },
            waypoints: [{ name: 'Origin', location: [-86.78, 36.16] }, { name: 'Destination', location: [-90.07, 29.95] }]
          }]
        };
      }
    };
  };
  run("RouteIntelligence.setProvider(createMapboxDirectionsProvider({endpoint:'/route-intelligence/mapbox',fetchImpl:mockMapboxFetch}))");
  const route = await run("RouteIntelligence.resolveAsync({origin:'Origin',destination:'Destination',days:[]})");
  assert.equal(route.status, 'available');
  assert.equal(route.distanceKm, 487.6);
  assert.equal(route.durationMinutes, 300);
  assert.equal(route.geometry.coordinates.length, 2);
  assert.equal(route.waypoints.length, 2);
  assert.match(context.mockMapboxRequest.url, /\/route-intelligence\/mapbox/);
  assert.equal(JSON.parse(context.mockMapboxRequest.options.body).profile, 'mapbox/driving');

  assert.equal(run('DWAJP_ROUTE_INTELLIGENCE_CONFIG.liveEnabled'), true, 'the verified isolated Worker is enabled for route-aware analysis');
  context.mockWorkerFetch = async () => ({ ok: true, async json() { return { verification: 'verified', provider: 'mapbox-directions', roadDistanceKm: 487.6, estimatedDrivingMinutes: 300, geometry: { type: 'LineString', coordinates: [[-86.78, 36.16], [-90.07, 29.95]] }, waypoints: [{ name: 'Origin' }, { name: 'Destination' }], overnightAreas: [] }; } });
  run("configureRouteIntelligence({enabled:true,workerEndpoint:'/api/route',fetchImpl:mockWorkerFetch})");
  const workerRoute = await run("RouteIntelligence.resolveAsync({origin:'Origin',destination:'Destination',days:[]})");
  assert.equal(workerRoute.status, 'available');
  assert.equal(workerRoute.source, 'mapbox-directions');
  run('configureRouteIntelligence()');
  assert.equal(run('RouteIntelligence.provider'), null, 'disabling the configuration removes the live provider');

  context.failingRouteFetch = async () => ({ ok: false, status: 502, async json() { return {}; } });
  run("RouteIntelligence.setProvider(createMapboxDirectionsProvider({endpoint:'/route-intelligence/mapbox',fetchImpl:failingRouteFetch}))");
  const failedRoute = await run("RouteIntelligence.resolveAsync({origin:'Origin',destination:'Destination',days:[]})");
  assert.equal(failedRoute.status, 'route_confirmation_required');
  assert.match(failedRoute.failureReason, /unavailable/);

  run("RouteIntelligence.setProvider({async routeAsync(){return {reliable:true,distanceKm:100,durationMinutes:60,geometry:{type:'LineString',coordinates:[[1,2]]}}}})");
  const malformedRoute = await run("RouteIntelligence.resolveAsync({origin:'Origin',destination:'Destination',days:[]})");
  assert.equal(malformedRoute.status, 'route_confirmation_required');
  assert.match(malformedRoute.failureReason, /Malformed/);

  // The coordinate registry is read-only, normalized by place name, and separate
  // from itinerary overrides/localStorage.
  const ortonville = run("lookupLocationCoordinates('ORTONVILLE, MI')");
  const indianaDunes = run("lookupLocationCoordinates('Indiana Dunes area, Indiana')");
  const memphis = run("lookupLocationCoordinates('Memphis, TN')");
  const bristol = run("lookupLocationCoordinates('Bristol, TN')");
  const newOrleans = run("lookupLocationCoordinates('New Orleans, LA')");
  const centralCoast = run("lookupLocationCoordinates('Central Coast')");
  const ambiguousPlace = run("lookupLocationCoordinates('Texas Hill Country')");
  const unknownPlace = run("lookupLocationCoordinates('Unmapped overnight stop')");
  assert.equal(ortonville.status, 'validated');
  assert.deepEqual(Array.from(ortonville.coordinates), [-83.443, 42.852251]);
  assert.equal(indianaDunes.status, 'validated', 'a suggested overnight area can be resolved even when it is absent from the original itinerary day');
  assert.deepEqual(Array.from(memphis.coordinates), [-89.9685113, 35.1091639]);
  assert.deepEqual(Array.from(bristol.coordinates), [-82.2170009, 36.5585486]);
  assert.deepEqual(Array.from(newOrleans.coordinates), [-89.9345018, 30.0528765]);
  assert.equal(centralCoast.status, 'validated');
  assert.equal(centralCoast.label, 'Pismo Beach, California', 'the itinerary route URL disambiguates its Central Coast endpoint');
  assert.equal(ambiguousPlace.status, 'ambiguous');
  assert.equal(ambiguousPlace.coordinates, null, 'ambiguous itinerary regions never receive guessed coordinates');
  assert.equal(unknownPlace.status, 'unavailable');
  assert.equal(unknownPlace.coordinates, null, 'unknown locations never receive invented coordinates');
  assert.equal(run("drivingRouteInput({dest:'Central Coast → Unmapped overnight stop'}).available"), false);
  const requiredRegistryNames = ['Amarillo','Palo Duro Canyon','Disneyland','Elko','Gallup','Grand Canyon','Las Vegas','Los Angeles','Missoula','NYC','Niagara Falls','San Diego','San Francisco','Santa Monica','Washington D.C.','Yellowstone','Yosemite'];
  requiredRegistryNames.forEach(name => assert.equal(run(`lookupLocationCoordinates(${JSON.stringify(name)}).status`), 'validated', `${name} has one explicit validated endpoint`));
  assert.equal(run("lookupLocationCoordinates('Amarillo, Texas').label"), 'Amarillo, Texas');
  assert.equal(run("lookupLocationCoordinates('Everett, Washington').label"), 'Everett, Washington');
  assert.equal(run("lookupLocationCoordinates('New York City, New York').label"), 'New York City, New York');
  assert.equal(run("lookupLocationCoordinates('Travel / Buffer').status"), 'non-geographic');
  assert.equal(run("lookupLocationCoordinates('RV Return').status"), 'non-geographic');
  assert.equal(run("lookupLocationCoordinates('New Orleans / Buffer').label"), 'New Orleans, Louisiana');
  assert.equal(run("lookupLocationCoordinates('Seattle / Everett').label"), 'Everett, Washington (Seattle local excursion)');
  assert.equal(run("lookupLocationCoordinates('San Diego / Tijuana Optional').label"), 'San Diego, California (Tijuana optional excursion)');
  const itineraryCoverage = run('auditItineraryLocationCoverage(DAYS)');
  assert.ok(itineraryCoverage.resolvable.some(item => item.name === 'NASHVILLE'));
  assert.ok(itineraryCoverage.resolvable.some(item => item.name === 'MEMPHIS'));
  assert.ok(itineraryCoverage.resolvable.some(item => item.name === 'BRISTOL'));
  assert.ok(itineraryCoverage.resolvable.some(item => item.name === 'NEW ORLEANS'));
  assert.ok(itineraryCoverage.resolvable.some(item => item.name === 'CENTRAL COAST'));
  assert.ok(itineraryCoverage.resolvable.some(item => item.name === 'YELLOWSTONE'));
  assert.ok(itineraryCoverage.ambiguous.some(item => item.name === 'TEXAS HILL COUNTRY'), 'the audit does not invent a precise Texas Hill Country stop');
  assert.ok(itineraryCoverage.nonGeographic.some(item => item.name === 'TRAVEL / BUFFER'));

  // Route-aware analysis is asynchronous and read-only. A verified long leg is
  // yellow with a halfway suggestion; provider failure and locked days stay safe.
  const routeStorageBefore = JSON.stringify(localStorage.data);
  const stateBeforeRouteAnalysis = run('JSON.stringify(state)');
  run("globalThis.registryRouteCalls=[]; RouteIntelligence.setProvider({async routeAsync({origin,destination}){globalThis.registryRouteCalls.push({origin,destination});return {reliable:true,distanceKm:720,durationMinutes:540,geometry:{type:'LineString',coordinates:[origin.coordinates,[-85.0,43.0],destination.coordinates]},waypoints:[{name:'Ortonville'},{name:'Halfway Town'},{name:'Milwaukee'}],source:'mapbox-directions'}}})");
  const routeAnalysis = await run("analyseTripChangeWithRouteIntelligence(\"We don't need to get to Milwaukee until later on Friday.\")");
  const verifiedAssessment = routeAnalysis.routeAssessments.find(item => item.day.date === '2026-09-10');
  assert.equal(verifiedAssessment.verification, 'verified');
  assert.equal(verifiedAssessment.impact, 'YELLOW');
  assert.match(verifiedAssessment.reason, /720 km/);
  assert.match(verifiedAssessment.solution, /Indiana Dunes area, Indiana/, 'a validated planned stop can be suggested');
  assert.doesNotMatch(verifiedAssessment.solution, /Halfway Town|Street|Avenue/i, 'arbitrary Mapbox waypoint names are never presented as overnight locations');
  assert.match(run("routeImpactSummary({dest:'ALPHA → BETA',detour:''},{reliable:true,distanceKm:720,durationMinutes:540,origin:{label:'Alpha'},destination:{label:'Beta'},waypoints:[{name:'North Milwaukee Street'}]}).solution"), /buffer day[\s\S]*split the leg[\s\S]*leave the itinerary unchanged/i, 'without a validated candidate, the UI offers safe generic choices instead of inventing an overnight stop');
  assert.deepEqual(JSON.parse(JSON.stringify(context.registryRouteCalls[0].origin.coordinates)), [-83.443, 42.852251], 'the Worker provider receives registry coordinates');
  assert.deepEqual(JSON.parse(JSON.stringify(context.registryRouteCalls[0].destination.coordinates)), [-87.9065, 43.0389]);
  const suggestedRoute = await run("RouteIntelligence.resolveAsync({origin:lookupLocationCoordinates('Ortonville'),destination:lookupLocationCoordinates('Indiana Dunes'),days:[]})");
  assert.equal(suggestedRoute.status, 'available', 'registry locations can be routed before they appear on an itinerary day');
  assert.equal(JSON.stringify(localStorage.data), routeStorageBefore, 'route analysis does not write localStorage before approval');
  assert.equal(run('JSON.stringify(state)'), stateBeforeRouteAnalysis, 'route analysis does not mutate itinerary overrides');

  run("RouteIntelligence.setProvider({async routeAsync(){throw new Error('routing unavailable')}})");
  const unavailableAnalysis = await run("analyseTripChangeWithRouteIntelligence(\"We don't need to get to Milwaukee until later on Friday.\")");
  assert.equal(unavailableAnalysis.routeAssessments.find(item => item.day.date === '2026-09-10').verification, 'route_confirmation_required');
  assert.equal(unavailableAnalysis.routeAssessments.find(item => item.day.date === '2026-09-10').impact, 'YELLOW');
  assert.equal(run("routeImpactSummary({status:'CONFIRMED',plan:'Confirmed campground booking'},{reliable:true,distanceKm:100,durationMinutes:90}).impact"), 'RED');
  assert.equal(run("drivingRouteInput({dest:'UNKNOWN START → UNMAPPED END'}).available"), false, 'missing coordinates retain the safe fallback');

  // Proposal cards are enriched read-only with verified route values; legacy
  // static itinerary kilometres are not retained after verified data arrives.
  run("RouteIntelligence.setProvider({async routeAsync({origin,destination}){return {reliable:true,distanceKm:720,durationMinutes:540,geometry:{type:'LineString',coordinates:[origin.coordinates,[-85,43],destination.coordinates]},waypoints:[],source:'mapbox-directions'}}}); state={}; globalThis.verifiedProposal=buildActionableProposals(analyseTripChange(\"We don't need to get to Milwaukee until later on Friday and we can leave earlier on Monday.\"))[0]");
  await run('enrichProposalRouteDisplays([globalThis.verifiedProposal])');
  const tuesdayProposal = run("globalThis.verifiedProposal.cascade.find(item=>item.current.date==='2026-09-15')");
  const thursdayProposal = run("globalThis.verifiedProposal.cascade.find(item=>item.current.date==='2026-09-10')");
  assert.equal(tuesdayProposal.currentVerifiedRoute.reliable, true);
  assert.equal(tuesdayProposal.proposedVerifiedRoute.reliable, true);
  assert.equal(thursdayProposal.proposedVerifiedRoute.reliable, true);
  const enrichedProposalHtml = run('renderProposalDay(globalThis.verifiedProposal.cascade.find(item=>item.current.date===\'2026-09-15\'))');
  const enrichedSplitHtml = run('renderProposalDay(globalThis.verifiedProposal.cascade.find(item=>item.current.date===\'2026-09-10\'))');
  assert.match(enrichedProposalHtml, /720 km/);
  assert.doesNotMatch(enrichedProposalHtml, /435 km|485 km/, 'verified route values replace inherited static distances in proposal cards');
  assert.match(enrichedSplitHtml, /720 km/);
  assert.doesNotMatch(enrichedSplitHtml, /305 km/, 'verified split legs replace the old 305 km display');
  const enrichedThursdayAffected = run("renderAffectedDayProposal(globalThis.verifiedProposal.cascade.find(item=>item.current.date==='2026-09-10'))");
  const enrichedFridayAffected = run("renderAffectedDayProposal(globalThis.verifiedProposal.cascade.find(item=>item.current.date==='2026-09-11'))");
  assert.match(enrichedThursdayAffected, /720 km/);
  assert.match(enrichedFridayAffected, /720 km/);
  assert.match(enrichedThursdayAffected, /9 hr/);
  assert.doesNotMatch(enrichedThursdayAffected + enrichedFridayAffected, /305 km/, 'left-side affected-day split cards use the same verified proposal data');
  assert.match(run("renderAffectedDayProposal({impact:'GREEN',note:'test',proposed:{dest:'ALPHA → BETA'}})"), /ROUTE CHECKING/, 'affected-day proposals show a pending state instead of a stale distance');
  assert.match(run("renderAffectedDayProposal({impact:'GREEN',note:'test',proposed:{dest:'ALPHA → BETA'},proposedVerifiedRoute:{reliable:false}})"), /DISTANCE TO VERIFY/, 'affected-day proposals retain the safe failure fallback');
  assert.match(enrichedProposalHtml, /9 hr/);
  assert.doesNotMatch(enrichedProposalHtml, /540 minutes/);
  const encodedAssessment = run("renderRouteAssessment({day:{short:'Example'},impact:'GREEN',route:{reliable:true,distanceKm:100,durationMinutes:80},input:{origin:{status:'validated'},destination:{status:'unavailable'}}})");
  assert.match(encodedAssessment, /&mdash;|&bull;|&#128994;/);
  assert.doesNotMatch(encodedAssessment, /â€”|â€¢|ðŸ/);
  assert.match(encodedAssessment, /1 hr 20 min/);
  assert.doesNotMatch(encodedAssessment, /80 minutes/);
  const wedAnalysis = await run("analyseTripChangeWithRouteIntelligence(\"We don't need to get to Milwaukee until later on Friday.\")");
  assert.equal(wedAnalysis.routeAssessments.some(item => item.day.date === '2026-09-09'), false, 'Wed 9 Sep is a local Ortonville/Detroit excursion, not an intercity route for verification');

  // Named-source reallocation must resolve Las Vegas before searching later
  // driving legs; generic token scoring must never substitute Texas Hill Country.
  run("state={days:{'2026-09-24':{dest:'NEW ORLEANS → Winnie, Texas',dest_query:'Winnie, Texas'}}}; localStorage.setItem(STORE,JSON.stringify(state)); globalThis.reallocationStateBefore=JSON.stringify(state); globalThis.reallocationStorageBefore=localStorage.getItem(STORE); globalThis.reallocationBookingsBefore=JSON.stringify(CONFIRMED_BOOKING_WINDOWS); globalThis.reallocationMustBefore=JSON.stringify(DAYS.filter(day=>String(day.status||'').toUpperCase()==='MUST DO')); globalThis.reallocationTimedBefore=JSON.stringify(mergedDays().filter(day=>day.date>='2026-10-18'&&day.date<='2026-10-20')); globalThis.reallocationCommand='I want to spend one less day in Las Vegas and use that day to break up a long driving day later in the trip. Keep all confirmed bookings and MUST DO items unchanged.'; globalThis.reallocation=analyseAlter2Request(globalThis.reallocationCommand)");
  assert.equal(context.reallocation.kind, 'source-reallocation');
  assert.equal(context.reallocation.target, '2026-10-03');
  assert.equal(context.reallocation.solverDetails.surrendered.date, '2026-10-05');
  assert.ok(context.reallocation.affected.every(item=>item.date>='2026-10-03'), 'no unrelated earlier/fallback day is selected');
  assert.equal(context.reallocation.affected.some(item=>item.date==='2026-09-25'), false, 'Texas Hill Country is never substituted for named Las Vegas');
  assert.equal(context.reallocation.changes.length, 0, 'command entry does not append text to an unrelated day');
  assert.ok(!run('alter2ApprovalReady(globalThis.reallocation)'), 'approval stays blocked until route-backed planning completes');
  assert.equal(run('JSON.stringify(state)'), context.reallocationStateBefore);
  assert.equal(localStorage.getItem('dwajp-trip-v5'), context.reallocationStorageBefore);
  run("globalThis.reallocationCalls=[]; globalThis.reallocationRoutes={async resolveAsync({origin,destination}){let key=origin.key+'>'+destination.key;globalThis.reallocationCalls.push(key);let values={'las vegas>yosemite':[650,450],'yosemite>elko':[530,420],'elko>yellowstone':[480,360],'yellowstone>missoula':[430.1,260],'missoula>seattle everett':[806.3,498],'missoula>spokane':[319.8,190],'spokane>seattle everett':[455.2,270]}[key];return values?{reliable:true,distanceKm:values[0],durationMinutes:values[1],origin,destination,geometry:{type:'LineString',coordinates:[origin.coordinates,destination.coordinates]},waypoints:[],source:'mapbox-directions'}:{reliable:false}}}");
  const reallocationVerification = await run('verifyAlter2Routes(globalThis.reallocation,{routeIntelligence:globalThis.reallocationRoutes})');
  assert.equal(reallocationVerification.status, 'verified');
  assert.equal(context.reallocation.proposalValidation.valid, true, context.reallocation.proposalValidation.issues.join('; '));
  assert.deepEqual(Array.from(context.reallocation.changes.map(change=>change.date)), ['2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09','2026-10-10','2026-10-11','2026-10-12','2026-10-13','2026-10-14','2026-10-15','2026-10-16','2026-10-17']);
  assert.deepEqual(Array.from(reallocationVerification.legs.map(leg=>[leg.changeDate,leg.origin,leg.destination,leg.distanceKm,leg.durationMinutes,leg.pressure])), [['2026-10-05','LAS VEGAS','YOSEMITE',650,450,'YELLOW'],['2026-10-08','YOSEMITE','ELKO',530,420,'YELLOW'],['2026-10-12','ELKO','YELLOWSTONE',480,360,'GREEN'],['2026-10-15','YELLOWSTONE','MISSOULA',430.1,260,'GREEN'],['2026-10-16','MISSOULA','Spokane, Washington',319.8,190,'GREEN'],['2026-10-17','Spokane, Washington','SEATTLE / EVERETT',455.2,270,'GREEN']]);
  assert.equal(context.reallocation.solverDetails.originalLongLeg.date, '2026-10-17');
  assert.equal(context.reallocation.solverDetails.originalLongLeg.pressure, 'RED');
  assert.equal(context.reallocation.solverDetails.splitStop, 'Spokane, Washington');
  assert.equal(context.reallocation.solverDetails.protectedDate, '2026-10-20');
  assert.ok(run('alter2ApprovalReady(globalThis.reallocation)'));
  run("alter2Pending=globalThis.reallocation; globalThis.reallocationReview=renderAlter2ChangeRows(globalThis.reallocation); globalThis.reallocationStateAfterReview=JSON.stringify(state); globalThis.reallocationStorageAfterReview=localStorage.getItem(STORE)");
  assert.match(context.reallocationReview, /SOURCE DAY SURRENDERED[\s\S]*Mon 5 Oct[\s\S]*Final Vegas day/i);
  assert.match(context.reallocationReview, /ORIGINAL LONG LEG:[\s\S]*MISSOULA → SEATTLE \/ EVERETT[\s\S]*806\.3 km[\s\S]*8 hr 18 min[\s\S]*RED/i);
  assert.match(context.reallocationReview, /INSERTED STOPPING AREA:[\s\S]*Spokane, Washington[\s\S]*SUGGESTION \/ NOT BOOKED/i);
  assert.match(context.reallocationReview, /Mon 5 Oct — LAS VEGAS → YOSEMITE[\s\S]*650 km[\s\S]*YELLOW/i);
  assert.match(context.reallocationReview, /Fri 16 Oct — MISSOULA → Spokane, Washington[\s\S]*319\.8 km[\s\S]*GREEN/i);
  assert.match(context.reallocationReview, /Sat 17 Oct — Spokane, Washington → SEATTLE \/ EVERETT[\s\S]*455\.2 km[\s\S]*GREEN/i);
  assert.match(context.reallocationReview, /SUGGESTION \/ NOT BOOKED/i);
  assert.doesNotMatch(context.reallocationReview, /User-approved change:/i);
  assert.equal(context.reallocationStateAfterReview, context.reallocationStateBefore);
  assert.equal(context.reallocationStorageAfterReview, context.reallocationStorageBefore);
  run("globalThis.reallocationApplied=approveAlter2Changes(); globalThis.reallocationCards=(document.getElementById('content').innerHTML.match(/<article class=\"card/g)||[]).length; globalThis.reallocationTimedAfter=JSON.stringify(mergedDays().filter(day=>day.date>='2026-10-18'&&day.date<='2026-10-20')); globalThis.reallocationBookingsAfter=JSON.stringify(CONFIRMED_BOOKING_WINDOWS); globalThis.reallocationMustAfter=JSON.stringify(DAYS.filter(day=>String(day.status||'').toUpperCase()==='MUST DO')); resetEdits(); globalThis.reallocationReset5=mergedDays().find(day=>day.date==='2026-10-05'); globalThis.reallocationReset17=mergedDays().find(day=>day.date==='2026-10-17')");
  assert.equal(context.reallocationApplied, true);
  assert.equal(context.reallocationCards, 57);
  assert.equal(context.reallocationTimedAfter, context.reallocationTimedBefore);
  assert.equal(context.reallocationBookingsAfter, context.reallocationBookingsBefore);
  assert.equal(context.reallocationMustAfter, context.reallocationMustBefore);
  assert.match(context.reallocationReset5.plan, /Final Vegas day/);
  assert.match(context.reallocationReset17.dest, /MISSOULA → SEATTLE \/ EVERETT/);

  // Generic named-source wording resolves Elko rather than relying on Las Vegas.
  run("state={}; localStorage.removeItem(STORE); globalThis.genericReallocation=analyseAlter2Request('Spend one less day in Elko and use that day to split a later long driving leg. Keep confirmed and MUST DO items unchanged.')");
  assert.equal(context.genericReallocation.kind, 'source-reallocation');
  assert.equal(context.genericReallocation.target, '2026-10-09');
  assert.equal(context.genericReallocation.solverDetails.surrendered.date, '2026-10-12');
  const genericReallocationVerification = await run('verifyAlter2Routes(globalThis.genericReallocation,{routeIntelligence:globalThis.reallocationRoutes})');
  assert.equal(genericReallocationVerification.status, 'verified');
  assert.equal(context.genericReallocation.solverDetails.splitStop, 'Spokane, Washington');
  assert.ok(context.genericReallocation.changes.every(change=>change.date>='2026-10-12'));
  assert.equal(localStorage.getItem('dwajp-trip-v5'), null, 'generic analysis and verification remain read-only');

  // Paired source/destination language is a zero-net transfer, not an extra day
  // that cascades into the protected 20 October commitment.
  run("state={days:{'2026-09-24':{dest:'NEW ORLEANS → Winnie, Texas',dest_query:'Winnie, Texas'}}}; localStorage.setItem(STORE,JSON.stringify(state)); globalThis.transferStateBefore=JSON.stringify(state); globalThis.transferStorageBefore=localStorage.getItem(STORE); globalThis.transferBookingsBefore=JSON.stringify(CONFIRMED_BOOKING_WINDOWS); globalThis.transferMustBefore=JSON.stringify(DAYS.filter(day=>String(day.status||'').toUpperCase()==='MUST DO')); globalThis.transferTimedBefore=JSON.stringify(mergedDays().filter(day=>day.date>='2026-10-18'&&day.date<='2026-10-20')); globalThis.transferCommand='I want to leave Yellowstone one day earlier and spend the extra day in Seattle. Make it work without changing confirmed bookings or MUST DO items.'; globalThis.transferAnalysis=analyseAlter2Request(globalThis.transferCommand)");
  assert.equal(context.transferAnalysis.kind, 'day-transfer');
  assert.equal(context.transferAnalysis.solverDetails.netDays, 0);
  assert.equal(context.transferAnalysis.solverDetails.surrendered.date, '2026-10-15', 'the last eligible non-MUST, non-timed Yellowstone local day supplies the transfer');
  assert.equal(context.transferAnalysis.solverDetails.received.date, '2026-10-17');
  assert.deepEqual(Array.from(context.transferAnalysis.changes.map(change=>[change.date,change.changes.dest])), [['2026-10-15','YELLOWSTONE → MISSOULA'],['2026-10-16','MISSOULA → SEATTLE / EVERETT'],['2026-10-17','SEATTLE / EVERETT']]);
  assert.deepEqual(Array.from(context.transferAnalysis.routeLegs.map(leg=>`${leg.origin} -> ${leg.destination}`)), ['YELLOWSTONE -> MISSOULA','MISSOULA -> SEATTLE / EVERETT']);
  assert.equal(context.transferAnalysis.proposalValidation.valid, true, context.transferAnalysis.proposalValidation.issues.join('; '));
  assert.match(context.transferAnalysis.summary, /Transfer one flexible day[\s\S]*57 days/i);
  assert.equal(run('JSON.stringify(state)'), context.transferStateBefore);
  assert.equal(localStorage.getItem('dwajp-trip-v5'), context.transferStorageBefore);
  run("globalThis.transferCalls=[]; globalThis.transferRoutes={async resolveAsync({origin,destination}){globalThis.transferCalls.push(origin.label+'>'+destination.label);let values=/Yellowstone/i.test(origin.label)?[520,390]:/Missoula/i.test(origin.label)?[760,540]:null;return values?{reliable:true,distanceKm:values[0],durationMinutes:values[1],origin,destination,geometry:{type:'LineString',coordinates:[origin.coordinates,destination.coordinates]},waypoints:[],source:'mapbox-directions'}:{reliable:false}}}");
  const transferVerification = await run('verifyAlter2Routes(globalThis.transferAnalysis,{routeIntelligence:globalThis.transferRoutes})');
  assert.equal(transferVerification.status, 'verified');
  assert.deepEqual(Array.from(transferVerification.legs.map(leg=>[leg.changeDate,leg.origin,leg.destination,leg.distanceKm,leg.durationMinutes,leg.pressure])), [['2026-10-15','YELLOWSTONE','MISSOULA',520,390,'YELLOW'],['2026-10-16','MISSOULA','SEATTLE / EVERETT',760,540,'YELLOW']]);
  assert.ok(transferVerification.legs.every(leg=>leg.pressure!=='RED'));
  assert.ok(run('alter2ApprovalReady(globalThis.transferAnalysis)'));
  run("alter2Pending=globalThis.transferAnalysis; showAlter2FinalProposal(); globalThis.transferReview=renderAlter2ChangeRows(globalThis.transferAnalysis); globalThis.transferStateAfterReview=JSON.stringify(state); globalThis.transferStorageAfterReview=localStorage.getItem(STORE)");
  assert.match(context.transferReview, /Thu 15 Oct — YELLOWSTONE → MISSOULA[\s\S]*520 km[\s\S]*6 hr 30 min[\s\S]*YELLOW/i);
  assert.match(context.transferReview, /Fri 16 Oct — MISSOULA → SEATTLE \/ EVERETT[\s\S]*760 km[\s\S]*9 hr[\s\S]*YELLOW/i);
  assert.match(context.transferReview, /Sat 17 Oct — SEATTLE \/ EVERETT[\s\S]*day transferred from Yellowstone/i);
  assert.equal(context.transferStateAfterReview, context.transferStateBefore);
  assert.equal(context.transferStorageAfterReview, context.transferStorageBefore);
  run("globalThis.transferApplied=approveAlter2Changes(); globalThis.transferDaysAfter=mergedDays(); globalThis.transferCards=(document.getElementById('content').innerHTML.match(/<article class=\"card/g)||[]).length; globalThis.transfer20=mergedDays().find(day=>day.date==='2026-10-20'); globalThis.transferTimedAfter=JSON.stringify(mergedDays().filter(day=>day.date>='2026-10-18'&&day.date<='2026-10-20')); globalThis.transferBookingsAfter=JSON.stringify(CONFIRMED_BOOKING_WINDOWS); globalThis.transferMustAfter=JSON.stringify(DAYS.filter(day=>String(day.status||'').toUpperCase()==='MUST DO')); resetEdits(); globalThis.transferReset15=mergedDays().find(day=>day.date==='2026-10-15'); globalThis.transferReset17=mergedDays().find(day=>day.date==='2026-10-17')");
  assert.equal(context.transferApplied, true);
  assert.equal(context.transferDaysAfter.length, 57);
  assert.equal(context.transferCards, 57);
  assert.match(context.transfer20.dest, /RV RETURN → SAN FRANCISCO/);
  assert.equal(context.transferTimedAfter, context.transferTimedBefore, '18–20 October timed and protected commitments remain byte-for-byte unchanged');
  assert.equal(context.transferBookingsAfter, context.transferBookingsBefore);
  assert.equal(context.transferMustAfter, context.transferMustBefore);
  assert.match(context.transferReset15.plan, /Lamar Valley/);
  assert.match(context.transferReset17.dest, /MISSOULA → SEATTLE \/ EVERETT/);

  // Live RED regression: route intelligence verifies a Spokane split, but no
  // eligible calendar date exists without consuming requested or timed time.
  run("state={days:{'2026-09-24':{dest:'NEW ORLEANS → Winnie, Texas',dest_query:'Winnie, Texas'}}}; localStorage.setItem(STORE,JSON.stringify(state)); globalThis.redTransferStateBefore=JSON.stringify(state); globalThis.redTransferStorageBefore=localStorage.getItem(STORE); globalThis.redTransferBookingsBefore=JSON.stringify(CONFIRMED_BOOKING_WINDOWS); globalThis.redTransferMustBefore=JSON.stringify(DAYS.filter(day=>String(day.status||'').toUpperCase()==='MUST DO')); globalThis.redTransfer=analyseAlter2Request(globalThis.transferCommand); globalThis.redTransferCalls=[]; globalThis.redTransferRoutes={async resolveAsync({origin,destination}){let key=origin.key+'>'+destination.key;globalThis.redTransferCalls.push(key);let values={'yellowstone>missoula':[430.1,260],'missoula>seattle everett':[806.3,498],'missoula>spokane':[319.8,190],'spokane>seattle everett':[455.2,270]}[key];return values?{reliable:true,distanceKm:values[0],durationMinutes:values[1],origin,destination,geometry:{type:'LineString',coordinates:[origin.coordinates,destination.coordinates]},waypoints:[],source:'mapbox-directions'}:{reliable:false}}}");
  const redTransferVerification = await run('verifyAlter2Routes(globalThis.redTransfer,{routeIntelligence:globalThis.redTransferRoutes})');
  assert.equal(redTransferVerification.status, 'verified');
  assert.deepEqual(Array.from(redTransferVerification.legs.map(leg=>[leg.origin,leg.destination,leg.distanceKm,leg.durationMinutes,leg.pressure])), [['YELLOWSTONE','MISSOULA',430.1,260,'GREEN'],['MISSOULA','SEATTLE / EVERETT',806.3,498,'RED']]);
  assert.ok(context.redTransfer.repairs.length >= 2, 'RED day-transfer generation searches for repairs before KEEP ORIGINAL');
  const spokaneRepair = context.redTransfer.repairs.find(option=>/spokane/i.test(option.id));
  assert.ok(spokaneRepair, 'validated Spokane forward-corridor split is investigated');
  assert.equal(spokaneRepair.viable, false, 'the road-safe split is not offered as selectable when it cannot fit the dates');
  assert.deepEqual(Array.from(spokaneRepair.legs.map(leg=>[leg.origin,leg.destination,leg.distanceKm,leg.durationMinutes,leg.pressure])), [['YELLOWSTONE','MISSOULA',430.1,260,'GREEN'],['MISSOULA','Spokane, Washington',319.8,190,'GREEN'],['Spokane, Washington','SEATTLE / EVERETT',455.2,270,'GREEN']]);
  assert.match(spokaneRepair.failureReason, /needs one additional travel date[\s\S]*consume the requested transferred Seattle day[\s\S]*no eligible flexible date/i);
  assert.match(spokaneRepair.protectedImpact, /Kraken[\s\S]*RV-return preparation[\s\S]*20 October/i);
  assert.equal(context.redTransfer.repairs.at(-1).id, 'keep-original');
  assert.equal(run('alter2ApprovalReady(globalThis.redTransfer)'), false, 'the unrepaired RED transfer remains blocked');
  run("alter2Pending=globalThis.redTransfer; globalThis.redTransferReview=renderAlter2RepairOptions(globalThis.redTransfer); globalThis.redTransferApply=approveAlter2Changes(); globalThis.redTransferStateAfter=JSON.stringify(state); globalThis.redTransferStorageAfter=localStorage.getItem(STORE); globalThis.redTransferBookingsAfter=JSON.stringify(CONFIRMED_BOOKING_WINDOWS); globalThis.redTransferMustAfter=JSON.stringify(DAYS.filter(day=>String(day.status||'').toUpperCase()==='MUST DO'))");
  assert.match(context.redTransferReview, /SPLIT RED LEG VIA SPOKANE, WASHINGTON[\s\S]*319\.8 km[\s\S]*3 hr 10 min[\s\S]*GREEN[\s\S]*455\.2 km[\s\S]*4 hr 30 min[\s\S]*GREEN/i);
  assert.match(context.redTransferReview, /NOT SAFE TO APPLY[\s\S]*KEEP ORIGINAL — LEAVE IT/i);
  assert.equal(context.redTransferApply, false);
  assert.equal(context.redTransferStateAfter, context.redTransferStateBefore);
  assert.equal(context.redTransferStorageAfter, context.redTransferStorageBefore);
  assert.equal(context.redTransferBookingsAfter, context.redTransferBookingsBefore);
  assert.equal(context.redTransferMustAfter, context.redTransferMustBefore);
  assert.equal(run("lookupLocationCoordinates('Spokane').status"), 'validated');

  // Exact Yellowstone regression: the only repeated local Seattle days carry a
  // timed target and return-preparation duty, so neither is silently sacrificed.
  run("state={days:{'2026-09-24':{dest:'NEW ORLEANS → Winnie, Texas',dest_query:'Winnie, Texas'}}}; localStorage.setItem(STORE,JSON.stringify(state)); globalThis.yellowstoneStateBefore=JSON.stringify(state); globalThis.yellowstoneStorageBefore=localStorage.getItem(STORE); globalThis.yellowstoneBookingsBefore=JSON.stringify(CONFIRMED_BOOKING_WINDOWS); globalThis.yellowstoneMustBefore=JSON.stringify(DAYS.filter(day=>String(day.status||'').toUpperCase()==='MUST DO')); globalThis.yellowstoneAnalysis=analyseAlter2Request('I want an extra day in Yellowstone. Make it work without changing any confirmed bookings or MUST DO items.')");
  assert.equal(context.yellowstoneAnalysis.scannedDays, 57);
  assert.equal(context.yellowstoneAnalysis.target, '2026-10-13');
  assert.deepEqual(Array.from(context.yellowstoneAnalysis.solverDetails.rejectedFullShiftValidation.issues), ['2026-10-18: plan/contact metadata does not match the proposed route','2026-10-19: plan/contact metadata does not match the proposed route'], 'the regression records the exact Yellowstone full-shift metadata failures');
  assert.deepEqual(Array.from(context.yellowstoneAnalysis.solverDetails.sacrificeSearch.timed.map(item=>item.date)), ['2026-10-18','2026-10-19'], 'both apparent Seattle local-day candidates are recognised as timed duties');
  assert.equal(context.yellowstoneAnalysis.solverDetails.sacrificeSearch.candidate, null, 'no genuine OPTIONAL, buffer or rest sacrifice exists in the short window');
  assert.equal(context.yellowstoneAnalysis.changes.length, 0);
  assert.equal(context.yellowstoneAnalysis.routeLegs.length, 0, 'no invented repair legs are sent for verification');
  assert.match(context.yellowstoneAnalysis.summary, /cannot be fitted safely[\s\S]*No eligible OPTIONAL, buffer or rest day/i);
  assert.match(context.yellowstoneAnalysis.affected.find(item=>item.date==='2026-10-18').reason, /Timed event/i);
  assert.match(context.yellowstoneAnalysis.affected.find(item=>item.date==='2026-10-19').reason, /preparation/i);
  assert.match(context.yellowstoneAnalysis.affected.find(item=>item.date==='2026-10-20').reason, /protected commitment/i);
  assert.ok(!run('alter2ApprovalReady(globalThis.yellowstoneAnalysis)'), 'a truthful no-safe-fit result cannot be approved');
  run("alter2Pending=globalThis.yellowstoneAnalysis; showAlter2FinalProposal(); globalThis.yellowstoneReview=document.getElementById('alterModal').innerHTML; globalThis.yellowstoneApproval=approveAlter2Changes(); globalThis.yellowstoneStateAfter=JSON.stringify(state); globalThis.yellowstoneStorageAfter=localStorage.getItem(STORE); globalThis.yellowstoneCards=(document.getElementById('content').innerHTML.match(/<article class=\"card/g)||[]).length; globalThis.yellowstoneBookingsAfter=JSON.stringify(CONFIRMED_BOOKING_WINDOWS); globalThis.yellowstoneMustAfter=JSON.stringify(DAYS.filter(day=>String(day.status||'').toUpperCase()==='MUST DO'))");
  assert.match(context.yellowstoneReview, /No automatic changes are available/);
  assert.doesNotMatch(context.yellowstoneReview, /INVALID PROPOSAL/);
  assert.equal(context.yellowstoneApproval, false);
  assert.equal(context.yellowstoneStateAfter, context.yellowstoneStateBefore, 'Yellowstone analysis and review remain read-only');
  assert.equal(context.yellowstoneStorageAfter, context.yellowstoneStorageBefore, 'Yellowstone review leaves persisted state byte-for-byte unchanged');
  assert.equal(context.yellowstoneBookingsAfter, context.yellowstoneBookingsBefore);
  assert.equal(context.yellowstoneMustAfter, context.yellowstoneMustBefore);
  assert.equal(context.yellowstoneCards, 57);

  // Exact Las Vegas extra-day regression: start from a saved current itinerary,
  // reconstruct only flexible days, and absorb the extra day before RV return.
  run("state={days:{'2026-09-24':{dest:'NEW ORLEANS → Winnie, Texas',dest_query:'Winnie, Texas'}}}; localStorage.setItem(STORE,JSON.stringify(state)); globalThis.vegasStateBefore=JSON.stringify(state); globalThis.vegasStorageBefore=localStorage.getItem(STORE); globalThis.vegasBookingsBefore=JSON.stringify(CONFIRMED_BOOKING_WINDOWS); globalThis.vegasMustBefore=JSON.stringify(DAYS.filter(day=>String(day.status||'').toUpperCase()==='MUST DO')); globalThis.vegasRequest='I want to stay an extra day in Las Vegas. Make it work without changing any confirmed bookings or MUST DO items.'; globalThis.vegasAnalysis=analyseAlter2Request(globalThis.vegasRequest)");
  assert.equal(context.vegasAnalysis.scannedDays, 57);
  assert.equal(context.vegasAnalysis.target, '2026-10-03');
  assert.equal(context.vegasAnalysis.proposalValidation.valid, true, context.vegasAnalysis.proposalValidation.issues.join('; '));
  assert.deepEqual(Array.from(context.vegasAnalysis.solverDetails.rejectedFullShiftValidation.issues), ['2026-10-18: plan/contact metadata does not match the proposed route','2026-10-19: plan/contact metadata does not match the proposed route'], 'the regression records the exact inconsistencies that made the all-days shift invalid');
  assert.equal(context.vegasAnalysis.changes[0].date, '2026-10-06');
  assert.equal(context.vegasAnalysis.changes.at(-1).date, '2026-10-12');
  assert.deepEqual(Array.from(context.vegasAnalysis.changes.map(change => [change.date,change.changes.dest])), [['2026-10-06','las vegas'],['2026-10-07','LAS VEGAS → YOSEMITE'],['2026-10-08','YOSEMITE'],['2026-10-09','YOSEMITE'],['2026-10-10','YOSEMITE → ELKO'],['2026-10-11','ELKO'],['2026-10-12','ELKO']], 'review uses the concrete day-by-day compressed sequence');
  assert.deepEqual(Array.from(context.vegasAnalysis.routeLegs.map(leg => `${leg.origin} -> ${leg.destination}`)), ['LAS VEGAS -> YOSEMITE','YOSEMITE -> ELKO']);
  assert.match(context.vegasAnalysis.summary, /sacrificing Mon 12 Oct: Final rest day/i, 'the solver names the flexible day used to gain the extra Vegas day');
  assert.match(context.vegasAnalysis.solutions.join('\n'), /Final rest day • Prepare for Yellowstone/i, 'review discloses the sacrificed lower-priority time');
  assert.equal(run('JSON.stringify(state)'), context.vegasStateBefore, 'Las Vegas analysis remains read-only');
  assert.equal(localStorage.getItem('dwajp-trip-v5'), context.vegasStorageBefore, 'Las Vegas analysis leaves persisted overrides byte-for-byte unchanged');
  run("globalThis.vegasRouteCalls=[]; globalThis.vegasRoutes={async resolveAsync({origin,destination}){globalThis.vegasRouteCalls.push(origin.key+'>'+destination.key);let values={'las vegas>yosemite':[650,450],'yosemite>elko':[530,420]}[origin.key+'>'+destination.key];return values?{reliable:true,distanceKm:values[0],durationMinutes:values[1],origin,destination,geometry:{type:'LineString',coordinates:[origin.coordinates,destination.coordinates]},waypoints:[],source:'mapbox-directions'}:{reliable:false}}}");
  const vegasVerification = await run('verifyAlter2Routes(globalThis.vegasAnalysis,{routeIntelligence:globalThis.vegasRoutes})');
  assert.equal(vegasVerification.status, 'verified');
  assert.deepEqual(Array.from(vegasVerification.legs.map(leg => [leg.changeDate,leg.origin,leg.destination,leg.distanceKm,leg.durationMinutes,leg.pressure])), [['2026-10-07','LAS VEGAS','YOSEMITE',650,450,'YELLOW'],['2026-10-10','YOSEMITE','ELKO',530,420,'YELLOW']]);
  assert.equal(run('alter2ApprovalReady(globalThis.vegasAnalysis)'), true, 'the internally consistent verified non-RED repair is approval-ready');
  run("alter2Pending=globalThis.vegasAnalysis; showAlter2FinalProposal(); globalThis.vegasReview=renderAlter2ChangeRows(globalThis.vegasAnalysis); globalThis.vegasStateAfterReview=JSON.stringify(state); globalThis.vegasStorageAfterReview=localStorage.getItem(STORE)");
  assert.match(context.vegasReview, /Tue 6 Oct — las vegas[\s\S]*Wed 7 Oct — LAS VEGAS → YOSEMITE[\s\S]*650 km[\s\S]*7 hr 30 min[\s\S]*YELLOW/i);
  assert.match(context.vegasReview, /Sat 10 Oct — YOSEMITE → ELKO[\s\S]*530 km[\s\S]*7 hr[\s\S]*YELLOW/i);
  assert.doesNotMatch(context.vegasReview, /INVALID PROPOSAL/);
  assert.equal(context.vegasStateAfterReview, context.vegasStateBefore, 'candidate verification and review do not mutate state');
  assert.equal(context.vegasStorageAfterReview, context.vegasStorageBefore, 'candidate verification and review do not write localStorage');
  run("globalThis.vegasApplied=approveAlter2Changes(); globalThis.vegasCards=(document.getElementById('content').innerHTML.match(/<article class=\"card/g)||[]).length; globalThis.vegasBookingsAfter=JSON.stringify(CONFIRMED_BOOKING_WINDOWS); globalThis.vegasMustAfter=JSON.stringify(DAYS.filter(day=>String(day.status||'').toUpperCase()==='MUST DO')); globalThis.vegas20=mergedDays().find(day=>day.date==='2026-10-20'); resetEdits(); globalThis.vegasReset6=mergedDays().find(day=>day.date==='2026-10-06'); globalThis.vegasReset12=mergedDays().find(day=>day.date==='2026-10-12')");
  assert.equal(context.vegasApplied, true);
  assert.equal(context.vegasCards, 57);
  assert.equal(context.vegasBookingsAfter, context.vegasBookingsBefore, 'confirmed bookings remain byte-for-byte unchanged');
  assert.equal(context.vegasMustAfter, context.vegasMustBefore, 'master MUST DO items remain byte-for-byte unchanged');
  assert.match(context.vegas20.dest, /RV RETURN → SAN FRANCISCO/, 'the protected 20 October commitment is not rewritten');
  assert.match(context.vegasReset6.dest, /LAS VEGAS → YOSEMITE/, 'Reset Edits restores the original departure day');
  assert.match(context.vegasReset12.plan, /Final rest day • Prepare for Yellowstone/, 'Reset Edits restores the sacrificed master day exactly');

  run('RouteIntelligence.setProvider(null)');
  const missingRoute = await run("RouteIntelligence.resolveAsync({origin:'Origin',destination:'Destination',days:[]})");
  assert.equal(missingRoute.status, 'route_confirmation_required');
  assert.equal(missingRoute.distanceKm, null);
  assert.doesNotMatch(html, /\b(?:pk|sk)\.[A-Za-z0-9_-]{10,}/, 'no Mapbox credential is present in the project source');
}

runRouteIntelligenceAsyncTests()
  .then(() => console.log('Alter Trip Stage 3 tests passed.'))
  .catch(error => { console.error(error); process.exitCode = 1; });
