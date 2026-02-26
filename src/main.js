import './style.css'

const sensors = [
  {
    id: 'geolocation',
    title: 'Geolocation',
    description: 'GPS latitude, longitude, and accuracy.',
    state: { watchId: null },
    start(update) {
      if (!('geolocation' in navigator)) return update('Not Supported');
      update('Requesting permission...');
      this.state.watchId = navigator.geolocation.watchPosition(
        (pos) => update(`Lat: ${pos.coords.latitude.toFixed(6)}\nLon: ${pos.coords.longitude.toFixed(6)}\nAcc: ${pos.coords.accuracy}m`),
        (err) => update(`Error: ${err.message}`),
        { enableHighAccuracy: true, maximumAge: 0 }
      );
    },
    stop(update) {
      if (this.state.watchId !== null) {
        navigator.geolocation.clearWatch(this.state.watchId);
        this.state.watchId = null;
      }
      update('Stopped');
    }
  },
  {
    id: 'orientation',
    title: 'Device Orientation',
    description: 'Gyroscope rotation: Alpha, Beta, Gamma.',
    state: { handler: null },
    start(update) {
      if (!window.DeviceOrientationEvent) return update('Not Supported');
      
      this.state.handler = (e) => {
        if (e.alpha !== null) {
          update(`Alpha: ${e.alpha.toFixed(2)}\nBeta: ${e.beta.toFixed(2)}\nGamma: ${e.gamma.toFixed(2)}`);
        } else {
          update('Awaiting data (requires physical device)');
        }
      };
      // For iOS 13+ support, we may need DeviceOrientationEvent.requestPermission()
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
          .then(permissionState => {
            if (permissionState === 'granted') {
              window.addEventListener('deviceorientation', this.state.handler);
            } else {
              update('Permission Denied');
            }
          })
          .catch(() => update('Permission Request Failed'));
      } else {
        window.addEventListener('deviceorientation', this.state.handler);
      }
      update('Listening...');
    },
    stop(update) {
      if (this.state.handler) window.removeEventListener('deviceorientation', this.state.handler);
      update('Stopped');
    }
  },
  {
    id: 'motion',
    title: 'Device Motion',
    description: 'Accelerometer: X, Y, Z forces and rotation rate.',
    state: { handler: null },
    start(update) {
      if (!window.DeviceMotionEvent) return update('Not Supported');
      this.state.handler = (e) => {
        let text = '';
        if (e.accelerationIncludingGravity && e.accelerationIncludingGravity.x !== null) {
          let a = e.accelerationIncludingGravity;
          text += `Accel X: ${a.x.toFixed(2)}\nAccel Y: ${a.y.toFixed(2)}\nAccel Z: ${a.z.toFixed(2)}`;
        } else {
          text = 'Awaiting data (requires physical device)';
        }
        update(text);
      };
      
      if (typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission()
          .then(permissionState => {
            if (permissionState === 'granted') {
              window.addEventListener('devicemotion', this.state.handler);
            } else {
              update('Permission Denied');
            }
          })
          .catch(() => update('Permission Request Failed'));
      } else {
        window.addEventListener('devicemotion', this.state.handler);
      }
      update('Listening...');
    },
    stop(update) {
      if (this.state.handler) window.removeEventListener('devicemotion', this.state.handler);
      update('Stopped');
    }
  },
  {
    id: 'camera',
    title: 'Camera (Video)',
    description: 'Live video feed from the front/back camera.',
    state: { stream: null, videoEl: null },
    async start(update, context) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return update('Not Supported');
      try {
        update('Requesting camera...');
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        this.state.stream = stream;
        
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;
        this.state.videoEl = video;
        
        context.mediaContainer.style.display = 'block';
        context.mediaContainer.appendChild(video);
        update('Camera active');
      } catch (err) {
        update(`Error: ${err.message}`);
      }
    },
    stop(update, context) {
      if (this.state.stream) {
        this.state.stream.getTracks().forEach(track => track.stop());
        this.state.stream = null;
      }
      if (this.state.videoEl) {
        this.state.videoEl.remove();
        this.state.videoEl = null;
      }
      context.mediaContainer.style.display = 'none';
      update('Stopped');
    }
  },
  {
    id: 'microphone',
    title: 'Microphone (Audio)',
    description: 'Audio input levels and stream status.',
    state: { stream: null, audioContext: null, analyser: null, interval: null },
    async start(update) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return update('Not Supported');
      try {
        update('Requesting mic...');
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        this.state.stream = stream;
        
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.state.audioContext = new AudioContext();
        const source = this.state.audioContext.createMediaStreamSource(stream);
        this.state.analyser = this.state.audioContext.createAnalyser();
        this.state.analyser.fftSize = 256;
        source.connect(this.state.analyser);
        
        const dataArray = new Uint8Array(this.state.analyser.frequencyBinCount);
        
        this.state.interval = setInterval(() => {
          this.state.analyser.getByteFrequencyData(dataArray);
          const sum = dataArray.reduce((acc, val) => acc + val, 0);
          const avg = (sum / dataArray.length).toFixed(2);
          update(`Input Level: ${avg} \nVolume Graph:\n${'█'.repeat(Math.min(20, Math.floor(avg / 5)))}`);
        }, 100);
      } catch (err) {
        update(`Error: ${err.message}`);
      }
    },
    stop(update) {
      if (this.state.interval) clearInterval(this.state.interval);
      if (this.state.audioContext) this.state.audioContext.close();
      if (this.state.stream) this.state.stream.getTracks().forEach(t => t.stop());
      update('Stopped');
    }
  },
  {
    id: 'battery',
    title: 'Battery API',
    description: 'Current battery level and power source.',
    state: { manager: null, handler: null },
    async start(update) {
      if (!('getBattery' in navigator)) return update('Not Supported');
      try {
        const battery = await navigator.getBattery();
        this.state.manager = battery;
        
        const updateBattery = () => {
          update(`${(battery.level * 100).toFixed(0)}% | Charging: ${battery.charging ? 'Yes' : 'No'}\nDischarging Time: ${battery.dischargingTime === Infinity ? 'N/A' : battery.dischargingTime + 's'}`);
        };
        this.state.handler = updateBattery;
        
        battery.addEventListener('levelchange', updateBattery);
        battery.addEventListener('chargingchange', updateBattery);
        updateBattery();
      } catch (err) {
        update(`Error: ${err.message}`);
      }
    },
    stop(update) {
      if (this.state.manager && this.state.handler) {
        this.state.manager.removeEventListener('levelchange', this.state.handler);
        this.state.manager.removeEventListener('chargingchange', this.state.handler);
      }
      update('Stopped');
    }
  },
  {
    id: 'network',
    title: 'Network Information',
    description: 'Current connection type and bandwidth.',
    state: { handler: null },
    start(update) {
      const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (!conn) return update('Not Supported');
      
      this.state.handler = () => {
        update(`Type: ${conn.effectiveType || 'unknown'}\nDownlink: ${conn.downlink || 'N/A'} Mbps\nRTT: ${conn.rtt || 'N/A'} ms\nSave Data: ${conn.saveData ? 'On' : 'Off'}`);
      };
      
      conn.addEventListener('change', this.state.handler);
      this.state.handler();
    },
    stop(update) {
      const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (conn && this.state.handler) conn.removeEventListener('change', this.state.handler);
      update('Stopped');
    }
  },
  {
    id: 'pointer',
    title: 'Pointer & Touch',
    description: 'Track screen pointer coordinates.',
    state: { handler: null },
    start(update) {
      this.state.handler = (e) => {
        update(`X: ${e.clientX} px\nY: ${e.clientY} px\nPressure: ${e.pressure || 0}\nType: ${e.pointerType}`);
      };
      window.addEventListener('pointermove', this.state.handler);
      update('Move pointer/finger across screen...');
    },
    stop(update) {
      if (this.state.handler) window.removeEventListener('pointermove', this.state.handler);
      update('Stopped');
    }
  }
];

