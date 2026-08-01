import fetch from 'node-fetch'

const GROUP_PICTURE_SIZE = 640
const GROUP_PICTURE_QUALITY = 50

export const downloadGroupPicture = async (pictureUrl: string): Promise<Uint8Array> => {
  const response = await fetch(pictureUrl)
  if (!response.ok) throw new Error(`Could not download group picture: HTTP ${response.status}`)

  const source = Buffer.from(await response.arrayBuffer())
  // Load on demand so routes that do not manipulate pictures avoid native image startup cost.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const sharpModule = require('sharp')
  const sharp = sharpModule.default || sharpModule
  const jpeg = await sharp(source)
    .resize(GROUP_PICTURE_SIZE, GROUP_PICTURE_SIZE)
    .jpeg({ quality: GROUP_PICTURE_QUALITY })
    .toBuffer()
  return new Uint8Array(jpeg)
}
