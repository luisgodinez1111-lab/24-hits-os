// Primitivos fundacionales compartidos. NO es un contenedor genérico:
// solo tipos/utilidades transversales sin dependencias de dominio.
export { newId, isUuid } from "./id.js";
export { Money, MoneyError, type CurrencyCode } from "./money.js";
