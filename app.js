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

  // Marina opening times based on selected marina (will be replaced by parsed data)
  const [marinaTimes, setMarinaTimes] = useState({});

  // Start with default values, auto-update on load
  const [currentConditions, setCurrentConditions] = useState({
    tides: {
      currentHeight: '-',
      nextHigh: { time: '-', height: '-' },
      nextLow: { time: '-', height: '-' },
      marinaOpen: '-',
      marinaClosed: '-',
      sillClearance: false,
      allTides: []
    },
    wind: {
      speed: '-',
      direction: '-'
    },
    waves: {
      height: '-',
      direction: '-'
    },
    weather: {
      temperature: '-',
      rainfall: '-',
      cloudiness: '-',
      visibility: '-'
    }
  });

  const [forecast, setForecast] = useState([]);

  // Auto-update on component mount
  useEffect(() => {
    updateLiveData();
  }, []);

  // Parse tide data and marina times
  const parseTideData = (htmlContent) => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, 'text/html');
      
      // Parse marina opening times
      const marinaTable = doc.querySelector('table thead:contains("Marina Opening Times")');
      let marinaTimes = {};
      if (marinaTable) {
        const marinaRows = marinaTable.closest('table').querySelectorAll('tbody tr, tr:not(:first-child)');
        marinaRows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 5) {
            const marina = cells[0].textContent.trim();
            const times = {
              close1: cells[1].textContent.trim() || '-',
              open1: cells[2].textContent.trim() || '-', 
              close2: cells[3].textContent.trim() || '-',
              open2: cells[4].textContent.trim() || '-'
            };
            marinaTimes[marina] = times;
          }
        });
      }
      
      // Parse peak tide times
      const peakTideTable = doc.querySelector('table thead:contains("Peak Tide Times")');
      let tideExtremes = [];
      if (peakTideTable) {
        const tideRows = peakTideTable.closest('table').querySelectorAll('tbody tr, tr:not(:first-child)');
        tideRows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 3) {
            const type = cells[0].textContent.trim().toLowerCase();
            const time = cells[1].textContent.trim();
            const height = parseFloat(cells[2].textContent.trim());
            if (type && time && !isNaN(height)) {
              tideExtremes.push({ type, time, height });
            }
          }
        });
      }
      
      // Parse hourly tide data
      const hourlyTables = doc.querySelectorAll('table.table-condensed.table-bordered');
      const allTideData = [];
      hourlyTables.forEach((table) => {
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
      
      // Sort hourly data by time
      allTideData.sort((a, b) => {
        const timeA = a.time.split(':').map(Number);
        const timeB = b.time.split(':').map(Number);
        return (timeA[0] * 60 + timeA[1]) - (timeB[0] * 60 + timeB[1]);
      });
      
      // Find current tide height from hourly data
      const now = new Date();
      const currentTimeMinutes = now.getHours() * 60 + now.getMinutes();
      
      let closestReading = allTideData[0];
      if (allTideData.length > 0) {
        let smallestDiff = Math.abs(currentTimeMinutes - (parseInt(closestReading.time.split(':')[0]) * 60 + parseInt(closestReading.time.split(':')[1])));
        
        allTideData.forEach(reading => {
          const readingMinutes = parseInt(reading.time.split(':')[0]) * 60 + parseInt(reading.time.split(':')[1]);
          const diff = Math.abs(currentTimeMinutes - readingMinutes);
          if (diff < smallestDiff) {
            smallestDiff = diff;
            closestReading = reading;
          }
        });
      }
      
      // Find next high and low from peak times
      const nextHigh = tideExtremes.find(extreme => {
        const extremeMinutes = parseInt(extreme.time.split(':')[0]) * 60 + parseInt(extreme.time.split(':')[1]);
        return extreme.type === 'high' && extremeMinutes > currentTimeMinutes;
      });
      
      const nextLow = tideExtremes.find(extreme => {
        const extremeMinutes = parseInt(extreme.time.split(':')[0]) * 60 + parseInt(extreme.time.split(':')[1]);
        return extreme.type === 'low' && extremeMinutes > currentTimeMinutes;
      });
      
      return {
        currentHeight: closestReading ? closestReading.height : '-',
        nextHigh: nextHigh || { time: '-', height: '-' },
        nextLow: nextLow || { time: '-', height: '-' },
        marinaTimes: marinaTimes,
        allTides: tideExtremes,
        hourlyData: allTideData
      };
      
    } catch (error) {
      console.error('Error parsing tide data:', error);
      return null;
    }
  };

  // Parse BBC RSS weather data
  const parseBBCWeatherRSS = (rssContent) => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(rssContent, 'text/xml');
      
      const items = doc.querySelectorAll('item');
      if (items.length === 0) return null;
      
      // Get current conditions from first item
      const currentItem = items[0];
      const description = currentItem.querySelector('description').textContent;
      const title = currentItem.querySelector('title').textContent;
      
      // Parse temperature from title: "Wednesday - 15:00 BST: Drizzle, 18°C (65°F)"
      const tempMatch = title.match(/(\d+)°C/);
      const temperature = tempMatch ? parseInt(tempMatch[1]) : '-';
      
      // Parse description: "Temperature: 18°C (65°F), Wind Direction: West South Westerly, Wind Speed: 16mph, Humidity: 100%, Pressure: 1019mb, Rising, Visibility: Very Poor"
      const visibilityMatch = description.match(/Visibility:\s*([^,]+)/);
      let visibility = '-';
      if (visibilityMatch) {
        const visText = visibilityMatch[1].toLowerCase();
        if (visText.includes('very poor')) visibility = 'Very Poor';
        else if (visText.includes('poor')) visibility = 'Poor';
        else if (visText.includes('moderate')) visibility = 'Moderate';
        else if (visText.includes('good')) visibility = 'Good';
        else if (visText.includes('very good')) visibility = 'Very Good';
        else if (visText.includes('excellent')) visibility = 'Excellent';
      }
      
      // Parse cloudiness from title condition
      const conditionMatch = title.match(/: ([^,]+),/);
      const cloudiness = conditionMatch ? conditionMatch[1] : '-';
      
      // Determine rainfall
      let rainfall = 'None';
      if (cloudiness.toLowerCase().includes('drizzle')) rainfall = 'Light';
      else if (cloudiness.toLowerCase().includes('rain')) rainfall = 'Moderate';
      else if (cloudiness.toLowerCase().includes('heavy')) rainfall = 'Heavy';
      
      console.log(`BBC Weather RSS: ${temperature}°C, ${cloudiness}, Visibility: ${visibility}`);
      
      return {
        temperature,
        rainfall,
        cloudiness,
        visibility
      };
      
    } catch (error) {
      console.error('Error parsing BBC Weather RSS:', error);
      return null;
    }
  };

  // Load Windguru widget
  const loadWindguruWidget = () => {
    // Remove existing widget
    const existingWidget = document.getElementById('wg_fwdg_35647_100');
    if (existingWidget) existingWidget.remove();
    
    // Create widget container
    const widgetContainer = document.createElement('div');
    widgetContainer.id = 'wg_fwdg_35647_100';
    document.body.appendChild(widgetContainer);
    
    // Load widget script
    const script = document.createElement('script');
    script.src = 'https://www.windguru.cz/js/widget.php?s=35647&m=100&mw=84&wj=knots&tj=c&waj=m&tij=cm&odh=0&doh=24&fhours=240&hrsm=1&vt=forecasts&lng=en&idbs=1&p=WINDSPD,SMER,HTSGW,DIRPW';
    script.onload = () => {
      console.log('Windguru widget loaded');
      // Extract data from widget after it loads
      setTimeout(() => extractWindguruData(), 2000);
    };
    document.head.appendChild(script);
  };

  // Extract data from loaded Windguru widget
  const extractWindguruData = () => {
    try {
      // Look for Windguru data in global scope or widget elements
      if (window.wgData) {
        const data = window.wgData;
        setCurrentConditions(prev => ({
          ...prev,
          wind: {
            speed: data.windSpeed?.[0] || '-',
            direction: data.windDirection?.[0] || '-'
          },
          waves: {
            height: data.waveHeight?.[0] || '-',
            direction: data.waveDirection?.[0] || '-'
          }
        }));
        console.log('Extracted Windguru data');
      }
    } catch (error) {
      console.log('Could not extract Windguru data:', error);
    }
  };

  // Update live data
  const updateLiveData = async () => {
    setIsUpdating(true);
    try {
      // Try proxies in order
      const proxies = [
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://corsproxy.io/?',
        'https://cors-anywhere.herokuapp.com/',
        'https://api.allorigins.win/get?url='
      ];
      
      let workingProxy = null;
      for (const proxy of proxies) {
        try {
          const testResponse = await fetch(proxy + encodeURIComponent('https://httpbin.org/json'));
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
        console.log('No working proxy found');
        setIsUpdating(false);
        return;
      }
      
      // Fetch tide data
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
            setMarinaTimes(parsedTides.marinaTimes);
            const selectedMarina = parsedTides.marinaTimes[settings.marina] || {};
            setCurrentConditions(prev => ({
              ...prev,
              tides: {
                ...prev.tides,
                currentHeight: parsedTides.currentHeight,
                nextHigh: parsedTides.nextHigh,
                nextLow: parsedTides.nextLow,
                marinaOpen: selectedMarina.open1 || '-',
                marinaClosed: selectedMarina.close2 || '-',
                sillClearance: parsedTides.currentHeight > (settings.boatDraft + 0.5),
                allTides: parsedTides.allTides
              }
            }));
            console.log('Successfully updated tide data');
          }
        }
      } catch (error) {
        console.log('Tide fetch failed:', error.message);
      }

      // Load Windguru widget instead of fetching
      try {
        loadWindguruWidget();
      } catch (error) {
        console.log('Windguru widget failed:', error.message);
      }

      // Fetch weather data from BBC RSS
      try {
        const bbcRSSUrl = 'https://weather-service-thunder-broker.api.bbci.co.uk/en/observation/rss/6296594';
        const bbcResponse = await fetch(workingProxy + encodeURIComponent(bbcRSSUrl));
        
        let content;
        if (workingProxy.includes('allorigins.win')) {
          const bbcData = await bbcResponse.json();
          content = bbcData.contents;
        } else {
          content = await bbcResponse.text();
        }
        
        if (content) {
          const parsedWeather = parseBBCWeatherRSS(content);
          if (parsedWeather) {
            setCurrentConditions(prev => ({
              ...prev,
              weather: parsedWeather
            }));
            console.log('Successfully updated weather data');
          }
        }
      } catch (error) {
        console.log('BBC Weather RSS fetch failed:', error.message);
      }
      
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error updating live data:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  // Calculate conditions score
  const calculateConditions = () => {
    let score = 100;
    let factors = [];
    
    // Convert string values to numbers for calculations
    const windSpeed = typeof currentConditions.wind.speed === 'number' ? currentConditions.wind.speed : parseFloat(currentConditions.wind.speed) || 0;
    const waveHeight = typeof currentConditions.waves.height === 'number' ? currentConditions.waves.height : parseFloat(currentConditions.waves.height) || 0;
    const tideHeight = typeof currentConditions.tides.currentHeight === 'number' ? currentConditions.tides.currentHeight : parseFloat(currentConditions.tides.currentHeight) || 0;
    
    if (windSpeed > 20) {
      score -= 40;
      factors.push('Strong winds');
    } else if (windSpeed > 15) {
      score -= 20;
      factors.push('Moderate winds');
    }

    let adjustedWaveHeight = waveHeight;
    if (currentConditions.wind.direction.includes('W')) {
      adjustedWaveHeight *= 0.7;
    } else if (currentConditions.wind.direction.includes('N') || currentConditions.wind.direction.includes('S')) {
      adjustedWaveHeight *= 1.5;
    } else if (currentConditions.wind.direction.includes('E')) {
      adjustedWaveHeight *= 1.2;
    }

    if (adjustedWaveHeight > 1.0) {
      score -= 35;
      factors.push('Rough seas');
    } else if (adjustedWaveHeight > 0.5) {
      score -= 15;
      factors.push('Moderate seas');
    }

    if (currentConditions.weather.rainfall !== 'None' && currentConditions.weather.rainfall !== '-') {
      score -= 25;
      factors.push('Rain');
    }
    if (currentConditions.weather.visibility === 'Very Poor' || currentConditions.weather.visibility === 'Poor') {
      score -= 30;
      factors.push('Poor visibility');
    }

    if (!currentConditions.tides.sillClearance) {
      score -= 50;
      factors.push('Insufficient depth');
    }
    
    if (tideHeight < 3.0 && tideHeight > 0) {
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

  const conditions = calculateConditions();

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
          React.createElement('option', { value: "Victoria" }, 'Victoria Marina'),
          React.createElement('option', { value: "QEII" }, 'QEII Marina'),
          React.createElement('option', { value: "St Sampsons" }, 'St Sampsons'),
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

    // Three Main Factors
    React.createElement('div', { className: "grid grid-cols-1 lg:grid-cols-3 gap-6" },
      // 1. TIDES
      React.createElement('div', { className: "bg-white rounded-lg shadow p-6" },
        React.createElement('h3', { className: "text-xl font-bold flex items-center mb-4 text-blue-700" },
          React.createElement('span', { className: "text-2xl mr-2" }, '🌊'),
          'TIDES'
        ),
        React.createElement('div', { className: "space-y-3" },
          React.createElement('div', { className: "text-center p-3 bg-blue-50 rounded" },
            React.createElement('div', { className: "text-sm text-gray-600" }, 'Current Height'),
            React.createElement('div', { className: "text-2xl font-bold text-blue-700" }, 
              typeof currentConditions.tides.currentHeight === 'number' ? `${currentConditions.tides.currentHeight.toFixed(1)}m` : currentConditions.tides.currentHeight
            )
          ),
          React.createElement('div', { className: "grid grid-cols-2 gap-3" },
            React.createElement('div', { className: "text-center p-2 border rounded" },
              React.createElement('div', { className: "text-xs text-gray-600" }, 'Next Low'),
              React.createElement('div', { className: "font-semibold" }, currentConditions.tides.nextLow.time),
              React.createElement('div', { className: "text-sm" }, currentConditions.tides.nextLow.height)
            ),
            React.createElement('div', { className: "text-center p-2 border rounded" },
              React.createElement('div', { className: "text-xs text-gray-600" }, 'Next High'),
              React.createElement('div', { className: "font-semibold" }, currentConditions.tides.nextHigh.time),
              React.createElement('div', { className: "text-sm" }, currentConditions.tides.nextHigh.height)
            )
          ),
          React.createElement('div', { className: "border-t pt-3" },
            React.createElement('div', { className: "text-sm space-y-1" },
              React.createElement('div', null, `Marina Opens: ${currentConditions.tides.marinaOpen}`),
              React.createElement('div', null, `Marina Closes: ${currentConditions.tides.marinaClosed}`),
              React.createElement('div', { className: `flex items-center ${currentConditions.tides.sillClearance ? 'text-green-600' : 'text-red-600'}` },
                React.createElement('span', { className: "mr-1" }, currentConditions.tides.sillClearance ? '✅' : '❌'),
                `${settings.boatDraft}m clearance`
              )
            )
          )
        )
      ),

      // 2. WIND & WAVES  
      React.createElement('div', { className: "bg-white rounded-lg shadow p-6" },
        React.createElement('h3', { className: "text-xl font-bold flex items-center mb-4 text-gray-700" },
          React.createElement('span', { className: "text-2xl mr-2" }, '💨'),
          'WIND & WAVES'
        ),
        React.createElement('div', { className: "space-y-4" },
          React.createElement('div', { className: "grid grid-cols-2 gap-4" },
            React.createElement('div', { className: "text-center p-3 bg-gray-50 rounded" },
              React.createElement('div', { className: "text-sm text-gray-600 mb-1" }, 'Wind'),
              React.createElement('div', { className: "text-xl font-bold" }, currentConditions.wind.speed),
              React.createElement('div', { className: "text-sm" }, 'knots'),
              React.createElement('div', { className: "text-sm font-medium mt-1" }, currentConditions.wind.direction)
            ),
            React.createElement('div', { className: "text-center p-3 bg-cyan-50 rounded" },
              React.createElement('div', { className: "text-sm text-gray-600 mb-1" }, 'Waves'),
              React.createElement('div', { className: "text-xl font-bold" }, currentConditions.waves.height),
              React.createElement('div', { className: "text-sm" }, 'meters'),
              React.createElement('div', { className: "text-sm font-medium mt-1" }, currentConditions.waves.direction)
            )
          ),
          React.createElement('div', { className: "text-xs text-gray-500 text-center" },
            currentConditions.wind.direction.includes('W') && "Westerly conditions - favorable",
            (currentConditions.wind.direction.includes('N') || currentConditions.wind.direction.includes('S')) && "North/South conditions - caution",
            currentConditions.wind.direction.includes('E') && !currentConditions.wind.direction.includes('W') && "Easterly conditions - proceed with care"
          )
        )
      ),

      // 3. WEATHER
      React.createElement('div', { className: "bg-white rounded-lg shadow p-6" },
        React.createElement('h3', { className: "text-xl font-bold flex items-center mb-4 text-purple-700" },
          React.createElement('span', { className: "text-2xl mr-2" }, '🌤️'),
          'WEATHER'
        ),
        React.createElement('div', { className: "space-y-3" },
          React.createElement('div', { className: "grid grid-cols-2 gap-3" },
            React.createElement('div', { className: "text-center p-2 border rounded" },
              React.createElement('div', { className: "text-xs text-gray-600" }, 'Temperature'),
              React.createElement('div', { className: "font-semibold" }, currentConditions.weather.temperature),
              React.createElement('div', { className: "text-xs" }, '°C')
            ),
            React.createElement('div', { className: "text-center p-2 border rounded" },
              React.createElement('div', { className: "text-xs text-gray-600" }, 'Rainfall'),
              React.createElement('div', { className: "font-semibold" }, currentConditions.weather.rainfall)
            )
          ),
          React.createElement('div', { className: "space-y-2" },
            React.createElement('div', { className: "text-sm" },
              React.createElement('span', { className: "text-gray-600" }, 'Cloudiness: '),
              React.createElement('strong', null, currentConditions.weather.cloudiness)
            ),
            React.createElement('div', { className: "text-sm" },
              React.createElement('span', { className: "text-gray-600" }, 'Visibility: '),
              React.createElement('strong', null, currentConditions.weather.visibility)
            )
          )
        )
      )
    )
  );

  const ForecastView = () => React.createElement('div', { className: "bg-white rounded-lg shadow p-6" },
    React.createElement('h2', { className: "text-xl font-bold mb-4" }, '3-Day Forecast'),
    React.createElement('div', { className: "text-center text-gray-500" }, 'Forecast feature coming soon...')
  );

  return React.createElement('div', { className: "min-h-screen bg-blue-50" },
    React.createElement('div', { className: "bg-blue-900 text-white p-4" },
      React.createElement('div', { className: "max-w-6xl mx-auto" },
        React.createElement('div', { className: "flex items-center justify-between" },
          React.createElement('div', null,
            React.createElement('h1', { className: "text-2xl font-bold flex items-center" },
              React.createElement('span', { className: "text-2xl mr-2" }, '🚤'),
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
          }, '3-Day Forecast'),
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
      React.createElement('div', { className: "max-w-6xl mx-auto text-center" },
        React.createElement('strong', null, 'Data Sources:'), ' Tides: digimap.gg | Wind/Waves: Windguru | Weather: BBC RSS',
        React.createElement('br'),
        React.createElement('em', null, 'Auto-updates on load. Click Update Now for latest conditions.')
      )
    )
  );
};

const container = document.getElementById('root');
const root = ReactDOM.createRoot(container);
root.render(React.createElement(GuernseyRibApp));
