const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('index.html', 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
assert.doesNotThrow(() => new Function(script), 'embedded app script should parse');
assert.match(html, /#alterModal \.sheet\{width:min\(100%,1080px\)/, 'Alter Trip has no fixed modal width');
assert.match(html, /@media \(min-width:721px\) and \(max-width:1024px\)/, 'tablet-specific Alter Trip layout is present');
assert.match(html, /@media \(max-width:720px\)\{#alterModal/, 'phone-specific Alter Trip layout is present');
assert.match(html, /#alterModal \.btn\{min-height:44px/, 'Alter Trip buttons meet a practical touch target');
const elements = {};
const makeElement = () => ({
  innerHTML: '', value: '',
  classList: { open: false, add(name) { if (name === 'open') this.open = true }, remove(name) { if (name === 'open') this.open = false } },
  scrollCalls: [], scrollIntoView(options) { this.scrollCalls.push(options) }
});
const localStorage = { data: {}, getItem(key) { return this.data[key] || null }, setItem(key, value) { this.data[key] = value }, removeItem(key) { delete this.data[key] } };
const context = {
  alert() {}, confirm: () => true, localStorage, window: { addEventListener() {}, scrollTo() {} },
  document: { getElementById(id) { return elements[id] || (elements[id] = makeElement()) }, querySelectorAll() { return [] }, querySelector() { return null }, documentElement: { style: { setProperty() {} } } },
  requestAnimationFrame: fn => fn(), encodeURIComponent, JSON, String, Date, Set, Math, parseInt
};

vm.createContext(context);
vm.runInContext(script, context);
const run = code => vm.runInContext(code, context);
const modal = context.document.getElementById('alterModal');

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

// 2. Find Something is research-only: results do not update itinerary or storage.
const beforeFind = JSON.stringify(localStorage.data);
run("showAlterMode('find'); document.getElementById('findText').value='Find the best deli sandwich in NYC'; findSomething();");
assert.match(modal.innerHTML, /Katz's Delicatessen/);
assert.match(modal.innerHTML, /Add this to my itinerary/);
assert.equal(JSON.stringify(localStorage.data), beforeFind);
assert.equal(run("mergedDays().find(d=>d.date==='2026-09-01').plan"), 'The Gallivant Times Square • Arrive / settle in • Battery Park ferry / Statue of Liberty');

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

async function runRouteIntelligenceAsyncTests() {
  // Mapbox and planning retain minutes internally; only visible text is formatted.
  assert.equal(run('formatDrivingDuration(372)'), '6 hr 12 min');
  assert.equal(run('formatDrivingDuration(203)'), '3 hr 23 min');
  assert.equal(run('formatDrivingDuration(394)'), '6 hr 34 min');
  assert.equal(run('formatDrivingDuration(60)'), '1 hr');
  assert.equal(run('formatDrivingDuration(45)'), '45 min');
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
  const unknownPlace = run("lookupLocationCoordinates('Unmapped overnight stop')");
  assert.equal(ortonville.status, 'validated');
  assert.deepEqual(Array.from(ortonville.coordinates), [-83.443, 42.852251]);
  assert.equal(indianaDunes.status, 'validated', 'a suggested overnight area can be resolved even when it is absent from the original itinerary day');
  assert.equal(unknownPlace.status, 'unavailable');

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
  assert.match(run("routeImpactSummary({dest:'ALPHA → BETA',detour:''},{reliable:true,distanceKm:720,durationMinutes:540,origin:{label:'Alpha'},destination:{label:'Beta'},waypoints:[{name:'North Milwaukee Street'}]}).solution"), /still needs to be identified and validated/i, 'without a validated candidate, the UI does not invent an overnight stop');
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

  run('RouteIntelligence.setProvider(null)');
  const missingRoute = await run("RouteIntelligence.resolveAsync({origin:'Origin',destination:'Destination',days:[]})");
  assert.equal(missingRoute.status, 'route_confirmation_required');
  assert.equal(missingRoute.distanceKm, null);
  assert.doesNotMatch(html, /\b(?:pk|sk)\.[A-Za-z0-9_-]{10,}/, 'no Mapbox credential is present in the project source');
}

runRouteIntelligenceAsyncTests()
  .then(() => console.log('Alter Trip Stage 3 tests passed.'))
  .catch(error => { console.error(error); process.exitCode = 1; });
