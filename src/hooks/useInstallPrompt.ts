import { useCallback, useEffect, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt: () => Promise<void>;
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

export interface InstallPromptApi {
  canInstall: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  promptInstall: () => Promise<InstallOutcome>;
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;

  const displayModes = ['standalone', 'fullscreen', 'minimal-ui'];
  const launchedAsApp = displayModes.some((mode) =>
    window.matchMedia(`(display-mode: ${mode})`).matches,
  );

  return launchedAsApp || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function detectIOS(): boolean {
  if (typeof navigator === 'undefined') return false;

  // iPadOS 13+ 的 Safari 会把自己伪装成 Mac，需要用触屏点数区分
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || iPadOS;
}

export function useInstallPrompt(): InstallPromptApi {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(detectStandalone);
  const [isIOS] = useState(detectIOS);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      // 阻止 Chrome 自动弹出迷你提示，改为用户点击按钮后再 prompt()
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setDeferredPrompt(null);
      setIsInstalled(true);
    };

    const displayMode = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = () => {
      if (displayMode.matches) setIsInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    displayMode.addEventListener('change', handleDisplayModeChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
      displayMode.removeEventListener('change', handleDisplayModeChange);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<InstallOutcome> => {
    if (!deferredPrompt) return 'unavailable';

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      return outcome;
    } finally {
      setDeferredPrompt(null);
    }
  }, [deferredPrompt]);

  return {
    canInstall: deferredPrompt !== null,
    isInstalled,
    isIOS,
    promptInstall,
  };
}
