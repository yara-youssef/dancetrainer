import { passe } from './passe'
import { arabesque } from './arabesque'
import { releve } from './releve'
import { plie } from './plie'
import { tendu } from './tendu'
import { downwardDog } from './downwardDog'
import { tree } from './tree'
import { warrior2 } from './warrior2'
import { plank } from './plank'
import { sidePlank } from './sidePlank'
import type { PoseDefinition } from './types'

export const POSES: PoseDefinition[] = [
  passe,
  arabesque,
  releve,
  plie,
  tendu,
  tree,
  warrior2,
  downwardDog,
  plank,
  sidePlank,
]

export * from './types'
