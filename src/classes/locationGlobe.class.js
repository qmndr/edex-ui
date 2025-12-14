class LocationGlobe {
    constructor(parentId) {
        if (!parentId) throw "Missing parameters";

        const path = require("path");
        const https = require("https");

        this._geodata = require(path.join(__dirname, "assets/misc/grid.json"));
        require(path.join(__dirname, "assets/vendor/encom-globe.js"));
        this.ENCOM = window.ENCOM;
        this.https = https;

        // Globe modes: 'connections', 'weather', 'iss', 'location'
        this.mode = window.settings.globeMode || 'connections';
        this.weatherData = null;
        this.issData = null;
        this.issSatellite = null;
        this.weatherUpdateInterval = null;
        this.issUpdateInterval = null;

        // Create DOM and include lib
        this.parent = document.getElementById(parentId);
        this.parent.innerHTML += `<div id="mod_globe">
            <div id="mod_globe_innercontainer">
                <h1>WORLD VIEW<i id="mod_globe_mode_label">${this._getModeLabel(this.mode)}</i></h1>
                <h2 id="mod_globe_header2">ENDPOINT<i class="mod_globe_headerInfo">0.0000, 0.0000</i></h2>
                <div id="mod_globe_info_panel"></div>
                <div id="mod_globe_canvas_placeholder"></div>
                <div id="mod_globe_mode_selector">
                    <button class="globe_mode_btn ${this.mode === 'connections' ? 'active' : ''}" data-mode="connections" title="Network Connections">NET</button>
                    <button class="globe_mode_btn ${this.mode === 'weather' ? 'active' : ''}" data-mode="weather" title="Weather">WX</button>
                    <button class="globe_mode_btn ${this.mode === 'iss' ? 'active' : ''}" data-mode="iss" title="ISS Tracker">ISS</button>
                    <button class="globe_mode_btn ${this.mode === 'location' ? 'active' : ''}" data-mode="location" title="Location Info">LOC</button>
                </div>
                <h3>OFFLINE</h3>
            </div>
        </div>`;

        this.lastgeo = {};
        this.conns = [];
        this.connectionStats = { total: 0, countries: new Set() };

        // Bind mode selector buttons
        document.querySelectorAll('.globe_mode_btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.setMode(btn.dataset.mode);
            });
        });


        setTimeout(() => {
            let container = document.getElementById("mod_globe_innercontainer");
            let placeholder = document.getElementById("mod_globe_canvas_placeholder");

            // Create Globe
            this.globe = new this.ENCOM.Globe(placeholder.offsetWidth, placeholder.offsetHeight, {
                font: window.theme.cssvars.font_main,
                data: [],
                tiles: this._geodata.tiles,
                baseColor: window.theme.globe.base || `rgb(${window.theme.r},${window.theme.g},${window.theme.b})`,
                markerColor: window.theme.globe.marker || `rgb(${window.theme.r},${window.theme.g},${window.theme.b})`,
                pinColor: window.theme.globe.pin || `rgb(${window.theme.r},${window.theme.g},${window.theme.b})`,
                satelliteColor: window.theme.globe.satellite || `rgb(${window.theme.r},${window.theme.g},${window.theme.b})`,
                scale: 1.1,
                viewAngle: 0.630,
                dayLength: 1000 * 45,
                introLinesDuration: 2000,
                introLinesColor: window.theme.globe.marker || `rgb(${window.theme.r},${window.theme.g},${window.theme.b})`,
                maxPins: 300,
                maxMarkers: 100
            });

            // Place Globe
            placeholder.remove();
            container.append(this.globe.domElement);

            // Init animations
            this._animate = () => {
                if (window.mods.globe.globe) {
                    window.mods.globe.globe.tick();
                }
                if (window.mods.globe._animate) {
                    setTimeout(() => {
                        try {
                            requestAnimationFrame(window.mods.globe._animate);
                        } catch(e) {
                            // We probably got caught in a theme change. Print it out but everything should keep running fine.
                            console.warn(e);
                        }
                    }, 1000 / 30);
                }
            };
            this.globe.init(window.theme.colors.light_black, () => {
                this._animate();
                window.audioManager.scan.play();
            });

            // resize handler
            this.resizeHandler = () => {
                let canvas = document.querySelector("div#mod_globe canvas");
                window.mods.globe.globe.camera.aspect = canvas.offsetWidth / canvas.offsetHeight;
                window.mods.globe.globe.camera.updateProjectionMatrix();
                window.mods.globe.globe.renderer.setSize(canvas.offsetWidth, canvas.offsetHeight);
            };
            window.addEventListener("resize", this.resizeHandler);

            // Connections
            this.conns = [];
            this.addConn = ip => {
                let data = null;
                try {
                    data = window.mods.netstat.geoLookup.get(ip);
                } catch {
                    // do nothing
                }
                let geo = (data !== null ? data.location : {});
                if (geo.latitude && geo.longitude) {
                    const lat = Number(geo.latitude);
                    const lon = Number(geo.longitude);
                    window.mods.globe.conns.push({
                        ip,
                        pin: window.mods.globe.globe.addPin(lat, lon, "", 1.2),
                    });
                }
            };
            this.removeConn = ip => {
                let index = this.conns.findIndex(x => x.ip === ip);
                this.conns[index].pin.remove();
                this.conns.splice(index, 1);
            };

            // Add random satellites
            let constellation = [];
            for(var i = 0; i< 2; i++){
                for(var j = 0; j< 3; j++){
                    constellation.push({
                        lat: 50 * i - 30 + 15 * Math.random(),
                        lon: 120 * j - 120 + 30 * i,
                        altitude: Math.random() * (1.7 - 1.3) + 1.3
                    });
                }
            }

            this.globe.addConstellation(constellation);
        }, 2000);

        // Init updaters when intro animation is done
        setTimeout(() => {
            this.updateLoc();
            this.locUpdater = setInterval(() => {
                this.updateLoc();
            }, 1000);

            this.updateConns();
            this.connsUpdater = setInterval(() => {
                this.updateConns();
            }, 3000);

            // Start mode-specific updates
            this._startModeUpdates();
        }, 4000);
    }

    _getModeLabel(mode) {
        const labels = {
            'connections': 'NETWORK MAP',
            'weather': 'WEATHER',
            'iss': 'ISS TRACKER',
            'location': 'LOCATION INFO'
        };
        return labels[mode] || 'WORLD VIEW';
    }

    setMode(mode) {
        if (this.mode === mode) return;
        
        this.mode = mode;
        window.settings.globeMode = mode;
        
        // Save setting
        try {
            const fs = require("fs");
            const settingsFile = require("path").join(require("@electron/remote").app.getPath("userData"), "settings.json");
            let settings = JSON.parse(fs.readFileSync(settingsFile, "utf-8"));
            settings.globeMode = mode;
            fs.writeFileSync(settingsFile, JSON.stringify(settings, "", 4));
        } catch(e) {
            console.warn("Could not save globe mode:", e);
        }

        // Update UI
        document.querySelectorAll('.globe_mode_btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        // Update mode label
        document.getElementById('mod_globe_mode_label').textContent = this._getModeLabel(mode);

        // Clear and restart mode-specific updates
        this._stopModeUpdates();
        this._startModeUpdates();
        this._updateInfoPanel();

        window.audioManager.folder.play();
    }

    _startModeUpdates() {
        if (this.mode === 'weather') {
            this._fetchWeather();
            this.weatherUpdateInterval = setInterval(() => this._fetchWeather(), 600000); // Every 10 minutes
        } else if (this.mode === 'iss') {
            this._fetchISS();
            this.issUpdateInterval = setInterval(() => this._fetchISS(), 5000); // Every 5 seconds
        }
    }

    _stopModeUpdates() {
        if (this.weatherUpdateInterval) {
            clearInterval(this.weatherUpdateInterval);
            this.weatherUpdateInterval = null;
        }
        if (this.issUpdateInterval) {
            clearInterval(this.issUpdateInterval);
            this.issUpdateInterval = null;
        }
        if (this.issSatellite) {
            try { this.issSatellite.remove(); } catch(e) {}
            this.issSatellite = null;
        }
    }

    _fetchWeather() {
        if (window.mods.netstat.offline || !window.mods.netstat.ipinfo) return;
        
        const geo = window.mods.netstat.ipinfo.geo;
        if (!geo || !geo.latitude || !geo.longitude) return;

        const url = `https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&hourly=temperature_2m&forecast_days=1&timezone=auto`;
        
        this.https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    this.weatherData = JSON.parse(data);
                    this._updateInfoPanel();
                } catch(e) {
                    console.warn("Weather parse error:", e);
                }
            });
        }).on('error', (e) => {
            console.warn("Weather fetch error:", e);
        });
    }

    _fetchISS() {
        this.https.get('https://api.wheretheiss.at/v1/satellites/25544', (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    this.issData = JSON.parse(data);
                    this._updateISSPosition();
                    this._updateInfoPanel();
                } catch(e) {
                    console.warn("ISS parse error:", e);
                }
            });
        }).on('error', (e) => {
            console.warn("ISS fetch error:", e);
        });
    }

    _updateISSPosition() {
        if (!this.issData || !this.globe) return;

        const lat = this.issData.latitude;
        const lon = this.issData.longitude;
        const altitude = 1.5;

        if (this.issSatellite) {
            try { this.issSatellite.remove(); } catch(e) {}
        }

        this.issSatellite = this.globe.addMarker(lat, lon, 'ISS', false, altitude);
    }

    _getWeatherDescription(code) {
        const descriptions = {
            0: 'Clear sky',
            1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
            45: 'Foggy', 48: 'Rime fog',
            51: 'Light drizzle', 53: 'Drizzle', 55: 'Dense drizzle',
            61: 'Slight rain', 63: 'Rain', 65: 'Heavy rain',
            71: 'Slight snow', 73: 'Snow', 75: 'Heavy snow',
            77: 'Snow grains',
            80: 'Slight showers', 81: 'Showers', 82: 'Violent showers',
            85: 'Slight snow showers', 86: 'Heavy snow showers',
            95: 'Thunderstorm', 96: 'Thunderstorm + hail', 99: 'Thunderstorm + heavy hail'
        };
        return descriptions[code] || 'Unknown';
    }

    _updateInfoPanel() {
        const panel = document.getElementById('mod_globe_info_panel');
        if (!panel) return;

        let html = '';

        if (this.mode === 'connections') {
            const connCount = this.conns.length;
            const countryCount = this.connectionStats.countries.size;
            html = `<div class="globe_info_item">
                <span class="globe_info_label">CONNECTIONS</span>
                <span class="globe_info_value">${connCount}</span>
            </div>
            <div class="globe_info_item">
                <span class="globe_info_label">COUNTRIES</span>
                <span class="globe_info_value">${countryCount}</span>
            </div>`;
        } else if (this.mode === 'weather' && this.weatherData && this.weatherData.current) {
            const current = this.weatherData.current;
            const temp = current.temperature_2m;
            const humidity = current.relative_humidity_2m;
            const wind = current.wind_speed_10m;
            const weatherCode = current.weather_code;
            const description = this._getWeatherDescription(weatherCode);
            
            html = `<div class="globe_info_item">
                <span class="globe_info_label">TEMP</span>
                <span class="globe_info_value">${temp}C</span>
            </div>
            <div class="globe_info_item">
                <span class="globe_info_label">HUMIDITY</span>
                <span class="globe_info_value">${humidity}%</span>
            </div>
            <div class="globe_info_item">
                <span class="globe_info_label">WIND</span>
                <span class="globe_info_value">${wind} km/h</span>
            </div>
            <div class="globe_info_item full">
                <span class="globe_info_label">CONDITIONS</span>
                <span class="globe_info_value">${description.toUpperCase()}</span>
            </div>`;
        } else if (this.mode === 'iss' && this.issData) {
            const lat = this.issData.latitude.toFixed(4);
            const lon = this.issData.longitude.toFixed(4);
            const alt = this.issData.altitude.toFixed(1);
            const vel = this.issData.velocity.toFixed(0);
            
            html = `<div class="globe_info_item">
                <span class="globe_info_label">LAT</span>
                <span class="globe_info_value">${lat}</span>
            </div>
            <div class="globe_info_item">
                <span class="globe_info_label">LON</span>
                <span class="globe_info_value">${lon}</span>
            </div>
            <div class="globe_info_item">
                <span class="globe_info_label">ALT</span>
                <span class="globe_info_value">${alt} km</span>
            </div>
            <div class="globe_info_item">
                <span class="globe_info_label">VELOCITY</span>
                <span class="globe_info_value">${vel} km/h</span>
            </div>`;
        } else if (this.mode === 'location') {
            if (window.mods.netstat.ipinfo) {
                const ip = window.mods.netstat.ipinfo.ip || 'Unknown';
                const geo = window.mods.netstat.ipinfo.geo || {};
                const lat = geo.latitude ? geo.latitude.toFixed(4) : '--';
                const lon = geo.longitude ? geo.longitude.toFixed(4) : '--';
                const tz = geo.time_zone || 'Unknown';
                
                let city = 'Unknown';
                let country = 'Unknown';
                try {
                    const geoData = window.mods.netstat.geoLookup.get(ip);
                    if (geoData) {
                        city = geoData.city?.names?.en || 'Unknown';
                        country = geoData.country?.names?.en || 'Unknown';
                    }
                } catch(e) {}
                
                html = `<div class="globe_info_item">
                    <span class="globe_info_label">PUBLIC IP</span>
                    <span class="globe_info_value">${ip}</span>
                </div>
                <div class="globe_info_item">
                    <span class="globe_info_label">CITY</span>
                    <span class="globe_info_value">${city.toUpperCase()}</span>
                </div>
                <div class="globe_info_item">
                    <span class="globe_info_label">COUNTRY</span>
                    <span class="globe_info_value">${country.toUpperCase()}</span>
                </div>
                <div class="globe_info_item">
                    <span class="globe_info_label">TIMEZONE</span>
                    <span class="globe_info_value">${tz}</span>
                </div>`;
            } else {
                html = `<div class="globe_info_item full">
                    <span class="globe_info_value">LOCATION DATA UNAVAILABLE</span>
                </div>`;
            }
        }

        panel.innerHTML = html;
    }

    addRandomConnectedMarkers() {
        const randomLat = this.getRandomInRange(40, 90, 3);
        const randomLong = this.getRandomInRange(-180, 0, 3);
        this.globe.addMarker(randomLat, randomLong, '');
        this.globe.addMarker(randomLat - 20, randomLong + 150, '', true);
    }
    addTemporaryConnectedMarker(ip) {
        let data = window.mods.netstat.geoLookup.get(ip);
        let geo = (data !== null ? data.location : {});
        if (geo.latitude && geo.longitude) {
            const lat = Number(geo.latitude);
            const lon = Number(geo.longitude);

            window.mods.globe.conns.push({
                ip,
                pin: window.mods.globe.globe.addPin(lat, lon, "", 1.2)
            });
            let mark = window.mods.globe.globe.addMarker(lat, lon, '', true);
            setTimeout(() => {
                mark.remove();
            }, 3000);
        }
    }
    removeMarkers() {
        this.globe.markers.forEach(marker => { marker.remove(); });
        this.globe.markers = [];
    }
    removePins() {
        this.globe.pins.forEach(pin => {
            pin.remove();
        });
        this.globe.pins = [];
    }
    getRandomInRange(from, to, fixed) {
        return (Math.random() * (to - from) + from).toFixed(fixed) * 1;
    }
    updateLoc() {
        if (window.mods.netstat.offline) {
            document.querySelector("div#mod_globe").setAttribute("class", "offline");
            document.querySelector("i.mod_globe_headerInfo").innerText = "(OFFLINE)";

            this.removePins();
            this.removeMarkers();
            this.conns = [];
            this.connectionStats = { total: 0, countries: new Set() };
            this.lastgeo = {
                latitude: 0,
                longitude: 0
            };
        } else {
            this.updateConOnlineConnection().then(() => {
                document.querySelector("div#mod_globe").setAttribute("class", "");
            }).catch(() => {
                document.querySelector("i.mod_globe_headerInfo").innerText = "UNKNOWN";
            })
        }
    }
    async updateConOnlineConnection() {
        let newgeo = window.mods.netstat.ipinfo.geo;
        newgeo.latitude = Math.round(newgeo.latitude*10000)/10000;
        newgeo.longitude = Math.round(newgeo.longitude*10000)/10000;

        if (newgeo.latitude !== this.lastgeo.latitude || newgeo.longitude !== this.lastgeo.longitude) {

            document.querySelector("i.mod_globe_headerInfo").innerText = `${newgeo.latitude}, ${newgeo.longitude}`;
            this.removePins();
            this.removeMarkers();
            this.conns = [];
            this.connectionStats = { total: 0, countries: new Set() };

            this._locPin = this.globe.addPin(newgeo.latitude, newgeo.longitude, "", 1.2);
            this._locMarker = this.globe.addMarker(newgeo.latitude, newgeo.longitude, "", false, 1.2);
        }

        this.lastgeo = newgeo;
        document.querySelector("div#mod_globe").setAttribute("class", "");
    }
    updateConns() {
        if (!window.mods.globe.globe || window.mods.netstat.offline) return false;
        window.si.networkConnections().then(conns => {
            let newconns = [];
            conns.forEach(conn => {
                let ip = conn.peeraddress;
                let state = conn.state;
                if (state === "ESTABLISHED" && ip !== "0.0.0.0" && ip !== "127.0.0.1" && ip !== "::") {
                    newconns.push(ip);
                }
            });

            this.conns.forEach(conn => {
                if (newconns.indexOf(conn.ip) !== -1) {
                    newconns.splice(newconns.indexOf(conn.ip), 1);
                } else {
                    this.removeConn(conn.ip);
                }
            });

            newconns.forEach(ip => {
                this.addConn(ip);
            });
        });
    }
}

module.exports = {
    LocationGlobe
};
