// El mapa de efectos vive en @24hits/database (fuente única compartida por API y
// worker). Se re-exporta aquí para mantener las importaciones internas estables.
export { MOVEMENT_EFFECTS, type BalanceEffect } from "@24hits/database";
