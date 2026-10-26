/**
 * 专注结束的提示音 + 系统通知。
 * 全部 best-effort：任何失败（无权限、浏览器不支持）都不阻塞主流程。
 */

let sharedAudioContext: AudioContext | null = null;

type AudioContextCtor = typeof AudioContext;

/** 惰性创建并复用同一个 AudioContext，避免每次提示都新建（也有利于浏览器放行播放） */
function getAudioContext(): AudioContext | null {
  try {
    const Ctor: AudioContextCtor | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
    if (!Ctor) return null;
    if (!sharedAudioContext) sharedAudioContext = new Ctor();
    return sharedAudioContext;
  } catch {
    return null;
  }
}

/**
 * 在用户手势（点击“开始专注”）时预先请求通知权限。
 * 提前到开始时刻请求，避免倒计时结束时才弹权限框（那时用户可能没在看屏幕）。
 */
export function requestNotificationPermission(): void {
  try {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  } catch {
    /* ignore */
  }
}

/** 播放一段简单的上行提示音（Web Audio 合成，无需音频资源文件）。 */
export function playFocusCompleteSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    // resume：浏览器可能因自动播放策略把 context 挂起，先恢复再发声
    void ctx.resume().then(() => {
      // C5 → E5 → G5 三个上行音符，短促明快
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const startAt = ctx.currentTime + index * 0.18;

        osc.type = 'sine';
        osc.frequency.value = freq;

        // 指数渐入渐出包络，避免爆音
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(0.28, startAt + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.16);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startAt);
        osc.stop(startAt + 0.18);
      });
    });
  } catch {
    /* ignore */
  }
}

/** 发送系统通知（需已授权，否则静默跳过）。 */
export function sendFocusCompleteNotification(): void {
  try {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    new Notification('专注结束', {
      body: '专注结束，快起来喝口水、看看窗外休息 6 分钟吧！',
      tag: 'focus-complete',
    });
  } catch {
    /* ignore */
  }
}
