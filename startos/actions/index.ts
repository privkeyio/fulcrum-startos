import { sdk } from '../sdk'
import { configure } from './configure'
import { reindex } from './reindex'

export const actions = sdk.Actions.of().addAction(configure).addAction(reindex)
