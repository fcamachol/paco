import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

await page.goto('http://localhost:3006/agents/5f0b4203-a227-4af6-8272-8dd38c66be2e', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

await page.screenshot({ path: '/tmp/agent-detail.png', fullPage: false });
console.log('Screenshot saved to /tmp/agent-detail.png');

// Also get the computed styles of key elements
const info = await page.evaluate(() => {
  const main = document.querySelector('main');
  const mainStyle = main ? window.getComputedStyle(main) : null;
  const body = document.body;
  const bodyStyle = window.getComputedStyle(body);
  const html = document.documentElement;
  const htmlStyle = window.getComputedStyle(html);

  return {
    body: {
      height: bodyStyle.height,
      overflow: bodyStyle.overflow,
      overflowY: bodyStyle.overflowY,
      scrollHeight: body.scrollHeight,
      clientHeight: body.clientHeight,
    },
    html: {
      height: htmlStyle.height,
      overflow: htmlStyle.overflow,
      overflowY: htmlStyle.overflowY,
      scrollHeight: html.scrollHeight,
      clientHeight: html.clientHeight,
    },
    main: main ? {
      height: mainStyle.height,
      overflow: mainStyle.overflow,
      overflowY: mainStyle.overflowY,
      scrollHeight: main.scrollHeight,
      clientHeight: main.clientHeight,
      scrollTop: main.scrollTop,
      className: main.className,
    } : 'NOT FOUND',
    mainParent: main?.parentElement ? {
      height: window.getComputedStyle(main.parentElement).height,
      overflow: window.getComputedStyle(main.parentElement).overflow,
      className: main.parentElement.className,
    } : 'NOT FOUND',
  };
});

console.log(JSON.stringify(info, null, 2));

await browser.close();
