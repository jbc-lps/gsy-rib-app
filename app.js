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

  // Auto-update on component mount and when settings change
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
      // Ensure we're using Guernsey local time (BST in summer)
      const guernseyTime = new Date(now.toLocaleString("en-US", {timeZone: "Europe/London"}));
      const currentTimeMinutes = guernseyTime.getHours() * 60 + guernseyTime.getMinutes();
      
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
      
      // First, try to find times later today
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
      
      // If no next high/low found today, use the first ones (tomorrow's)
      if (nextHigh.time === '--' && tideExtremes.length > 0) {
        const highs = tideExtremes.filter(e => e.type === 'high');
        if (highs.length > 0) {
          nextHigh = { ...highs[0], time: highs[0].time + ' (tomorrow)' };
        }
      }
      if (nextLow.time === '--' && tideExtremes.length > 0) {
        const lows = tideExtremes.filter(e => e.type === 'low');
        if (lows.length > 0) {
          nextLow = { ...lows[0], time: lows[0].time + ' (tomorrow)' };
        }
      }
      
      // Calculate next marina times based on current time
      const calculateNextMarinaTimes = (marina) => {
        if (!marina || !marina.open1) return { nextOpen: '--', nextClose: '--' };
        
        const times = [
          { type: 'open', time: marina.open1 },
          { type: 'close', time: marina.close1 },
          { type: 'open', time: marina.open2 },
          { type: 'close', time: marina.close2 }
        ].filter(t => t.time && t.time !== '--');
        
        let nextOpen = '--';
        let nextClose = '--';
        
        // Find next times
        times.forEach(t => {
          const timeParts = t.time.split(':');
          if (timeParts.length === 2) {
            const timeMinutes = parseInt(timeParts[0]) * 60 + parseInt(timeParts[1]);
            if (timeMinutes > currentTimeMinutes) {
              if (t.type === 'open' && nextOpen === '--') nextOpen = t.time;
              if (t.type === 'close' && nextClose === '--') nextClose = t.time;
            }
          }
        });
        
        // If no times found today, use tomorrow's first times
        if (nextOpen === '--' && marina.open1 && marina.open1 !== '--') {
          nextOpen = marina.open1 + ' (tomorrow)';
        }
        if (nextClose === '--' && marina.close1 && marina.close1 !== '--') {
          nextClose = marina.close1 + ' (tomorrow)';
        }
        
        return { nextOpen, nextClose };
      };
      
      return {
        currentHeight: currentHeight,
        nextHigh: nextHigh,
        nextLow: nextLow,
        marinaTimes: marinaTimes,
        allTides: tideExtremes,
        hourlyData: allTideData,
        calculateNextMarinaTimes: calculateNextMarinaTimes
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
            const nextMarinaTimes = parsedTides.calculateNextMarinaTimes(selectedMarina);
            setCurrentConditions(prev => ({
              ...prev,
              tides: {
                ...prev.tides,
                currentHeight: parsedTides.currentHeight,
                nextHigh: parsedTides.nextHigh,
                nextLow: parsedTides.nextLow,
                marinaOpen: nextMarinaTimes.nextOpen,
                marinaClosed: nextMarinaTimes.nextClose,
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
    
    // Check if marina is currently open
    const marinaOpenStr = currentConditions.tides.marinaOpen || '--';
    const marinaCloseStr = currentConditions.tides.marinaClosed || '--';
    const isMarinaTomorrow = marinaOpenStr.includes('(tomorrow)') || marinaCloseStr.includes('(tomorrow)');
    
    if (isMarinaTomorrow) {
      score -= 20;
      factors.push('Marina closed today');
    }
    
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
      color = 'text-green-700 bg-green-100';
      icon = '✅';
    } else if (score >= 60) {
      rating = 'Good';
      color = 'text-green-700 bg-green-100';
      icon = '✅';
    } else if (score >= 40) {
      rating = 'Caution';
      color = 'text-yellow-700 bg-yellow-100';
      icon = '⚠️';
    } else {
      rating = 'Poor/Dangerous';
      color = 'text-red-700 bg-red-100';
      icon = '❌';
    }

    return { score, rating, color, icon, factors };
  };

  const conditions = calculateConditions();

  const SettingsPanel = () => React.createElement('div', { className: "bg-white rounded-lg shadow-lg p-4 sm:p-6" },
    React.createElement('h2', { className: "text-lg sm:text-xl font-bold mb-3 sm:mb-4 flex items-center" },
      React.createElement('span', { className: "text-lg mr-2" }, '⚙️'),
      'Settings'
    ),
    React.createElement('div', { className: "space-y-3 sm:space-y-4" },
      React.createElement('div', null,
        React.createElement('label', { className: "block text-xs sm:text-sm font-medium mb-1" }, 'Marina'),
        React.createElement('select', {
          value: settings.marina,
          onChange: (e) => setSettings({...settings, marina: e.target.value}),
          className: "w-full p-2 border rounded text-sm sm:text-base"
        },
          React.createElement('option', { value: "Albert" }, 'Albert Marina'),
          React.createElement('option', { value: "Victoria" }, 'Victoria Marina'),
          React.createElement('option', { value: "QEII" }, 'QEII Marina'),
          React.createElement('option', { value: "St Sampsons" }, 'St Sampsons'),
          React.createElement('option', { value: "Beaucette" }, 'Beaucette Marina')
        )
      ),
      React.createElement('div', null,
        React.createElement('label', { className: "block text-xs sm:text-sm font-medium mb-1" }, 'Boat Draft (m)'),
        React.createElement('input', {
          type: "number",
          step: "0.1",
          value: settings.boatDraft,
          onChange: (e) => setSettings({...settings, boatDraft: parseFloat(e.target.value)}),
          className: "w-full p-2 border rounded text-sm sm:text-base"
        })
      ),
      React.createElement('div', null,
        React.createElement('label', { className: "block text-xs sm:text-sm font-medium mb-1" }, 'Max Wind Speed (knots)'),
        React.createElement('input', {
          type: "number",
          value: settings.windLimit,
          onChange: (e) => setSettings({...settings, windLimit: parseInt(e.target.value)}),
          className: "w-full p-2 border rounded text-sm sm:text-base"
        })
      ),
      React.createElement('div', null,
        React.createElement('label', { className: "block text-xs sm:text-sm font-medium mb-1" }, 'Max Wave Height (m)'),
        React.createElement('input', {
          type: "number",
          step: "0.1",
          value: settings.waveLimit,
          onChange: (e) => setSettings({...settings, waveLimit: parseFloat(e.target.value)}),
          className: "w-full p-2 border rounded text-sm sm:text-base"
        })
      ),
      React.createElement('div', null,
        React.createElement('label', { className: "block text-xs sm:text-sm font-medium mb-1" }, 'Risk Tolerance'),
        React.createElement('select', {
          value: settings.riskTolerance,
          onChange: (e) => setSettings({...settings, riskTolerance: e.target.value}),
          className: "w-full p-2 border rounded text-sm sm:text-base"
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
    React.createElement('div', { className: `rounded-lg p-4 sm:p-6 ${conditions.color} border-l-4 border-current` },
      React.createElement('div', { className: "flex flex-col sm:flex-row items-center justify-between" },
        React.createElement('div', { className: "flex items-center mb-2 sm:mb-0" },
          React.createElement('span', { className: "text-xl sm:text-2xl mr-2" }, conditions.icon),
          React.createElement('h2', { className: "text-xl sm:text-2xl font-bold ml-2" }, conditions.rating)
        ),
        React.createElement('div', { className: "text-center sm:text-right" },
          React.createElement('div', { className: "text-xs sm:text-sm opacity-75" }, 'Conditions Score'),
          React.createElement('div', { className: "text-lg sm:text-xl font-bold" }, `${conditions.score}/100`)
        )
      ),
      conditions.factors.length > 0 && React.createElement('div', { className: "mt-2 text-xs sm:text-sm text-center sm:text-left" },
        React.createElement('strong', null, 'Factors:'), ` ${conditions.factors.join(', ')}`
      )
    ),

    // Three Main Factors
    React.createElement('div', { className: "grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6" },
      // 1. TIDES
      React.createElement('div', { className: "bg-blue-100 rounded-lg shadow p-4 sm:p-6" },
        React.createElement('h3', { className: "text-lg sm:text-xl font-bold flex items-center mb-3 sm:mb-4 text-blue-800" },
          React.createElement('span', { className: "text-xl sm:text-2xl mr-2" }, '🌊'),
          'TIDES'
        ),
        React.createElement('div', { className: "grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4" },
          // Left column - Tide information
          React.createElement('div', { className: "space-y-3" },
            // Current Height
            React.createElement('div', { className: "text-center p-3 bg-blue-200 rounded" },
              React.createElement('div', { className: "text-xs sm:text-sm text-blue-700" }, 'Current Height'),
              React.createElement('div', { className: "text-xl sm:text-2xl font-bold text-blue-900" }, 
                typeof currentConditions.tides.currentHeight === 'number' ? `${currentConditions.tides.currentHeight.toFixed(1)}m` : currentConditions.tides.currentHeight
              )
            ),
            // Determine which tide is next
            (() => {
              const nextHighTime = currentConditions.tides.nextHigh.time.replace(' (tomorrow)', '');
              const nextLowTime = currentConditions.tides.nextLow.time.replace(' (tomorrow)', '');
              const nextHighMinutes = nextHighTime !== '--' ? parseInt(nextHighTime.split(':')[0]) * 60 + parseInt(nextHighTime.split(':')[1]) : Infinity;
              const nextLowMinutes = nextLowTime !== '--' ? parseInt(nextLowTime.split(':')[0]) * 60 + parseInt(nextLowTime.split(':')[1]) : Infinity;
              const highIsNext = nextHighMinutes < nextLowMinutes;
              
              return React.createElement(React.Fragment, null,
                // First tide (whichever is next)
                React.createElement('div', { className: "text-center p-2 bg-blue-50 border border-blue-200 rounded" },
                  React.createElement('div', { className: "text-xs text-blue-600" }, highIsNext ? 'Next High' : 'Next Low'),
                  React.createElement('div', { className: "font-semibold text-sm sm:text-base text-blue-800" }, highIsNext ? currentConditions.tides.nextHigh.time : currentConditions.tides.nextLow.time),
                  React.createElement('div', { className: "text-xs sm:text-sm text-blue-700" }, highIsNext ? currentConditions.tides.nextHigh.height : currentConditions.tides.nextLow.height)
                ),
                // Second tide (opposite of first)
                React.createElement('div', { className: "text-center p-2 bg-blue-50 border border-blue-200 rounded" },
                  React.createElement('div', { className: "text-xs text-blue-600" }, highIsNext ? 'Next Low' : 'Next High'),
                  React.createElement('div', { className: "font-semibold text-sm sm:text-base text-blue-800" }, highIsNext ? currentConditions.tides.nextLow.time : currentConditions.tides.nextHigh.time),
                  React.createElement('div', { className: "text-xs sm:text-sm text-blue-700" }, highIsNext ? currentConditions.tides.nextLow.height : currentConditions.tides.nextHigh.height)
                )
              );
            })()
          ),
          
          // Right column - Marina information
          React.createElement('div', { className: "space-y-3" },
            // Determine which marina event is next
            (() => {
              const openTime = currentConditions.tides.marinaOpen.replace(' (tomorrow)', '');
              const closeTime = currentConditions.tides.marinaClosed.replace(' (tomorrow)', '');
              const openMinutes = openTime !== '--' ? parseInt(openTime.split(':')[0]) * 60 + parseInt(openTime.split(':')[1]) : Infinity;
              const closeMinutes = closeTime !== '--' ? parseInt(closeTime.split(':')[0]) * 60 + parseInt(closeTime.split(':')[1]) : Infinity;
              const openIsNext = openMinutes < closeMinutes;
              
              return React.createElement(React.Fragment, null,
                // Spacer to align with current height - only on desktop
                React.createElement('div', { className: "hidden sm:block h-[76px]" }),
                // First marina event (whichever is next)
                React.createElement('div', { className: "text-center p-2 bg-blue-50 border border-blue-200 rounded" },
                  React.createElement('div', { className: "text-xs text-blue-600" }, openIsNext ? 'Marina Opens' : 'Marina Closes'),
                  React.createElement('div', { className: "font-semibold text-sm sm:text-base text-blue-800" }, openIsNext ? currentConditions.tides.marinaOpen : currentConditions.tides.marinaClosed),
                  React.createElement('div', { className: "text-xs text-blue-700" }, `(at ${settings.boatDraft}m depth)`)
                ),
                // Second marina event (opposite of first)
                React.createElement('div', { className: "text-center p-2 bg-blue-50 border border-blue-200 rounded" },
                  React.createElement('div', { className: "text-xs text-blue-600" }, openIsNext ? 'Marina Closes' : 'Marina Opens'),
                  React.createElement('div', { className: "font-semibold text-sm sm:text-base text-blue-800" }, openIsNext ? currentConditions.tides.marinaClosed : currentConditions.tides.marinaOpen),
                  React.createElement('div', { className: "text-xs text-blue-700" }, `(at ${settings.boatDraft}m depth)`)
                )
              );
            })()
          )
        ),
        React.createElement('div', { className: "text-xs text-blue-600 italic text-left border-t border-blue-200 pt-2 mt-3 sm:mt-4" },
          'Tide data: © Digimap Tides. Times adjusted for BST when applicable.'
        )
      ),

      // 2. WIND & WAVES - Direct Widget
      React.createElement('div', { className: "bg-sky-100 rounded-lg shadow p-4 sm:p-6" },
        React.createElement('h3', { className: "text-lg sm:text-xl font-bold flex items-center mb-3 sm:mb-4 text-sky-800" },
          React.createElement('span', { className: "text-xl sm:text-2xl mr-2" }, '💨'),
          'WIND & WAVES'
        ),
        React.createElement('div', { className: "bg-sky-50 p-3 sm:p-4 rounded-lg min-h-[150px] sm:min-h-[200px] border border-sky-200 overflow-x-auto" },
          React.createElement('div', { id: "windguru-widget-container" },
            React.createElement('div', { className: "text-center text-sky-600 py-6 sm:py-8 text-xs sm:text-base" }, 'Loading Windguru widget...')
          )
        ),
        React.createElement('div', { className: "text-xs text-sky-600 italic mt-2 pt-2 border-t border-sky-200" },
          'Wind/Wave data: © Windguru.cz'
        )
      ),

      // 3. WEATHER
      React.createElement('div', { className: "bg-orange-100 rounded-lg shadow p-4 sm:p-6" },
        React.createElement('h3', { className: "text-lg sm:text-xl font-bold flex items-center mb-3 sm:mb-4 text-orange-800" },
          React.createElement('span', { className: "text-xl sm:text-2xl mr-2" }, '🌤️'),
          'WEATHER'
        ),
        React.createElement('div', { className: "grid grid-cols-3 gap-2 sm:gap-3 mb-3 sm:mb-4" },
          React.createElement('div', { className: "text-center p-2 sm:p-3 bg-orange-50 rounded border border-orange-200" },
            React.createElement('div', { className: "text-xs text-orange-600 mb-1" }, 'Summary'),
            React.createElement('div', { className: "font-semibold text-xs sm:text-sm text-orange-800" }, currentConditions.weather.summary)
          ),
          React.createElement('div', { className: "text-center p-2 sm:p-3 bg-orange-50 rounded border border-orange-200" },
            React.createElement('div', { className: "text-xs text-orange-600 mb-1" }, 'Temperature'),
            React.createElement('div', { className: "font-semibold text-xs sm:text-sm text-orange-800" }, currentConditions.weather.temperature)
          ),
          React.createElement('div', { className: "text-center p-2 sm:p-3 bg-orange-50 rounded border border-orange-200" },
            React.createElement('div', { className: "text-xs text-orange-600 mb-1" }, 'Visibility'),
            React.createElement('div', { className: "font-semibold text-xs sm:text-sm text-orange-800" }, currentConditions.weather.visibility)
          )
        ),
        React.createElement('div', { className: "text-xs text-orange-600 italic text-left border-t border-orange-200 pt-2 mt-3 sm:mt-4" },
          `Weather data: BBC Weather ${currentConditions.weather.time}`
        )
      )
    )
  );

  const ForecastView = () => React.createElement('div', { className: "bg-white rounded-lg shadow p-4 sm:p-6" },
    React.createElement('h2', { className: "text-lg sm:text-xl font-bold mb-3 sm:mb-4" }, '3-Day Forecast'),
    React.createElement('div', { className: "text-center text-gray-500 text-sm sm:text-base" }, 'Forecast feature coming soon...')
  );

  return React.createElement('div', { className: "min-h-screen bg-gray-100" },
    React.createElement('div', { className: "bg-blue-800 text-white p-3 sm:p-4" },
      React.createElement('div', { className: "max-w-6xl mx-auto" },
        React.createElement('div', { className: "flex flex-col sm:flex-row items-center justify-between" },
          React.createElement('div', { className: "text-center sm:text-left mb-3 sm:mb-0" },
            React.createElement('h1', { className: "text-xl sm:text-2xl font-bold" },
              'TEF RIB Reckoner'
            ),
            React.createElement('p', { className: "text-blue-100 text-xs sm:text-sm" }, 'Bailiwick waters sailing conditions')
          ),
          React.createElement('div', { className: "text-center sm:text-right w-full sm:w-auto" },
            React.createElement('div', { className: "text-xs text-blue-100 mb-1" },
              `Guernsey time: ${new Date().toLocaleTimeString('en-GB', {timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit'})}`
            ),
            React.createElement('button', {
              onClick: updateLiveData,
              disabled: isUpdating,
              className: "bg-blue-600 hover:bg-blue-500 disabled:bg-blue-700 px-3 py-2 sm:px-4 sm:py-2 rounded-lg flex items-center text-xs sm:text-sm font-medium transition-colors mx-auto sm:mx-0"
            },
              isUpdating ? 
                React.createElement(React.Fragment, null,
                  React.createElement('div', { className: "animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" }),
                  'Updating...'
                ) :
                React.createElement(React.Fragment, null,
                  'Update Now'
                )
            ),
            React.createElement('div', { className: "text-xs text-blue-100" },
              `Last updated: ${lastUpdated.toLocaleTimeString('en-GB', {timeZone: 'Europe/London'})}`
            )
          )
        )
      )
    ),

    React.createElement('div', { className: "bg-white shadow-sm" },
      React.createElement('div', { className: "max-w-6xl mx-auto px-3 sm:px-4" },
        React.createElement('div', { className: "flex space-x-4 sm:space-x-8 overflow-x-auto" },
          React.createElement('button', {
            onClick: () => setCurrentView('current'),
            className: `py-2 sm:py-3 px-1 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap ${
              currentView === 'current' 
                ? 'border-blue-600 text-blue-700' 
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`
          }, 'Current Conditions'),
          React.createElement('button', {
            onClick: () => setCurrentView('forecast'),
            className: `py-2 sm:py-3 px-1 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap ${
              currentView === 'forecast' 
                ? 'border-blue-600 text-blue-700' 
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`
          }, '3-Day Forecast'),
          React.createElement('button', {
            onClick: () => setCurrentView('settings'),
            className: `py-2 sm:py-3 px-1 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap ${
              currentView === 'settings' 
                ? 'border-blue-600 text-blue-700' 
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`
          }, 'Settings')
        )
      )
    ),

    React.createElement('div', { className: "max-w-6xl mx-auto p-3 sm:p-4" },
      currentView === 'current' && CurrentConditions(),
      currentView === 'forecast' && ForecastView(),
      currentView === 'settings' && SettingsPanel()
    ),

    React.createElement('div', { className: "bg-gray-200 mt-8 p-3 sm:p-4 text-xs text-gray-700" },
      React.createElement('div', { className: "max-w-6xl mx-auto text-center" },
        React.createElement('strong', null, 'Data Sources:'), 
        React.createElement('span', { className: "block sm:inline" }, ' Tides: digimap.gg | Wind/Waves: Windguru | Weather: BBC RSS'),
        React.createElement('br', { className: "hidden sm:block" }),
        React.createElement('em', { className: "block mt-1 sm:mt-0" }, 'Auto-updates on load. Click Update Now for latest conditions.')
      )
    )
  );
};

const container = document.getElementById('root');
const root = ReactDOM.createRoot(container);
root.render(React.createElement(GuernseyRibApp));
