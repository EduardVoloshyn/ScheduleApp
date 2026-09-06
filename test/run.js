/**
 * Terminal runner. `jsc -m test/run.js` from the project root.
 *
 * jsc is JavaScriptCore — the engine Safari and the iPad use, which makes it the most
 * relevant place to check this code. It ships with macOS, so there is nothing to install.
 */
import './layout.test.js'
import './model.test.js'
import './icons.test.js'
import './single-flight.test.js'
import './categories.test.js'
import './render.test.js'
import './boot.test.js'
import { run } from './harness.js'

const { results, passed, failed } = await run()

for (const r of results) {
  print(`  ${r.passed ? 'PASS' : 'FAIL'}  ${r.name}`)
  if (!r.passed) print(`        ${r.message}`)
}

print('')
print(failed === 0 ? `ALL PASS — ${passed} tests` : `${failed} FAILED, ${passed} passed`)
