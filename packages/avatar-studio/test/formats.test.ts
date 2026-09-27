import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  EXPORT_FORMATS,
  clampSize,
  exportFileName,
  formatInfo,
  frameTimes,
  heightFor,
  loopsFor,
  pixelScale,
  planSheet,
  slugify,
  svgSize,
} from '../src/export/formats.ts'
import { STRINGS } from '../src/strings.ts'

test('every format is unique, has a label and a description string', () => {
  const ids = EXPORT_FORMATS.map((f) => f.id)
  assert.equal(new Set(ids).size, ids.length)
  const s = STRINGS as Record<string, string>
  for (const f of EXPORT_FORMATS) {
    assert.ok(s[`fmt_${f.id}`], `label for ${f.id}`)
    assert.ok(s[`fmtDesc_${f.id}`], `description for ${f.id}`)
    if (f.bundle) assert.equal(f.ext, 'zip')
    if (f.animated && f.id !== 'spritesheet' && f.id !== 'rig') assert.ok(f.options.includes('clip'))
  }
  assert.equal(formatInfo('gif').mime, 'image/gif')
})

test('sizes clamp and follow the aspect ratio', () => {
  assert.equal(clampSize(99999), 4096)
  assert.equal(clampSize(-3), 16)
  assert.equal(clampSize(Number.NaN), 16)
  assert.equal(clampSize(511.6), 512)
  assert.equal(heightFor(512, 100, 100), 512)
  assert.equal(heightFor(512, 200, 100), 256)
  assert.equal(pixelScale(48, 512), 10)
  assert.equal(pixelScale(64, 32), 1)
})

test('frame times: loops exclude the end, one-shots include it, capped', () => {
  assert.deepEqual(frameTimes(1, 4, true), [0, 0.25, 0.5, 0.75])
  assert.deepEqual(frameTimes(1, 4, false), [0, 1 / 3, 2 / 3, 1])
  assert.equal(frameTimes(10, 30, true, 60).length, 60)
  assert.deepEqual(frameTimes(0, 12, true), [0])
  assert.equal(loopsFor(1.2, 3), 3)
  assert.equal(loopsFor(4, 3), 1)
})

test('sprite sheets fit on every browser canvas', () => {
  const small = planSheet([29, 12], 256)
  assert.equal(small.columns, 16)
  assert.equal(small.cell, 256)
  assert.equal(small.width, 16 * 256)
  assert.equal(small.height, (2 + 1) * 256)
  const huge = planSheet([48, 48, 48, 48, 48, 48, 48, 48], 1024)
  assert.ok(huge.width <= 8192 && huge.height <= 8192)
  assert.ok(huge.width * huge.height <= 16_000_000)
  assert.ok(huge.cell >= 16)
  assert.equal(planSheet([], 128).columns, 1)
})

test('file names are safe and descriptive', () => {
  assert.equal(slugify('  Zoë the Brave!! '), 'zoe-the-brave')
  assert.equal(slugify('***'), 'avatar')
  assert.equal(slugify('a'.repeat(80)).length, 40)
  assert.equal(exportFileName('Robin', 'png'), 'robin.png')
  assert.equal(exportFileName('', 'jpeg'), 'avatar.jpg')
  assert.equal(exportFileName('Robin', 'gif', 'walk'), 'robin-walk.gif')
  assert.equal(exportFileName('Robin', 'spritesheet'), 'robin-spritesheet.zip')
  assert.equal(exportFileName('Robin', 'animated-svg', 'wave'), 'robin-animated-wave.svg')
})

test('svgSize reads the root element only', () => {
  assert.deepEqual(svgSize('<svg xmlns="x" viewBox="0 0 10 20" width="256" height="512"><rect width="9" height="9"/></svg>'), { width: 256, height: 512 })
  assert.deepEqual(svgSize('<svg><rect width="9" height="9"/></svg>'), { width: 512, height: 512 })
})
