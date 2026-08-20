import fs from 'fs'
import path from 'path'

describe('public session manager', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'public', 'index.html'), 'utf8')
  const app = fs.readFileSync(path.join(process.cwd(), 'public', 'app', 'app.js'), 'utf8')
  const styles = fs.readFileSync(path.join(process.cwd(), 'public', 'app', 'styles.css'), 'utf8')

  test('does not expose Cloud Embedded Signup or coexistence configuration', () => {
    expect(html).not.toContain('Cloud / Embedded Signup')
    expect(html).not.toContain('webhookForwardPhoneNumberId')
    expect(html).not.toContain('webhookForwardToken')
    expect(html).not.toContain('webhookForwardBusinessAccountId')
    expect(html).not.toContain('coexistenceEnabled')
    expect(html).not.toContain('/embedded/config.js')
    expect(html).not.toContain('oneToOneAddressingMode')
    expect(html).not.toContain('applyEmbeddedToForm')
  })

  test('does not overwrite hidden Cloud settings when saving a session', () => {
    expect(html).not.toMatch(/webhookForward\s*:/)
    expect(html).not.toMatch(/coexistenceWindowSeconds\s*:/)
  })

  test('shows accessible progress and result feedback for every configuration save form', () => {
    for (const form of [
      'session-config',
      'webhook',
      'redis-save',
      'voip-resource',
      'voip-console-json',
      'voip-resource-fields',
      'voip-sip-mode',
      'voip-recording-settings',
    ]) {
      expect(app).toContain(`'${form}'`)
    }
    expect(app).toContain("setAttribute('aria-busy', 'true')")
    expect(app).toContain("t('Salvando…')")
    expect(app).toContain('toast--${this.toast.tone}')
    expect(app).toContain('this.renderToast()')
    expect(styles).toContain('.btn--loading .icon')
    expect(styles).toContain('.toast--success')
    expect(styles).toContain('.toast--error')
  })
})
