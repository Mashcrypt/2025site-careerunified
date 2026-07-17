type AnalyticsValue = string | number | boolean;

type AnalyticsParams = Record<string, AnalyticsValue | null | undefined>;

type GtagWindow = Window & {
  gtag?: (command: 'event', eventName: string, params?: Record<string, AnalyticsValue>) => void;
};

export function trackAnalyticsEvent(eventName: string, params: AnalyticsParams = {}) {
  if (typeof window === 'undefined') return false;

  const gtag = (window as GtagWindow).gtag;
  if (typeof gtag !== 'function') return false;

  const safeParams: Record<string, AnalyticsValue> = {};
  Object.entries(params).forEach(([key, value]) => {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      safeParams[key] = value;
    }
  });

  gtag('event', eventName, safeParams);
  return true;
}

export function trackAnalyticsEventOnce(
  storageKey: string,
  eventName: string,
  params: AnalyticsParams = {}
) {
  if (typeof window === 'undefined') return;

  const key = `careerUnifiedAnalytics:${storageKey}`;

  try {
    if (window.sessionStorage.getItem(key)) return;
    if (trackAnalyticsEvent(eventName, params)) window.sessionStorage.setItem(key, '1');
  } catch {
    trackAnalyticsEvent(eventName, params);
  }
}
