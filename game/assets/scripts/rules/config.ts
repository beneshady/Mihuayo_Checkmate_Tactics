export type Kind = 'king' | 'rook' | 'horse' | 'cannon' | 'pawn';
export interface Position { x: number; y: number }
export const CONFIG = {
  width: 9, height: 10, kingHP: 3, enemyKingHP: 2,
  upgradeXP: [0, 2, 4], reward: 2, price: 2,
  spawns: { king: { x: 4, y: 0 }, rook: { x: 0, y: 0 }, horse: { x: 2, y: 0 }, cannon: { x: 1, y: 2 } },
  waves: [
    [['pawn', 0, 3], ['pawn', 2, 5], ['cannon', 4, 6], ['king', 4, 9]],
    [['pawn', 4, 4], ['horse', 2, 6], ['cannon', 6, 6], ['rook', 0, 7], ['king', 4, 9]],
  ] as [Kind, number, number][][],
};
