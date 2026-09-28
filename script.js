/* ============================================================
   Sky Diary — script.js
   Free, no-key APIs:
   - Open-Meteo geocoding  (city search)
   - Open-Meteo forecast   (current weather)
   - OpenStreetMap Nominatim (reverse geocode for "use my location")
   ============================================================ */

const els = {
  form: document.getElementById('searchForm'),
  input: document.getElementById('cityInput'),
  suggestions: document.getElementById('suggestions'),
  locateBtn: document.getElementById('locateBtn'),
  unitToggle: document.getElementById('unitToggle'),
  card: document.getElementById('weatherCard'),
  status: document.getElementById('status'),
  result: document.getElementById('result'),
  place: document.getElementById('place'),
  datetime: document.getElementById('datetime'),
  icon: document.getElementById('conditionIcon'),
  temp: document.getElementById('temp'),
  condition: document.getElementById('condition'),
  feelsLike: document.getElementById('feelsLike'),
  humidity: document.getElementById('humidity'),
  wind: document.getElementById('wind'),
  mood: document.getElementById('mood'),
  canvas: document.getElementById('scene'),
};

let unit = 'C';          // 'C' or 'F'
let lastReading = null;  // cache last fetched weather so unit toggle can re-render

/* ============================================================
   WMO weather code → icon + label
   https://open-meteo.com/en/docs  (weather_code table)
   ============================================================ */
function describeCode(code, isDay){
  const map = {
    0:  ['Clear sky',            isDay ? '☀️' : '🌙'],
    1:  ['Mostly clear',         isDay ? '🌤️' : '🌙'],
    2:  ['Partly cloudy',        isDay ? '⛅' : '☁️'],
    3:  ['Overcast',             '☁️'],
    45: ['Foggy',                '🌫️'],
    48: ['Icy fog',              '🌫️'],
    51: ['Light drizzle',        '🌦️'],
    53: ['Drizzle',              '🌦️'],
    55: ['Heavy drizzle',        '🌧️'],
    56: ['Freezing drizzle',     '🌧️'],
    57: ['Freezing drizzle',     '🌧️'],
    61: ['Light rain',           '🌦️'],
    63: ['Rain',                 '🌧️'],
    65: ['Heavy rain',           '🌧️'],
    66: ['Freezing rain',        '🌧️'],
    67: ['Freezing rain',        '🌧️'],
    71: ['Light snow',           '🌨️'],
    73: ['Snow',                 '❄️'],
    75: ['Heavy snow',           '❄️'],
    77: ['Snow grains',          '❄️'],
    80: ['Light showers',        '🌦️'],
    81: ['Showers',              '🌧️'],
    82: ['Violent showers',      '🌧️'],
    85: ['Snow showers',         '🌨️'],
    86: ['Heavy snow showers',   '❄️'],
    95: ['Thunderstorm',         '⛈️'],
    96: ['Thunderstorm + hail',  '⛈️'],
    99: ['Thunderstorm + hail',  '⛈️'],
  };
  return map[code] || ['Unsettled skies', '🌡️'];
}

/* Decide the "mood" band that drives the palette + particle scene */
function moodFromReading({ tempC, code, isDay }){
  const isRain = [51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99].includes(code);
  const isSnow = [71,73,75,77,85,86].includes(code);

  if (!isDay) return 'night';
  if (isSnow || tempC <= 5) return 'cold';
  if (isRain) return 'rain';
  if (tempC <= 14) return 'cool';   // → falling leaves
  if (tempC <= 24) return 'mild';   // → calm blue
  if (tempC <= 31) return 'warm';   // → golden sun
  return 'hot';                     // → orange heat
}

const moodLabel = {
  cold:  'Snowy & crisp',
  cool:  'Cool, leaves falling',
  mild:  'Calm & clear',
  warm:  'Warm sunshine',
  hot:   'Hot & glowing',
  rain:  'Rainy',
  night: 'Quiet night',
};

/* ============================================================
   City search — geocoding + debounced suggestions
   ============================================================ */
let debounceId = null;
let activeIndex = -1;
let currentMatches = [];

