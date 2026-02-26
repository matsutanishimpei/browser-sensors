// Main application logic

const sensors = [
  {
    id: 'geolocation',
    title: '位置情報 (Geolocation)',
    description: 'GPSによる緯度、経度、および精度の取得。',
    state: { watchId: null },
    isSupported: () => 'geolocation' in navigator,
    start(update) {
      update('権限をリクエスト中...');
      this.state.watchId = navigator.geolocation.watchPosition(
        (pos) => update(`緯度: ${pos.coords.latitude.toFixed(6)}\n経度: ${pos.coords.longitude.toFixed(6)}\n精度: ${pos.coords.accuracy}m`),
        (err) => update(`エラー: ${err.message}`),
        { enableHighAccuracy: true, maximumAge: 0 }
      );
    },
    stop(update) {
      if (this.state.watchId !== null) {
        navigator.geolocation.clearWatch(this.state.watchId);
        this.state.watchId = null;
      }
      update('停止しました');
    }
  },
  {
    id: 'orientation',
    title: 'デバイスの傾き (ジャイロセンサー)',
    description: 'ジャイロスコープによる回転（Alpha, Beta, Gamma）。',
    state: { handler: null },
    isSupported: () => window.DeviceOrientationEvent !== undefined,
    start(update) {
      this.state.handler = (e) => {
        if (e.alpha !== null) {
          update(`Alpha (Z軸): ${e.alpha.toFixed(2)}\nBeta (X軸): ${e.beta.toFixed(2)}\nGamma (Y軸): ${e.gamma.toFixed(2)}`);
        } else {
          update('データ待機中 (実際のデバイスが必要です)');
        }
      };
      // For iOS 13+ support, we may need DeviceOrientationEvent.requestPermission()
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
          .then(permissionState => {
            if (permissionState === 'granted') {
              window.addEventListener('deviceorientation', this.state.handler);
            } else {
              update('権限が拒否されました');
            }
          })
          .catch(() => update('権限リクエストに失敗しました'));
      } else {
        window.addEventListener('deviceorientation', this.state.handler);
      }
      update('リスニング中...');
    },
    stop(update) {
      if (this.state.handler) window.removeEventListener('deviceorientation', this.state.handler);
      update('停止しました');
    }
  },
  {
    id: 'motion',
    title: 'デバイスの動き (加速度センサー)',
    description: '加速度センサーによるX, Y, Z軸の力。',
    state: { handler: null },
    isSupported: () => window.DeviceMotionEvent !== undefined,
    start(update) {
      this.state.handler = (e) => {
        let text = '';
        if (e.accelerationIncludingGravity && e.accelerationIncludingGravity.x !== null) {
          let a = e.accelerationIncludingGravity;
          text += `加速度 X: ${a.x.toFixed(2)}\n加速度 Y: ${a.y.toFixed(2)}\n加速度 Z: ${a.z.toFixed(2)}`;
        } else {
          text = 'データ待機中 (実際のデバイスが必要です)';
        }
        update(text);
      };

      if (typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission()
          .then(permissionState => {
            if (permissionState === 'granted') {
              window.addEventListener('devicemotion', this.state.handler);
            } else {
              update('権限が拒否されました');
            }
          })
          .catch(() => update('権限リクエストに失敗しました'));
      } else {
        window.addEventListener('devicemotion', this.state.handler);
      }
      update('リスニング中...');
    },
    stop(update) {
      if (this.state.handler) window.removeEventListener('devicemotion', this.state.handler);
      update('停止しました');
    }
  },
  {
    id: 'camera',
    title: 'カメラ (映像)',
    description: 'フロントまたはバックカメラからの映像プレビュー。',
    state: { stream: null, videoEl: null },
    isSupported: () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    async start(update, context) {
      try {
        update('カメラをリクエスト中...');
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        this.state.stream = stream;

        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;
        this.state.videoEl = video;

        context.mediaContainer.style.display = 'block';
        context.mediaContainer.appendChild(video);
        update('カメラ起動中');
      } catch (err) {
        update(`エラー: ${err.message}`);
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
      update('停止しました');
    }
  },
  {
    id: 'microphone',
    title: 'マイク (音声)',
    description: '音声の入力レベルと簡易波形の取得。',
    state: { stream: null, audioContext: null, analyser: null, interval: null },
    isSupported: () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    async start(update) {
      try {
        update('マイクをリクエスト中...');
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
          update(`入力レベル: ${avg} \n音量グラフ:\n${'█'.repeat(Math.min(20, Math.floor(avg / 5)))}`);
        }, 100);
      } catch (err) {
        update(`エラー: ${err.message}`);
      }
    },
    stop(update) {
      if (this.state.interval) clearInterval(this.state.interval);
      if (this.state.audioContext) this.state.audioContext.close();
      if (this.state.stream) this.state.stream.getTracks().forEach(t => t.stop());
      update('停止しました');
    }
  },
  {
    id: 'battery',
    title: 'バッテリー情報',
    description: '現在のバッテリー残量と充電状態。',
    state: { manager: null, handler: null },
    isSupported: () => 'getBattery' in navigator,
    async start(update) {
      try {
        const battery = await navigator.getBattery();
        this.state.manager = battery;

        const updateBattery = () => {
          update(`残量: ${(battery.level * 100).toFixed(0)}% | 充電中: ${battery.charging ? 'はい' : 'いいえ'}\n残り時間: ${battery.dischargingTime === Infinity ? '不明' : battery.dischargingTime + '秒'}`);
        };
        this.state.handler = updateBattery;

        battery.addEventListener('levelchange', updateBattery);
        battery.addEventListener('chargingchange', updateBattery);
        updateBattery();
      } catch (err) {
        update(`エラー: ${err.message}`);
      }
    },
    stop(update) {
      if (this.state.manager && this.state.handler) {
        this.state.manager.removeEventListener('levelchange', this.state.handler);
        this.state.manager.removeEventListener('chargingchange', this.state.handler);
      }
      update('停止しました');
    }
  },
  {
    id: 'network',
    title: 'ネットワーク情報',
    description: '現在の接続タイプと通信状況。',
    state: { handler: null },
    isSupported: () => !!(navigator.connection || navigator.mozConnection || navigator.webkitConnection),
    start(update) {
      const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

      this.state.handler = () => {
        update(`回線種別: ${conn.effectiveType || '不明'}\n下り速度: ${conn.downlink || '不明'} Mbps\n応答速度(RTT): ${conn.rtt || '不明'} ms\nデータセーバー: ${conn.saveData ? 'オン' : 'オフ'}`);
      };

      conn.addEventListener('change', this.state.handler);
      this.state.handler();
    },
    stop(update) {
      const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (conn && this.state.handler) conn.removeEventListener('change', this.state.handler);
      update('停止しました');
    }
  },
  {
    id: 'pointer',
    title: 'ポインター＆タッチ',
    description: '画面のタップやマウスの座標、筆圧などの追跡。',
    state: { handler: null },
    isSupported: () => window.PointerEvent !== undefined,
    start(update) {
      this.state.handler = (e) => {
        update(`X座標: ${e.clientX} px\nY座標: ${e.clientY} px\n筆圧: ${e.pressure || 0}\n種類: ${e.pointerType}`);
      };
      window.addEventListener('pointermove', this.state.handler);
      update('画面上で指やマウスを動かしてください...');
    },
    stop(update) {
      if (this.state.handler) window.removeEventListener('pointermove', this.state.handler);
      update('停止しました');
    }
  },
  {
    id: 'vibration',
    title: 'バイブレーション',
    description: 'デバイスの振動を作動（スマートフォン等のみ）。',
    state: { interval: null },
    isSupported: () => 'vibrate' in navigator,
    start(update) {
      update('振動パターン再生中 (200ms ON, 100ms OFF)...');
      navigator.vibrate([200, 100, 200, 100, 200]);

      this.state.interval = setInterval(() => {
        navigator.vibrate([200]);
      }, 1000);
    },
    stop(update) {
      if (this.state.interval) clearInterval(this.state.interval);
      navigator.vibrate(0);
      update('停止しました');
    }
  }
];

