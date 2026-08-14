const CORS_HEADERS = { 'access-control-allow-origin': 'https://dwajp-trip.pages.dev', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', vary: 'Origin' };
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS_HEADERS };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function routeConfirmationRequired(code, message, status = 503) {
  return json({ verification: 'route_confirmation_required', code, message }, status);
}

function sanitiseMapboxMessage(message, status) {
  const fallback = Number.isInteger(status) ? `Mapbox returned HTTP ${status}.` : 'Mapbox route request failed.';
  if (typeof message !== 'string' || !message.trim()) return fallback;
  return message
    .replace(/https?:\/\/\S+/gi, '[redacted URL]')
    .replace(/\b(?:access[_-]?token|token)\s*[=:]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/\b(?:pk|sk)\.[A-Za-z0-9_-]+/g, '[redacted token]')
    .trim()
    .slice(0, 240) || fallback;
}

async function mapboxFailure(response) {
  const status = Number.isInteger(response?.status) ? response.status : undefined;
  let message = '';
  try {
    const payload = await response.json();
    message = typeof payload?.message === 'string' ? payload.message : typeof payload?.error === 'string' ? payload.error : '';
  } catch {
    try { message = await response.text(); } catch { /* Use the safe fallback below. */ }
  }
  return json({
    verification: 'route_confirmation_required',
    code: 'routing_unavailable',
    message: sanitiseMapboxMessage(message, status || 'an unavailable status')
  }, 503);
}

function validCoordinates(value) {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite) && value[0] >= -180 && value[0] <= 180 && value[1] >= -90 && value[1] <= 90;
}

export function normaliseLocation(value, field) {
  if (typeof value === 'string') {
    const label = value.trim();
    if (!label || label.length > 200) throw new Error(`${field} must be a non-empty location string or location object.`);
    return { label, coordinates: null };
  }
  if (!value || typeof value !== 'object') throw new Error(`${field} must be a non-empty location string or location object.`);
  const label = typeof value.label === 'string' && value.label.trim() ? value.label.trim() : null;
  const coordinates = value.coordinates;
  if (coordinates !== undefined && !validCoordinates(coordinates)) throw new Error(`${field}.coordinates must be [longitude, latitude].`);
  if (!label && !coordinates) throw new Error(`${field} requires a label or coordinates.`);
  return { label: label || `${coordinates[0]},${coordinates[1]}`, coordinates: coordinates || null };
}

export function validateRoutePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Request body must be a JSON object.');
  const origin = normaliseLocation(payload.origin, 'origin');
  const destination = normaliseLocation(payload.destination, 'destination');
  const profile = payload.profile === 'mapbox/driving-traffic' ? 'mapbox/driving-traffic' : 'mapbox/driving';
  return { origin, destination, profile };
}

export function standardiseMapboxRoute(payload, request) {
  const route = payload?.routes?.[0];
  const distanceMeters = Number(route?.distance);
  const durationSeconds = Number(route?.duration);
  const geometry = route?.geometry;
  if (!route || !Number.isFinite(distanceMeters) || distanceMeters < 0 || !Number.isFinite(durationSeconds) || durationSeconds < 0 || !Array.isArray(geometry?.coordinates) || geometry.coordinates.length < 2) return null;
  return {
    verification: 'verified',
    provider: 'mapbox-directions',
    origin: request.origin,
    destination: request.destination,
    roadDistanceKm: Math.round(distanceMeters / 100) / 10,
    estimatedDrivingMinutes: Math.round(durationSeconds / 60),
    geometry: { type: geometry.type || 'LineString', coordinates: geometry.coordinates },
    waypoints: Array.isArray(route.waypoints) ? route.waypoints : Array.isArray(payload.waypoints) ? payload.waypoints : [],
    overnightAreas: []
  };
}

function coordinatesFor(location) {
  return location.coordinates ? location.coordinates.join(',') : null;
}

export async function handleRouteRequest(request, env, contextOrFetch) {
  // Cloudflare invokes fetch handlers as (request, env, ctx). Tests may pass a
  // fetch function as the third argument, so only accept a function as a mock.
  const fetchFn = typeof contextOrFetch === 'function' ? contextOrFetch : fetch;
  const url = new URL(request.url);
  if (request.method === 'OPTIONS' && url.pathname === '/api/route') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (url.pathname !== '/api/route') return json({ error: 'Not found.' }, 404);
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  let routeRequest;
  try {
    routeRequest = validateRoutePayload(await request.json());
  } catch (error) {
    return json({ verification: 'route_confirmation_required', code: 'invalid_request', message: String(error.message || error) }, 400);
  }

  if (env.ROUTE_INTELLIGENCE_LIVE_ENABLED !== 'true') return routeConfirmationRequired('routing_disabled', 'Live route intelligence is disabled. Confirm route distance before applying changes.');
  if (!env.MAPBOX_ACCESS_TOKEN) return routeConfirmationRequired('routing_not_configured', 'Live route intelligence is not configured. Confirm route distance before applying changes.');
  if (!coordinatesFor(routeRequest.origin) || !coordinatesFor(routeRequest.destination)) return routeConfirmationRequired('coordinates_required', 'Coordinates are required for live road routing. Confirm route distance before applying changes.', 422);

  const coordinates = `${coordinatesFor(routeRequest.origin)};${coordinatesFor(routeRequest.destination)}`;
  const query = new URLSearchParams({ geometries: 'geojson', overview: 'full', annotations: 'distance,duration', access_token: env.MAPBOX_ACCESS_TOKEN });
  let response;
  try {
    response = await fetchFn(`https://api.mapbox.com/directions/v5/${routeRequest.profile}/${coordinates}?${query}`);
  } catch {
    return routeConfirmationRequired('routing_unavailable', 'Route provider is unavailable. Confirm route distance before applying changes.');
  }
  if (!response.ok) return mapboxFailure(response);

  let mapboxPayload;
  try {
    mapboxPayload = await response.json();
  } catch {
    return routeConfirmationRequired('malformed_route_response', 'Route provider returned an invalid response. Confirm route distance before applying changes.');
  }
  const result = standardiseMapboxRoute(mapboxPayload, routeRequest);
  return result ? json(result) : routeConfirmationRequired('malformed_route_response', 'Route provider returned an invalid response. Confirm route distance before applying changes.');
}

export default { fetch: handleRouteRequest };
