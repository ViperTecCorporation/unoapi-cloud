import fs from 'fs'
import YAML from 'yaml'

describe('OpenAPI interactive message examples', () => {
  test('documents CTA URL, call and copy buttons with a matching request schema', () => {
    const spec = YAML.parse(fs.readFileSync('docs/openapi.yaml', 'utf8'))
    const example = spec.paths['/v15.0/{phone}/messages'].post.requestBody
      .content['application/json'].examples.interactiveCtaButtons.value
    const schema = spec.components.schemas.MessageInteractiveCtaButtons
    const buttonVariants = schema.allOf[1].properties.interactive.properties
      .action.properties.buttons.items.oneOf

    expect(example.interactive.action.buttons).toEqual([
      { type: 'cta_url', url: { title: 'Abrir site', link: 'https://facebook.com.br' } },
      { type: 'cta_call', call: { title: 'Ligar', phone_number: '+5511999999999' } },
      { type: 'cta_copy', copy_code: { title: 'ChavePix', code: '0000000055442' } },
    ])
    expect(buttonVariants.map((variant: any) => variant.properties.type.const)).toEqual([
      'cta_url',
      'cta_call',
      'cta_copy',
    ])
    expect(spec.components.schemas.MessageRequest.oneOf).toContainEqual({
      $ref: '#/components/schemas/MessageInteractiveCtaButtons',
    })
  })
})
