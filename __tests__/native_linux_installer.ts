import { spawnSync } from 'child_process'
import path from 'path'

const installer = path.resolve('scripts/install-native-linux.sh')
const installerForBash =
  process.platform === 'win32'
    ? installer.replace(/^([A-Za-z]):\\/, (_match, drive: string) => `/mnt/${drive.toLowerCase()}/`).replace(/\\/g, '/')
    : installer
const bashCommand = process.platform === 'win32' ? 'wsl.exe' : 'bash'
const bashArgs = (args: string[]) => (process.platform === 'win32' ? ['bash', installerForBash, ...args] : [installerForBash, ...args])

describe('native Linux installer', () => {
  test('documents its supported options', () => {
    const result = spawnSync(bashCommand, bashArgs(['--help']), { encoding: 'utf8' })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('--tag TAG')
    expect(result.stdout).toContain('--role ROLE')
    expect(result.stdout).toContain('--dry-run')
  })

  test('plans a role-separated installation without changing the host', () => {
    const result = spawnSync(
      bashCommand,
      bashArgs([
        '--dry-run',
        '--tag',
        'v4.0.0-beta8',
        '--role',
        'worker',
        '--install-root',
        '/opt/viperconnect-test',
        '--state-root',
        '/var/lib/viperconnect-test',
      ]),
      { encoding: 'utf8' },
    )

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('role: worker')
    expect(result.stdout).toContain('unit: viperconnect-worker.service')
    expect(result.stdout).toContain('nenhuma alteração foi realizada')
  })

  test('plans a dedicated video worker unit', () => {
    const result = spawnSync(
      bashCommand,
      bashArgs(['--dry-run', '--tag', 'v4.0.12', '--role', 'video']),
      { encoding: 'utf8' },
    )

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('role: video')
    expect(result.stdout).toContain('unit: viperconnect-video.service')
  })

  test('rejects unsafe tags before requiring root', () => {
    const result = spawnSync(bashCommand, bashArgs(['--dry-run', '--tag', '../main']), {
      encoding: 'utf8',
    })

    expect(result.status).toBe(2)
    expect(result.stderr).toContain('Tag inválida')
  })

  test('rejects unsafe installation paths before requiring root', () => {
    const result = spawnSync(bashCommand, bashArgs(['--dry-run', '--install-root', '/opt/viper:connect']), { encoding: 'utf8' })

    expect(result.status).toBe(2)
    expect(result.stderr).toContain('install-root contém caracteres inválidos')
  })

  test('rejects a missing environment source before changing the host', () => {
    const result = spawnSync(bashCommand, bashArgs(['--dry-run', '--env-file', '/viperconnect-file-that-does-not-exist']), {
      encoding: 'utf8',
    })

    expect(result.status).toBe(2)
    expect(result.stderr).toContain('Arquivo de ambiente não encontrado ou sem leitura')
  })
})
