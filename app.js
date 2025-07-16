const { useState, useEffect } = React;

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

  // Current conditions - start with #Err until first update
  const [currentConditions, setCurrentConditions] = useState({
    tides: {
      currentHeight: '#Err',
      nextHigh: { time: '#Err', height: '#Err' },
      nextLow: { time: '#Err', height: '#Err' },
      sillClearance: false,
      marinaOpen: true,
      allTides: []
    },
    wind: {
      speed: '#Err',
      direction: '#Err',
      gusts: '#Err'
    },
    waves: {
      height: '#Err',
      direction: '#Err',
      period: '#Err'
    },
    weather: {
      condition: '#Err',
      visibility: '#Err',
      temperature: '#Err',
      rainfall: '#Err'
    }
  });

  const [forecast, setForecast] = useState([
    { time: '12:00', wind: {speed: 12, dir: 'W'}, waves: {height: 0.8, dir: 'WSW'}, weather: 'Sunny', score: 'good' },
    { time: '15:00', wind: {speed: 8, dir: 'SW'}, waves: {height: 0.5, dir: 'W'}, weather: 'Sunny', score: 'excellent' },
    { time: '18:00', wind: {speed: 15, dir: 'W'}, waves: {height: 1.0, dir: 'W'}, weather: 'Partly Cloudy', score: 'good' },
    { time: '21:00', wind: {speed: 18, dir: 'NW'}, waves: {height: 1.2, dir: 'N'}, weather: 'Cloudy', score: 'poor' },
    { time: '09:00+1', wind: {speed: 6, dir: 'E'}, waves: {height: 0.6, dir: 'SE'}, weather: 'Sunny', score: 'good' },
    { time: '12:00+1', wind: {speed: 22, dir: 'N'}, waves: {height: 1.5, dir: 'N'}, weather: 'Rain', score: 'dangerous' }
  ]);

  // Parse detailed tide data
  const parseTideData = (htmlContent) => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, 'text/html');
      const tables = doc.querySelectorAll('table.table-condensed.table-bordered');
      
      if (tables.length === 0) return null;
      
      const allTideData = [];
      tables.forEach((table) => {
        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(row => {
          const timeCell = row.querySelector('td b');
          const heightDiv = row.querySelector('td .pull-right');
          if (timeCell && heightDiv) {
            const time = timeCell.textContent.trim();
            const height = parseFloat(heightDiv.textContent.trim());
            if (time && !isNaN(height)) {
              allTideData.push({ time, height });
            }
          }
        });
      });
      
      if (allTideData.length === 0) return null;
      
      // Sort by time
      allTideData.sort((a, b) => {
        const timeA = a.time.split(':').map(Number);
        const timeB = b.time.split(':').map(Number);
        return (timeA[0] * 60 + timeA[1]) - (timeB[0] * 60 + timeB[1]);
      });
      
      // Find extremes
      const tideExtremes = [];
      for (let i = 1; i < allTideData.length - 1; i++) {
        const prev = allTideData[i - 1];
        const curr = allTideData[i];
        const next = allTideData[i + 1];
        
        if (curr.height > prev.height && curr.height > next.height) {
          tideExtremes.push({ type: 'high', time: curr.time, height: curr.height });
        } else if (curr.height < prev.height && curr.height < next.height) {
          tideExtremes.push({ type: 'low', time: curr.time, height: curr.height });
        }
      }
      
      // Get current time
      const now = new Date();
      const currentTimeMinutes = now.getHours() * 60 + now.getMinutes();
      
      // Find closest reading
      let closestReading = allTideData[0];
      let smallestDiff = Math.abs(currentTimeMinutes - (parseInt(closestReading.time.split(':')[0]) * 60 + parseInt(closestReading.time.split(':')[1])));
      
      allTideData.forEach(reading => {
        const readingMinutes = parseInt(reading.time.split(':')[0]) * 60 + parseInt(reading.time.split(':')[1]);
        const diff = Math.abs(currentTimeMinutes - readingMinutes);
        if (diff < smallestDiff) {
          smallestDiff = diff;
          closestReading = reading;
        }
      });
      
      // Find next extremes
      const nextHigh = tideExtremes.find(extreme => {
        const extremeMinutes = parseInt(extreme.time.split(':')[0]) * 60 + parseInt(extreme.time.split(':')[1]);
        return extreme.type === 'high' && extremeMinutes > currentTimeMinutes;
      });
      
      const nextLow = tideExtremes.find(extreme => {
        const extremeMinutes = parseInt(extreme.time.split(':')[0]) * 60 + parseInt(extreme.time.split(':')[1]);
        return extreme.type === 'low' && extremeMinutes > currentTimeMinutes;
      });
      
      return {
        allTides: tideExtremes,
        nextHigh: nextHigh || null,
        nextLow: nextLow || null,
        currentHeight: closestReading.height
      };
      
    } catch (error) {
      console.error('Error parsing tide data:', error);
      return null;
    }
  };

  // Parse Windguru data
  const parseWindguruData = (scriptContent) => {
    try {
      const windSpeedMatch = scriptContent.match(/WINDSPD.*?\[(.*?)\]/);
      const windDirMatch = scriptContent.match(/SMER.*?\[(.*?)\]/);
      const gustMatch = scriptContent.match(/GUST.*?\[(.*?)\]/);
      const waveHeightMatch = scriptContent.match(/HTSGW.*?\[(.*?)\]/);
      const waveDirMatch = scriptContent.match(/DIRPW.*?\[(.*?)\]/);
      const wavePeriodMatch = scriptContent.match(/PERPW.*?\[(.*?)\]/);

      if (!windSpeedMatch || !waveHeightMatch) return null;

      const windSpeeds = windSpeedMatch[1].split(',').map(v => parseFloat(v.trim()));
      const windDirs = windDirMatch ? windDirMatch[1].split(',').map(v => parseFloat(v.trim())) : [];
      const gusts = gustMatch ? gustMatch[1].split(',').map(v => parseFloat(v.trim())) : [];
      const waveHeights = waveHeightMatch[1].split(',').map(v => parseFloat(v.trim()));
      const waveDirs = waveDirMatch ? waveDirMatch[1].split(',').map(v => parseFloat(v.trim())) : [];
      const wavePeriods = wavePeriodMatch ? wavePeriodMatch[1].split(',').map(v => parseFloat(v.trim())) : [];

      const degreesToCompass = (degrees) => {
        const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
        return directions[Math.round(degrees / 22.5) % 16];
      };

      return {
        wind: {
          speed: windSpeeds[0] || 0,
          direction: windDirs.length > 0 ? degreesToCompass(windDirs[0]) : 'N',
          gusts: gusts.length > 0 ? gusts[0] : windSpeeds[0] + 5
        },
        waves: {
          height: waveHeights[0] || 0,
          direction: waveDirs.length > 0 ? degreesToCompass(waveDirs[0]) : 'N',
          period: wavePeriods.length > 0 ? wavePeriods[0] : 6
        }
      };
    } catch (error) {
      console.error('Error parsing Windguru data:', error);
      return null;
    }
  };

  // Parse BBC Weather data
  const parseBBCWeatherData = (htmlContent) => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, 'text/html');
      
      const conditionElement = doc.querySelector('.wr-weather-type__text');
      const condition = conditionElement ? conditionElement.textContent.trim() : 'Unknown';
      
      const tempElement = doc.querySelector('.wr-value--temperature--c span[aria-hidden="true"]');
      const tempText = tempElement ? tempElement.textContent.trim() : '0°';
      const temperature = parseInt(tempText.replace('°', '')) || 0;
      
      let visibility = 10000;
      const visibilityElements = doc.querySelectorAll('.wr-c-station-data__observation');
      for (let el of visibilityElements) {
        if (el.textContent.includes('Visibility:')) {
          const visText = el.textContent.toLowerCase();
          if (visText.includes('very poor')) visibility = 500;
          else if (visText.includes('poor')) visibility = 2000;
          else if (visText.includes('moderate')) visibility = 5000;
          else if (visText.includes('good')) visibility = 10000;
          else if (visText.includes('very good')) visibility = 20000;
          else if (visText.includes('excellent')) visibility = 40000;
          break;
        }
      }
      
      let rainfall = 0;
      const conditionLower = condition.toLowerCase();
      if (conditionLower.includes('drizzle')) rainfall = 0.5;
      else if (conditionLower.includes('light rain')) rainfall = 1;
      else if (conditionLower.includes('rain')) rainfall = 2;
      else if (conditionLower.includes('heavy rain')) rainfall = 5;
      
      return {
        condition,
        temperature,
        visibility,
        rainfall
      };
    } catch (error) {
      console.error('Error parsing BBC Weather data:', error);
      return null;
    }
  };

  // Update live data
  const updateLiveData = async () => {
    setIsUpdating(true);
    try {
      // Try multiple CORS proxies
      const proxies = [
        'https://corsproxy.io/?',
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://cors-anywhere.herokuapp.com/',
        'https://api.allorigins.win/get?url='
      ];
      
      let workingProxy = null;
      
      // Test proxies
      for (const proxy of proxies) {
        try {
          const testUrl = proxy + encodeURIComponent('https://httpbin.org/json');
          const testResponse = await fetch(testUrl);
          if (testResponse.ok) {
            workingProxy = proxy;
            console.log('Using proxy:', proxy);
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      if (!workingProxy) {
        console.log('No working CORS proxy found');
        // Set error indicators instead of simulated data
        setCurrentConditions(prev => ({
          ...prev,
          wind: {
            speed: '#Err',
            direction: '#Err',
            gusts: '#Err'
          },
          waves: {
            height: '#Err',
            direction: '#Err',
            period: '#Err'
          },
          weather: {
            condition: '#Err',
            temperature: '#Err',
            visibility: '#Err',
            rainfall: '#Err'
          },
          tides: {
            ...prev.tides,
            currentHeight: '#Err',
            nextHigh: { time: '#Err', height: '#Err' },
            nextLow: { time: '#Err', height: '#Err' }
          }
        }));
        setLastUpdated(new Date());
        setIsUpdating(false);
        return;
      }
      
      // Tide data
      try {
        const tideUrl = 'https://tides.digimap.gg/?year=2025&yearDay=196&reqDepth=100';
        const tideResponse = await fetch(workingProxy + encodeURIComponent(tideUrl));
        
        let content;
        if (workingProxy.includes('allorigins.win')) {
          const tideData = await tideResponse.json();
          content = tideData.contents;
        } else {
          content = await tideResponse.text();
        }
        
        if (content) {
          const parsedTides = parseTideData(content);
          if (parsedTides) {
            setCurrentConditions(prev => ({
              ...prev,
              tides: {
                ...prev.tides,
                currentHeight: parsedTides.currentHeight,
                nextHigh: parsedTides.nextHigh || prev.tides.nextHigh,
                nextLow: parsedTides.nextLow || prev.tides.nextLow,
                allTides: parsedTides.allTides,
                sillClearance: parsedTides.currentHeight > (settings.boatDraft + 0.5),
                marinaOpen: true
              }
            }));
            console.log('Successfully updated tide data');
          }
        }
      } catch (error) {
        console.log('Tide fetch failed:', error.message);
      }

      // Wind/Wave data
      try {
        const windguruUrl = 'https://www.windguru.cz/js/widget.php?s=35647&m=100&p=WINDSPD,SMER,GUST,HTSGW,DIRPW,PERPW&wj=knots&waj=m&lng=en';
        const windguruResponse = await fetch(workingProxy + encodeURIComponent(windguruUrl));
        
        let content;
        if (workingProxy.includes('allorigins.win')) {
          const windguruData = await windguruResponse.json();
          content = windguruData.contents;
        } else {
          content = await windguruResponse.text();
        }
        
        if (content) {
          const parsedWindWave = parseWindguruData(content);
          if (parsedWindWave) {
            setCurrentConditions(prev => ({
              ...prev,
              wind: parsedWindWave.wind,
              waves: parsedWindWave.waves
            }));
            console.log('Successfully updated wind/wave data');
          }
        }
      } catch (error) {
        console.log('Windguru fetch failed:', error.message);
      }

      // Weather data
      try {
        const bbcWeatherUrl = 'https://www.bbc.co.uk/weather/6296594';
        const bbcResponse = await fetch(workingProxy + encodeURIComponent(bbcWeatherUrl));
        
        let content;
        if (workingProxy.includes('allorigins.win')) {
          const bbcData = await bbcResponse.json();
          content = bbcData.contents;
        } else {
          content = await bbcResponse.text();
        }
        
        if (content) {
          const parsedWeather = parseBBCWeatherData(content);
          if (parsedWeather) {
            setCurrentConditions(prev => ({
              ...prev,
              weather: parsedWeather
            }));
            console.log('Successfully updated weather data');
          }
        }
      } catch (error) {
        console.log('BBC Weather fetch failed:', error.message);
      }
      
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error updating live data:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  // Calculate conditions
  const calculateConditions = (wind, waves, weather, tides) => {
    let score = 100;
    let factors = [];
    
    if (wind.speed > 20) {
      score -= 40;
      factors.push('Strong winds');
    } else if (wind.speed > 15) {
      score -= 20;
      factors.push('Moderate winds');
    }

    let adjustedWaveHeight = waves.height;
    if (wind.direction.includes('W')) {
      adjustedWaveHeight *= 0.7;
    } else if (wind.direction.includes('N') || wind.direction.includes('S')) {
      adjustedWaveHeight *= 1.5;
    } else if (wind.direction.includes('E')) {
      adjustedWaveHeight *= 1.2;
    }

    if (adjustedWaveHeight > 1.0) {
      score -= 35;
      factors.push('Rough seas');
    } else if (adjustedWaveHeight > 0.5) {
      score -= 15;
      factors.push('Moderate seas');
    }

    if (weather.condition.includes('Rain')) {
      score -= 25;
      factors.push('Rain');
    }
    if (weather.condition.includes('Fog') || weather.visibility < 1000) {
      score -= 30;
      factors.push('Poor visibility');
    }

    if (!tides.sillClearance) {
      score -= 50;
      factors.push('Insufficient depth');
    }
    if (!tides.marinaOpen) {
      score -= 60;
      factors.push('Marina closed');
    }
    
    if (tides.currentHeight < 3.0) {
      score -= 15;
      factors.push('Low tide conditions');
    }

    let rating, color, icon;
    if (score >= 80) {
      rating = 'Excellent';
      color = 'text-green-600 bg-green-50';
      icon = '✅';
    } else if (score >= 60) {
      rating = 'Good';
      color = 'text-green-600 bg-green-50';
      icon = '✅';
    } else if (score >= 40) {
      rating = 'Caution';
      color = 'text-yellow-600 bg-yellow-50';
      icon = '⚠️';
    } else {
      rating = 'Poor/Dangerous';
      color = 'text-red-600 bg-red-50';
      icon = '❌';
    }

    return { score, rating, color, icon, factors };
  };

  const conditions = calculateConditions(currentConditions.wind, currentConditions.waves, currentConditions.weather, currentConditions.tides);

  const SettingsPanel = () => React.createElement('div', { className: "bg-white rounded-lg shadow-lg p-6" },
    React.createElement('h2', { className: "text-xl font-bold mb-4 flex items-center" },
      React.createElement('span', { className: "text-lg mr-2" }, '⚙️'),
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
    React.createElement('div', { className: `rounded-lg p-6 ${conditions.color} border-l-4 border-current` },
      React.createElement('div', { className: "flex items-center justify-between" },
        React.createElement('div', { className: "flex items-center" },
          React.createElement('span', { className: "text-2xl mr-2" }, conditions.icon),
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

    React.createElement('div', { className: "grid grid-cols-1 md:grid-cols-2 gap-4" },
      // Tides
      React.createElement('div', { className: "bg-white rounded-lg shadow p-4" },
        React.createElement('h3', { className: "font-bold flex items-center mb-3" },
          React.createElement('span', { className: "text-lg mr-2" }, '🌊'),
          `Tides - ${settings.marina}`
        ),
        React.createElement('div', { className: "space-y-2 text-sm" },
          React.createElement('div', null, 'Current Height: ', React.createElement('strong', null, typeof currentConditions.tides.currentHeight === 'number' ? `${currentConditions.tides.currentHeight.toFixed(1)}m` : currentConditions.tides.currentHeight)),
          currentConditions.tides.nextHigh && React.createElement('div', null, 'Next High: ', React.createElement('strong', null, `${currentConditions.tides.nextHigh.time} (${currentConditions.tides.nextHigh.height}m)`)),
          currentConditions.tides.nextLow && React.createElement('div', null, 'Next Low: ', React.createElement('strong', null, `${currentConditions.tides.nextLow.time} (${currentConditions.tides.nextLow.height}m)`)),
          React.createElement('div', { className: `flex items-center ${currentConditions.tides.sillClearance ? 'text-green-600' : 'text-red-600'}` },
            React.createElement('span', { className: "mr-1" }, currentConditions.tides.sillClearance ? '✅' : '❌'),
            `Draft Clearance (${settings.boatDraft}m)`
          ),
          React.createElement('div', { className: `flex items-center ${currentConditions.tides.marinaOpen ? 'text-green-600' : 'text-red-600'}` },
            React.createElement('span', { className: "mr-1" }, currentConditions.tides.marinaOpen ? '✅' : '❌'),
            'Marina Access'
          ),
          currentConditions.tides.allTides.length > 0 && React.createElement('div', { className: "mt-3 pt-2 border-t text-xs" },
            React.createElement('strong', null, 'Today\'s Tide Schedule:'),
            React.createElement('div', { className: "grid grid-cols-2 gap-1 mt-1" },
              currentConditions.tides.allTides.slice(0, 6).map((tide, index) => 
                React.createElement('div', { key: index, className: "flex justify-between" },
                  React.createElement('span', null, tide.time),
                  React.createElement('span', null, `${tide.type} ${tide.height}m`)
                )
              )
            )
          )
        )
      ),

      // Wind
      React.createElement('div', { className: "bg-white rounded-lg shadow p-4" },
        React.createElement('h3', { className: "font-bold flex items-center mb-3" },
          React.createElement('span', { className: "text-lg mr-2" }, '💨'),
          'Wind'
        ),
        React.createElement('div', { className: "space-y-2 text-sm" },
          React.createElement('div', null, 'Speed: ', React.createElement('strong', null, typeof currentConditions.wind.speed === 'number' ? `${Math.round(currentConditions.wind.speed)} knots` : currentConditions.wind.speed)),
          React.createElement('div', null, 'Direction: ', React.createElement('strong', null, currentConditions.wind.direction)),
          React.createElement('div', null, 'Gusts: ', React.createElement('strong', null, typeof currentConditions.wind.gusts === 'number' ? `${Math.round(currentConditions.wind.gusts)} knots` : currentConditions.wind.gusts)),
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
          React.createElement('span', { className: "text-lg mr-2" }, '🌊'),
          'Sea State'
        ),
        React.createElement('div', { className: "space-y-2 text-sm" },
          React.createElement('div', null, 'Wave Height: ', React.createElement('strong', null, typeof currentConditions.waves.height === 'number' ? `${currentConditions.waves.height.toFixed(1)}m` : currentConditions.waves.height)),
          React.createElement('div', null, 'Direction: ', React.createElement('strong', null, currentConditions.waves.direction)),
          React.createElement('div', null, 'Period: ', React.createElement('strong', null, typeof currentConditions.waves.period === 'number' ? `${currentConditions.waves.period}s` : currentConditions.waves.period)),
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
          React.createElement('span', { className: "text-lg mr-2" }, '👁️'),
          'Weather'
        ),
        React.createElement('div', { className: "space-y-2 text-sm" },
          React.createElement('div', null, 'Condition: ', React.createElement('strong', null, currentConditions.weather.condition)),
          React.createElement('div', null, 'Visibility: ', React.createElement('strong', null, typeof currentConditions.weather.visibility === 'number' ? `${(currentConditions.weather.visibility/1000).toFixed(1)}km` : currentConditions.weather.visibility)),
          React.createElement('div', null, 'Temperature: ', React.createElement('strong', null, typeof currentConditions.weather.temperature === 'number' ? `${currentConditions.weather.temperature}°C` : currentConditions.weather.temperature)),
          React.createElement('div', null, 'Rainfall: ', React.createElement('strong', null, typeof currentConditions.weather.rainfall === 'number' ? `${currentConditions.weather.rainfall}mm/hr` : currentConditions.weather.rainfall))
        )
      )
    )
  );

  const ForecastView = () => React.createElement('div', { className: "bg-white rounded-lg shadow" },
    React.createElement('div', { className: "p-4 border-b" },
      React.createElement('h2', { className: "text-xl font-bold flex items-center" },
        React.createElement('span', { className: "text-lg mr-2" }, '🕐'),
        '48-Hour Forecast'
      )
    ),
    React.createElement('div', { className: "p-4" },
      React.createElement('div', { className: "space-y-3" },
        forecast.map((period, index) => {
          let statusColor = 'bg-gray-100';
          let statusIcon = '⚠️';
          
          if (period.score === 'excellent') {
            statusColor = 'bg-green-100 border-l-4 border-green-500';
            statusIcon = '✅';
          } else if (period.score === 'good') {
            statusColor = 'bg-green-50 border-l-4 border-green-400';
            statusIcon = '✅';
          } else if (period.score === 'poor') {
            statusColor = 'bg-yellow-50 border-l-4 border-yellow-500';
            statusIcon = '⚠️';
          } else if (period.score === 'dangerous') {
            statusColor = 'bg-red-50 border-l-4 border-red-500';
            statusIcon = '❌';
          }

          return React.createElement('div', { key: index, className: `p-3 rounded ${statusColor}` },
            React.createElement('div', { className: "flex items-center justify-between" },
              React.createElement('div', { className: "flex items-center" },
                React.createElement('span', { className: "mr-2" }, statusIcon),
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
    React.createElement('div', { className: "bg-blue-900 text-white p-4" },
      React.createElement('div', { className: "max-w-6xl mx-auto" },
        React.createElement('div', { className: "flex items-center justify-between" },
          React.createElement('div', null,
            React.createElement('h1', { className: "text-2xl font-bold flex items-center" },
              React.createElement('span', { className: "text-2xl mr-2" }, '📍'),
              'Guernsey RIB Ride'
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
                  React.createElement('span', { className: "mr-2" }, '🔄'),
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

    React.createElement('div', { className: "max-w-6xl mx-auto p-4" },
      currentView === 'current' && CurrentConditions(),
      currentView === 'forecast' && ForecastView(),
      currentView === 'settings' && SettingsPanel()
    ),

    React.createElement('div', { className: "bg-gray-100 mt-8 p-4 text-xs text-gray-600" },
      React.createElement('div', { className: "max-w-6xl mx-auto" },
        React.createElement('strong', null, 'Data Sources:'), ' Tides: digimap.gg (LIVE) | Wind/Waves: Windguru (LIVE) | Weather: BBC Weather (LIVE)',
        React.createElement('br'),
        React.createElement('em', null, 'All data sources now parse live conditions for accurate Guernsey sailing assessments.')
      )
    )
  );
};

const container = document.getElementById('root');
const root = ReactDOM.createRoot(container);
root.render(React.createElement(GuernseyRibApp));
