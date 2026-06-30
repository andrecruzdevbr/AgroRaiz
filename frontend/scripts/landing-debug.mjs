import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3000'

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  page.on('console', (msg) => console.log('BROWSER:', msg.type(), msg.text()))
  page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message))

  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await page.waitForTimeout(15_000)

  const text = await page.locator('body').innerText()
  console.log('--- BODY TEXT (first 800 chars) ---')
  console.log(text.slice(0, 800))
  console.log('--- CHECKS ---')
  console.log('Depoimentos:', text.includes('Depoimentos'))
  console.log('Entrar:', text.includes('Entrar'))
  console.log('Fale Conosco:', text.includes('Fale Conosco'))
  console.log('Não foi possível carregar:', text.includes('Não foi possível carregar'))
  console.log('Skeleton count:', await page.locator('[data-slot="skeleton"]').count())

  await page.screenshot({ path: 'scripts/landing-debug.png', fullPage: false })
  console.log('Screenshot: scripts/landing-debug.png')

  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
