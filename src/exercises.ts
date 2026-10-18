import { POSES, type PoseDefinition } from '@/poses'
import { MOVEMENTS, type MovementDefinition } from '@/movements'

/** Anything you can practise: a held position or a movement. */
export type Exercise = PoseDefinition | MovementDefinition

export const isMovement = (e: Exercise): e is MovementDefinition => (e as MovementDefinition).kind === 'movement'

export const EXERCISES: Exercise[] = [...POSES, ...MOVEMENTS]
