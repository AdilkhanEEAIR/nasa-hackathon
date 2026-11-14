import { distanceKm, bearingDeg } from './geo.js';

export const CITIES = [
  ['Bishkek', 42.87, 74.59], ['Osh', 40.51, 72.81], ['Almaty', 43.24, 76.89], ['Astana', 51.17, 71.45],
  ['Tashkent', 41.30, 69.24], ['Samarkand', 39.65, 66.96], ['Dushanbe', 38.56, 68.79], ['Ashgabat', 37.95, 58.38],
  ['Urumqi', 43.83, 87.62], ['Kashgar', 39.47, 75.99],
  ['Delhi', 28.61, 77.21], ['Mumbai', 19.08, 72.88], ['Kolkata', 22.57, 88.36], ['Chennai', 13.08, 80.27],
  ['Bengaluru', 12.97, 77.59], ['Hyderabad', 17.39, 78.49], ['Ahmedabad', 23.02, 72.57], ['Pune', 18.52, 73.86],
  ['Lucknow', 26.85, 80.95], ['Jaipur', 26.91, 75.79], ['Nagpur', 21.15, 79.09], ['Patna', 25.59, 85.14],
  ['Karachi', 24.86, 67.01], ['Lahore', 31.55, 74.34], ['Islamabad', 33.68, 73.05], ['Kabul', 34.56, 69.21],
  ['Dhaka', 23.81, 90.41], ['Kathmandu', 27.72, 85.32], ['Colombo', 6.93, 79.86],
  ['Beijing', 39.90, 116.41], ['Shanghai', 31.23, 121.47], ['Guangzhou', 23.13, 113.26], ['Shenzhen', 22.54, 114.06],
  ['Chongqing', 29.56, 106.55], ['Chengdu', 30.57, 104.07], ['Wuhan', 30.59, 114.31], ['Xi\'an', 34.34, 108.94],
  ['Lanzhou', 36.06, 103.83], ['Kunming', 25.04, 102.71], ['Harbin', 45.80, 126.53], ['Hong Kong', 22.32, 114.17],
  ['Taipei', 25.03, 121.57], ['Seoul', 37.57, 126.98], ['Pyongyang', 39.04, 125.76], ['Tokyo', 35.68, 139.69],
  ['Osaka', 34.69, 135.50], ['Ulaanbaatar', 47.89, 106.91], ['Hanoi', 21.03, 105.85], ['Ho Chi Minh City', 10.82, 106.63],
  ['Bangkok', 13.76, 100.50], ['Yangon', 16.84, 96.17], ['Kuala Lumpur', 3.14, 101.69], ['Singapore', 1.35, 103.82],
  ['Jakarta', -6.21, 106.85], ['Manila', 14.60, 120.98], ['Phnom Penh', 11.56, 104.93],
  ['Tehran', 35.69, 51.39], ['Baghdad', 33.31, 44.36], ['Riyadh', 24.71, 46.68], ['Dubai', 25.20, 55.27],
  ['Doha', 25.29, 51.53], ['Kuwait City', 29.38, 47.98], ['Damascus', 33.51, 36.28], ['Beirut', 33.89, 35.50],
  ['Amman', 31.95, 35.93], ['Jerusalem', 31.77, 35.21], ['Istanbul', 41.01, 28.98], ['Ankara', 39.93, 32.86],
  ['Baku', 40.41, 49.87], ['Tbilisi', 41.72, 44.79], ['Yerevan', 40.18, 44.51], ['Muscat', 23.59, 58.41], ['Sanaa', 15.37, 44.19],
  ['Moscow', 55.76, 37.62], ['Saint Petersburg', 59.93, 30.34], ['Kyiv', 50.45, 30.52], ['Kharkiv', 49.99, 36.23],
  ['Odesa', 46.48, 30.72], ['Minsk', 53.90, 27.56], ['Warsaw', 52.23, 21.01], ['Berlin', 52.52, 13.40],
  ['Hamburg', 53.55, 9.99], ['Munich', 48.14, 11.58], ['Frankfurt', 50.11, 8.68], ['Paris', 48.86, 2.35],
  ['London', 51.51, -0.13], ['Manchester', 53.48, -2.24], ['Dublin', 53.35, -6.26], ['Amsterdam', 52.37, 4.90],
  ['Brussels', 50.85, 4.35], ['Madrid', 40.42, -3.70], ['Barcelona', 41.39, 2.17], ['Lisbon', 38.72, -9.14],
  ['Rome', 41.90, 12.50], ['Milan', 45.46, 9.19], ['Vienna', 48.21, 16.37], ['Prague', 50.08, 14.44],
  ['Budapest', 47.50, 19.04], ['Bucharest', 44.43, 26.10], ['Sofia', 42.70, 23.32], ['Belgrade', 44.79, 20.45],
  ['Athens', 37.98, 23.73], ['Stockholm', 59.33, 18.07], ['Oslo', 59.91, 10.75], ['Helsinki', 60.17, 24.94],
  ['Copenhagen', 55.68, 12.57], ['Reykjavik', 64.15, -21.94],
  ['Cairo', 30.04, 31.24], ['Alexandria', 31.20, 29.92], ['Khartoum', 15.50, 32.56], ['Addis Ababa', 9.03, 38.74],
  ['Nairobi', -1.29, 36.82], ['Dar es Salaam', -6.79, 39.21], ['Kinshasa', -4.44, 15.27], ['Luanda', -8.84, 13.23],
  ['Lagos', 6.52, 3.38], ['Abuja', 9.08, 7.40], ['Kano', 12.00, 8.52], ['Accra', 5.60, -0.19], ['Abidjan', 5.36, -4.01],
  ['Dakar', 14.72, -17.47], ['Casablanca', 33.57, -7.59], ['Algiers', 36.75, 3.06], ['Tunis', 36.81, 10.18],
  ['Tripoli', 32.89, 13.19], ['Johannesburg', -26.20, 28.05], ['Cape Town', -33.92, 18.42], ['Durban', -29.86, 31.02],
  ['Lusaka', -15.39, 28.32], ['Harare', -17.83, 31.05], ['Antananarivo', -18.88, 47.51], ['Kampala', 0.35, 32.58],
  ['New York', 40.71, -74.01], ['Washington', 38.91, -77.04], ['Boston', 42.36, -71.06], ['Chicago', 41.88, -87.63],
  ['Atlanta', 33.75, -84.39], ['Miami', 25.76, -80.19], ['Houston', 29.76, -95.37], ['Dallas', 32.78, -96.80],
  ['Denver', 39.74, -104.99], ['Phoenix', 33.45, -112.07], ['Los Angeles', 34.05, -118.24], ['San Francisco', 37.77, -122.42],
  ['Seattle', 47.61, -122.33], ['Toronto', 43.65, -79.38], ['Montreal', 45.50, -73.57], ['Vancouver', 49.28, -123.12],
  ['Anchorage', 61.22, -149.90], ['Mexico City', 19.43, -99.13], ['Guadalajara', 20.66, -103.35], ['Monterrey', 25.69, -100.32],
  ['Havana', 23.11, -82.37], ['Bogota', 4.71, -74.07], ['Caracas', 10.48, -66.90], ['Lima', -12.05, -77.04],
  ['Quito', -0.18, -78.47], ['Santiago', -33.45, -70.67], ['Buenos Aires', -34.60, -58.38], ['Sao Paulo', -23.55, -46.63],
  ['Rio de Janeiro', -22.91, -43.17], ['Brasilia', -15.79, -47.88], ['Manaus', -3.12, -60.02], ['La Paz', -16.50, -68.15],
  ['Honolulu', 21.31, -157.86],
  ['Sydney', -33.87, 151.21], ['Melbourne', -37.81, 144.96], ['Brisbane', -27.47, 153.03], ['Perth', -31.95, 115.86],
  ['Adelaide', -34.93, 138.60], ['Darwin', -12.46, 130.84], ['Auckland', -36.85, 174.76], ['Port Moresby', -9.44, 147.18],
].map(([name, lat, lon]) => ({ name, lat, lon }));

