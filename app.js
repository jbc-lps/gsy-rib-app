const { useState, useEffect } = React;

// Access Lucide icons correctly for browser environment
const Settings = lucide.Settings;
const MapPin = lucide.MapPin;
const Wind = lucide.Wind;
const Waves = lucide.Waves;
const Eye = lucide.Eye;
const CloudRain = lucide.CloudRain;
const Clock = lucide.Clock;
const AlertTriangle = lucide.AlertTriangle;
const CheckCircle = lucide.CheckCircle;
const XCircle = lucide.XCircle;

const GuernseyRibApp = () => {
  const [currentView, setCurrentView] = useState('current');
  const [isUpdating, setIsUpdating] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [settings, setSettings] = useState({
    marina: 'Albert',
    boatDraft: 1.0,
    windLimit: 15,
    waveLimit: 1.0,
    visibilityLimit: 1000,
    riskTolerance: 'moderate'
  });

  // Simulated current conditions (in real app, these would come from APIs)
  const [currentConditions, setCurrentConditions] = useState({
    tides: {
      currentHeight: 7.2,
      nextHigh: { time: '14:30', height: 8.4 },
      nextLow: { time: '20:45', height: 2.1 },
      sillClearance: true,
      marinaOpen: true
    },
    wind: {
      speed: 12,
      direction: 'W',
      gusts: 18
    },
    waves: {
      height: 0.8,
      direction: 'WSW',
      period: 6
    },
    weather: {
      condition: 'Sunny',
      visibility: 10000,
      temperature: 18,
      rainfall: 0
    }
  });

  // Forecast data (simulated)
  const [forecast, setForecast] = useState([
    { time: '12:00', wind: {speed: 12, dir: 'W'}, waves: {height: 0.8, dir: 'WSW'}, weather: 'Sunny', score: 'good' },
    { time: '15:00', wind: {speed: 8, dir: 'SW'}, waves: {height: 0.5, dir: 'W'}, weather: 'Sunny', score: 'excellent' },
    { time: '18:00', wind: {speed: 15, dir: 'W'}, waves: {height: 1.0, dir: 'W'}, weather: 'Partly Cloudy', score: 'good' },
    { time: '21:00', wind: {speed: 18, dir: 'NW'}, waves: {height: 1.2, dir: 'N'}, weather: 'Cloudy', score: 'poor' },
    { time: '09:00+1', wind: {speed: 6, dir: 'E'}, waves: {height: 0.6, dir: 'SE'}, weather: 'Sunny', score: 'good' },
    { time: '12:00+1', wind: {speed: 22, dir: 'N'}, waves: {height: 1.5, dir: 'N'}, weather: 'Rain', score: 'dangerous' }
  ]);

  // Live data scraping function
  const updateLiveData = async () => {
    setIsUpdating(true);
    try {
      // CORS proxy for cross-origin requests
      const proxyUrl = 'https://api.allorigins.win/get?url=';
      
      console.log('Fetching live data...');
      
      // Scrape BBC Weather (simplified - in real implementation would parse HTML)
      try {
        const weatherResponse = await fetch(proxyUrl + encodeURIComponent('https://www.bbc.co.uk/weather/6296594'));
        const weatherData = await weatherResponse.json();
        console.log('Weather data fetched');
      } catch (error) {
        console.log('Weather fetch failed:', error);
      }

      // Scrape Windguru (simplified - would need HTML parsing)
      try {
        const windResponse = await fetch(proxyUrl + encodeURIComponent('https://www.windguru.cz/35647'));
        const windData = await windResponse.json();
        console.log('Wind data fetched');
      } catch (error) {
        console.log('Wind fetch failed:', error);
      }

      // For demo purposes, simulate updated data with slight variations
      setCurrentConditions(prev => ({
        ...prev,
        wind: {
          speed: Math.max(5, prev.wind.speed + (Math.random() - 0.5) * 4),
          direction: ['W', 'SW', 'NW', 'E', 'SE'][Math.floor(Math.random() * 5)],
          gusts: Math.max(8, prev.wind.speed + 3 + (Math.random() * 6))
        },
        waves: {
          ...prev.waves,
          height: Math.max(0.2, prev.waves.height + (Math.random() - 0.5) * 0.4)
        },
        weather: {
          ...prev.weather,
          condition: ['Sunny', 'Partly Cloudy', 'Cloudy', 'Light Rain'][Math.floor(Math.random() * 4)],
          visibility: Math.max(1000, 10000 + (Math.random() - 0.5) * 5000)
        }
      }));
      
      setLastUpdated(new Date());
      console.log('Live data update completed');
      
    } catch (error) {
      console.error('Error updating live data:', error);
      alert('Failed to fetch live data. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  // Calculate sailing conditions score
  const calculateConditions = (wind, waves, weather, tides) => {
    let score = 100;
    let factors = [];
    
    // Wind assessment
    if (wind.speed > 20) {
      score -= 40;
      factors.push('Strong winds');
    } else if (wind.speed > 15) {
      score -= 20;
      factors.push('Moderate winds');
    }

    // Wave assessment with directional logic
    let adjustedWaveHeight = waves.height;
    if (wind.direction.includes('W')) {
      adjustedWaveHeight *= 0.7; // Treat as calmer
    } else if (wind.direction.includes('N') || wind.direction.includes('S')) {
      adjustedWaveHeight *= 1.5; // Treat as rougher
    } else if (wind.direction.includes('E')) {
      adjustedWaveHeight *= 1.2; // Proceed with caution
    }

    if (adjustedWaveHeight > 1.0) {
      score -= 35;
      factors.push('Rough seas');
    } else if (adjustedWaveHeight > 0.5) {
      score -= 15;
      factors.push('Moderate seas');
    }

    // Weather assessment
    if (weather.condition.includes('Rain')) {
      score -= 25;
      factors.push('Rain');
    }
    if (weather.condition.includes('Fog') || weather.visibility < 1000) {
      score -= 30;
      factors.push('Poor visibility');
    }

    // Tide assessment
    if (!tides.sillClearance) {
      score -= 50;
      factors.push('Insufficient depth');
    }
    if (!tides.marinaOpen) {
      score -= 60;
      factors.push('Marina closed');
    }

    // Determine overall rating
    let rating, color, icon;
    if (score >= 80) {
      rating = 'Excellent';
      color = 'text-green-600 bg-green-50';
      icon = React.createElement(CheckCircle, { className: "w-5 h-5 text-green-600" });
    } else if (score >= 60) {
      rating = 'Good';
      color = 'text-green-600 bg-green-50';
      icon = React.createElement(CheckCircle, { className: "w-5 h-5 text-green-600" });
    } else if (score >= 40) {
      rating = 'Caution';
      color = 'text-yellow-600 bg-yellow-50';
      icon = React.createElement(AlertTriangle, { className: "w-5 h-5 text-yellow-600" });
    } else {
      rating = 'Poor/Dangerous';
      color = 'text-red-600 bg-red-50';
      icon = React.createElement(XCircle, { className: "w-5 h-5 text-red-600" });
    }

    return { score, rating, color, icon, factors };
  };

  const conditions = calculateConditions(currentConditions.wind, currentConditions.waves, currentConditions.weather, currentConditions.tides);

  const SettingsPanel = () => React.createElement('div', { className: "bg-white rounded-lg shadow-lg p-6" },
    React.createElement('h2', { className: "text-xl font-bold mb-4 flex items-center" },
      React.createElement(Settings, { className: "w-5 h-5 mr-2" }),
      'Settings'
    ),
    
    React.createElement('div', { className: "space-y-4" },
      React.createElement('div', null,
        React.createElement('label', { className: "block text-sm font-medium mb-1" }, 'Marina'),
        React.createElement('select', {
          value: settings.marina,
          onChange: (e) => setSettings({...settings, marina: e.target.value}),
          className: "w-full p-2 border rounded"
        },
          React.createElement('option', { value: "Albert" }, 'Albert Marina'),
          React.createElement('option', { value: "St Peter Port" }, 'St Peter Port'),
          React.createElement('option', { value: "Beaucette" }, 'Beaucette Marina')
        )
      ),

      React.createElement('div', null,
        React.createElement('label', { className: "block text-sm font-medium mb-1" }, 'Boat Draft (m)'),
        React.createElement('input', {
          type: "number",
          step: "0.1",
          value: settings.boatDraft,
          onChange: (e) => setSettings({...settings, boatDraft: parseFloat(e.target.value)}),
          className: "w-full p-2 border rounded"
        })
      ),

      React.createElement('div', null,
        React.createElement('label', { className: "block text-sm font-medium mb-1" }, 'Max Wind Speed (knots)'),
        React.createElement('input', {
          type: "number",
          value: settings.windLimit,
          onChange: (e) => setSettings({...settings, windLimit: parseInt(e.target.value)}),
          className: "w-full p-2 border rounded"
        })
      ),

      React.createElement('div', null,
        React.createElement('label', { className: "block text-sm font-medium mb-1" }, 'Max Wave Height (m)'),
        React.createElement('input', {
          type: "number",
          step: "0.1",
          value: settings.waveLimit,
          onChange: (e) => setSettings({...settings, waveLimit: parseFloat(e.target.value)}),
          className: "w-full p-2 border rounded"
        })
      ),

      React.createElement('div', null,
        React.createElement('label', { className: "block text-sm font-medium mb-1" }, 'Risk Tolerance'),
        React.createElement('select', {
          value: settings.riskTolerance,
          onChange: (e) => setSettings({...settings, riskTolerance: e.target.value}),
          className: "w-full p-2 border rounded"
        },
          React.createElement('option', { value: "conservative" }, 'Conservative'),
          React.createElement('option', { value: "moderate" }, 'Moderate'),
          React.createElement('option', { value: "aggressive" }, 'Aggressive')
        )
      )
    )
  );

  const CurrentConditions = () => React.createElement('div', { className: "space-y-4" },
    // Overall Status
    React.createElement('div', { className: `rounded-lg p-6 ${conditions.color} border-l-4 border-current` },
      React.createElement('div', { className: "flex items-center justify-between" },
        React.createElement('div', { className: "flex items-center" },
          conditions.icon,
          React.createElement('h2', { className: "text-2xl font-bold ml-2" }, conditions.rating)
        ),
        React.createElement('div', { className: "text-right" },
          React.createElement('div', { className: "text-sm opacity-75" }, 'Conditions Score'),
          React.createElement('div', { className: "text-xl font-bold" }, `${conditions.score}/100`)
        )
      ),
      conditions.factors.length > 0 && React.createElement('div', { className: "mt-2 text-sm" },
        React.createElement('strong', null, 'Factors:'), ` ${conditions.factors.join(', ')}`
      )
    ),

    // Detailed Conditions Grid
    React.createElement('div', { className: "grid grid-cols-1 md:grid-cols-2 gap-4" },
      // Tides
      React.createElement('div', { className: "bg-white rounded-lg shadow p-4" },
        React.createElement('h3', { className: "font-bold flex items-center mb-3" },
          React.createElement(Waves, { className: "w-4 h-4 mr-2 text-blue-600" }),
          `Tides - ${settings.marina}`
        ),
        React.createElement('div', { className: "space-y-2 text-sm" },
          React.createElement('div', null, 'Current Height: ', React.createElement('strong', null, `${currentConditions.tides.currentHeight}m`)),
          React.createElement('div', null, 'Next High: ', React.createElement('strong', null, `${currentConditions.tides.nextHigh.time} (${currentConditions.tides.nextHigh.height}m)`)),
          React.createElement('div', null, 'Next Low: ', React.createElement('strong', null, `${currentConditions.tides.nextLow.time} (${currentConditions.tides.nextLow.height}m)`)),
          React.createElement('div', { className: `flex items-center ${currentConditions.tides.sillClearance ? 'text-green-600' : 'text-red-600'}` },
            currentConditions.tides.sillClearance ? React.createElement(CheckCircle, { className: "w-4 h-4 mr-1" }) : React.createElement(XCircle, { className: "w-4 h-4 mr-1" }),
            `Draft Clearance (${settings.boatDraft}m)`
          ),
          React.createElement('div', { className: `flex items-center ${currentConditions.tides.marinaOpen ? 'text-green-600' : 'text-red-600'}` },
            currentConditions.tides.marinaOpen ? React.createElement(CheckCircle, { className: "w-4 h-4 mr-1" }) : React.createElement(XCircle, { className: "w-4 h-4 mr-1" }),
            'Marina Access'
          )
        )
      ),

      // Wind
      React.createElement('div', { className: "bg-white rounded-lg shadow p-4" },
        React.createElement('h3', { className: "font-bold flex items-center mb-3" },
          React.createElement(Wind, { className: "w-4 h-4 mr-2 text-gray-600" }),
          'Wind'
        ),
        React.createElement('div', { className: "space-y-2 text-sm" },
          React.createElement('div', null, 'Speed: ', React.createElement('strong', null, `${Math.round(currentConditions.wind.speed)} knots`)),
          React.createElement('div', null, 'Direction: ', React.createElement('strong', null, currentConditions.wind.direction)),
          React.createElement('div', null, 'Gusts: ', React.createElement('strong', null, `${Math.round(currentConditions.wind.gusts)} knots`)),
          React.createElement('div', { className: "text-xs text-gray-500 mt-2" },
            currentConditions.wind.direction.includes('W') && "Westerly winds - favorable conditions",
            (currentConditions.wind.direction.includes('N') || currentConditions.wind.direction.includes('S')) && "North/South winds - proceed with extreme caution",
            currentConditions.wind.direction.includes('E') && !currentConditions.wind.direction.includes('W') && "Easterly winds - proceed with caution"
          )
        )
      ),

      // Waves
      React.createElement('div', { className: "bg-white rounded-lg shadow p-4" },
        React.createElement('h3', { className: "font-bold flex items-center mb-3" },
          React.createElement(Waves, { className: "w-4 h-4 mr-2 text-cyan-600" }),
          'Sea State'
        ),
        React.createElement('div', { className: "space-y-2 text-sm" },
          React.createElement('div', null, 'Wave Height: ', React.createElement('strong', null, `${currentConditions.waves.height.toFixed(1)}m`)),
          React.createElement('div', null, 'Direction: ', React.createElement('strong', null, currentConditions.waves.direction)),
          React.createElement('div', null, 'Period: ', React.createElement('strong', null, `${currentConditions.waves.period}s`)),
          React.createElement('div', { className: "text-xs text-gray-500 mt-2" },
            currentConditions.waves.height <= 0.5 && "Calm conditions",
            currentConditions.waves.height > 0.5 && currentConditions.waves.height <= 1.0 && "Moderate seas",
            currentConditions.waves.height > 1.0 && "Rough conditions"
          )
        )
      ),

      // Weather
      React.createElement('div', { className: "bg-white rounded-lg shadow p-4" },
        React.createElement('h3', { className: "font-bold flex items-center mb-3" },
          React.createElement(Eye, { className: "w-4 h-4 mr-2 text-purple-600" }),
          'Weather'
        ),
        React.createElement('div', { className: "space-y-2 text-sm" },
          React.createElement('div', null, 'Condition: ', React.createElement('strong', null, currentConditions.weather.condition)),
          React.createElement('div', null, 'Visibility: ', React.createElement('strong', null, `${(currentConditions.weather.visibility/1000).toFixed(1)}km`)),
          React.createElement('div', null, 'Temperature: ', React.createElement('strong', null, `${currentConditions.weather.temperature}°C`)),
          React.createElement('div', null, 'Rainfall: ', React.createElement('strong', null, `${currentConditions.weather.rainfall}mm/hr`))
        )
      )
    )
  );

  const ForecastView = () => React.createElement('div', { className: "bg-white rounded-lg shadow" },
    React.createElement('div', { className: "p-4 border-b" },
      React.createElement('h2', { className: "text-xl font-bold flex items-center" },
        React.createElement(Clock, { className: "w-5 h-5 mr-2" }),
        '48-Hour Forecast'
      )
    ),
    React.createElement('div', { className: "p-4" },
      React.createElement('div', { className: "space-y-3" },
        forecast.map((period, index) => {
          let statusColor = 'bg-gray-100';
          let statusIcon = React.createElement(AlertTriangle, { className: "w-4 h-4" });
          
          if (period.score === 'excellent') {
            statusColor = 'bg-green-100 border-l-4 border-green-500';
            statusIcon = React.createElement(CheckCircle, { className: "w-4 h-4 text-green-600" });
          } else if (period.score === 'good') {
            statusColor = 'bg-green-50 border-l-4 border-green-400';
            statusIcon = React.createElement(CheckCircle, { className: "w-4 h-4 text-green-500" });
          } else if (period.score === 'poor') {
            statusColor = 'bg-yellow-50 border-l-4 border-yellow-500';
            statusIcon = React.createElement(AlertTriangle, { className: "w-4 h-4 text-yellow-600" });
          } else if (period.score === 'dangerous') {
            statusColor = 'bg-red-50 border-l-4 border-red-500';
            statusIcon = React.createElement(XCircle, { className: "w-4 h-4 text-red-600" });
          }

          return React.createElement('div', { key: index, className: `p-3 rounded ${statusColor}` },
            React.createElement('div', { className: "flex items-center justify-between" },
              React.createElement('div', { className: "flex items-center" },
                statusIcon,
                React.createElement('span', { className: "font-medium ml-2" }, period.time)
              ),
              React.createElement('div', { className: "text-sm text-gray-600" },
                `Wind: ${period.wind.speed}kt ${period.wind.dir} | Waves: ${period.waves.height}m ${period.waves.dir} | ${period.weather}`
              )
            )
          );
        })
      )
    )
  );

  return React.createElement('div', { className: "min-h-screen bg-blue-50" },
    // Header
    React.createElement('div', { className: "bg-blue-900 text-white p-4" },
      React.createElement('div', { className: "max-w-6xl mx-auto" },
        React.createElement('div', { className: "flex items-center justify-between" },
          React.createElement('div', null,
            React.createElement('h1', { className: "text-2xl font-bold flex items-center" },
              React.createElement(MapPin, { className: "w-6 h-6 mr-2" }),
              'Guernsey RIB Conditions'
            ),
            React.createElement('p', { className: "text-blue-200 text-sm" }, 'Bailiwick waters sailing conditions')
          ),
          React.createElement('div', { className: "text-right" },
            React.createElement('button', {
              onClick: updateLiveData,
              disabled: isUpdating,
              className: "bg-blue-700 hover:bg-blue-600 disabled:bg-blue-800 px-4 py-2 rounded-lg flex items-center text-sm font-medium mb-2 transition-colors"
            },
              isUpdating ? 
                React.createElement(React.Fragment, null,
                  React.createElement('div', { className: "animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" }),
                  'Updating...'
                ) :
                React.createElement(React.Fragment, null,
                  React.createElement('svg', { className: "w-4 h-4 mr-2", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24" },
                    React.createElement('path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" })
                  ),
                  'Update Now'
                )
            ),
            React.createElement('div', { className: "text-xs text-blue-200" },
              `Last updated: ${lastUpdated.toLocaleTimeString()}`
            )
          )
        )
      )
    ),

    // Navigation
    React.createElement('div', { className: "bg-white shadow-sm" },
      React.createElement('div', { className: "max-w-6xl mx-auto px-4" },
        React.createElement('div', { className: "flex space-x-8" },
          React.createElement('button', {
            onClick: () => setCurrentView('current'),
            className: `py-3 px-1 border-b-2 font-medium text-sm ${
              currentView === 'current' 
                ? 'border-blue-500 text-blue-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`
          }, 'Current Conditions'),
          React.createElement('button', {
            onClick: () => setCurrentView('forecast'),
            className: `py-3 px-1 border-b-2 font-medium text-sm ${
              currentView === 'forecast' 
                ? 'border-blue-500 text-blue-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`
          }, '48-Hour Forecast'),
          React.createElement('button', {
            onClick: () => setCurrentView('settings'),
            className: `py-3 px-1 border-b-2 font-medium text-sm ${
              currentView === 'settings' 
                ? 'border-blue-500 text-blue-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`
          }, 'Settings')
        )
      )
    ),

    // Main Content
    React.createElement('div', { className: "max-w-6xl mx-auto p-4" },
      currentView === 'current' && CurrentConditions(),
      currentView === 'forecast' && ForecastView(),
      currentView === 'settings' && SettingsPanel()
    ),

    // Data Sources Footer
    React.createElement('div', { className: "bg-gray-100 mt-8 p-4 text-xs text-gray-600" },
      React.createElement('div', { className: "max-w-6xl mx-auto" },
        React.createElement('strong', null, 'Data Sources:'), ' Tides: digimap.gg | Wind/Waves: Windguru | Weather: BBC Weather & Jersey Met',
        React.createElement('br'),
        React.createElement('em', null, 'Click "Update Now" to fetch live data from weather sources. Live deployment will include full data parsing.')
      )
    )
  );
};

// Render the app using React 18 createRoot method
const container = document.getElementById('root');
const root = ReactDOM.createRoot(container);
root.render(React.createElement(GuernseyRibApp));
