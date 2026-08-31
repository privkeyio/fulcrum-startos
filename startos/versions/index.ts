import { VersionGraph } from '@start9labs/start-sdk'
import { current } from './current'
import { v_2_1_1_6 } from './v2.1.1_6'
import { v_2_1_1_13 } from './v2.1.1_13'
import { v_2_1_1_16 } from './v2.1.1_16'
import { v_2_1_1_17 } from './v2.1.1_17'
import { v_2_1_1_18 } from './v2.1.1_18'
import { v_2_1_1_19 } from './v2.1.1_19'
import { v_2_1_2_0 } from './v2.1.2_0'
import { v_2_1_2_1 } from './v2.1.2_1'

export const versionGraph = VersionGraph.of({
  current,
  other: [v_2_1_1_6, v_2_1_1_13, v_2_1_1_16, v_2_1_1_17, v_2_1_1_18, v_2_1_1_19, v_2_1_2_0, v_2_1_2_1],
})
