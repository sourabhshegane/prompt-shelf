const PANEL_MAX_ROWS = 10;
const PANEL_CHROME_ROWS = 2;
const FALLBACK_BOTTOM_GAP = 4;
const TOAST_BOTTOM_GAP = 3;

export interface InputAnchor {
  rows: number;
  inputTop: number | null;
  hasBorderAbove: boolean;
}

export interface PanelPlacement {
  top: number;
  height: number;
}

const anchorRow = ({ inputTop, hasBorderAbove }: InputAnchor) =>
  inputTop === null ? null : inputTop - (hasBorderAbove ? 1 : 0);

export function panelPlacement(input: InputAnchor & { entryCount: number }): PanelPlacement {
  const rows = Math.max(1, input.rows);
  const height = Math.min(Math.max(input.entryCount, 1) + PANEL_CHROME_ROWS, PANEL_MAX_ROWS, rows);
  const anchor = anchorRow(input);
  const anchored = anchor === null ? -1 : anchor - height;
  const preferred = anchored < 0 ? rows - height - FALLBACK_BOTTOM_GAP : anchored;
  const top = Math.max(0, Math.min(preferred, rows - height));
  return { top, height };
}

export function toastRow(input: InputAnchor): number {
  const anchor = anchorRow(input);
  const above = anchor === null ? -1 : anchor - 1;
  return above < 0 ? Math.max(0, input.rows - TOAST_BOTTOM_GAP) : above;
}
