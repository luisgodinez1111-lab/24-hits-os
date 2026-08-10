// Token de inyección del proveedor de almacenamiento. En un archivo propio para
// evitar dependencias circulares entre el módulo y sus controllers/servicios.
export const FILE_STORAGE = Symbol("FILE_STORAGE");