function init() {
  const container = document.getElementById('sensor-container');
  let hasUnsupported = false;

  sensors.forEach(sensor => {
    const supported = sensor.isSupported();
    if (!supported) hasUnsupported = true;

    const card = document.createElement('div');
    card.className = `card ${supported ? '' : 'unsupported'}`;
    card.id = `card-${sensor.id}`;

    if (!supported) {
      card.style.opacity = '0.5';
      card.style.borderColor = 'rgba(255, 51, 102, 0.4)';
    }

    // Header
    const header = document.createElement('div');
    header.className = 'card-header';
    header.innerHTML = `
      <div>
        <div class="card-title">${sensor.title}</div>
        <div class="card-desc">${sensor.description}</div>
      </div>
      <div class="status-badge" id="status-${sensor.id}" style="${!supported ? 'color:#ff3366; background: rgba(255,51,102,0.1);' : ''}">
        ${supported ? '待機中' : '非対応 (NOT SUPPORTED)'}
      </div>
    `;

    // Content mapping
    const content = document.createElement('div');
    content.className = 'card-content';
    const pre = document.createElement('pre');
    pre.id = `content-${sensor.id}`;
    pre.innerText = supported ? '準備完了' : 'このブラウザではサポートされていないか、\nHTTPS接続が必要です。';
    if (!supported) pre.style.color = '#ff99aa';

    content.appendChild(pre);

    // Additional media container (for video)
    const mediaContainer = document.createElement('div');
    mediaContainer.className = 'media-container';
    mediaContainer.id = `media-${sensor.id}`;
    content.appendChild(mediaContainer);

    // Button
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.innerText = '開始 (Start)';
    if (!supported) {
      btn.disabled = true;
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';
    }

    let isRunning = false;

    const updateUi = (text) => {
      pre.innerText = text;
    };

    btn.addEventListener('click', () => {
      if (!supported) return;

      if (isRunning) {
        // STOP
        sensor.stop(updateUi, { mediaContainer });
        card.classList.remove('active');
        document.getElementById(`status-${sensor.id}`).innerText = '待機中';
        btn.innerText = '開始 (Start)';
        isRunning = false;
      } else {
        // START
        sensor.start(updateUi, { mediaContainer });
        card.classList.add('active');
        document.getElementById(`status-${sensor.id}`).innerText = '動作中';
        btn.innerText = '停止 (Stop)';
        isRunning = true;
      }
    });

    card.appendChild(header);
    card.appendChild(content);
    card.appendChild(btn);
    container.appendChild(card);
  });

  if (hasUnsupported) {
    document.getElementById('compatibility-alert').style.display = 'block';
  }
}

document.addEventListener('DOMContentLoaded', init);
