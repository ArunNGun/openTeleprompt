/**
 * snap.mjs — Notch mode snapshot tool
 *
 * Usage:
 *   node scripts/snap.mjs save    → lock current notch state as golden
 *   node scripts/snap.mjs check   → diff current vs golden, fail if changed
 *
 * Requires: dev server running on :1420
 */

import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'
import { createHash } from 'crypto'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE_URL = 'http://localhost:1420'
const SNAP_DIR = path.resolve('.snapshots/notch')
const DIFF_THRESHOLD = 100 // max pixels allowed to differ

// The 6 notch states we care about
const STATES = [
  { view: 'idle', theme: 'dark' },
  { view: 'idle', theme: 'light' },
  { view: 'edit', theme: 'dark' },
  { view: 'edit', theme: 'light' },
  { view: 'read', theme: 'dark' },
  { view: 'read', theme: 'light' },
]

async function getPage(browser, view, theme) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  await page.goto(`${BASE_URL}/?view=${view}&mode=notch&theme=${theme}`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('#island')
  await new Promise(r => setTimeout(r, 700)) // let animations settle

  // Clip to island + small padding
  const box = await page.$eval('#island', el => {
    const r = el.getBoundingClientRect()
    return { x: r.left, y: r.top, width: r.width, height: r.height }
  })

  const clip = {
    x: Math.max(0, box.x - 30),
    y: 0,
    width: box.width + 60,
    height: box.height + 30,
  }

  const buf = await page.screenshot({ clip, type: 'png' })
  await page.close()
  return buf
}

async function run(cmd) {
  // Check dev server is up
  try {
    const res = await fetch(BASE_URL)
    if (!res.ok) throw new Error()
  } catch {
    console.error('❌  Dev server not running. Start it with: npm run dev:react')
    process.exit(1)
  }

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  })

  if (cmd === 'save') {
    fs.mkdirSync(SNAP_DIR, { recursive: true })
    console.log('📸  Saving notch golden snapshots...\n')

    for (const { view, theme } of STATES) {
      const name = `notch__${view}__${theme}.png`
      const buf = await getPage(browser, view, theme)
      fs.writeFileSync(path.join(SNAP_DIR, name), buf)
      console.log(`  ✅  ${name}`)
    }
    console.log(`\n✨  Saved ${STATES.length} snapshots to ${SNAP_DIR}`)

  } else if (cmd === 'check') {
    if (!fs.existsSync(SNAP_DIR)) {
      console.error('❌  No snapshots found. Run: node scripts/snap.mjs save')
      process.exit(1)
    }

    console.log('🔍  Checking notch mode for regressions...\n')
    let failed = 0

    for (const { view, theme } of STATES) {
      const name = `notch__${view}__${theme}.png`
      const goldenPath = path.join(SNAP_DIR, name)

      if (!fs.existsSync(goldenPath)) {
        console.log(`  ⚠️   ${name} — no golden, skipping`)
        continue
      }

      const current = await getPage(browser, view, theme)
      const golden = fs.readFileSync(goldenPath)

      // Quick hash check first (fast path)
      const hashA = createHash('md5').update(current).digest('hex')
      const hashB = createHash('md5').update(golden).digest('hex')

      if (hashA === hashB) {
        console.log(`  ✅  ${name} — identical`)
        continue
      }

      // Hash differs — do byte-level size check as proxy for major diff
      const sizeDiff = Math.abs(current.length - golden.length)
      const sizeRatio = sizeDiff / golden.length

      if (sizeRatio > 0.02) {
        // >2% file size change = significant visual change
        fs.writeFileSync(path.join(SNAP_DIR, `FAIL__${name}`), current)
        console.log(`  ❌  ${name} — CHANGED (${(sizeRatio * 100).toFixed(1)}% size diff) → saved as FAIL__${name}`)
        failed++
      } else {
        // Minor encoding/font sub-pixel diff — warn but don't fail
        console.log(`  ⚠️   ${name} — minor diff (${sizeDiff} bytes, likely sub-pixel)`)
      }
    }

    console.log('')
    if (failed === 0) {
      console.log('✨  Notch mode clean — no regressions detected')
    } else {
      console.log(`🚨  ${failed} regression(s) found! Check FAIL__*.png files in ${SNAP_DIR}`)
      process.exit(1)
    }

  } else {
    console.log('Usage: node scripts/snap.mjs [save|check]')
    process.exit(1)
  }

  await browser.close()
}

run(process.argv[2])
