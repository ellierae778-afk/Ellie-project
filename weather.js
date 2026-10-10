// Google's Weather API (Maps Platform) is authenticated with a plain API
// key, not the OAuth2 flow used by google.js for Calendar/Gmail/Drive/Sheets.
// It takes lat/lng, not place names, so a lookup here is really two calls:
// Geocoding API to resolve the place name, then Weather API for conditions.

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

export function isConfigured() {
  return Boolean(GOOGLE_MAPS_API_KEY);
}

export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description:
        'Get current weather conditions for a place. Returns raw condition data (temperature, humidity, wind, description, etc.) to summarize naturally for the user.',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: "City and region/country, e.g. 'Salida, Colorado' or 'Tokyo, Japan'.",
          },
        },
        required: ['location'],
      },
    },
  },
];

async function geocode(location) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
    location
  )}&key=${GOOGLE_MAPS_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== 'OK' || !data.results?.length) {
    throw new Error(`Could not find location "${location}" (${data.status})`);
  }
  const { lat, lng } = data.results[0].geometry.location;
  return { lat, lng, formattedAddress: data.results[0].formatted_address };
}

export async function executeTool(name, args) {
  if (name !== 'get_weather') {
    return { error: `Unknown tool: ${name}` };
  }
  if (!isConfigured()) {
    return {
      error:
        'Weather is not configured. Set GOOGLE_MAPS_API_KEY in .env (needs Geocoding API + Weather API enabled on the key).',
    };
  }

  try {
    const { lat, lng, formattedAddress } = await geocode(args.location);

    const url = `https://weather.googleapis.com/v1/currentConditions:lookup?key=${GOOGLE_MAPS_API_KEY}&location.latitude=${lat}&location.longitude=${lng}`;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { error: `Weather API responded with ${res.status}: ${text}` };
    }
    const data = await res.json();
    return { location: formattedAddress, conditions: data };
  } catch (err) {
    return { error: err.message };
  }
}
