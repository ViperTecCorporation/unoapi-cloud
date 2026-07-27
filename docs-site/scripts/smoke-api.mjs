const base = process.env.API_BASE_URL
const token = process.env.API_TOKEN
if (!base || !token) throw new Error('Defina API_BASE_URL e API_TOKEN')

const request = async (pathname, auth = true) => {
  const response = await fetch(new URL(pathname, base), {
    headers: auth ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok) throw new Error(`${pathname}: HTTP ${response.status} ${await response.text()}`)
  return response
}

await request('/ping', false)
const sessions = await (await request('/sessions')).json()
if (!Array.isArray(sessions) && !Array.isArray(sessions?.data)) throw new Error('/sessions retornou formato inesperado')
console.log('Smoke test concluído: ping e autenticação de sessões OK')
