import { barrelTurn } from './barrelTurn'
import { pirouette } from './pirouette'
import { pushup } from './pushup'
import type { MovementDefinition } from './types'

export const MOVEMENTS: MovementDefinition[] = [pirouette, barrelTurn, pushup]

export * from './types'
