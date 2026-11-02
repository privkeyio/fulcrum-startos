import { FileHelper } from '@start9labs/start-sdk'
import { sdk } from '../sdk'

export const bannerTxt = FileHelper.string({
  base: sdk.volumes.main,
  subpath: 'banner.txt',
})
