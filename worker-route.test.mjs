import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleRouteRequest, standardiseMapboxRoute, validateRoutePayload } from './workers/route-intelligence.js';

const workerUrl = 'https://dwajp.example/api/route';
const liveEnv = { ROUTE_INTELLIGENCE_LIVE_ENABLED: 'true', MAPBOX_ACCESS_TOKEN: true };
const validPayload = {
  origin: { label: 'Origin', coordinates: [-86.78, 36.16] },
  destination: { label: 'Destination', coordinates: [-90.07, 29.95] }
};
const mapboxRoute = {
  routes: [{
    distance: 487600,
    duration: 18000,
    geometry: { type: 'LineString', coordinates: [[-86.78, 36.16], [-90.07, 29.95]] },
    waypoints: [{ name: 'Origin', location: [-86.78, 36.16] }, { name: 'Destination', location: [-90.07, 29.95] }]
  }]
};
const request = body => new Request(workerUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const jsonResponse = body => ({ ok: true, json: async () => body });

let response = await handleRouteRequest(new Request(workerUrl, { method: 'OPTIONS' }), {});
assert.equal(response.status, 204);
assert.equal(response.headers.get('access-control-allow-origin'), 'https://dwajp-trip.pages.dev');

// Valid coordinates form the live-routing contract; labels remain available for presentation.
assert.deepEqual(validateRoutePayload(validPayload).origin.coordinates, [-86.78, 36.16]);

response = await handleRouteRequest(request({ destination: validPayload.destination }), {});
assert.equal(response.status, 400);
assert.equal((await response.json()).code, 'invalid_request');

response = await handleRouteRequest(request({ origin: validPayload.origin }), {});
assert.equal(response.status, 400);
assert.equal((await response.json()).code, 'invalid_request');

response = await handleRouteRequest(request({ origin: { label: 'Origin', coordinates: [200, 10] }, destination: validPayload.destination }), {});
assert.equal(response.status, 400);
assert.match((await response.json()).message, /coordinates/);

response = await handleRouteRequest(request(validPayload), {});
assert.equal(response.status, 503);
assert.equal((await response.json()).code, 'routing_disabled');

// Mock-only response normalization: no internet request or real credential is needed.
const standardized = standardiseMapboxRoute(mapboxRoute, validateRoutePayload(validPayload));
assert.equal(standardized.verification, 'verified');
assert.equal(standardized.provider, 'mapbox-directions');
assert.equal(standardized.roadDistanceKm, 487.6);
assert.equal(standardized.estimatedDrivingMinutes, 300);
assert.equal(standardized.geometry.coordinates.length, 2);
assert.equal(standardized.waypoints.length, 2);

response = await handleRouteRequest(request(validPayload), liveEnv, async () => ({ ok: false, status: 502 }));
assert.equal(response.status, 503);
assert.equal((await response.json()).code, 'routing_unavailable');

response = await handleRouteRequest(request(validPayload), liveEnv, async () => jsonResponse({ routes: [{}] }));
assert.equal(response.status, 503);
assert.equal((await response.json()).code, 'malformed_route_response');

response = await handleRouteRequest(request(validPayload), liveEnv, async () => jsonResponse(mapboxRoute));
assert.equal(response.status, 200);
const successfulBody = await response.json();
assert.equal(successfulBody.verification, 'verified');
assert.equal(successfulBody.roadDistanceKm, 487.6);
assert.equal(successfulBody.estimatedDrivingMinutes, 300);
assert.equal(successfulBody.geometry.coordinates.length, 2);
assert.doesNotMatch(JSON.stringify(successfulBody), /MAPBOX_ACCESS_TOKEN|access_token/i);

// Cloudflare supplies an execution context as the third fetch-handler argument;
// it must not replace the native fetch implementation used in production.
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => jsonResponse(mapboxRoute);
try {
  response = await handleRouteRequest(request(validPayload), liveEnv, { waitUntil() {} });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).verification, 'verified');
} finally {
  globalThis.fetch = originalFetch;
}

assert.doesNotMatch(readFileSync(new URL('./workers/route-intelligence.js', import.meta.url), 'utf8'), /\b(?:pk|sk)\.[A-Za-z0-9_-]{10,}/, 'Worker source contains no credential');

console.log('Worker route tests passed.');
