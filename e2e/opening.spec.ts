import { expect, test } from '@playwright/test';
import { expectOpeningLinesUp } from '@huishouden/pwa-kit/e2e';

// While Health opens it shows the kit's opening frame (AppOpening): the same app bar, tabs and
// column as the loaded app, so nothing jumps when the first screen arrives (kit STANDARD.md
// "Updates"). Who may read conditions is known only with the data, so the opening shows that tab
// only when the address is on it: checked there, where the two frames have the same tabs.

test('the opening frame lines up with the loaded app: phone and tablet, light and dark', async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  await expectOpeningLinesUp(browser, {
    baseURL,
    path: './?tab=conditions&person=demo-person-ria',
    loaded: (p) => expect(p.getByText('Type 2 diabetes')).toBeVisible(),
  });
});