els.input.addEventListener('input', () => {
  const q = els.input.value.trim();
  clearTimeout(debounceId);
  if (q.length < 2){
    hideSuggestions();
    return;
  }
  debounceId = setTimeout(() => fetchSuggestions(q), 300);
});

els.input.addEventListener('keydown', (e) => {
  if (els.suggestions.hidden) return;
  const items = [...els.suggestions.children];
  if (e.key === 'ArrowDown'){
    e.preventDefault();
    activeIndex = Math.min(activeIndex + 1, items.length - 1);
    highlight(items);
  } else if (e.key === 'ArrowUp'){
    e.preventDefault();
    activeIndex = Math.max(activeIndex - 1, 0);
    highlight(items);
  } else if (e.key === 'Enter' && activeIndex >= 0){
    e.preventDefault();
    selectMatch(currentMatches[activeIndex]);
  } else if (e.key === 'Escape'){
    hideSuggestions();
  }
});

function highlight(items){
  items.forEach((li, i) => li.classList.toggle('active', i === activeIndex));
  items[activeIndex]?.scrollIntoView({ block: 'nearest' });
}

async function fetchSuggestions(query){
  try{
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=6&language=en&format=json`;
    const res = await fetch(url);
    const data = await res.json();
    currentMatches = data.results || [];
    renderSuggestions(currentMatches);
  }catch(err){
    hideSuggestions();
  }
}

function renderSuggestions(matches){
  activeIndex = -1;
  els.suggestions.innerHTML = '';
  if (!matches.length){
    hideSuggestions();
    return;
  }
  matches.forEach((m) => {
    const li = document.createElement('li');
    const region = [m.admin1, m.country].filter(Boolean).join(', ');
    li.innerHTML = `${m.name}<small>${region}</small>`;
    li.addEventListener('click', () => selectMatch(m));
    els.suggestions.appendChild(li);
  });
  els.suggestions.hidden = false;
}

function hideSuggestions(){
  els.suggestions.hidden = true;
  els.suggestions.innerHTML = '';
  currentMatches = [];
  activeIndex = -1;
}

function selectMatch(match){
  if (!match) return;
  els.input.value = match.name;
  hideSuggestions();
  loadWeather(match.latitude, match.longitude, formatPlace(match));
}

function formatPlace(m){
  return [m.name, m.admin1, m.country].filter(Boolean).join(', ');
}

document.addEventListener('click', (e) => {
  if (!els.form.contains(e.target)) hideSuggestions();
});

/* ============================================================
   Form submit — geocode the typed text, then load weather
   ============================================================ */
els.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = els.input.value.trim();
  if (!q) return;

  if (currentMatches.length && els.suggestions.hidden === false){
    selectMatch(currentMatches[0]);
    return;
  }

  setStatus('Finding that place… ✨');
  try{
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`;
    const res = await fetch(url);
    const data = await res.json();
    const match = (data.results || [])[0];
    if (!match){
      setStatus(`Couldn't find "${q}" — try a different spelling.`);
      return;
    }
    loadWeather(match.latitude, match.longitude, formatPlace(match));
  }catch(err){
    setStatus('Something went wrong reaching the map. Try again?');
  }
});

/* ============================================================
   "Use my location"
   ============================================================ */
els.locateBtn.addEventListener('click', () => {
  if (!navigator.geolocation){
    setStatus('Location isn\u2019t available in this browser.');
    return;
  }
  setStatus('Finding you… 📍');
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      let placeName = 'Your location';
      try{
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
        );
        const data = await res.json();
        const a = data.address || {};
        placeName = [a.city || a.town || a.village || a.county, a.country]
          .filter(Boolean).join(', ') || placeName;
      }catch(err){ /* fall back to generic name */ }
      loadWeather(latitude, longitude, placeName);
    },
    () => setStatus('Couldn\u2019t get your location — search a city instead.')
  );
});

/* ============================================================
   Fetch current weather + render
   ============================================================ */
async function loadWeather(lat, lon, placeName){
  setStatus('Checking the sky… ☁️');
  try{
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day` +
      `&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('bad response');
    const data = await res.json();
    const c = data.current;

    lastReading = {
      place: placeName,
      tempC: c.temperature_2m,
      feelsLikeC: c.apparent_temperature,
      humidity: c.relative_humidity_2m,
      windKmh: c.wind_speed_10m,
      code: c.weather_code,
      isDay: c.is_day === 1,
      time: data.timezone,
    };

    render(lastReading);
  }catch(err){
    setStatus('Couldn\u2019t load weather for that place. Please try again.');
  }
}

