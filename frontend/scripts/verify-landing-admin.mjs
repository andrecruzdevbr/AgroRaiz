/**
 * Browser verification for landing admin access button.
 * Usage: node scripts/verify-landing-admin.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const API = process.env.API_URL || 'http://localhost:8001'

async function login() {
  const res = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'username=admin@agroraiz.com.br&password=AgroRaiz%402024',
  })
  if (!res.ok) throw new Error(`Login API failed: ${res.status}`)
  const data = await res.json()
  return data.access_token
}

function adminLink(page) {
  return page
    .locator('header')
    .getByRole('link', { name: /Entrar|Ir para o painel/ })
    .first()
}

async function waitLandingReady(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await page.locator('header').waitFor({ state: 'visible', timeout: 90_000 })
  await adminLink(page).waitFor({ state: 'visible', timeout: 90_000 })
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()

  console.log('1. Landing sem login (desktop)...')
  await waitLandingReady(page)
  const guestBtn = adminLink(page)
  const guestText = (await guestBtn.innerText()).trim()
  const guestHref = await guestBtn.getAttribute('href')
  console.log(`   Botão visível: "${guestText}" → ${guestHref}`)
  if (!guestText.includes('Entrar') || guestHref !== '/login') {
    throw new Error(`Esperado "Entrar" → /login, obteve "${guestText}" → ${guestHref}`)
  }

  console.log('2. Clique sem login...')
  await guestBtn.click()
  await page.waitForURL('**/login**', { timeout: 30_000 })
  console.log(`   URL: ${page.url()}`)

  console.log('3. Login via cookie...')
  const token = await login()
  await context.addCookies([
    {
      name: 'agroraiz_token',
      value: token,
      domain: 'localhost',
      path: '/',
      sameSite: 'Lax',
    },
  ])

  console.log('4. Landing com sessão (desktop)...')
  await waitLandingReady(page)
  const authedBtn = adminLink(page)
  const authedText = (await authedBtn.innerText()).trim()
  const authedHref = await authedBtn.getAttribute('href')
  console.log(`   Botão visível: "${authedText}" → ${authedHref}`)
  if (!authedText.includes('Ir para o painel') || authedHref !== '/admin') {
    throw new Error(`Esperado "Ir para o painel" → /admin, obteve "${authedText}" → ${authedHref}`)
  }

  console.log('5. Clique com sessão...')
  await authedBtn.click()
  await page.waitForURL('**/admin**', { timeout: 30_000 })
  console.log(`   URL: ${page.url()}`)

  console.log('6. Mobile viewport...')
  await page.setViewportSize({ width: 390, height: 844 })
  await waitLandingReady(page)
  const mobileBtn = adminLink(page)
  const mobileText = (await mobileBtn.innerText()).trim()
  const mobileBox = await mobileBtn.boundingBox()
  console.log(`   Botão mobile visível: "${mobileText}" (x=${mobileBox?.x?.toFixed(0)}, y=${mobileBox?.y?.toFixed(0)})`)
  if (!mobileText.includes('Ir para o painel')) {
    throw new Error(`Mobile: esperado "Ir para o painel", obteve "${mobileText}"`)
  }

  console.log('7. Logout (cookie removido) → landing...')
  await context.clearCookies()
  await waitLandingReady(page)
  const loggedOutBtn = adminLink(page)
  const outText = (await loggedOutBtn.innerText()).trim()
  const outHref = await loggedOutBtn.getAttribute('href')
  console.log(`   Botão após logout: "${outText}" → ${outHref}`)
  if (!outText.includes('Entrar') || outHref !== '/login') {
    throw new Error(`Após logout: esperado "Entrar" → /login, obteve "${outText}" → ${outHref}`)
  }

  await page.screenshot({ path: 'scripts/landing-admin-mobile.png' })
  console.log('   Screenshot: scripts/landing-admin-mobile.png')

  await browser.close()
  console.log('\n✓ Todos os testes de browser passaram.')
}

main().catch((err) => {
  console.error('\n✗ Falha:', err.message)
  process.exit(1)
})
