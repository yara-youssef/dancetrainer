import { pirouette } from './pirouette'
import { pushup } from './pushup'
import type { MovementDefinition } from './types'

export const MOVEMENTS: MovementDefinition[] = [pirouette, pushup]

export * from './types'