/* ============================================================
   Render results + trigger the canvas scene
   ============================================================ */
function render(r){
  const mood = moodFromReading(r);
  const [label, icon] = describeCode(r.code, r.isDay);

  els.status.hidden = true;
  els.result.hidden = false;
  els.card.dataset.state = mood;

  els.place.textContent = r.place;
  els.datetime.textContent = new Date().toLocaleString(undefined, {
    weekday: 'short', hour: '2-digit', minute: '2-digit'
  });

  els.icon.textContent = icon;
  els.temp.textContent = formatTemp(r.tempC);
  els.condition.textContent = label;
  els.feelsLike.textContent = `Feels like ${formatTemp(r.feelsLikeC)}`;

  els.humidity.textContent = `${Math.round(r.humidity)}%`;
  els.wind.textContent = `${Math.round(r.windKmh)} km/h`;
  els.mood.textContent = moodLabel[mood];

  startScene(mood);
}

function setStatus(msg){
  els.result.hidden = true;
  els.status.hidden = false;
  els.status.textContent = msg;
}

function formatTemp(c){
  const v = unit === 'C' ? c : (c * 9/5) + 32;
  return `${Math.round(v)}°`;
}

els.unitToggle.addEventListener('click', () => {
  unit = unit === 'C' ? 'F' : 'C';
  els.unitToggle.textContent = `°${unit}`;
  if (lastReading) render(lastReading);
});

/* ============================================================
   Canvas weather scenes — the app's signature element
   Each mood gets its own lightweight particle system.
   ============================================================ */
const ctx = els.canvas.getContext('2d');
let particles = [];
let rafId = null;
let currentMood = null;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function resizeCanvas(){
  const rect = els.card.getBoundingClientRect();
  els.canvas.width = rect.width * devicePixelRatio;
  els.canvas.height = rect.height * devicePixelRatio;
  els.canvas.style.width = rect.width + 'px';
  els.canvas.style.height = rect.height + 'px';
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function startScene(mood){
  currentMood = mood;
  resizeCanvas();
  particles = buildParticles(mood);
  if (rafId) cancelAnimationFrame(rafId);
  if (prefersReducedMotion){
    drawFrame(mood, true); // draw one static frame only
    return;
  }
  animate();
}

function width(){ return els.canvas.width / devicePixelRatio; }
function height(){ return els.canvas.height / devicePixelRatio; }

function rand(min, max){ return Math.random() * (max - min) + min; }

function buildParticles(mood){
  const w = width(), h = height();
  const list = [];

  if (mood === 'cold'){
    for (let i = 0; i < 60; i++){
      list.push({
        x: rand(0, w), y: rand(-h, h),
        r: rand(1.5, 4), speed: rand(0.4, 1.4),
        drift: rand(-0.4, 0.4), sway: rand(0, Math.PI * 2),
      });
    }
  }
  else if (mood === 'cool'){ // falling leaves
    const colors = ['#E08A3E', '#C9622E', '#E3A857', '#B5541F'];
    for (let i = 0; i < 22; i++){
      list.push({
        x: rand(0, w), y: rand(-h, h),
        size: rand(8, 15), speed: rand(0.5, 1.2),
        angle: rand(0, Math.PI * 2), spin: rand(-0.02, 0.02),
        color: colors[i % colors.length], sway: rand(0, Math.PI * 2),
      });
    }
  }
  else if (mood === 'rain'){
    for (let i = 0; i < 80; i++){
      list.push({
        x: rand(0, w), y: rand(-h, h),
        len: rand(10, 20), speed: rand(4, 8),
      });
    }
  }
  else if (mood === 'mild'){ // gentle clouds
    for (let i = 0; i < 5; i++){
      list.push({
        x: rand(0, w), y: rand(20, h * 0.5),
        scale: rand(0.6, 1.3), speed: rand(0.08, 0.2),
      });
    }
  }
  else if (mood === 'warm' || mood === 'hot'){ // sun rays / heat shimmer
    for (let i = 0; i < 14; i++){
      list.push({
        angle: (Math.PI * 2 * i) / 14,
        len: rand(40, 70), pulse: rand(0, Math.PI * 2),
      });
    }
  }
  else if (mood === 'night'){
    for (let i = 0; i < 40; i++){
      list.push({
        x: rand(0, w), y: rand(0, h * 0.7),
        r: rand(0.6, 1.8), twinkle: rand(0, Math.PI * 2),
      });
    }
  }
  return list;
}

let frame = 0;
function animate(){
  frame++;
  drawFrame(currentMood, false);
  rafId = requestAnimationFrame(animate);
}

function drawFrame(mood, staticFrame){
  const w = width(), h = height();
  ctx.clearRect(0, 0, w, h);

  if (mood === 'cold') drawSnow(w, h, staticFrame);
  else if (mood === 'cool') drawLeaves(w, h, staticFrame);
  else if (mood === 'rain') drawRain(w, h, staticFrame);
  else if (mood === 'mild') drawClouds(w, h, staticFrame);
  else if (mood === 'warm' || mood === 'hot') drawSun(w, h, mood, staticFrame);
  else if (mood === 'night') drawStars(w, h, staticFrame);
}

function drawSnow(w, h, still){
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  particles.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    if (!still){
      p.y += p.speed;
      p.x += Math.sin(p.sway) * 0.3;
      p.sway += 0.02;
      if (p.y > h + 5){ p.y = -5; p.x = rand(0, w); }
    }
  });
}

