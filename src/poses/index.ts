import { passe } from './passe'
import { downwardDog } from './downwardDog'
import { plank } from './plank'
import type { PoseDefinition } from './types'

export const POSES: PoseDefinition[] = [passe, downwardDog, plank]

export * from './types'
