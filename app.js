const { useState, useEffect } = React;

const GuernseyRibApp = () => {
  const [showSettings, setShowSettings] = useState(false);
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
      lastTide: { time: '--', height: '--', type: '--' },
      nextTide: { time: '--', height: '--', type: '--' },
      lastMarinaEvent: { time: '--', type: '--' },
      nextMarinaEvent: { time: '--', type: '--' },
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
    loadWindguruWidget();
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
          if (cells.length >= 6) { // Now checking for 6 columns
            const marina = cells[0].textContent.trim();
            marinaTimes[marina] = {
              open1: cells[1].textContent.trim() || '--',   // Usually empty
              close1: cells[2].textContent.trim() || '--',  // 02:46
              open2: cells[3].textContent.trim() || '--',   // 08:33
              close2: cells[4].textContent.trim() || '--',  // 15:12
              open3: cells[5].textContent.trim() || '--'    // 20:43 - MISSING!
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
      
      // Find last and next tide events - determine current state first
      let lastTide = { time: '--', height: '--', type: '--' };
      let nextTide = { time: '--', height: '--', type: '--' };
      
      // Get all tides in chronological order
      const allEvents = [...tideExtremes];
      
      // Find most recent past tide to determine current state
      let currentTideState = 'unknown';
      let lastTideData = null;
      
      for (let i = 0; i < allEvents.length; i++) {
        const event = allEvents[i];
        const eventMinutes = parseInt(event.time.split(':')[0]) * 60 + parseInt(event.time.split(':')[1]);
        
        if (eventMinutes <= currentTimeMinutes) {
          lastTideData = event;
          currentTideState = event.type; // 'high' or 'low'
        }
      }
      
      // If no tides today, data problem - don't guess
      if (!lastTideData) {
        lastTide = { time: '--', height: '--', type: '--' };
        nextTide = { time: '--', height: '--', type: '--' };
      } else {
        if (currentTideState === 'high') {
          // Currently FALLING (after high): Last=High, Next=Low
          lastTide = lastTideData;
          
          // Find next low tide
          const nextLow = allEvents.find(e => {
            const eventMinutes = parseInt(e.time.split(':')[0]) * 60 + parseInt(e.time.split(':')[1]);
            return e.type === 'low' && eventMinutes > currentTimeMinutes;
          });
          
          nextTide = nextLow || { time: '--', height: '--', type: '--' };
          
        } else if (currentTideState === 'low') {
          // Currently RISING (after low): Last=Low, Next=High
          lastTide = lastTideData;
          
          // Find next high tide  
          const nextHigh = allEvents.find(e => {
            const eventMinutes = parseInt(e.time.split(':')[0]) * 60 + parseInt(e.time.split(':')[1]);
            return e.type === 'high' && eventMinutes > currentTimeMinutes;
          });
          
          nextTide = nextHigh || { time: '--', height: '--', type: '--' };
        } else {
          // Unknown tide state - data problem
          lastTide = { time: '--', height: '--', type: '--' };
          nextTide = { time: '--', height: '--', type: '--' };
        }
      }
      
      // Calculate sunrise/sunset for Guernsey (49.45°N, 2.54°W)
  const calculateSunTimes = (date) => {
    const lat = 49.45; // Guernsey latitude
    const lon = -2.54; // Guernsey longitude
    
    const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);
    const P = Math.asin(.39795 * Math.cos(.98563 * (dayOfYear - 173) * Math.PI / 180));
    const argument = Math.tan(lat * Math.PI / 180) * Math.tan(P);
    const argument2 = Math.sqrt(1 - argument * argument);
    const H = 180 / Math.PI * Math.atan2(argument2, argument);
    
    const sunrise = 12 - H / 15 - lon / 15;
    const sunset = 12 + H / 15 - lon / 15;
    
    return { sunrise, sunset };
  };

  // Check if it's night time (sunset+30min to sunrise-30min)
  const isNightTime = () => {
    const now = new Date();
    const guernseyTime = new Date(now.toLocaleString("en-US", {timeZone: "Europe/London"}));
    const currentHours = guernseyTime.getHours() + guernseyTime.getMinutes() / 60;
    
    const { sunrise, sunset } = calculateSunTimes(guernseyTime);
    const nightStart = sunset + 0.5; // 30 minutes after sunset
    const nightEnd = sunrise - 0.5;  // 30 minutes before sunrise
    
    // Handle overnight (sunset to midnight, then midnight to sunrise)
    return currentHours >= nightStart || currentHours <= nightEnd;
  };
      const calculateMarinaEvents = (marina) => {
        if (!marina || !marina.open1) return { lastEvent: { time: '--', type: '--' }, nextEvent: { time: '--', type: '--' } };
        
        // Create all events for today
        const events = [];
        if (marina.open1 && marina.open1 !== '--') events.push({ type: 'Opened', time: marina.open1 });
        if (marina.close1 && marina.close1 !== '--') events.push({ type: 'Closed', time: marina.close1 });
        if (marina.open2 && marina.open2 !== '--') events.push({ type: 'Opened', time: marina.open2 });
        if (marina.close2 && marina.close2 !== '--') events.push({ type: 'Closed', time: marina.close2 });
        
        // Sort events chronologically
        events.sort((a, b) => {
          const timeA = parseInt(a.time.split(':')[0]) * 60 + parseInt(a.time.split(':')[1]);
          const timeB = parseInt(b.time.split(':')[0]) * 60 + parseInt(b.time.split(':')[1]);
          return timeA - timeB;
        });
        
        // Find most recent past event to determine current state
        let currentState = 'unknown';
        let lastEventData = null;
        
        for (let i = 0; i < events.length; i++) {
          const event = events[i];
          const eventMinutes = parseInt(event.time.split(':')[0]) * 60 + parseInt(event.time.split(':')[1]);
          
          if (eventMinutes <= currentTimeMinutes) {
            lastEventData = event;
            currentState = event.type; // 'Opened' or 'Closed'
          }
        }
        
        // If no events today, data problem - don't guess
        if (!lastEventData) {
          return { lastEvent: { time: '--', type: '--' }, nextEvent: { time: '--', type: '--' } };
        }
        
        let lastEvent = { time: '--', type: '--' };
        let nextEvent = { time: '--', type: '--' };
        
        if (currentState === 'Opened') {
          // Currently OPEN: Last=Opened, Next=Closes
          lastEvent = lastEventData;
          
          // Find next closing
          const nextClose = events.find(e => {
            const eventMinutes = parseInt(e.time.split(':')[0]) * 60 + parseInt(e.time.split(':')[1]);
            return e.type === 'Closed' && eventMinutes > currentTimeMinutes;
          });
          
          nextEvent = nextClose || { time: '--', type: '--' };
          
        } else if (currentState === 'Closed') {
          // Currently CLOSED: Last=Closed, Next=Opens  
          lastEvent = lastEventData;
          
          // Find next opening
          const nextOpen = events.find(e => {
            const eventMinutes = parseInt(e.time.split(':')[0]) * 60 + parseInt(e.time.split(':')[1]);
            return e.type === 'Opened' && eventMinutes > currentTimeMinutes;
          });
          
          nextEvent = nextOpen || { time: '--', type: '--' };
        } else {
          // Unknown state - data problem
          lastEvent = { time: '--', type: '--' };
          nextEvent = { time: '--', type: '--' };
        }
        
        return { lastEvent, nextEvent };
      };
      
      return {
        currentHeight: currentHeight,
        lastTide: lastTide,
        nextTide: nextTide,
        marinaTimes: marinaTimes,
        allTides: tideExtremes,
        hourlyData: allTideData,
        calculateMarinaEvents: calculateMarinaEvents
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

  // Calculate marina events - determine current state first
  const calculateMarinaEvents = (marina, tomorrowTides, currentTimeMinutes) => {
    if (!marina || !marina.open1) return { lastEvent: { time: '--', type: '--' }, nextEvent: { time: '--', type: '--' } };
    
    // Create all events for today
    const events = [];
    if (marina.open1 && marina.open1 !== '--') events.push({ type: 'Opened', time: marina.open1 });
    if (marina.close1 && marina.close1 !== '--') events.push({ type: 'Closed', time: marina.close1 });
    if (marina.open2 && marina.open2 !== '--') events.push({ type: 'Opened', time: marina.open2 });
    if (marina.close2 && marina.close2 !== '--') events.push({ type: 'Closed', time: marina.close2 });
    if (marina.open3 && marina.open3 !== '--') events.push({ type: 'Opened', time: marina.open3 }); // Added open3!
    
    // Sort events chronologically
    events.sort((a, b) => {
      const timeA = parseInt(a.time.split(':')[0]) * 60 + parseInt(a.time.split(':')[1]);
      const timeB = parseInt(b.time.split(':')[0]) * 60 + parseInt(b.time.split(':')[1]);
      return timeA - timeB;
    });
    
    // Find most recent past event to determine current state
    let currentState = 'unknown';
    let lastEventData = null;
    
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const eventMinutes = parseInt(event.time.split(':')[0]) * 60 + parseInt(event.time.split(':')[1]);
      
      if (eventMinutes <= currentTimeMinutes) {
        lastEventData = event;
        currentState = event.type; // 'Opened' or 'Closed'
      }
    }
    
    let lastEvent = { time: '--', type: '--' };
    let nextEvent = { time: '--', type: '--' };
    
    // If no events today, data problem - don't guess
    if (!lastEventData) {
      return { lastEvent, nextEvent };
    }
    
    if (currentState === 'Opened') {
      // Currently OPEN: Last=Opened, Next=Closes
      lastEvent = lastEventData;
      
      // Find next closing - first try today
      const nextClose = events.find(e => {
        const eventMinutes = parseInt(e.time.split(':')[0]) * 60 + parseInt(e.time.split(':')[1]);
        return e.type === 'Closed' && eventMinutes > currentTimeMinutes;
      });
      
      if (nextClose) {
        nextEvent = nextClose;
      } else if (tomorrowTides && tomorrowTides.marinaTimes) {
        // Use tomorrow's marina data
        const tomorrowMarina = tomorrowTides.marinaTimes[settings.marina] || {};
        const tomorrowEvents = [];
        if (tomorrowMarina.open1 && tomorrowMarina.open1 !== '--') tomorrowEvents.push({ type: 'Opened', time: tomorrowMarina.open1 });
        if (tomorrowMarina.close1 && tomorrowMarina.close1 !== '--') tomorrowEvents.push({ type: 'Closed', time: tomorrowMarina.close1 });
        if (tomorrowMarina.open2 && tomorrowMarina.open2 !== '--') tomorrowEvents.push({ type: 'Opened', time: tomorrowMarina.open2 });
        if (tomorrowMarina.close2 && tomorrowMarina.close2 !== '--') tomorrowEvents.push({ type: 'Closed', time: tomorrowMarina.close2 });
        if (tomorrowMarina.open3 && tomorrowMarina.open3 !== '--') tomorrowEvents.push({ type: 'Opened', time: tomorrowMarina.open3 }); // Added open3!
        if (tomorrowMarina.open3 && tomorrowMarina.open3 !== '--') tomorrowEvents.push({ type: 'Opened', time: tomorrowMarina.open3 }); // Added open3!
        
        const firstClose = tomorrowEvents.find(e => e.type === 'Closed');
        nextEvent = firstClose || { time: '--', type: '--' };
      } else {
        nextEvent = { time: '--', type: '--' };
      }
      
    } else if (currentState === 'Closed') {
      // Currently CLOSED: Last=Closed, Next=Opens  
      lastEvent = lastEventData;
      
      // Find next opening - first try today
      const nextOpen = events.find(e => {
        const eventMinutes = parseInt(e.time.split(':')[0]) * 60 + parseInt(e.time.split(':')[1]);
        return e.type === 'Opened' && eventMinutes > currentTimeMinutes;
      });
      
      if (nextOpen) {
        nextEvent = nextOpen;
      } else if (tomorrowTides && tomorrowTides.marinaTimes) {
        // Use tomorrow's marina data
        const tomorrowMarina = tomorrowTides.marinaTimes[settings.marina] || {};
        const tomorrowEvents = [];
        if (tomorrowMarina.open1 && tomorrowMarina.open1 !== '--') tomorrowEvents.push({ type: 'Opened', time: tomorrowMarina.open1 });
        if (tomorrowMarina.close1 && tomorrowMarina.close1 !== '--') tomorrowEvents.push({ type: 'Closed', time: tomorrowMarina.close1 });
        if (tomorrowMarina.open2 && tomorrowMarina.open2 !== '--') tomorrowEvents.push({ type: 'Opened', time: tomorrowMarina.open2 });
        if (tomorrowMarina.close2 && tomorrowMarina.close2 !== '--') tomorrowEvents.push({ type: 'Closed', time: tomorrowMarina.close2 });
        
        const firstOpen = tomorrowEvents.find(e => e.type === 'Opened');
        nextEvent = firstOpen || { time: '--', type: '--' };
      } else {
        nextEvent = { time: '--', type: '--' };
      }
    } else {
      // Unknown state - data problem
      lastEvent = { time: '--', type: '--' };
      nextEvent = { time: '--', type: '--' };
    }
    
    return { lastEvent, nextEvent };
  };
  const checkNeedsTomorrowData = async (todayTides, currentTimeMinutes) => {
    // Check if any future tide events exist today
    const futureTides = todayTides.allTides.filter(tide => {
      const tideMinutes = parseInt(tide.time.split(':')[0]) * 60 + parseInt(tide.time.split(':')[1]);
      return tideMinutes > currentTimeMinutes;
    });
    
    // Check if any future marina events exist today
    const marina = todayTides.marinaTimes[settings.marina] || {};
    const futureMarinas = [
      { type: 'Opened', time: marina.open1 },
      { type: 'Closed', time: marina.close1 },
      { type: 'Opened', time: marina.open2 },
      { type: 'Closed', time: marina.close2 },
      { type: 'Opened', time: marina.open3 } // Added open3!
    ].filter(e => {
      if (!e.time || e.time === '--') return false;
      const eventMinutes = parseInt(e.time.split(':')[0]) * 60 + parseInt(e.time.split(':')[1]);
      return eventMinutes > currentTimeMinutes;
    });
    
    return futureTides.length === 0 || futureMarinas.length === 0;
  };

  // Calculate tide events using today + tomorrow data
  const calculateTideEvents = (todayTides, tomorrowTides, currentTimeMinutes) => {
    let lastTide = { time: '--', height: '--', type: '--' };
    let nextTide = { time: '--', height: '--', type: '--' };
    
    const todayEvents = todayTides.allTides || [];
    
    // Find most recent past tide
    for (let i = 0; i < todayEvents.length; i++) {
      const event = todayEvents[i];
      const eventMinutes = parseInt(event.time.split(':')[0]) * 60 + parseInt(event.time.split(':')[1]);
      
      if (eventMinutes <= currentTimeMinutes) {
        lastTide = event;
      }
    }
    
    // Find next future tide - first try today
    for (let i = 0; i < todayEvents.length; i++) {
      const event = todayEvents[i];
      const eventMinutes = parseInt(event.time.split(':')[0]) * 60 + parseInt(event.time.split(':')[1]);
      
      if (eventMinutes > currentTimeMinutes) {
        nextTide = event;
        break;
      }
    }
    
    // If no future tide today, use tomorrow's first
    if (nextTide.time === '--' && tomorrowTides && tomorrowTides.allTides && tomorrowTides.allTides.length > 0) {
      nextTide = tomorrowTides.allTides[0];
    }
    
    return { lastTide, nextTide };
  };
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
          const now = new Date();
          const guernseyTime = new Date(now.toLocaleString("en-US", {timeZone: "Europe/London"}));
          const currentTimeMinutes = guernseyTime.getHours() * 60 + guernseyTime.getMinutes();
          
          const parsedTides = parseTideData(content);
          console.log('Parsed tide result:', parsedTides);
          if (parsedTides) {
            // Check if we need tomorrow's data for next events
            const needsTomorrowData = await checkNeedsTomorrowData(parsedTides, currentTimeMinutes);
            
            let tomorrowTides = null;
            if (needsTomorrowData) {
              console.log('Need tomorrow data, fetching...');
              const tomorrowYearDay = yearDay + 1;
              const tomorrowUrl = `https://tides.digimap.gg/?year=${now.getFullYear()}&yearDay=${tomorrowYearDay}&reqDepth=${reqDepth}`;
              
              try {
                const tomorrowResponse = await fetch(workingProxy + encodeURIComponent(tomorrowUrl));
                let tomorrowContent;
                if (workingProxy.includes('allorigins.win')) {
                  const tomorrowData = await tomorrowResponse.json();
                  tomorrowContent = tomorrowData.contents;
                } else {
                  tomorrowContent = await tomorrowResponse.text();
                }
                
                if (tomorrowContent) {
                  tomorrowTides = parseTideData(tomorrowContent);
                  console.log('Tomorrow tide data fetched:', tomorrowTides);
                }
              } catch (error) {
                console.log('Tomorrow tide fetch failed:', error.message);
              }
            }
            
            setMarinaTimes(parsedTides.marinaTimes);
            const selectedMarina = parsedTides.marinaTimes[settings.marina] || {};
            const marinaEvents = calculateMarinaEvents(selectedMarina, tomorrowTides, currentTimeMinutes);
            const tideEvents = calculateTideEvents(parsedTides, tomorrowTides, currentTimeMinutes);
            
            setCurrentConditions(prev => ({
              ...prev,
              tides: {
                ...prev.tides,
                currentHeight: parsedTides.currentHeight,
                lastTide: tideEvents.lastTide,
                nextTide: tideEvents.nextTide,
                lastMarinaEvent: marinaEvents.lastEvent,
                nextMarinaEvent: marinaEvents.nextEvent,
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
    // Check for night mode first
    if (isNightTime()) {
      return { 
        score: null, 
        rating: 'Night', 
        color: 'text-gray-800 bg-gray-300', 
        icon: '🌙', 
        factors: [], 
        isMarinaClosed: false 
      };
    }
    
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

    // Check if marina is currently closed - simple logic
    const lastMarinaEvent = currentConditions.tides.lastMarinaEvent || { type: '--' };
    const isMarinaClosed = lastMarinaEvent.type === 'Closed';

    return { score, rating, color, icon, factors, isMarinaClosed };
  };

  const conditions = calculateConditions();

  const CurrentConditions = () => {
    // Update current time every minute
    const [currentTime, setCurrentTime] = useState(new Date());
    
    useEffect(() => {
      const timer = setInterval(() => {
        setCurrentTime(new Date());
      }, 60000); // Update every minute
      
      return () => clearInterval(timer);
    }, []);
    
    return React.createElement('div', { className: "space-y-4" },
      // Overall Status
      React.createElement('div', { className: `rounded-lg p-4 sm:p-6 ${conditions.color} border-l-4 border-current` },
        React.createElement('div', { className: "flex flex-col sm:flex-row items-center justify-between" },
          React.createElement('div', { className: "flex items-center mb-2 sm:mb-0" },
            React.createElement('span', { className: "text-xl sm:text-2xl mr-2" }, conditions.icon),
            React.createElement('h2', { className: "text-xl sm:text-2xl font-bold ml-2" }, conditions.rating)
          ),
          conditions.score !== null && React.createElement('div', { className: "text-center sm:text-right" },
            React.createElement('div', { className: "text-xs sm:text-sm opacity-75" }, 'Conditions Score'),
            React.createElement('div', { className: "text-lg sm:text-xl font-bold" }, `${conditions.score}/100`)
          )
        ),
        conditions.factors.length > 0 && React.createElement('div', { className: "mt-2 text-xs sm:text-sm text-center sm:text-left" },
          React.createElement('strong', null, 'Factors:'), ` ${conditions.factors.join(', ')}`
        ),
        conditions.isMarinaClosed && React.createElement('div', { className: "mt-3 text-center" },
          React.createElement('span', { className: "bg-red-600 text-white px-3 py-1 rounded-full text-sm font-bold" }, 
            '--- MARINA CLOSED ---'
          )
        )
      ),

    // Three Main Factors
    React.createElement('div', { className: "grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 items-stretch" },
      // 1. TIDES
      React.createElement('div', { className: "bg-green-100 rounded-lg shadow p-4 sm:p-6 flex flex-col h-full" },
        React.createElement('h3', { className: "text-lg sm:text-xl font-bold flex items-center mb-3 sm:mb-4 text-green-800" },
          React.createElement('span', { className: "text-xl sm:text-2xl mr-2" }, '🌊'),
          'TIDES'
        ),
        React.createElement('div', { className: "space-y-3 flex-grow" },
          // Row 1 - Marina Status
          React.createElement('div', { className: "grid grid-cols-3 gap-2 sm:gap-3" },
            // Last Marina Status
            React.createElement('div', { className: "text-center p-2 sm:p-3 bg-green-200 rounded" },
              React.createElement('div', { className: "text-xs text-green-700" }, 
                currentConditions.tides.lastMarinaEvent.type !== '--' ?
                  `Marina ${currentConditions.tides.lastMarinaEvent.type}` :
                  'Last Marina Status'
              ),
              React.createElement('div', { className: "font-semibold text-sm sm:text-base text-green-900" }, 
                currentConditions.tides.lastMarinaEvent.time
              ),
              React.createElement('div', { className: "text-xs text-green-800" }, 
                `${settings.boatDraft}m clearance`
              )
            ),
            // Current Time
            React.createElement('div', { className: "text-center p-2 sm:p-3 bg-green-200 rounded" },
              React.createElement('div', { className: "text-xs text-green-700" }, 'Current Time'),
              React.createElement('div', { className: "text-lg sm:text-xl font-bold text-green-900" }, 
                currentTime.toLocaleTimeString('en-GB', {timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit'})
              )
            ),
            // Next Marina Status
            React.createElement('div', { className: "text-center p-2 sm:p-3 bg-green-200 rounded" },
              React.createElement('div', { className: "text-xs text-green-700" }, 
                currentConditions.tides.nextMarinaEvent.type !== '--' ?
                  `Marina ${currentConditions.tides.nextMarinaEvent.type === 'Opened' ? 'Opens' : 'Closes'}` :
                  'Next Marina Status'
              ),
              React.createElement('div', { className: "font-semibold text-sm sm:text-base text-green-900" }, 
                currentConditions.tides.nextMarinaEvent.time
              ),
              React.createElement('div', { className: "text-xs text-green-800" }, 
                `${settings.boatDraft}m clearance`
              )
            )
          ),
          
          // Row 2 - Tide Status
          React.createElement('div', { className: "grid grid-cols-3 gap-2 sm:gap-3" },
            // Last Tide
            React.createElement('div', { className: "text-center p-2 sm:p-3 bg-green-200 rounded" },
              React.createElement('div', { className: "text-xs text-green-700" }, 
                currentConditions.tides.lastTide.type !== '--' ? 
                  `Last ${currentConditions.tides.lastTide.type.charAt(0).toUpperCase() + currentConditions.tides.lastTide.type.slice(1)}` : 
                  'Last Tide'
              ),
              React.createElement('div', { className: "font-semibold text-sm sm:text-base text-green-900" }, 
                currentConditions.tides.lastTide.time
              ),
              React.createElement('div', { className: "text-xs sm:text-sm text-green-800" }, 
                currentConditions.tides.lastTide.height
              )
            ),
            // Current Height
            React.createElement('div', { className: "text-center p-2 sm:p-3 bg-green-200 rounded" },
              React.createElement('div', { className: "text-xs text-green-700" }, 'Current Height'),
              React.createElement('div', { className: "text-lg sm:text-xl font-bold text-green-900" }, 
                typeof currentConditions.tides.currentHeight === 'number' ? 
                  `${currentConditions.tides.currentHeight.toFixed(1)}m` : 
                  currentConditions.tides.currentHeight
              )
            ),
            // Next Tide
            React.createElement('div', { className: "text-center p-2 sm:p-3 bg-green-200 rounded" },
              React.createElement('div', { className: "text-xs text-green-700" }, 
                currentConditions.tides.nextTide.type !== '--' ? 
                  `Next ${currentConditions.tides.nextTide.type.charAt(0).toUpperCase() + currentConditions.tides.nextTide.type.slice(1)}` : 
                  'Next Tide'
              ),
              React.createElement('div', { className: "font-semibold text-sm sm:text-base text-green-900" }, 
                currentConditions.tides.nextTide.time
              ),
              React.createElement('div', { className: "text-xs sm:text-sm text-green-800" }, 
                currentConditions.tides.nextTide.height
              )
            )
          )
        ),
        React.createElement('div', { className: "text-xs text-green-600 italic text-left border-t border-green-200 pt-2 mt-3" },
          React.createElement('a', { 
            href: `https://tides.digimap.gg/?year=${new Date().getFullYear()}&yearDay=${getYearDay(new Date())}&reqDepth=${Math.round(settings.boatDraft * 100)}`,
            target: '_blank',
            rel: 'noopener noreferrer',
            className: 'hover:underline'
          }, 'Tide data: © Digimap Tides. Times adjusted for BST when applicable.')
        )
      ),

      // 2. WIND & WAVES - Direct Widget
      React.createElement('div', { className: "bg-gray-100 rounded-lg shadow p-4 sm:p-6 flex flex-col h-full" },
        React.createElement('h3', { className: "text-lg sm:text-xl font-bold flex items-center mb-3 sm:mb-4 text-gray-800" },
          React.createElement('span', { className: "text-xl sm:text-2xl mr-2" }, '💨'),
          'WIND & WAVES'
        ),
        React.createElement('div', { className: "bg-gray-50 p-3 sm:p-4 rounded-lg min-h-[150px] sm:min-h-[200px] border border-gray-200 overflow-x-auto flex-grow" },
          React.createElement('div', { id: "windguru-widget-container" },
            React.createElement('div', { className: "text-center text-gray-600 py-6 sm:py-8 text-xs sm:text-base" }, 'Loading Windguru widget...')
          )
        ),
        React.createElement('div', { className: "text-xs text-gray-600 italic mt-3 pt-2 border-t border-gray-200" },
          React.createElement('a', { 
            href: 'https://www.windguru.cz/35647',
            target: '_blank',
            rel: 'noopener noreferrer',
            className: 'hover:underline'
          }, 'Wind/Wave data: © Windguru.cz')
        )
      ),

      // 3. WEATHER
      React.createElement('div', { className: "bg-orange-100 rounded-lg shadow p-4 sm:p-6 flex flex-col h-full" },
        React.createElement('h3', { className: "text-lg sm:text-xl font-bold flex items-center mb-3 sm:mb-4 text-orange-800" },
          React.createElement('span', { className: "text-xl sm:text-2xl mr-2" }, '🌤️'),
          'WEATHER'
        ),
        React.createElement('div', { className: "flex-grow" },
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
          )
        ),
        React.createElement('div', { className: "text-xs text-orange-600 italic text-left border-t border-orange-200 pt-2" },
          React.createElement('a', { 
            href: 'https://www.bbc.com/weather/6296594',
            target: '_blank',
            rel: 'noopener noreferrer',
            className: 'hover:underline'
          }, `Weather data: BBC Weather ${currentConditions.weather.time}`)
        )
      )
    )
   );
  };

  return React.createElement('div', { className: "min-h-screen bg-blue-50" },
    React.createElement('div', { className: "bg-blue-800 text-white p-3 sm:p-4" },
      React.createElement('div', { className: "max-w-6xl mx-auto" },
        React.createElement('div', { className: "flex flex-col sm:flex-row items-center justify-between" },
          React.createElement('div', { className: "text-center sm:text-left mb-3 sm:mb-0" },
            React.createElement('h1', { className: "text-xl sm:text-2xl font-bold" },
              'TEF RIB Reckoner'
            ),
            React.createElement('p', { className: "text-blue-100 text-xs sm:text-sm" }, 'Bailiwick waters sailing conditions')
          ),
          React.createElement('div', { className: "text-center sm:text-right" },
            React.createElement('button', {
              onClick: updateLiveData,
              disabled: isUpdating,
              className: "bg-blue-600 hover:bg-blue-500 disabled:bg-blue-700 px-3 py-2 sm:px-4 sm:py-2 rounded-lg inline-flex items-center text-xs sm:text-sm font-medium transition-colors mx-auto sm:mx-0 mb-1"
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
            React.createElement('div', { className: "text-xs text-blue-100 text-center sm:text-right" },
              `Last updated: ${lastUpdated.toLocaleTimeString('en-GB', {timeZone: 'Europe/London'})}`
            )
          )
        )
      )
    ),

    React.createElement('div', { className: "max-w-6xl mx-auto p-3 sm:p-4" },
      React.createElement('div', { className: "space-y-4" },
        showSettings && React.createElement('div', { className: "bg-white rounded-lg shadow-lg p-4 sm:p-6" },
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
        ),
        CurrentConditions()
      )
    ),

    React.createElement('div', { className: "bg-blue-200 mt-8 p-3 sm:p-4 text-xs text-blue-800" },
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