function drawLeaves(w, h, still){
  particles.forEach(p => {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, p.size * 0.5, p.size, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (!still){
      p.y += p.speed;
      p.x += Math.sin(p.sway) * 0.6;
      p.sway += 0.03;
      p.angle += p.spin;
      if (p.y > h + 10){ p.y = -10; p.x = rand(0, w); }
    }
  });
}

function drawRain(w, h, still){
  ctx.strokeStyle = 'rgba(140,170,210,0.55)';
  ctx.lineWidth = 1.6;
  particles.forEach(p => {
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - 2, p.y + p.len);
    ctx.stroke();
    if (!still){
      p.y += p.speed;
      p.x -= 0.6;
      if (p.y > h){ p.y = -20; p.x = rand(0, w); }
    }
  });
}

function drawClouds(w, h, still){
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  particles.forEach(p => {
    drawCloudShape(p.x, p.y, p.scale);
    if (!still){
      p.x += p.speed;
      if (p.x > w + 60) p.x = -60;
    }
  });
}
function drawCloudShape(x, y, s){
  ctx.beginPath();
  ctx.ellipse(x, y, 24 * s, 14 * s, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 18 * s, y - 6 * s, 16 * s, 12 * s, 0, 0, Math.PI * 2);
  ctx.ellipse(x - 18 * s, y - 4 * s, 14 * s, 10 * s, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawSun(w, h, mood, still){
  const cx = w * 0.78, cy = h * 0.22;
  const core = mood === 'hot' ? 34 : 28;
  const glow = mood === 'hot' ? 'rgba(255,150,60,0.9)' : 'rgba(255,209,102,0.95)';

  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, core, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = glow;
  ctx.lineWidth = 3;
  particles.forEach(p => {
    const pulse = still ? 0 : Math.sin(p.pulse) * 6;
    const r1 = core + 10;
    const r2 = core + p.len + pulse;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(p.angle) * r1, cy + Math.sin(p.angle) * r1);
    ctx.lineTo(cx + Math.cos(p.angle) * r2, cy + Math.sin(p.angle) * r2);
    ctx.stroke();
    if (!still) p.pulse += 0.05;
  });
}

function drawStars(w, h, still){
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  particles.forEach(p => {
    const alpha = still ? 0.8 : 0.4 + Math.abs(Math.sin(p.twinkle)) * 0.6;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    if (!still) p.twinkle += 0.03;
  });
  ctx.globalAlpha = 1;
}

/* ============================================================
   Boot: show a calm idle scene, then try Karachi as a friendly
   first result (falls back silently if geocoding is offline).
   ============================================================ */
startScene('mild');
loadWeather(24.8607, 67.0011, 'Karachi, Pakistan');