function init() {
  const container = document.getElementById('sensor-container');
  
  sensors.forEach(sensor => {
    const card = document.createElement('div');
    card.className = 'card';
    card.id = `card-${sensor.id}`;
    
    // Header
    const header = document.createElement('div');
    header.className = 'card-header';
    header.innerHTML = `
      <div>
        <div class="card-title">${sensor.title}</div>
        <div class="card-desc">${sensor.description}</div>
      </div>
      <div class="status-badge" id="status-${sensor.id}">INACTIVE</div>
    `;
    
    // Content mapping
    const content = document.createElement('div');
    content.className = 'card-content';
    const pre = document.createElement('pre');
    pre.id = `content-${sensor.id}`;
    pre.innerText = 'Ready to launch';
    content.appendChild(pre);
    
    // Additional media container (for video)
    const mediaContainer = document.createElement('div');
    mediaContainer.className = 'media-container';
    mediaContainer.id = `media-${sensor.id}`;
    content.appendChild(mediaContainer);
    
    // Button
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.innerText = 'Start';
    
    let isRunning = false;
    
    const updateUi = (text) => {
      pre.innerText = text;
    };
    
    btn.addEventListener('click', () => {
      if (isRunning) {
        // STOP
        sensor.stop(updateUi, { mediaContainer });
        card.classList.remove('active');
        document.getElementById(`status-${sensor.id}`).innerText = 'INACTIVE';
        btn.innerText = 'Start';
        isRunning = false;
      } else {
        // START
        sensor.start(updateUi, { mediaContainer });
        card.classList.add('active');
        document.getElementById(`status-${sensor.id}`).innerText = 'ACTIVE';
        btn.innerText = 'Stop';
        isRunning = true;
      }
    });
    
    card.appendChild(header);
    card.appendChild(content);
    card.appendChild(btn);
    container.appendChild(card);
  });
}

document.addEventListener('DOMContentLoaded', init);
