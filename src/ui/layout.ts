const PANEL_MAX_ROWS = 11;
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

/**
 * Where a panel goes: right above the agent's input box. The list panel always uses the full
 * height, so switching lists never resizes it; the save picker asks for fewer rows.
 */
export function panelPlacement(input: InputAnchor, height = PANEL_MAX_ROWS): PanelPlacement {
  const rows = Math.max(1, input.rows);
  const h = Math.min(height, rows);
  const anchor = anchorRow(input);
  const anchored = anchor === null ? -1 : anchor - h;
  const preferred = anchored < 0 ? rows - h - FALLBACK_BOTTOM_GAP : anchored;
  const top = Math.max(0, Math.min(preferred, rows - h));
  return { top, height: h };
}

export function toastRow(input: InputAnchor): number {
  const anchor = anchorRow(input);
  const above = anchor === null ? -1 : anchor - 1;
  return above < 0 ? Math.max(0, input.rows - TOAST_BOTTOM_GAP) : above;
}
