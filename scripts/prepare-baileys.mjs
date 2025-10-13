import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { spawnSync } from 'child_process'

const log = (...args) => console.log('[prepare-baileys]', ...args)
const warn = (...args) => console.warn('[prepare-baileys]', ...args)

try {
  const root = process.cwd()
  const modDir = join(root, 'node_modules', '@whiskeysockets', 'baileys')
  const pkgPath = join(modDir, 'package.json')

  if (!existsSync(pkgPath)) {
    log('baileys não encontrado em node_modules, nada a fazer')
    process.exit(0)
  }

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))

  // Heurísticas de artefatos compilados
  const libIndex = join(modDir, 'lib', 'index.js')
  const distIndex = join(modDir, 'dist', 'index.js')
  const socketIdxCandidates = [
    join(modDir, 'lib', 'Socket', 'index.js'),
    join(modDir, 'lib', 'Socket', 'index.cjs'),
    join(modDir, 'lib', 'Socket', 'index.mjs')
  ]
  const hasLibIndex = existsSync(libIndex)
  const hasDistIndex = existsSync(distIndex)
  const hasSocketIdx = socketIdxCandidates.some(existsSync)

  if ((hasLibIndex || hasDistIndex) && hasSocketIdx) {
    log('artefatos já presentes (lib/dist + Socket), skip build')
    process.exit(0)
  }

  // Se veio de git, geralmente precisa compilar: instalar devDeps e rodar build/prepare
  log('artefatos não encontrados; instalando devDependencies do baileys…')
  const install = spawnSync('yarn', ['install', '--production=false', '--non-interactive', '--ignore-scripts'], {
    cwd: modDir,
    stdio: 'inherit',
    shell: false
  })
  if (install.status !== 0) {
    warn('falha ao instalar devDependencies do baileys, código:', install.status)
    process.exit(0) // não falhar o postinstall do app
  }

  // Preparar tsconfig local desativando declarações para evitar TS2742
  const tsconfigBuild = [
    join(modDir, 'tsconfig.build.json'),
    join(modDir, 'tsconfig.json')
  ].find(existsSync)

  if (!tsconfigBuild) {
    warn('tsconfig do baileys não encontrado; abortando prepare')
    process.exit(0)
  }

  try {
    const cfg = JSON.parse(readFileSync(tsconfigBuild, 'utf8'))
    cfg.compilerOptions = cfg.compilerOptions || {}
    cfg.compilerOptions.declaration = false
    cfg.compilerOptions.skipLibCheck = true
    const localCfg = join(modDir, 'tsconfig.build.local.json')
    writeFileSync(localCfg, JSON.stringify(cfg, null, 2))

    // Compilar TS -> JS
    let tsc = spawnSync('yarn', ['tsc', '-p', localCfg], { cwd: modDir, stdio: 'inherit', shell: false })
    if (tsc.status !== 0) {
      tsc = spawnSync('npx', ['-y', 'typescript', '-p', localCfg], { cwd: modDir, stdio: 'inherit', shell: false })
    }

    // Ajustar imports ESM
    let esmFix = spawnSync('yarn', ['tsc-esm-fix', `--tsconfig=${localCfg}`, '--ext=.js'], { cwd: modDir, stdio: 'inherit', shell: false })
    if (esmFix.status !== 0) {
      esmFix = spawnSync('npx', ['-y', 'tsc-esm-fix', `--tsconfig=${localCfg}`, '--ext=.js'], { cwd: modDir, stdio: 'inherit', shell: false })
    }
  } catch (e) {
    warn('falha ao ajustar/compilar tsconfig local:', e?.message || e)
  }

  // Checagem final
  const finalHasLibIndex = existsSync(libIndex)
  const finalHasSocketIdx = socketIdxCandidates.some(existsSync)
  if (finalHasLibIndex && finalHasSocketIdx) {
    log('baileys compilado e arquivos esperados presentes')
  } else {
    warn('baileys pode não estar completamente compilado (lib/Socket/index ausente).')
  }
} catch (err) {
  warn('erro no prepare-baileys:', err?.message || err)
  // Não derrubar a instalação do app
}
