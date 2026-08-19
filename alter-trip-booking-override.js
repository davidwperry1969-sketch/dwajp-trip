/* DWAJP TRIP — Alter Trip confirmed-booking override helper
 * Confirmed means protected, not permanently frozen.
 * This module does NOT alter itinerary data itself. It only manages the
 * deliberate override state and marks affected bookings as needing change.
 */
(function (root) {
  'use strict';

  const OVERRIDE_KEY = 'dwajpAlterTripBookingOverride';

  function normaliseBooking(b) {
    return {
      id: b && (b.id || b.bookingId || b.ref) || '',
      name: b && (b.name || b.title || b.place || b.provider) || 'Confirmed booking',
      startDate: b && (b.startDate || b.fromDate || b.checkIn || b.date) || '',
      endDate: b && (b.endDate || b.toDate || b.checkOut || b.date) || '',
      confirmed: !!(b && (b.confirmed === true || String(b.status || '').toUpperCase() === 'CONFIRMED')),
      raw: b
    };
  }

  function overlaps(aStart, aEnd, bStart, bEnd) {
    if (!aStart || !bStart) return false;
    const ae = aEnd || aStart;
    const be = bEnd || bStart;
    return aStart <= be && bStart <= ae;
  }

  function findBlockingBookings(bookings, changeStart, changeEnd) {
    return (bookings || [])
      .map(normaliseBooking)
      .filter(b => b.confirmed && overlaps(b.startDate, b.endDate, changeStart, changeEnd));
  }

  function describeBlockers(blockers) {
    if (!blockers || !blockers.length) return '';
    return blockers.map(b => {
      const dates = b.startDate && b.endDate && b.startDate !== b.endDate
        ? `${b.startDate} to ${b.endDate}`
        : (b.startDate || 'date not recorded');
      return `${b.name} — confirmed ${dates}`;
    }).join('\n');
  }

  function beginOverride(blockers, requestedChange) {
    if (!blockers || !blockers.length) throw new Error('No protected booking supplied for override.');
    const state = {
      token: `override-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      requestedChange: String(requestedChange || ''),
      blockers: blockers.map(b => ({
        id: b.id,
        name: b.name,
        startDate: b.startDate,
        endDate: b.endDate
      })),
      stage: 'AWAITING_FINAL_APPROVAL'
    };
    try { sessionStorage.setItem(OVERRIDE_KEY, JSON.stringify(state)); } catch (_) {}
    return state;
  }

  function getOverride() {
    try {
      const raw = sessionStorage.getItem(OVERRIDE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  function clearOverride() {
    try { sessionStorage.removeItem(OVERRIDE_KEY); } catch (_) {}
  }

  function canWriteWithOverride(token) {
    const state = getOverride();
    return !!(state && state.stage === 'AWAITING_FINAL_APPROVAL' && state.token === token);
  }

  function markBookingsNeedsChanging(bookings, blockerIds) {
    const ids = new Set((blockerIds || []).filter(Boolean));
    return (bookings || []).map(b => {
      const n = normaliseBooking(b);
      const matches = ids.size ? ids.has(n.id) : false;
      if (!matches) return b;
      return Object.assign({}, b, {
        status: 'NEEDS CHANGING',
        confirmed: false,
        needsChanging: true,
        needsChangingReason: 'Alter Trip override affects this confirmed booking.'
      });
    });
  }

  root.DWAJPAlterBookingOverride = {
    findBlockingBookings,
    describeBlockers,
    beginOverride,
    getOverride,
    clearOverride,
    canWriteWithOverride,
    markBookingsNeedsChanging
  };
})(typeof window !== 'undefined' ? window : globalThis);
