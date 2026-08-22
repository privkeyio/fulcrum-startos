import { setupManifest } from '@start9labs/start-sdk'
import { bitcoindDescription, long, short } from './i18n'

export const manifest = setupManifest({
  id: 'fulcrum',
  title: 'Fulcrum',
  license: 'MIT',
  packageRepo: 'https://github.com/privkeyio/fulcrum-startos',
  upstreamRepo: 'https://github.com/privkeyio/Fulcrum',
  marketingUrl: 'https://github.com/cculianu/Fulcrum',
  donationUrl: 'https://github.com/cculianu/Fulcrum',
  description: { short, long },
  volumes: ['main'],
  images: {
    main: {
      source: {
        dockerBuild: {
          workdir: 'fulcrum',
          dockerfile: 'fulcrum/contrib/docker/Dockerfile',
        },
      },
      arch: ['x86_64'],
    },
  },
  dependencies: {
    bitcoind: {
      description: bitcoindDescription,
      optional: false,
      metadata: {
        title: 'Bitcoin',
        icon: 'https://raw.githubusercontent.com/Start9Labs/bitcoin-core-startos/refs/heads/30.x/dep-icon.svg',
      },
    },
  },
})
