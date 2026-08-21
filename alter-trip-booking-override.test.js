const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const store = new Map();
const context = {
  console,
  Date,
  Math,
  globalThis: {},
  sessionStorage: {
    setItem(k,v){ store.set(k,v); },
    getItem(k){ return store.has(k) ? store.get(k) : null; },
    removeItem(k){ store.delete(k); }
  }
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync('alter-trip-booking-override.js','utf8'), context);
const api = context.DWAJPAlterBookingOverride;

const bookings = [
  {id:'gallivant', name:'The Gallivant Times Square', category:'Accommodation', startDate:'2026-09-01', endDate:'2026-09-04', status:'CONFIRMED', confirmed:true},
  {id:'rv', name:'Cruise America RV', category:'Car / RV Hire', startDate:'2026-09-04', endDate:'2026-10-20', status:'CONFIRMED', confirmed:true},
  {id:'later', name:'Later Hotel', category:'Accommodation', startDate:'2026-09-10', endDate:'2026-09-12', status:'CONFIRMED', confirmed:true}
];

const blockers = api.findBlockingBookings(bookings, '2026-09-03', '2026-09-03');
assert.strictEqual(blockers.length, 1);
assert.strictEqual(blockers[0].name, 'The Gallivant Times Square');
assert.ok(api.describeBlockers(blockers).includes('The Gallivant Times Square'));

const departureMatch = api.chooseBlockingBookings(
  bookings,
  '2026-09-04',
  'Move New York departure from 4 September to 3 September',
  [bookings[1]]
);
assert.strictEqual(departureMatch.length, 1);
assert.strictEqual(departureMatch[0].name, 'Cruise America RV');
const departureSolutions = api.solutionCopy({request:'Move New York departure from 4 September to 3 September'}, departureMatch);
assert.ok(departureSolutions.some(x=>x.includes('Cruise America RV')));
assert.ok(departureSolutions.some(x=>x.includes('will not change a real reservation')));
assert.ok(departureSolutions.some(x=>x.includes('leave the trip unchanged')));

const frenchQuarter = {id:'fq',name:'French Quarter RV Resort',category:'RV Park / Campground',startDate:'2026-09-22',endDate:'2026-09-24',status:'CONFIRMED',confirmed:true};
assert.strictEqual(api.bookingLocksDate(frenchQuarter,'2026-09-22'), true, 'check-in night is protected');
assert.strictEqual(api.bookingLocksDate(frenchQuarter,'2026-09-23'), true, 'second occupied night is protected');
assert.strictEqual(api.bookingLocksDate(frenchQuarter,'2026-09-24'), false, 'checkout/departure date is not an occupied night');
assert.strictEqual(api.findBlockingBookings([frenchQuarter],'2026-09-23','2026-09-23').length, 1);
assert.strictEqual(api.findBlockingBookings([frenchQuarter],'2026-09-24','2026-09-24').length, 0);
assert.strictEqual(api.chooseBlockingBookings([frenchQuarter],'2026-09-23','Leave New Orleans on 23 September',[frenchQuarter]).length, 1);
assert.strictEqual(api.chooseBlockingBookings([frenchQuarter],'2026-09-24','Leave New Orleans on 24 September and drive toward Texas',[]).length, 0, 'departure wording does not turn checkout into a booking collision');
const protectedDepartureCommand = 'Leave New Orleans on 23 September and drive toward Texas.';
const protectedDepartureBlockers = api.chooseBlockingBookings([frenchQuarter], '2026-09-23', protectedDepartureCommand, [frenchQuarter]);
const protectedDepartureCopy = api.solutionCopy({request:protectedDepartureCommand}, protectedDepartureBlockers);
assert.strictEqual(protectedDepartureBlockers.length, 1);
assert.strictEqual(protectedDepartureBlockers[0].name, 'French Quarter RV Resort');
assert.ok(protectedDepartureCopy.some(line=>line.includes('French Quarter RV Resort')), 'RED impact names the affected protected booking');
assert.ok(protectedDepartureCopy.some(line=>/review.*before releasing/i.test(line)), 'RED directs the user through explicit protected-booking release');
assert.ok(protectedDepartureCopy.some(line=>/will not change a real reservation/i.test(line)), 'release explanation preserves the real confirmed booking');
assert.ok(protectedDepartureCopy.some(line=>/leave the trip unchanged/i.test(line)), 'LEAVE IT remains a clear unchanged option');

const normalMatch = api.chooseBlockingBookings(
  bookings,
  '2026-09-04',
  'Change the RV pickup time on 4 September',
  [bookings[1]]
);
assert.strictEqual(normalMatch.length, 1);
assert.strictEqual(normalMatch[0].name, 'Cruise America RV');

const state = api.beginOverride(blockers, 'Leave New York on 3 September');
assert.ok(state.token);
assert.strictEqual(api.canWriteWithOverride(state.token), true);
assert.strictEqual(api.canWriteWithOverride('wrong-token'), false);

const changed = api.markBookingsNeedsChanging(bookings, ['gallivant']);
assert.strictEqual(changed[0].status, 'NEEDS CHANGING');
assert.strictEqual(changed[0].confirmed, false);
assert.strictEqual(changed[0].needsChanging, true);
assert.strictEqual(changed[1].status, 'CONFIRMED');

api.clearOverride();
assert.strictEqual(api.canWriteWithOverride(state.token), false);
console.log('Alter Trip booking override helper tests passed');
