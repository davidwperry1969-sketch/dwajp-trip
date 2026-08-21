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
  innerHTML: '', value: '',
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
const suggestionDates = run("DAYS.map(day=>day.date).filter(date=>date!=='2026-10-27'&&!['2026-09-22','2026-09-23'].includes(date))");
assert.equal(suggestionDates.length, 54, 'all 54 unconfirmed overnight dates are audited');
for (const date of suggestionDates) {
  const suggestionCard = run(`dayCard(mergedDays().find(day=>day.date==='${date}'))`);
  assert.match(suggestionCard, /OVERNIGHT — NOT BOOKED/, `${date} shows unconfirmed overnight options`);
  assert.match(suggestionCard, /Use this stop — connect to Alter Trip later/);
  assert.match(suggestionCard, /google\.com\/maps\/search/);
}
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

run("state={}; localStorage.removeItem(STORE); globalThis.overnightBefore=JSON.stringify(state); beginOvernightAlter2('2026-09-06',0); globalThis.overnightAnalysis=alter2Pending; globalThis.overnightAfterAnalysis=JSON.stringify(state)");
assert.equal(context.overnightAnalysis.kind, 'overnight', 'I. Use this stop enters Alter Trip 2.0');
assert.equal(context.overnightAnalysis.status, 'GREEN');
assert.equal(context.overnightAfterAnalysis, context.overnightBefore, 'overnight analysis does not write state');
assert.match(modal.innerHTML, /Four Mile Creek State Park[\s\S]*Nothing has changed/);
assert.match(run("dayCard(mergedDays().find(day=>day.date==='2026-09-06'))"), /beginOvernightAlter2\('2026-09-06',0\)/);
run("showAlter2FinalProposal(); globalThis.overnightApproved=approveAlter2Changes(); globalThis.overnightSaved=state.days['2026-09-06']");
assert.equal(context.overnightApproved, true);
assert.match(context.overnightSaved.plan, /Suggested overnight — NOT BOOKED: Four Mile Creek State Park/);
assert.match(context.overnightSaved.contact, /SUGGESTION — NOT BOOKED/);
assert.equal(context.overnightSaved.status, undefined, 'selecting a suggestion never upgrades booking status');

assert.equal(run("DAYS.find(day=>day.date==='2026-09-22').status"), 'CONFIRMED', 'J. first New Orleans booked night remains confirmed');
assert.equal(run("DAYS.find(day=>day.date==='2026-09-23').status"), 'CONFIRMED', 'J. second New Orleans booked night remains confirmed');
assert.match(run("DAYS.find(day=>day.date==='2026-09-22').plan"), /Confirmation 2026075827/);
assert.match(run("DAYS.find(day=>day.date==='2026-09-23').plan"), /Confirmation 2026075827/);
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
  run("globalThis.afterMilwaukeeState=JSON.stringify(state); globalThis.afterMilwaukeeStorage=JSON.stringify(localStorage.data); globalThis.stalePreviousAnalysis=globalThis.verifiedReview; alter2Pending=globalThis.stalePreviousAnalysis; globalThis.nashvilleFresh=analyseAlter2Request('Stay one extra night in Nashville'); globalThis.afterNashvilleAnalysisState=JSON.stringify(state); globalThis.afterNashvilleAnalysisStorage=JSON.stringify(localStorage.data)");
  assert.equal(context.nashvilleFresh.target, '2026-09-16', 'the current Nashville arrival is the new command anchor');
  assert.equal(context.nashvilleFresh.affected[0].date, '2026-09-16');
  assert.equal(context.nashvilleFresh.affected.at(-1).date, '2026-09-22', 'analysis scans to the next genuine protected commitment');
  assert.ok(context.nashvilleFresh.affected.every(item => item.date >= '2026-09-16'), 'earlier Milwaukee days are excluded');
  assert.match(context.nashvilleFresh.summary, /extra night in nashville/i);
  assert.equal(context.nashvilleFresh.request, 'Stay one extra night in Nashville');
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
  run("alter2Pending=globalThis.nashvilleFresh; globalThis.bufferRepairIndex=globalThis.nashvilleFresh.repairs.findIndex(option=>option.id==='use-buffer'); globalThis.repairSelected=selectAlter2Repair(globalThis.bufferRepairIndex); globalThis.selectedRepairReady=alter2ApprovalReady(globalThis.nashvilleFresh); globalThis.stateAfterRepairSelection=JSON.stringify(state); globalThis.storageAfterRepairSelection=JSON.stringify(localStorage.data); delete globalThis.nashvilleFresh.selectedRepairIndex");
  assert.equal(context.repairSelected, true);
  assert.equal(context.selectedRepairReady, true, 'only a selected fully verified repair exposes approval readiness');
  assert.equal(context.stateAfterRepairSelection, context.afterMilwaukeeState, 'repair selection does not mutate itinerary state');
  assert.equal(context.storageAfterRepairSelection, context.afterMilwaukeeStorage, 'repair selection does not write localStorage');
  run("alter2Pending=globalThis.nashvilleFresh; selectAlter2Repair(globalThis.bufferRepairIndex); globalThis.repairReviewPlan=alter2SelectedRepair(globalThis.nashvilleFresh).changes[0].changes.plan; globalThis.safeRepairApplied=approveAlter2Changes(); globalThis.committedRepairPlans=Object.values(state.days).map(day=>day.plan||'').join('\\n'); globalThis.committedRepairStorage=localStorage.getItem(STORE)");
  assert.match(context.repairReviewPlan, /PROPOSED ONLY/i, 'proposal-only wording remains visible in repair review before approval');
  assert.equal(context.safeRepairApplied, true, 'the selected fully verified non-RED repair can be approved');
  assert.doesNotMatch(context.committedRepairPlans, /PROPOSED ONLY/i, 'approved repair write-back removes proposal-only wording');
  assert.doesNotMatch(context.committedRepairStorage, /PROPOSED ONLY/i, 'persisted approved repair data contains no proposal-only wording');
  assert.match(context.committedRepairStorage, /SUGGESTION — NOT BOOKED/i, 'unconfirmed overnight wording remains explicit after approval');
  assert.equal(run("mergedDays().find(day=>day.date==='2026-09-23').dest"), 'NEW ORLEANS', 'repair approval retains the occupied second night as a New Orleans stay');
  assert.equal(run("mergedDays().find(day=>day.date==='2026-09-23').status"), 'CONFIRMED');
  assert.equal(run("state.days['2026-09-22']"), undefined, 'repair approval does not write the confirmed check-in night');
  assert.equal(run("state.days['2026-09-23']"), undefined, 'repair approval does not write the confirmed second night');
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

  run('RouteIntelligence.setProvider(null)');
  const missingRoute = await run("RouteIntelligence.resolveAsync({origin:'Origin',destination:'Destination',days:[]})");
  assert.equal(missingRoute.status, 'route_confirmation_required');
  assert.equal(missingRoute.distanceKm, null);
  assert.doesNotMatch(html, /\b(?:pk|sk)\.[A-Za-z0-9_-]{10,}/, 'no Mapbox credential is present in the project source');
}

runRouteIntelligenceAsyncTests()
  .then(() => console.log('Alter Trip Stage 3 tests passed.'))
  .catch(error => { console.error(error); process.exitCode = 1; });
