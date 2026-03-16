import { getConfig } from './config'

export class Template {
  private getConfig: getConfig

  constructor(getConfig: getConfig) {
    this.getConfig = getConfig
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async bind(phone: string, name: string, parametersValues: any) {
    const config = await this.getConfig(phone)
    const store = await config.getStore(phone, config)
    const loaded = await store.dataStore.loadTemplates()
    const templates: any[] = Array.isArray(loaded) ? loaded as any[] : []
    const template: any = templates.find((t: any) => t?.name == name)
    if (!template) {
      throw `Template name ${name} not found`
    }
    const components: any[] = Array.isArray(template.components) ? template.components : []
    const values: any[] = Array.isArray(parametersValues) ? parametersValues : []
    const types = ['header', 'body', 'footer']
    let text = ''
    types.forEach((type) => {
      const component = components.find((c: any) => (c?.type || '').toLowerCase() === type)
      const value = values.find((v: any) => (v?.type || '').toLowerCase() === type)
      if (component && value) {
        const params: any[] = Array.isArray(value.parameters) ? value.parameters : []
        let current = `${component.text || ''}`
        params.forEach((parameter: any) => {
          current = current.replace(/\{\{.*?\}\}/, parameter?.text || '')
        })
        text = `${text}${current}`
      }
    })
    return { text }
  }
}
