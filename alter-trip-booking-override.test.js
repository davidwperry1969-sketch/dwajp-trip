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
  {id:'gallivant', name:'The Gallivant Times Square', startDate:'2026-09-01', endDate:'2026-09-04', status:'CONFIRMED', confirmed:true},
  {id:'later', name:'Later Hotel', startDate:'2026-09-10', endDate:'2026-09-12', status:'CONFIRMED', confirmed:true}
];

const blockers = api.findBlockingBookings(bookings, '2026-09-03', '2026-09-03');
assert.strictEqual(blockers.length, 1);
assert.strictEqual(blockers[0].name, 'The Gallivant Times Square');
assert.ok(api.describeBlockers(blockers).includes('The Gallivant Times Square'));

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
