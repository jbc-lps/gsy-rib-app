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
      currentHeight: '--',
      nextHigh: { time: '--', height: '--' },
      nextLow: { time: '--', height: '--' },
      marinaOpen: '--',
      marinaClosed: '--',
      sillClearance: false,
      allTides: []
    },
    wind: {
      speed: '--',
      direction: '--'
    },
    waves: {
      height: '--',
      direction: '--'
    },
    weather: {
      summary: '--',
      temperature: '--',
      visibility: '--',
      time: '--'
    }
  });

  const [forecast, setForecast] = useState([]);

  // Auto-update on component mount
  useEffect(() => {
    updateLiveData();
  }, []);

  // Re-fetch when marina or boat draft changes
  useEffect(() => {
    updateLiveData();
  }, [settings.marina, settings.boatDraft]);

  // Parse tide data and marina times
  const parseTideData = (htmlContent) => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, 'text/html');
      
      // Parse marina opening times
      const marinaTimes = {};
      const tables = doc.querySelectorAll('table');
      
      // Find marina table - it has 6 columns
      let marinaTable = null;
      for (let table of tables) {
        const firstRow = table.querySelector('tr');
        if (firstRow) {
          const cells = firstRow.querySelectorAll('th, td');
          if (cells.length === 6 && cells[0].textContent.includes('Marina')) {
            marinaTable = table;
            break;
          }
        }
      }
      
      if (marinaTable) {
        const rows = marinaTable.querySelectorAll('tr');
        // Start from row 1 to skip header
        for (let i = 1; i < rows.length; i++) {
          const cells = rows[i].querySelectorAll('td');
          if (cells.length >= 5) {
            const marina = cells[0].textContent.trim();
            marinaTimes[marina] = {
              open1: cells[1].textContent.trim() || '--',
              close1: cells[2].textContent.trim() || '--', 
              open2: cells[3].textContent.trim() || '--',
              close2: cells[4].textContent.trim() || '--'
            };
          }
        }
      }
      
      // Parse peak tide times - look for table with Low/High in first column
      let tideExtremes = [];
      let peakTable = null;
      
      for (let table of tables) {
        const rows = table.querySelectorAll('tr');
        if (rows.length > 1) {
          const firstDataRow = rows[1];
          const firstCell = firstDataRow.querySelector('td');
          if (firstCell && (firstCell.textContent.includes('Low') || firstCell.textContent.includes('High'))) {
            peakTable = table;
            break;
          }
        }
      }
      
      if (peakTable) {
        const rows = peakTable.querySelectorAll('tr');
        // Start from row 1 to skip header
        for (let i = 1; i < rows.length; i++) {
          const cells = rows[i].querySelectorAll('td');
          if (cells.length >= 3) {
            const type = cells[0].textContent.trim().toLowerCase();
            const time = cells[1].textContent.trim();
            const heightText = cells[2].textContent.trim();
            if (type && time && heightText) {
              tideExtremes.push({ 
                type, 
                time, 
                height: `${heightText}m` 
              });
            }
          }
        }
      }
      
      // Parse hourly tide data - smaller tables with 2 columns
      const allTideData = [];
      for (let table of tables) {
        const rows = table.querySelectorAll('tr');
        // Check if it's a tide table (has Time/Height headers)
        if (rows.length > 1) {
          const headerRow = rows[0];
          const headers = headerRow.querySelectorAll('th');
          if (headers.length === 2 && 
              headers[0].textContent.includes('Time') && 
              headers[1].textContent.includes('Height')) {
            // Parse this tide table
            for (let i = 1; i < rows.length; i++) {
              const cells = rows[i].querySelectorAll('td');
              if (cells.length === 2) {
                const time = cells[0].textContent.trim();
                const heightText = cells[1].textContent.trim();
                const height = parseFloat(heightText);
                if (time && !isNaN(height)) {
                  allTideData.push({ time, height });
                }
              }
            }
          }
        }
      }
      
      // Sort hourly data by time
      allTideData.sort((a, b) => {
        const timeA = a.time.split(':').map(Number);
        const timeB = b.time.split(':').map(Number);
        return (timeA[0] * 60 + timeA[1]) - (timeB[0] * 60 + timeB[1]);
      });
      
      // Find current tide height from hourly data
      const now = new Date();
      const currentTimeMinutes = now.getHours() * 60 + now.getMinutes();
      
      let currentHeight = '--';
      if (allTideData.length > 0) {
        let closestReading = allTideData[0];
        let smallestDiff = Math.abs(currentTimeMinutes - (parseInt(closestReading.time.split(':')[0]) * 60 + parseInt(closestReading.time.split(':')[1])));
        
        allTideData.forEach(reading => {
          const timeParts = reading.time.split(':');
          if (timeParts.length === 2) {
            const readingMinutes = parseInt(timeParts[0]) * 60 + parseInt(timeParts[1]);
            const diff = Math.abs(currentTimeMinutes - readingMinutes);
            if (diff < smallestDiff) {
              smallestDiff = diff;
              closestReading = reading;
            }
          }
        });
        currentHeight = closestReading ? closestReading.height : '--';
      }
      
      // Find next high and low from peak times
      let nextHigh = { time: '--', height: '--' };
      let nextLow = { time: '--', height: '--' };
      
      tideExtremes.forEach(extreme => {
        const timeParts = extreme.time.split(':');
        if (timeParts.length === 2) {
          const extremeMinutes = parseInt(timeParts[0]) * 60 + parseInt(timeParts[1]);
          if (extreme.type === 'high' && extremeMinutes > currentTimeMinutes && nextHigh.time === '--') {
            nextHigh = extreme;
          }
          if (extreme.type === 'low' && extremeMinutes > currentTimeMinutes && nextLow.time === '--') {
            nextLow = extreme;
          }
        }
      });
      
      // If no next high/low found today, they might be tomorrow
      if (nextHigh.time === '--' && tideExtremes.length > 0) {
        const highs = tideExtremes.filter(e => e.type === 'high');
        if (highs.length > 0) nextHigh = highs[0];
      }
      if (nextLow.time === '--' && tideExtremes.length > 0) {
        const lows = tideExtremes.filter(e => e.type === 'low');
        if (lows.length > 0) nextLow = lows[0];
      }
      
      return {
        currentHeight: currentHeight,
        nextHigh: nextHigh,
        nextLow: nextLow,
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
      
      const currentItem = items[0];
      const description = currentItem.querySelector('description').textContent;
      const title = currentItem.querySelector('title').textContent;
      
      // Parse from title: "Wednesday - 15:00 BST: Drizzle, 18°C (65°F)"
      const summaryMatch = title.match(/: ([^,]+),/);
      const summary = summaryMatch ? summaryMatch[1] : '--';
      
      const tempMatch = title.match(/(\d+)°C/);
      const temperature = tempMatch ? `${tempMatch[1]}°C` : '--';
      
      const timeMatch = title.match(/(\d{2}:\d{2})/);
      const time = timeMatch ? timeMatch[1] : '--';
      
      // Parse visibility from description
      const visibilityMatch = description.match(/Visibility:\s*([^,]+)/);
      const visibility = visibilityMatch ? visibilityMatch[1].trim() : '--';
      
      console.log(`BBC Weather RSS: ${summary}, ${temperature}, Visibility: ${visibility}, Time: ${time}`);
      
      return {
        summary,
        temperature,
        visibility,
        time
      };
      
    } catch (error) {
      console.error('Error parsing BBC Weather RSS:', error);
      return null;
    }
  };

  // Load Windguru widget directly
  const loadWindguruWidget = () => {
    const container = document.getElementById('windguru-widget-container');
    if (!container) return;
    
    // Clear existing content
    container.innerHTML = '';
    
    // Create unique widget ID
    const widgetId = 'wg_fwdg_35647_100_' + Date.now();
    
    // Create script element with widget loader
    const script = document.createElement('script');
    script.id = widgetId;
    script.innerHTML = `
      (function (window, document) {
        var loader = function () {
          var arg = ["s=35647","m=100","mw=84","uid=${widgetId}","wj=knots","tj=c","waj=m","tij=cm","odh=0","doh=24","fhours=72","hrsm=1","vt=forecasts","lng=en","idbs=1","p=WINDSPD,SMER,HTSGW,DIRPW"];
          var script = document.createElement("script");
          var tag = document.getElementsByTagName("script")[0];
          script.src = "https://www.windguru.cz/js/widget.php?"+(arg.join("&"));
          tag.parentNode.insertBefore(script, tag);
        };
        if (document.readyState === 'complete') {
          loader();
        } else {
          window.addEventListener ? window.addEventListener("load", loader, false) : window.attachEvent("onload", loader);
        }
      })(window, document);
    `;
    
    container.appendChild(script);
    console.log('Windguru widget script loaded');
  };

  // Calculate year day for tide URL
  const getYearDay = (date) => {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date - start;
    return Math.floor(diff / (1000 * 60 * 60 * 24));
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
      
      // Fetch tide data with dynamic URL
      try {
        const now = new Date();
        const yearDay = getYearDay(now);
        const reqDepth = Math.round(settings.boatDraft * 100);
        const tideUrl = `https://tides.digimap.gg/?year=${now.getFullYear()}&yearDay=${yearDay}&reqDepth=${reqDepth}`;
        console.log('Fetching tide data from:', tideUrl);
        const tideResponse = await fetch(workingProxy + encodeURIComponent(tideUrl));
        
        let content;
        if (workingProxy.includes('allorigins.win')) {
          const tideData = await tideResponse.json();
          content = tideData.contents;
        } else {
          content = await tideResponse.text();
        }
        
        console.log('Tide data received, length:', content?.length);
        console.log('First 500 chars:', content?.substring(0, 500));
        
        if (content) {
          const parsedTides = parseTideData(content);
          console.log('Parsed tide result:', parsedTides);
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
                marinaOpen: selectedMarina.open1 || '--',
                marinaClosed: selectedMarina.close2 || '--',
                sillClearance: typeof parsedTides.currentHeight === 'number' ? parsedTides.currentHeight > (settings.boatDraft + 0.5) : false,
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

      // Fetch weather data from BBC RSS (try different endpoint)
      try {
        const bbcRSSUrl = 'https://weather-broker-cdn.api.bbci.co.uk/en/observation/rss/6296594';
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
    const windDir = currentConditions.wind.direction || '';
    if (windDir.includes('W')) {
      adjustedWaveHeight *= 0.7;
    } else if (windDir.includes('N') || windDir.includes('S')) {
      adjustedWaveHeight *= 1.5;
    } else if (windDir.includes('E')) {
      adjustedWaveHeight *= 1.2;
    }

    if (adjustedWaveHeight > 1.0) {
      score -= 35;
      factors.push('Rough seas');
    } else if (adjustedWaveHeight > 0.5) {
      score -= 15;
      factors.push('Moderate seas');
    }

    if (currentConditions.weather.rainfall !== 'None' && currentConditions.weather.rainfall !== '--') {
      score -= 25;
      factors.push('Rain');
    }
    if (currentConditions.weather.visibility === 'Very Poor' || currentConditions.weather.visibility === 'Poor' || currentConditions.weather.visibility.includes('Poor')) {
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
            ),
            React.createElement('div', { className: "text-xs text-gray-500 italic mt-2 pt-2 border-t" },
              'Tide data: © Digimap Tides. Times adjusted for BST when applicable.'
            )
          )
        )
      ),

      // 2. WIND & WAVES - Direct Widget
      React.createElement('div', { className: "bg-white rounded-lg shadow p-6" },
        React.createElement('h3', { className: "text-xl font-bold flex items-center mb-4 text-gray-700" },
          React.createElement('span', { className: "text-2xl mr-2" }, '💨'),
          'WIND & WAVES'
        ),
        React.createElement('div', { className: "bg-blue-50 p-4 rounded-lg min-h-[200px]" },
          React.createElement('div', { id: "windguru-widget-container" },
            React.createElement('div', { className: "text-center text-gray-500 py-8" }, 'Loading Windguru widget...')
          )
        ),
        React.createElement('div', { className: "text-xs text-gray-500 italic mt-2 pt-2 border-t" },
          'Wind/Wave data: © Windguru.cz'
        )
      ),

      // 3. WEATHER
      React.createElement('div', { className: "bg-white rounded-lg shadow p-6" },
        React.createElement('h3', { className: "text-xl font-bold flex items-center mb-4 text-purple-700" },
          React.createElement('span', { className: "text-2xl mr-2" }, '🌤️'),
          'WEATHER'
        ),
        React.createElement('div', { className: "grid grid-cols-3 gap-3 mb-4" },
          React.createElement('div', { className: "text-center p-3 bg-orange-50 rounded border border-orange-100" },
            React.createElement('div', { className: "text-xs text-gray-600 mb-1" }, 'Summary'),
            React.createElement('div', { className: "font-semibold text-sm" }, currentConditions.weather.summary)
          ),
          React.createElement('div', { className: "text-center p-3 bg-orange-50 rounded border border-orange-100" },
            React.createElement('div', { className: "text-xs text-gray-600 mb-1" }, 'Temperature'),
            React.createElement('div', { className: "font-semibold text-sm" }, currentConditions.weather.temperature)
          ),
          React.createElement('div', { className: "text-center p-3 bg-orange-50 rounded border border-orange-100" },
            React.createElement('div', { className: "text-xs text-gray-600 mb-1" }, 'Visibility'),
            React.createElement('div', { className: "font-semibold text-sm" }, currentConditions.weather.visibility)
          )
        ),
        React.createElement('div', { className: "text-xs text-gray-500 italic text-center" },
          `Weather data: BBC Weather ${currentConditions.weather.time}`
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
