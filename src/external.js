// External Hardware API logic

const sensors = [
    {
        id: 'bluetooth',
        title: 'Web Bluetooth',
        description: '近くのBluetoothデバイス（BLE）をスキャンして接続します。',
        state: { device: null },
        isSupported: () => navigator.bluetooth !== undefined,
        async start(update) {
            if (this.state.device) {
                return update('すでにデバイスと接続済みか、接続プロセス中です。');
            }

            try {
                update('周辺のBluetoothデバイスを検索中...' + '\n' + '（ポップアップからデバイスを選択してください）');

                // 通常は特定のサービスUUIDを指定しますが、テスト用に広く受け付けるフィルタを使うか
                // ユーザーにすべて見せるためのフィルタを設定します（一部ブラウザはすべて表示を禁止しています）
                const device = await navigator.bluetooth.requestDevice({
                    acceptAllDevices: true,
                    optionalServices: ['battery_service', 'heart_rate'] // よくあるサービス
                });

                this.state.device = device;
                update(`デバイスが選択されました:\n名前: ${device.name || '不明なデバイス'}\nID: ${device.id}\n接続状態: ${device.gatt ? (device.gatt.connected ? '接続済' : '未接続 (準備OK)') : 'GATT非対応'}`);

                // 切断イベントのリスニング
                device.addEventListener('gattserverdisconnected', () => {
                    update(`${device.name || 'デバイス'} との接続が切断されました。`);
                    this.state.device = null;
                    document.getElementById(`status-${this.id}`).innerText = '待機中';
                    document.querySelector(`#card-${this.id}`).classList.remove('active');
                    document.querySelector(`#card-${this.id} .btn`).innerText = '開始 (Start)';
                });

            } catch (err) {
                update(`エラー/キャンセル: ${err.message}`);
            }
        },
        stop(update) {
            if (this.state.device && this.state.device.gatt && this.state.device.gatt.connected) {
                this.state.device.gatt.disconnect();
            }
            this.state.device = null;
            update('停止（切断）しました。');
        }
    },
    {
        id: 'usb',
        title: 'WebUSB',
        description: 'USBポートに接続された機器と直接シリアル通信します。',
        state: { device: null },
        isSupported: () => navigator.usb !== undefined,
        async start(update) {
            try {
                update('USBデバイスへのアクセス権限をリクエスト中...' + '\n' + '（ポップアップから機器を選択してください）');

                const device = await navigator.usb.requestDevice({ filters: [] });
                this.state.device = device;

                let text = `[デバイス情報]\n製品名: ${device.productName || '不明'}\nメーカー: ${device.manufacturerName || '不明'}\n`;
                text += `ベンダーID: ${device.vendorId}\nプロダクトID: ${device.productId}\nバージョン: ${device.deviceVersionMajor}.${device.deviceVersionMinor}.${device.deviceVersionSubminor}\n`;
                text += `クラス: ${device.deviceClass}\nプロトコル: ${device.deviceProtocol}`;

                update(text);

            } catch (err) {
                update(`エラー/キャンセル: ${err.message}`);
            }
        },
        stop(update) {
            if (this.state.device && this.state.device.opened) {
                this.state.device.close();
            }
            this.state.device = null;
            update('停止しました。');
        }
    },
    {
        id: 'serial',
        title: 'Web Serial API',
        description: 'Arduino等のマイコン・電子工作ボードとシリアル通信(COM)を行います。',
        state: { port: null, reader: null, keepReading: true },
        isSupported: () => navigator.serial !== undefined,
        async start(update) {
            try {
                update('シリアルポートへのアクセス権限をリクエスト中...\n（マイコンボード等をUSB接続してください）');

                const port = await navigator.serial.requestPort();
                this.state.port = port;

                // Typical baud rate for Arduino
                await port.open({ baudRate: 9600 });
                update('ポートを開きました (Baud Rate: 9600)\n\nデータ受信を待機中...');

                this.state.keepReading = true;
                while (port.readable && this.state.keepReading) {
                    const reader = port.readable.getReader();
                    this.state.reader = reader;
                    try {
                        while (true) {
                            const { value, done } = await reader.read();
                            if (done) break;
                            const textDecoder = new TextDecoder();
                            update(`【受信データ】\n${textDecoder.decode(value)}`);
                        }
                    } catch (error) {
                        update(`シリアル読取エラー: ${error.message}`);
                    } finally {
                        reader.releaseLock();
                    }
                }

            } catch (err) {
                if (err.name === 'NotFoundError') {
                    update('キャンセルされました。');
                } else {
                    update(`エラー: ${err.message}`);
                }
            }
        },
        async stop(update) {
            this.state.keepReading = false;
            if (this.state.reader) {
                await this.state.reader.cancel();
            }
            if (this.state.port) {
                await this.state.port.close();
            }
            this.state.port = null;
            this.state.reader = null;
            update('シリアル通信を停止（切断）しました。');
        }
    },
    {
        id: 'nfc',
        title: 'Web NFC',
        description: 'スマホ等でNFCタグ・ICカード（Suica等）をかざして読み取ります。',
        state: { ndef: null, abortController: null },
        isSupported: () => 'NDEFReader' in window,
        async start(update) {
            try {
                update('NFCタグの読み取り準備中...');
                const ndef = new NDEFReader();
                this.state.ndef = ndef;
                this.state.abortController = new AbortController();

                await ndef.scan({ signal: this.state.abortController.signal });
                update('【スキャン中】\nSuicaやNFCタグをスマホの背面に近づけてください...');

                ndef.onreading = event => {
                    let text = `【NFCタグを検出しました！】\nシリアル番号 (UID): ${event.serialNumber}\nレコード数: ${event.message.records.length}\n`;

                    event.message.records.forEach((record, index) => {
                        text += `\n[レコード ${index + 1}]\nタイプ: ${record.recordType}\nエンコーディング: ${record.encoding || '不明'}\n`;
                        if (record.recordType === 'text') {
                            const textDecoder = new TextDecoder(record.encoding);
                            text += `内容: ${textDecoder.decode(record.data)}\n`;
                        } else if (record.recordType === 'url') {
                            const textDecoder = new TextDecoder();
                            text += `URL: ${textDecoder.decode(record.data)}\n`;
                        } else {
                            text += `データサイズ: ${record.data ? record.data.byteLength : 0} bytes\n`;
                        }
                    });

                    update(text);
                };

                ndef.onreadingerror = () => {
                    update('【読取エラー】\nタグの読み取りに失敗しました。もう一度かざしてください。');
                };

            } catch (err) {
                update(`エラー/キャンセル: ${err.message}`);
            }
        },
        stop(update) {
            if (this.state.abortController) {
                this.state.abortController.abort();
                this.state.abortController = null;
            }
            this.state.ndef = null;
            update('スキャンを停止しました。');
        }
    },
    {
        id: 'gamepad',
        title: 'Gamepad API',
        description: '接続されたゲームコントローラー（PS4/xbox等）の入力を取得します。',
        state: { reqFrame: null },
        isSupported: () => navigator.getGamepads !== undefined,
        start(update) {
            update('コントローラーを探しています...\n【重要】認識させるために、接続したコントローラーのいずれかのボタンを1回押してください。');

            const loop = () => {
                const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
                let connectedPad = null;

                for (let i = 0; i < gamepads.length; i++) {
                    if (gamepads[i] !== null) {
                        connectedPad = gamepads[i];
                        break;
                    }
                }

                if (connectedPad) {
                    let text = `コントローラー名: ${connectedPad.id}\nインデックス: ${connectedPad.index}\n\n`;

                    // ボタン状態
                    text += `[ボタン入力]\n`;
                    let activeButtons = [];
                    connectedPad.buttons.forEach((btn, idx) => {
                        if (btn.pressed) activeButtons.push(idx);
                    });
                    text += activeButtons.length > 0 ? `押されているボタン: ${activeButtons.join(', ')}\n` : `ボタンは押されていません\n`;

                    // スティック状態
                    text += `\n[スティック (Axes)]\n`;
                    connectedPad.axes.forEach((axis, idx) => {
                        text += `Axis ${idx}: ${axis.toFixed(2)}\n`;
                    });

                    update(text);
                }

                this.state.reqFrame = requestAnimationFrame(loop);
            };

            this.state.reqFrame = requestAnimationFrame(loop);
        },
        stop(update) {
            if (this.state.reqFrame) {
                cancelAnimationFrame(this.state.reqFrame);
                this.state.reqFrame = null;
            }
            update('監視を停止しました。');
        }
    },
    {
        id: 'midi',
        title: 'Web MIDI API',
        description: '電子ピアノやシンセサイザー等のMIDI入力デバイスと通信します。',
        state: { midiAccess: null },
        isSupported: () => navigator.requestMIDIAccess !== undefined,
        async start(update) {
            try {
                update('MIDIデバイスへのアクセス権限をリクエスト中...');
                const midiAccess = await navigator.requestMIDIAccess();
                this.state.midiAccess = midiAccess;

                let inputs = Array.from(midiAccess.inputs.values());
                if (inputs.length === 0) {
                    return update('MIDI入力デバイスが見つかりません。\n電子ピアノなどをPCに接続してください。');
                }

                let deviceInfo = '【接続されているMIDI入力デバイス】\n';
                inputs.forEach(input => {
                    deviceInfo += `- ${input.name} (メーカー: ${input.manufacturer || '不明'})\n`;

                    // イベントリスナーをセット
                    input.onmidimessage = (msg) => {
                        const data = msg.data;
                        let cmd = data[0] >> 4;
                        let channel = data[0] & 0xf;
                        let type = data[0]; // note on/off etc...
                        let note = data[1];
                        let velocity = data[2];

                        // 簡易的に Note On / Note Off だけパースする例
                        let action = '';
                        if (cmd === 9 && velocity !== 0) action = 'Note On  (鍵盤を押した)';
                        else if (cmd === 8 || (cmd === 9 && velocity === 0)) action = 'Note Off (鍵盤を離した)';
                        else action = `Command: ${cmd}`;

                        update(`${deviceInfo}\n【直近のMIDI信号】\n${action}\nチャンネル: ${channel + 1}\nノート番号(音程): ${note}\nベロシティ(強さ): ${velocity}`);
                    };
                });

                update(deviceInfo + '\n待機中... 接続した楽器の鍵盤を弾いてください。');

            } catch (err) {
                update(`エラー/キャンセル: ${err.message}`);
            }
        },
        stop(update) {
            if (this.state.midiAccess) {
                // 全ての入力のリスナーを解除
                const inputs = this.state.midiAccess.inputs.values();
                for (let input = inputs.next(); input && !input.done; input = inputs.next()) {
                    input.value.onmidimessage = null;
                }
            }
            this.state.midiAccess = null;
            update('停止しました。');
        }
    }
];

function init() {
    const container = document.getElementById('sensor-container');
    let hasUnsupported = false;

    sensors.forEach(sensor => {
        const supported = sensor.isSupported();
        if (!supported) hasUnsupported = true;

        // Web BluetoothやWebUSBの場合、停止ボタンを押してもブラウザ仕様的に明示的な「デバイス切断（キャンセル）」が難しいケースがあるがUI的に提供
        const isOneShotStart = (sensor.id === 'bluetooth' || sensor.id === 'usb');

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
        btn.innerText = '開始 (Start / Connect)';
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
                btn.innerText = '開始 (Start / Connect)';
                isRunning = false;
            } else {
                // START
                sensor.start(updateUi, { mediaContainer });
                card.classList.add('active');
                document.getElementById(`status-${sensor.id}`).innerText = '動作中';
                btn.innerText = '停止 (Stop / Disconnect)';
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
