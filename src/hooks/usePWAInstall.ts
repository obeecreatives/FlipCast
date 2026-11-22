import { useEffect, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

declare global {
  interface Window {
    __papanDeferredPrompt?: BeforeInstallPromptEvent | null;
  }
}

export type DevicePlatform = 'android' | 'ios' | 'desktop';

function detectPlatform(): DevicePlatform {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent.toLowerCase();
  const isIPadOS =
    navigator.platform === 'MacIntel' && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1;
  if (/iphone|ipad|ipod/.test(ua) || isIPadOS) {
    return 'ios';
  }
  if (/android/.test(ua)) {
    return 'android';
  }
  return 'desktop';
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() =>
    typeof window !== 'undefined' ? window.__papanDeferredPrompt || null : null
  );
  const [isInstalled, setIsInstalled] = useState(false);
  const [platform, setPlatform] = useState<DevicePlatform>(() => detectPlatform());
  const [isInIframe, setIsInIframe] = useState(false);

  useEffect(() => {
    const checkStandalone = () => {
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: window-controls-overlay)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      setIsInstalled(standalone);
    };

    checkStandalone();
    setPlatform(detectPlatform());

    try {
      setIsInIframe(window.self !== window.top);
    } catch {
      setIsInIframe(true);
    }

    if (window.__papanDeferredPrompt) {
      setDeferredPrompt(window.__papanDeferredPrompt);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      window.__papanDeferredPrompt = promptEvent;
      setDeferredPrompt(promptEvent);
    };

    const handleEarlyReady = () => {
      if (window.__papanDeferredPrompt) {
        setDeferredPrompt(window.__papanDeferredPrompt);
      }
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      window.__papanDeferredPrompt = null;
      setDeferredPrompt(null);
    };

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    mediaQuery.addEventListener?.('change', checkStandalone);

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('papan:install-ready', handleEarlyReady);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      mediaQuery.removeEventListener?.('change', checkStandalone);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('papan:install-ready', handleEarlyReady);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    const promptObj = deferredPrompt || window.__papanDeferredPrompt;
    if (!promptObj) return false;
    await promptObj.prompt();
    const { outcome } = await promptObj.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      window.__papanDeferredPrompt = null;
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS: platform === 'ios',
    platform,
    isInIframe,
    install,
  };
}
