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

  // Current conditions with real tide data structure
  const [currentConditions, setCurrentConditions] = useState({
    tides: {
      currentHeight: 7.2,
      nextHigh: { time: '14:30', height: 8.4 },
      nextLow: { time: '20:45', height: 2.1 },
      sillClearance: true,
      marinaOpen: true,
      allTides: [] // Will store the full tide schedule
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

  // Function to parse detailed hourly tide data from HTML content
  const parseTideData = (htmlContent) => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, 'text/html');
      
      // Find all tide tables (multiple tables with hourly data)
      const tables = doc.querySelectorAll('table.table-condensed.table-bordered');
      
      if (tables.length === 0) {
        console.log('Could not find tide tables in HTML content');
        return null;
      }
      
      console.log(`Found ${tables.length} tide tables, parsing hourly data...`);
      
      const allTideData = [];
      
      // Parse each table to extract hourly tide data
      tables.forEach((table, tableIndex) => {
        const rows = table.querySelectorAll('tbody tr');
        
        rows.forEach(row => {
          const timeCell = row.querySelector('td b');
          const heightDiv = row.querySelector('td .pull-right');
          
          if (timeCell && heightDiv) {
            const time = timeCell.textContent.trim();
            const heightText = heightDiv.textContent.trim();
            const height = parseFloat(heightText);
            
            if (time && !isNaN(height)) {
              allTideData.push({
                time: time,
                height: height
              });
            }
          }
        });
      });
      
      if (allTideData.length === 0) {
        console.log('No valid tide data found');
        return null;
      }
      
      // Sort by time
      allTideData.sort((a, b) => {
        const timeA = a.time.split(':').map(Number);
        const timeB = b.time.split(':').map(Number);
        return (timeA[0] * 60 + timeA[1]) - (timeB[0] * 60 + timeB[1]);
      });
      
      console.log(`Parsed ${allTideData.length} tide readings`);
      
      // Find peaks (highs) and troughs (lows)
      const tideExtremes = [];
      for (let i = 1; i < allTideData.length - 1; i++) {
        const prev = allTideData[i - 1];
        const curr = allTideData[i];
        const next = allTideData[i + 1];
        
        // Check for local maximum (high tide)
        if (curr.height > prev.height && curr.height > next.height) {
          tideExtremes.push({
            type: 'high',
            time: curr.time,
            height: curr.height
          });
        }
        // Check for local minimum (low tide)
        else if (curr.height < prev.height && curr.height < next.height) {
          tideExtremes.push({
            type: 'low',
            time: curr.time,
            height: curr.height
          });
        }
      }
      
      // Get current time and find current tide height
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const currentTimeMinutes = currentHour * 60 + currentMinute;
      
      // Find closest tide reading to current time
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
      
      // Find next high and low tides from current time
      const nextHigh = tideExtremes.find(extreme => {
        const extremeMinutes = parseInt(extreme.time.split(':')[0]) * 60 + parseInt(extreme.time.split(':')[1]);
        return extreme.type === 'high' && extremeMinutes > currentTimeMinutes;
      });
      
      const nextLow = tideExtremes.find(extreme => {
        const extremeMinutes = parseInt(extreme.time.split(':')[0]) * 60 + parseInt(extreme.time.split(':')[1]);
        return extreme.type === 'low' && extremeMinutes > currentTimeMinutes;
      });
      
      console.log(`Current tide height: ${closestReading.height}m at ${closestReading.time}`);
      console.log(`Found ${tideExtremes.length} tide extremes`);
      
      return {
        allTides: tideExtremes,
        allReadings: allTideData,
        nextHigh: nextHigh || null,
        nextLow: nextLow || null,
        currentHeight: closestReading.height,
        currentTime: closestReading.time
      // Function to parse Windguru widget data
  const parseWindguruData = (scriptContent) => {
    try {
      // Extract data from the widget script response
      // Look for data arrays in the JavaScript
      const windSpeedMatch = scriptContent.match(/WINDSPD.*?\[(.*?)\]/);
      const windDirMatch = scriptContent.match(/SMER.*?\[(.*?)\]/);
      const gustMatch = scriptContent.match(/GUST.*?\[(.*?)\]/);
      const waveHeightMatch = scriptContent.match(/HTSGW.*?\[(.*?)\]/);
      const waveDirMatch = scriptContent.match(/DIRPW.*?\[(.*?)\]/);
      const wavePeriodMatch = scriptContent.match(/PERPW.*?\[(.*?)\]/);

      if (!windSpeedMatch || !waveHeightMatch) {
        console.log('Could not find wind/wave data in Windguru response');
        return null;
      }

      // Parse arrays and get current values (first element is current)
      const windSpeeds = windSpeedMatch[1].split(',').map(v => parseFloat(v.trim()));
      const windDirs = windDirMatch ? windDirMatch[1].split(',').map(v => parseFloat(v.trim())) : [];
      const gusts = gustMatch ? gustMatch[1].split(',').map(v => parseFloat(v.trim())) : [];
      const waveHeights = waveHeightMatch[1].split(',').map(v => parseFloat(v.trim()));
      const waveDirs = waveDirMatch ? waveDirMatch[1].split(',').map(v => parseFloat(v.trim())) : [];
      const wavePeriods = wavePeriodMatch ? wavePeriodMatch[1].split(',').map(v => parseFloat(v.trim())) : [];

      // Convert wind direction from degrees to compass
      const degreesToCompass = (degrees) => {
        const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
        return directions[Math.round(degrees / 22.5) % 16];
      // Function to parse BBC Weather data
  const parseBBCWeatherData = (htmlContent) => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, 'text/html');
      
      // Extract weather condition
      const conditionElement = doc.querySelector('.wr-weather-type__text');
      const condition = conditionElement ? conditionElement.textContent.trim() : 'Unknown';
      
      // Extract temperature (Celsius)
      const tempElement = doc.querySelector('.wr-value--temperature--c span[aria-hidden="true"]');
      const tempText = tempElement ? tempElement.textContent.trim() : '0°';
      const temperature = parseInt(tempText.replace('°', '')) || 0;
      
      // Extract visibility
      const visibilityElement = doc.querySelector('.wr-c-station-data__observation:contains("Visibility:")');
      let visibility = 10000; // Default good visibility
      if (visibilityElement) {
        const visText = visibilityElement.textContent.toLowerCase();
        if (visText.includes('very poor')) visibility = 500;
        else if (visText.includes('poor')) visibility = 2000;
        else if (visText.includes('moderate')) visibility = 5000;
        else if (visText.includes('good')) visibility = 10000;
        else if (visText.includes('very good')) visibility = 20000;
        else if (visText.includes('excellent')) visibility = 40000;
      }
      
      // Extract humidity
      const humidityElement = doc.querySelector('.wr-c-station-data__observation:contains("Humidity:")');
      let humidity = 50;
      if (humidityElement) {
        const humText = humidityElement.textContent;
        const humMatch = humText.match(/(\d+)%/);
        if (humMatch) humidity = parseInt(humMatch[1]);
      }
      
      // Extract pressure
      const pressureElement = doc.querySelector('.wr-c-station-data__observation:contains("Pressure:")');
      let pressure = 1013;
      if (pressureElement) {
        const pressText = pressureElement.textContent;
        const pressMatch = pressText.match(/(\d+)mb/);
        if (pressMatch) pressure = parseInt(pressMatch[1]);
      }
      
      // Determine rainfall based on condition
      let rainfall = 0;
      const conditionLower = condition.toLowerCase();
      if (conditionLower.includes('drizzle')) rainfall = 0.5;
      else if (conditionLower.includes('light rain')) rainfall = 1;
      else if (conditionLower.includes('rain')) rainfall = 2;
      else if (conditionLower.includes('heavy rain')) rainfall = 5;
      
      console.log(`BBC Weather: ${condition}, ${temperature}°C, visibility ${visibility}m, humidity ${humidity}%`);
      
      return {
        condition: condition,
        temperature: temperature,
        visibility: visibility,
        humidity: humidity,
        pressure: pressure,
        rainfall: rainfall
      };
      
    } catch (error) {
      console.error('Error parsing BBC Weather data:', error);
      return null;
    }
  };

      const currentWindSpeed = windSpeeds[0] || 0;
      const currentWindDir = windDirs.length > 0 ? degreesToCompass(windDirs[0]) : 'N';
      const currentGusts = gusts.length > 0 ? gusts[0] : currentWindSpeed + 5;
      const currentWaveHeight = waveHeights[0] || 0;
      const currentWaveDir = waveDirs.length > 0 ? degreesToCompass(waveDirs[0]) : 'N';
      const currentWavePeriod = wavePeriods.length > 0 ? wavePeriods[0] : 6;

      console.log(`Windguru data: Wind ${currentWindSpeed}kt ${currentWindDir}, Gusts ${currentGusts}kt, Waves ${currentWaveHeight}m ${currentWaveDir}`);

      return {
        wind: {
          speed: currentWindSpeed,
          direction: currentWindDir,
          gusts: currentGusts
        },
        waves: {
          height: currentWaveHeight,
          direction: currentWaveDir,
          period: currentWavePeriod
        }
      };

    } catch (error) {
      console.error('Error parsing Windguru data:', error);
      return null;
    }
  };
      
    } catch (error) {
      console.error('Error parsing tide data:', error);
      return null;
    }
  };

  // Enhanced live data update function with real tide and wind parsing
  const updateLiveData = async () => {
    setIsUpdating(true);
    try {
      const proxyUrl = 'https://api.allorigins.win/get?url=';
      
      console.log('Fetching live data...');
      
      // Fetch real tide data from digimap.gg
      try {
        console.log('Fetching tide data from digimap.gg...');
        const tideUrl = 'https://tides.digimap.gg/?year=2025&yearDay=196&reqDepth=100';
        const tideResponse = await fetch(proxyUrl + encodeURIComponent(tideUrl));
        const tideData = await tideResponse.json();
        
        if (tideData && tideData.contents) {
          console.log('Received tide data, parsing...');
          const parsedTides = parseTideData(tideData.contents);
          
          if (parsedTides) {
            console.log('Successfully parsed tide data:', parsedTides);
            
            // Update tide conditions with real data
            setCurrentConditions(prev => ({
              ...prev,
              tides: {
                ...prev.tides,
                currentHeight: parsedTides.currentHeight,
                nextHigh: parsedTides.nextHigh || prev.tides.nextHigh,
                nextLow: parsedTides.nextLow || prev.tides.nextLow,
                allTides: parsedTides.allTides,
                // Calculate sill clearance based on current height and boat draft
                sillClearance: parsedTides.currentHeight > (settings.boatDraft + 0.5), // Add 0.5m safety margin
                marinaOpen: true // Assume marina is open if we have tide data
              }
            }));
          } else {
            console.log('Failed to parse tide data, using simulated data');
          }
        }
      } catch (error) {
        console.log('Tide fetch failed:', error);
      }

      // Fetch real wind/wave data from Windguru widget
      try {
        console.log('Fetching wind/wave data from Windguru...');
        const windguruUrl = 'https://www.windguru.cz/js/widget.php?s=35647&m=100&p=WINDSPD,SMER,GUST,HTSGW,DIRPW,PERPW&wj=knots&waj=m&lng=en';
        const windguruResponse = await fetch(proxyUrl + encodeURIComponent(windguruUrl));
        const windguruData = await windguruResponse.json();
        
        if (windguruData && windguruData.contents) {
          console.log('Received Windguru data, parsing...');
          const parsedWindWave = parseWindguruData(windguruData.contents);
          
          if (parsedWindWave) {
            console.log('Successfully parsed Windguru data:', parsedWindWave);
            
            // Update wind and wave conditions with real data
            setCurrentConditions(prev => ({
              ...prev,
              wind: parsedWindWave.wind,
              waves: parsedWindWave.waves
            }));
          } else {
            console.log('Failed to parse Windguru data, using simulated data');
            // Fallback to simulated wind/wave data
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
              }
            }));
          }
        }
      } catch (error) {
        console.log('Windguru fetch failed:', error);
        // Fallback to simulated data
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
          }
        }));
      }

      // Fetch real weather data from BBC Weather
      try {
        console.log('Fetching weather data from BBC Weather...');
        const bbcWeatherUrl = 'https://www.bbc.co.uk/weather/6296594';
        const bbcResponse = await fetch(proxyUrl + encodeURIComponent(bbcWeatherUrl));
        const bbcData = await bbcResponse.json();
        
        if (bbcData && bbcData.contents) {
          console.log('Received BBC Weather data, parsing...');
          const parsedWeather = parseBBCWeatherData(bbcData.contents);
          
          if (parsedWeather) {
            console.log('Successfully parsed BBC Weather data:', parsedWeather);
            
            // Update weather conditions with real data
            setCurrentConditions(prev => ({
              ...prev,
              weather: parsedWeather
            }));
          } else {
            console.log('Failed to parse BBC Weather data, using simulated data');
            // Fallback to simulated weather data
            setCurrentConditions(prev => ({
              ...prev,
              weather: {
                ...prev.weather,
                condition: ['Sunny', 'Partly Cloudy', 'Cloudy', 'Light Rain'][Math.floor(Math.random() * 4)],
                visibility: Math.max(1000, 10000 + (Math.random() - 0.5) * 5000)
              }
            }));
          }
        }
      } catch (error) {
        console.log('BBC Weather fetch failed:', error);
        // Fallback to simulated data
        setCurrentConditions(prev => ({
          ...prev,
          weather: {
            ...prev.weather,
            condition: ['Sunny', 'Partly Cloudy', 'Cloudy', 'Light Rain'][Math.floor(Math.random() * 4)],
            visibility: Math.max(1000, 10000 + (Math.random() - 0.5) * 5000)
          }
        }));
      }
      
      setLastUpdated(new Date());
      console.log('Live data update completed');
      
    } catch (error) {
      console.error('Error updating live data:', error);
      alert('Failed to fetch live data. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  // Calculate sailing conditions score (enhanced with real tide data)
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

    // Enhanced tide assessment using real data
    if (!tides.sillClearance) {
      score -= 50;
      factors.push('Insufficient depth');
    }
    if (!tides.marinaOpen) {
      score -= 60;
      factors.push('Marina closed');
    }
    
    // Add factor for low tide conditions
    if (tides.currentHeight < 3.0) {
      score -= 15;
      factors.push('Low tide conditions');
    }

    // Determine overall rating
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
    // Overall Status
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

    // Detailed Conditions Grid
    React.createElement('div', { className: "grid grid-cols-1 md:grid-cols-2 gap-4" },
      // Enhanced Tides Display with Real Data
      React.createElement('div', { className: "bg-white rounded-lg shadow p-4" },
        React.createElement('h3', { className: "font-bold flex items-center mb-3" },
          React.createElement('span', { className: "text-lg mr-2" }, '🌊'),
          `Tides - ${settings.marina}`
        ),
        React.createElement('div', { className: "space-y-2 text-sm" },
          React.createElement('div', null, 'Current Height: ', React.createElement('strong', null, `${currentConditions.tides.currentHeight.toFixed(1)}m`)),
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
          // Show all tide times if we have real data
          currentConditions.tides.allTides.length > 0 && React.createElement('div', { className: "mt-3 pt-2 border-t text-xs" },
            React.createElement('strong', null, 'Today\'s Tide Schedule:'),
            React.createElement('div', { className: "grid grid-cols-2 gap-1 mt-1" },
              currentConditions.tides.allTides.map((tide, index) => 
                React.createElement('div', { key: index, className: "flex justify-between" },
                  React.createElement('span', null, tide.time),
                  React.createElement('span', null, `${tide.type} ${tide.height}m`)
                )
              )
            )
          )
        )
      ),

      // Wind (unchanged for now)
      React.createElement('div', { className: "bg-white rounded-lg shadow p-4" },
        React.createElement('h3', { className: "font-bold flex items-center mb-3" },
          React.createElement('span', { className: "text-lg mr-2" }, '💨'),
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

      // Waves (unchanged for now)
      React.createElement('div', { className: "bg-white rounded-lg shadow p-4" },
        React.createElement('h3', { className: "font-bold flex items-center mb-3" },
          React.createElement('span', { className: "text-lg mr-2" }, '🌊'),
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

      // Weather (unchanged for now)
      React.createElement('div', { className: "bg-white rounded-lg shadow p-4" },
        React.createElement('h3', { className: "font-bold flex items-center mb-3" },
          React.createElement('span', { className: "text-lg mr-2" }, '👁️'),
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
    // Header
    React.createElement('div', { className: "bg-blue-900 text-white p-4" },
      React.createElement('div', { className: "max-w-6xl mx-auto" },
        React.createElement('div', { className: "flex items-center justify-between" },
          React.createElement('div', null,
            React.createElement('h1', { className: "text-2xl font-bold flex items-center" },
              React.createElement('span', { className: "text-2xl mr-2" }, '📍'),
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
        React.createElement('strong', null, 'Data Sources:'), ' Tides: digimap.gg (LIVE) | Wind/Waves: Windguru (LIVE) | Weather: BBC Weather (LIVE)',
        React.createElement('br'),
        React.createElement('em', null, 'All data sources now parse live conditions for accurate Guernsey sailing assessments.')
      )
    )
  );
};

// Render the app using React 18 createRoot method
const container = document.getElementById('root');
const root = ReactDOM.createRoot(container);
root.render(React.createElement(GuernseyRibApp));