const WATERS = [
  ['the Mediterranean Sea', 30, 46, -6, 36], ['the Black Sea', 40.5, 47, 27, 42], ['the Caspian Sea', 36.5, 47.5, 46.5, 55],
  ['the Red Sea', 12, 30, 32, 44], ['the Persian Gulf', 23, 30.5, 47.5, 57], ['the Bay of Bengal', 5, 23, 80, 95],
  ['the Arabian Sea', 5, 25, 51, 78], ['the South China Sea', 0, 23, 105, 121], ['the Gulf of Mexico', 18, 31, -98, -81],
  ['the Caribbean Sea', 9, 22, -88, -60], ['the Baltic Sea', 53, 66, 9, 30], ['the North Sea', 51, 61, -4, 9],
  ['Hudson Bay', 51, 64, -95, -77], ['Lake Issyk-Kul', 41.9, 42.7, 76.1, 78.4],
  ['the Arctic Ocean', 66, 90, -180, 180], ['the Southern Ocean', -90, -60, -180, 180],
];

function oceanFor(lat, lon) {
  for (const [name, a, b, c, d] of WATERS) if (lat >= a && lat <= b && lon >= c && lon <= d) return name;
  if (lon > 20 && lon < 147 && lat < 30) return 'the Indian Ocean';
  if (lon >= -70 && lon <= 20) return 'the Atlantic Ocean';
  if (lon > -100 && lon < -70 && lat > 8) return 'the Atlantic Ocean';
  return 'the Pacific Ocean';
}

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

export function describePlace(lat, lon, onLand, maxKm = 600) {
  let best = null;
  let bestD = Infinity;
  for (const c of CITIES) {
    const d = distanceKm({ lat, lon }, c);
    if (d < bestD) { bestD = d; best = c; }
  }
  const relative = () => {
    if (bestD < 25) return best.name;
    const dir = COMPASS[Math.round(bearingDeg(best, { lat, lon }) / 45) % 8];
    const km = bestD < 100 ? Math.round(bestD / 5) * 5 : Math.round(bestD / 10) * 10;
    return `${km} km ${dir} of ${best.name}`;
  };
  if (!onLand) return bestD <= 150 ? `${oceanFor(lat, lon)}, ${relative()}` : oceanFor(lat, lon);
  if (!best || bestD > maxKm) return 'open land, far from large cities';
  return relative();
}
