export const SAFE_MARGIN_X = 0.055;
export const SAFE_MARGIN_Y = 0.055;

export function clampWithinSafeZone(params: {
  x: number;
  y: number;
  width: number;
  height: number;
  canvasWidth: number;
  canvasHeight: number;
}) {
  const { x, y, width, height, canvasWidth, canvasHeight } = params;
  const safeLeft = canvasWidth * SAFE_MARGIN_X;
  const safeTop = canvasHeight * SAFE_MARGIN_Y;
  const safeRight = canvasWidth * (1 - SAFE_MARGIN_X);
  const safeBottom = canvasHeight * (1 - SAFE_MARGIN_Y);

  const maxWidth = Math.max(16, safeRight - safeLeft);
  const maxHeight = Math.max(16, safeBottom - safeTop);
  const nextWidth = Math.min(width, maxWidth);
  const nextHeight = Math.min(height, maxHeight);
  const nextX = Math.min(Math.max(x, safeLeft), safeRight - nextWidth);
  const nextY = Math.min(Math.max(y, safeTop), safeBottom - nextHeight);

  return { x: nextX, y: nextY, width: nextWidth, height: nextHeight };
}

