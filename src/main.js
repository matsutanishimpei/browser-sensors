// Main application logic

const sensors = [
  // --- 既存のセンサー類 ---
  {
    id: 'geolocation',
    title: '位置情報 (Geolocation)',
    description: 'GPSによる緯度、経度、および精度の取得。',
    state: { watchId: null },
    isSupported: () => 'geolocation' in navigator,
    start(update) {
      update('権限をリクエスト中...');
      this.state.watchId = navigator.geolocation.watchPosition(
        (pos) => update(`緯度: ${pos.coords.latitude.toFixed(6)}\n経度: ${pos.coords.longitude.toFixed(6)}\n精度: ${pos.coords.accuracy}m\n高度: ${pos.coords.altitude || '不明'}m\n方角: ${pos.coords.heading || '不明'}度\n速度: ${pos.coords.speed || '不明'}m/s`),
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
          update(`Alpha (Z軸/方位): ${e.alpha.toFixed(2)}\nBeta (X軸/前後): ${e.beta.toFixed(2)}\nGamma (Y軸/左右): ${e.gamma.toFixed(2)}`);
        } else {
          update('データ待機中 (実際のデバイスが必要です)');
        }
      };
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
          let aNoG = e.acceleration || { x: 0, y: 0, z: 0 };
          let rot = e.rotationRate || { alpha: 0, beta: 0, gamma: 0 };

          text += `[重力含む加速度]\nX: ${a.x.toFixed(2)} | Y: ${a.y.toFixed(2)} | Z: ${a.z.toFixed(2)}\n`;
          text += `[純粋な加速度]\nX: ${aNoG.x?.toFixed(2) || 0} | Y: ${aNoG.y?.toFixed(2) || 0} | Z: ${aNoG.z?.toFixed(2) || 0}\n`;
          text += `[回転速度]\nA: ${rot.alpha?.toFixed(2) || 0} | B: ${rot.beta?.toFixed(2) || 0} | G: ${rot.gamma?.toFixed(2) || 0}`;
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
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }, // 背面カメラを優先
          audio: false
        });
        this.state.stream = stream;

        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;
        this.state.videoEl = video;

        context.mediaContainer.style.display = 'block';
        context.mediaContainer.appendChild(video);

        const track = stream.getVideoTracks()[0];
        const settings = track.getSettings();
        update(`カメラ起動中\n解像度: ${settings.width}x${settings.height}\nフレームレート: ${settings.frameRate}fps`);
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
        }, 50);
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
          update(`残量: ${(battery.level * 100).toFixed(0)}%\n充電中: ${battery.charging ? 'はい (⚡)' : 'いいえ'}\n充電完了まで: ${battery.chargingTime === Infinity ? '不明/満充電' : battery.chargingTime + '秒'}\n放電完了まで: ${battery.dischargingTime === Infinity ? '不明/充電中' : battery.dischargingTime + '秒'}`);
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
        update(`回線種別: ${conn.effectiveType || '不明'}\n推定下り速度: ${conn.downlink || '不明'} Mbps\n応答速度(RTT): ${conn.rtt || '不明'} ms\nデータセーバー: ${conn.saveData ? 'オン' : 'オフ'}`);
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
        update(`タップ/マウスポインタ追跡中\nX座標: ${e.clientX} px\nY座標: ${e.clientY} px\n筆圧 (Pressure): ${e.pressure || 0}\nポインタ種類: ${e.pointerType}`);
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
  },

  // --- 追加した機能 (Hardware & Screen APIなど) ---
  {
    id: 'hardware',
    title: 'ハードウェア情報 (デバイス情報)',
    description: 'CPUコア数、推定メモリ容量、ブラウザ情報。',
    state: { interval: null },
    isSupported: () => true, // これは大体どこでもサポートされている
    start(update) {
      const cores = navigator.hardwareConcurrency || '取得不可';
      const memory = navigator.deviceMemory || '取得不可 (iOS等では非対応)';
      const platform = navigator.platform || '不明';
      const userAgent = navigator.userAgent;
      const language = navigator.language;
      const t = `CPU論理コア数: ${cores}\n推定RAM: 約 ${memory} GB\nプラットフォーム: ${platform}\n言語: ${language}\nUA: ${userAgent}`;
      update(t);
    },
    stop(update) {
      update('停止しました');
    }
  },
  {
    id: 'screen',
    title: '画面・ウィンドウ情報',
    description: '解像度、色深度、デバイスピクセル比など。',
    state: { handler: null },
    isSupported: () => window.screen !== undefined,
    start(update) {
      this.state.handler = () => {
        update(`画面解像度: ${window.screen.width} x ${window.screen.height}\n表示可能領域: ${window.screen.availWidth} x ${window.screen.availHeight}\n現在のウィンドウ: ${window.innerWidth} x ${window.innerHeight}\nピクセル比 (DPR): ${window.devicePixelRatio}\n色深度: ${window.screen.colorDepth} bit`);
      };
      window.addEventListener('resize', this.state.handler);
      this.state.handler();
    },
    stop(update) {
      if (this.state.handler) window.removeEventListener('resize', this.state.handler);
      update('停止しました');
    }
  },
  {
    id: 'wakelock',
    title: 'スリープ防止 (Screen Wake Lock)',
    description: '画面が自動で暗くなる(スリープする)のを防ぎます。',
    state: { lock: null },
    isSupported: () => 'wakeLock' in navigator,
    async start(update) {
      try {
        this.state.lock = await navigator.wakeLock.request('screen');
        update('有効：画面が自動でスリープしなくなりました。\n※タブを切り替えると自動で無効になります。');

        this.state.lock.addEventListener('release', () => {
          update('解除：スリープ防止が無効になりました。');
        });
      } catch (err) {
        update(`エラー (バッテリー低下などの理由): ${err.message}`);
      }
    },
    stop(update) {
      if (this.state.lock !== null) {
        this.state.lock.release();
        this.state.lock = null;
      }
      update('停止しました');
    }
  },
  {
    id: 'speech',
    title: '音声認識 (Speech Recognition)',
    description: 'マイクから喋った言葉をテキストに変換します。',
    state: { recognition: null, text: '' },
    isSupported: () => 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window,
    start(update) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.state.recognition = new SpeechRecognition();
      this.state.recognition.lang = 'ja-JP';
      this.state.recognition.continuous = true; // 連続認識
      this.state.recognition.interimResults = true; // 途中経過も取得

      this.state.text = '';
      update('「何か喋ってみてください...」');

      this.state.recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        if (finalTranscript) {
          this.state.text += finalTranscript + '\n';
        }

        update(`確定テキスト:\n${this.state.text}\n\n認識中:\n${interimTranscript}`);
      };

      this.state.recognition.onerror = (event) => {
        update(`エラー: ${event.error}`);
      };

      this.state.recognition.start();
    },
    stop(update) {
      if (this.state.recognition) {
        this.state.recognition.stop();
        this.state.recognition = null;
      }
      update('停止しました');
    }
  },
  {
    id: 'screenshare',
    title: '画面共有 (Screen Capture)',
    description: '自分のPC/スマホの画面をキャプチャします。',
    state: { stream: null, videoEl: null },
    isSupported: () => !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia),
    async start(update, context) {
      try {
        update('キャプチャする画面をリクエスト中...');
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        this.state.stream = stream;

        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;
        this.state.videoEl = video;

        context.mediaContainer.style.display = 'block';
        context.mediaContainer.appendChild(video);

        const track = stream.getVideoTracks()[0];
        update(`画面共有中\n共有元: ${track.label}`);

        track.onended = () => {
          this.stop(update, context);
        };
      } catch (err) {
        update(`エラー: キャンセルされたか非対応です。\n(${err.message})`);
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
    if (!supported) pre.style.color = '#ff99aa'; // text color error

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

  // Help Modal Logic
  const btnHelp = document.getElementById('btn-help');
  const btnCloseHelp = document.getElementById('btn-close-help');
  const helpModal = document.getElementById('help-modal');

  if (btnHelp && btnCloseHelp && helpModal) {
    btnHelp.addEventListener('click', () => {
      helpModal.style.display = 'flex';
    });

    btnCloseHelp.addEventListener('click', () => {
      helpModal.style.display = 'none';
    });

    // Close on outside click
    helpModal.addEventListener('click', (e) => {
      if (e.target === helpModal) {
        helpModal.style.display = 'none';
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
