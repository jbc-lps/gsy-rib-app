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
