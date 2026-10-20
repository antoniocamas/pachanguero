import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

/** Opens a game from the game screen and answers the row of one of its players, once it is there. */
export async function openGameRow(
  page: Page,
  gameId: number,
  player: string
): Promise<Locator> {
  await page.getByLabel('Elegir partido').selectOption(String(gameId));
  const row = page.locator(`[data-testid="player-row"][data-name="${player}"]`);
  await expect(row).toBeVisible();
  return row;
}
