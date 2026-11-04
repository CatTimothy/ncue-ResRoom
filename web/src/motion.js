/** 瀏覽器支援且使用者沒有要求減少動態時才播放轉場 */
export function canAnimate() {
  return Boolean(document.startViewTransition) && !matchMedia('(prefers-reduced-motion: reduce)').matches;
}
