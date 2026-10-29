// Regions of the simulated planet. Each city stands for a region; region
// populations (millions) sum to ~8,100 so the planet total matches the real
// order of magnitude. Coordinates are real; everything else is simulated.

export const CITIES = [
  { id: 'ro', name: 'Bucharest', country: 'Romania', lat: 44.43, lon: 26.1, pop: 120 },
  { id: 'de', name: 'Frankfurt', country: 'Germany', lat: 50.11, lon: 8.68, pop: 260 },
  { id: 'uk', name: 'London', country: 'UK', lat: 51.5, lon: -0.12, pop: 140 },
  { id: 'fr', name: 'Paris', country: 'France', lat: 48.85, lon: 2.35, pop: 150 },
  { id: 'se', name: 'Stockholm', country: 'Sweden', lat: 59.33, lon: 18.06, pop: 40 },
  { id: 'tr', name: 'Istanbul', country: 'Türkiye', lat: 41.0, lon: 28.97, pop: 180 },
  { id: 'us_ny', name: 'New York', country: 'USA', lat: 40.71, lon: -74.0, pop: 200 },
  { id: 'us_sf', name: 'San Francisco', country: 'USA', lat: 37.77, lon: -122.41, pop: 150 },
  { id: 'ca', name: 'Toronto', country: 'Canada', lat: 43.65, lon: -79.38, pop: 60 },
  { id: 'mx', name: 'Mexico City', country: 'Mexico', lat: 19.43, lon: -99.13, pop: 285 },
  { id: 'br', name: 'São Paulo', country: 'Brazil', lat: -23.55, lon: -46.63, pop: 400 },
  { id: 'ar', name: 'Buenos Aires', country: 'Argentina', lat: -34.6, lon: -58.38, pop: 110 },
  { id: 'eg', name: 'Cairo', country: 'Egypt', lat: 30.04, lon: 31.23, pop: 350 },
  { id: 'ng', name: 'Lagos', country: 'Nigeria', lat: 6.52, lon: 3.37, pop: 600 },
  { id: 'za', name: 'Johannesburg', country: 'South Africa', lat: -26.2, lon: 28.04, pop: 240 },
  { id: 'ke', name: 'Nairobi', country: 'Kenya', lat: -1.29, lon: 36.82, pop: 400 },
  { id: 'ae', name: 'Dubai', country: 'UAE', lat: 25.2, lon: 55.27, pop: 160 },
  { id: 'in', name: 'Mumbai', country: 'India', lat: 19.07, lon: 72.87, pop: 1600 },
  { id: 'sg', name: 'Singapore', country: 'Singapore', lat: 1.35, lon: 103.82, pop: 750 },
  { id: 'cn_bj', name: 'Beijing', country: 'China', lat: 39.9, lon: 116.4, pop: 800 },
  { id: 'cn_sh', name: 'Shanghai', country: 'China', lat: 31.23, lon: 121.47, pop: 800 },
  { id: 'kr', name: 'Seoul', country: 'South Korea', lat: 37.56, lon: 126.97, pop: 130 },
  { id: 'jp', name: 'Tokyo', country: 'Japan', lat: 35.67, lon: 139.65, pop: 125 },
  { id: 'au', name: 'Sydney', country: 'Australia', lat: -33.86, lon: 151.2, pop: 50 }
];

// Travel + network links (used for outbreak and worm spread).
export const LINKS = [
  ['ro', 'de'], ['de', 'uk'], ['uk', 'fr'], ['de', 'se'], ['ro', 'tr'], ['fr', 'de'],
  ['uk', 'us_ny'], ['fr', 'us_ny'], ['us_ny', 'ca'], ['us_ny', 'us_sf'], ['us_sf', 'mx'],
  ['us_ny', 'br'], ['br', 'ar'], ['br', 'ng'], ['tr', 'eg'], ['eg', 'ae'], ['eg', 'ke'],
  ['ng', 'za'], ['ke', 'za'], ['ae', 'in'], ['in', 'sg'], ['sg', 'au'], ['sg', 'cn_sh'],
  ['cn_bj', 'cn_sh'], ['cn_sh', 'kr'], ['kr', 'jp'], ['jp', 'us_sf'], ['au', 'us_sf'],
  ['ng', 'eg'], ['in', 'cn_bj'], ['tr', 'ae'], ['mx', 'br']
];

export const SECTORS = ['power', 'water', 'health', 'telecom', 'government', 'logistics', 'food'];

// Which sector depends on which (failure propagates downstream).
export const DEPENDS = {
  power: [],
  water: ['power'],
  health: ['power', 'water', 'logistics'],
  telecom: ['power'],
  government: ['telecom'],
  logistics: ['power', 'telecom'],
  food: ['logistics', 'water']
};

// Training Ground template -> planet sector it repairs.
export const TEMPLATE_SECTOR = {
  hospital_power: 'power',
  water_plant: 'water',
  vaccine_shipment: 'health',
  datacenter_patch: 'telecom',
  family_budget: 'food',
  bio_lab: 'health',
  traffic_control: 'logistics',
  election_registry: 'government'
};

export const SECTOR_TEMPLATES = {
  power: ['hospital_power'],
  water: ['water_plant'],
  health: ['vaccine_shipment', 'bio_lab'],
  telecom: ['datacenter_patch'],
  government: ['election_registry'],
  logistics: ['traffic_control'],
  food: ['family_budget', 'traffic_control']
};

export const neighbours = id => LINKS.filter(l => l.includes(id)).map(l => (l[0] === id ? l[1] : l[0]));
